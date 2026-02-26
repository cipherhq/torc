import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'motion/react';
import { AdminLayout } from '../../components/AdminLayout';
import { supabase } from '../../lib/supabase';
import { FileText, RefreshCw, Search, CheckCircle2, XCircle, Clock, Download, Eye } from 'lucide-react';
import { Pagination } from '../../components/Pagination';

interface DocumentRow {
  id: string;
  provider_id: string;
  type: string;
  file_name: string;
  file_path: string | null;
  file_url: string | null;
  mime_type: string | null;
  file_size: number | null;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  provider_name: string;
  provider_email: string;
}

type FilterTab = 'all' | 'pending' | 'approved' | 'rejected';

export function DocumentSettings() {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('documents')
        .select('id, provider_id, type, file_name, file_path, file_url, mime_type, file_size, status, rejection_reason, reviewed_by, reviewed_at, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      // Fetch provider profiles separately (no FK relationship between documents and profiles)
      const providerIds = [...new Set((data ?? []).map((d: any) => d.provider_id).filter(Boolean))];
      let profilesMap: Record<string, { full_name: string; email: string }> = {};

      if (providerIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', providerIds);

        if (profiles) {
          profilesMap = Object.fromEntries(profiles.map((p: any) => [p.id, { full_name: p.full_name, email: p.email }]));
        }
      }

      const mapped: DocumentRow[] = (data ?? []).map((doc: any) => ({
        id: doc.id,
        provider_id: doc.provider_id,
        type: doc.type,
        file_name: doc.file_name,
        file_path: doc.file_path,
        file_url: doc.file_url,
        mime_type: doc.mime_type,
        file_size: doc.file_size,
        status: doc.status,
        rejection_reason: doc.rejection_reason,
        reviewed_by: doc.reviewed_by,
        reviewed_at: doc.reviewed_at,
        created_at: doc.created_at,
        updated_at: doc.updated_at,
        provider_name: profilesMap[doc.provider_id]?.full_name ?? 'Unknown Provider',
        provider_email: profilesMap[doc.provider_id]?.email ?? '',
      }));

      setDocuments(mapped);
    } catch (err: any) {
      console.error('Failed to fetch documents:', err);
      setError(err?.message || 'Failed to load documents.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const stats = useMemo(() => ({
    total: documents.length,
    pending: documents.filter(d => d.status === 'pending').length,
    approved: documents.filter(d => d.status === 'approved').length,
    rejected: documents.filter(d => d.status === 'rejected').length,
  }), [documents]);

  const filteredDocuments = useMemo(() => {
    let filtered = documents;

    if (activeTab !== 'all') {
      filtered = filtered.filter(d => d.status === activeTab);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(d =>
        d.provider_name.toLowerCase().includes(q) ||
        d.type.toLowerCase().includes(q) ||
        d.file_name.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [documents, activeTab, searchQuery]);

  useEffect(() => { setCurrentPage(1); }, [activeTab, searchQuery]);

  const paginatedDocuments = useMemo(() =>
    filteredDocuments.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
  [filteredDocuments, currentPage]);

  const handleApprove = async (docId: string) => {
    if (!currentUserId) return;
    setActionLoading(docId);

    try {
      const { error: updateError } = await supabase
        .from('documents')
        .update({
          status: 'approved',
          reviewed_by: currentUserId,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', docId);

      if (updateError) throw updateError;

      await supabase.from('admin_audit_logs').insert({
        actor_id: currentUserId,
        action: 'approve_document',
        entity_type: 'document',
        entity_id: docId,
        details: { status: 'approved' },
      });

      setDocuments(prev =>
        prev.map(d =>
          d.id === docId
            ? { ...d, status: 'approved' as const, reviewed_by: currentUserId, reviewed_at: new Date().toISOString() }
            : d
        )
      );
    } catch (err: any) {
      console.error('Failed to approve document:', err);
      alert('Failed to approve document: ' + (err?.message || 'Unknown error'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (docId: string) => {
    if (!currentUserId) return;
    if (!rejectionReason.trim()) {
      alert('Please provide a rejection reason.');
      return;
    }

    setActionLoading(docId);

    try {
      const { error: updateError } = await supabase
        .from('documents')
        .update({
          status: 'rejected',
          rejection_reason: rejectionReason.trim(),
          reviewed_by: currentUserId,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', docId);

      if (updateError) throw updateError;

      await supabase.from('admin_audit_logs').insert({
        actor_id: currentUserId,
        action: 'reject_document',
        entity_type: 'document',
        entity_id: docId,
        details: { status: 'rejected', rejection_reason: rejectionReason.trim() },
      });

      setDocuments(prev =>
        prev.map(d =>
          d.id === docId
            ? {
                ...d,
                status: 'rejected' as const,
                rejection_reason: rejectionReason.trim(),
                reviewed_by: currentUserId,
                reviewed_at: new Date().toISOString(),
              }
            : d
        )
      );

      setRejectingId(null);
      setRejectionReason('');
    } catch (err: any) {
      console.error('Failed to reject document:', err);
      alert('Failed to reject document: ' + (err?.message || 'Unknown error'));
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '--';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '--';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A' }}>
            <Clock className="w-3.5 h-3.5" />
            Pending
          </span>
        );
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: '#D1FAE5', color: '#047857', border: '1px solid #A7F3D0' }}>
            <CheckCircle2 className="w-3.5 h-3.5" />
            Approved
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>
            <XCircle className="w-3.5 h-3.5" />
            Rejected
          </span>
        );
      default:
        return null;
    }
  };

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: stats.total },
    { key: 'pending', label: 'Pending', count: stats.pending },
    { key: 'approved', label: 'Approved', count: stats.approved },
    { key: 'rejected', label: 'Rejected', count: stats.rejected },
  ];

  return (
    <AdminLayout>
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-8 pt-8 pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Document Settings</h1>
            <p className="text-base text-gray-500">Review and manage provider documents</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={fetchDocuments}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 cursor-pointer"
            style={{ background: 'linear-gradient(to right, #008CE5, #0070B8)', color: '#FFFFFF' }}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </motion.button>
        </div>
      </div>

      <div className="p-8">
        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: 'linear-gradient(135deg, #008CE5, #0070B8)' }}>
              <FileText className="w-5 h-5 text-white" />
            </div>
            <p className="text-gray-500 text-sm font-medium">Total Documents</p>
            <p className="text-gray-900 text-3xl font-bold mt-1">{stats.total}</p>
          </div>
          <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: 'linear-gradient(135deg, #FACC15, #F97316)' }}>
              <Clock className="w-5 h-5 text-white" />
            </div>
            <p className="text-gray-500 text-sm font-medium">Pending Review</p>
            <p className="text-gray-900 text-3xl font-bold mt-1">{stats.pending}</p>
          </div>
          <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: 'linear-gradient(135deg, #4ADE80, #10B981)' }}>
              <CheckCircle2 className="w-5 h-5 text-white" />
            </div>
            <p className="text-gray-500 text-sm font-medium">Approved</p>
            <p className="text-gray-900 text-3xl font-bold mt-1">{stats.approved}</p>
          </div>
          <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: 'linear-gradient(135deg, #F87171, #EF4444)' }}>
              <XCircle className="w-5 h-5 text-white" />
            </div>
            <p className="text-gray-500 text-sm font-medium">Rejected</p>
            <p className="text-gray-900 text-3xl font-bold mt-1">{stats.rejected}</p>
          </div>
        </div>

        {/* Filter Tabs + Search */}
        <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            {/* Tabs */}
            <div className="flex gap-1 bg-gray-50 rounded-xl p-1">
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer"
                  style={activeTab === tab.key
                    ? { background: 'linear-gradient(to right, #008CE5, #0070B8)', color: '#FFFFFF', boxShadow: '0 2px 4px rgba(0,140,229,0.3)' }
                    : { color: '#6B7280', backgroundColor: 'transparent' }
                  }
                >
                  {tab.label}
                  <span
                    className="ml-2 text-xs font-bold"
                    style={{ color: activeTab === tab.key ? '#FFFFFF' : '#9CA3AF' }}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by provider, type, or file name..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-16">
              <RefreshCw className="w-8 h-8 animate-spin mb-3" style={{ color: '#008CE5' }} />
              <p className="text-gray-500 text-base">Loading documents...</p>
            </div>
          )}

          {/* Error State */}
          {!loading && error && (
            <div className="flex flex-col items-center justify-center py-16">
              <XCircle className="w-8 h-8 text-red-400 mb-3" />
              <p className="text-gray-900 font-semibold text-base mb-1">Failed to load documents</p>
              <p className="text-gray-500 text-sm mb-4">{error}</p>
              <button
                onClick={fetchDocuments}
                className="px-5 py-2.5 text-sm font-semibold rounded-xl transition-all cursor-pointer"
                style={{ background: 'linear-gradient(to right, #008CE5, #0070B8)', color: '#FFFFFF' }}
              >
                Try Again
              </button>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && filteredDocuments.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <FileText className="w-8 h-8 text-gray-300 mb-3" />
              <p className="text-gray-900 font-semibold text-base mb-1">No documents found</p>
              <p className="text-gray-500 text-sm">
                {searchQuery
                  ? 'Try adjusting your search query.'
                  : activeTab !== 'all'
                  ? `No ${activeTab} documents at this time.`
                  : 'No documents have been submitted yet.'}
              </p>
            </div>
          )}

          {/* Document List */}
          {!loading && !error && filteredDocuments.length > 0 && (
            <div className="space-y-3">
              {paginatedDocuments.map((doc, index) => (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className="border border-gray-100 rounded-2xl p-5 hover:border-gray-200 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* Left: Document Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #008CE5, #0070B8)' }}>
                          <FileText className="w-4 h-4 text-white" />
                        </div>
                        <h3 className="text-gray-900 font-bold text-base truncate">{doc.file_name}</h3>
                        {statusBadge(doc.status)}
                      </div>

                      <div className="ml-12 space-y-1.5">
                        <p className="text-sm">
                          <span className="text-gray-400 font-medium">Provider:</span>{' '}
                          <span className="text-gray-800 font-semibold">{doc.provider_name}</span>
                        </p>
                        <p className="text-sm">
                          <span className="text-gray-400 font-medium">Type:</span>{' '}
                          <span className="text-gray-700 font-medium">{doc.type}</span>
                          {doc.file_size != null && (
                            <>
                              <span className="mx-2 text-gray-300">|</span>
                              <span className="text-gray-400 font-medium">Size:</span>{' '}
                              <span className="text-gray-700 font-medium">{formatFileSize(doc.file_size)}</span>
                            </>
                          )}
                        </p>
                        <p className="text-gray-400 text-sm">
                          Submitted {formatDate(doc.created_at)}
                          {doc.reviewed_at && (
                            <>
                              <span className="mx-2">|</span>
                              Reviewed {formatDate(doc.reviewed_at)}
                            </>
                          )}
                        </p>
                        {doc.status === 'rejected' && doc.rejection_reason && (
                          <p className="text-red-500 text-sm mt-1">
                            Reason: {doc.rejection_reason}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {doc.file_url && (
                        <>
                          <a
                            href={doc.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2.5 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800 transition-all cursor-pointer"
                            title="View document"
                          >
                            <Eye className="w-4 h-4" />
                          </a>
                          <a
                            href={doc.file_url}
                            download={doc.file_name}
                            className="p-2.5 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800 transition-all cursor-pointer"
                            title="Download document"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        </>
                      )}

                      {doc.status === 'pending' && (
                        <>
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.93 }}
                            onClick={() => handleApprove(doc.id)}
                            disabled={actionLoading === doc.id}
                            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 cursor-pointer"
                            style={{ background: 'linear-gradient(135deg, #4ADE80, #10B981)', color: '#FFFFFF' }}
                          >
                            {actionLoading === doc.id ? '...' : 'Approve'}
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.93 }}
                            onClick={() => {
                              setRejectingId(rejectingId === doc.id ? null : doc.id);
                              setRejectionReason('');
                            }}
                            disabled={actionLoading === doc.id}
                            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 cursor-pointer"
                            style={{ background: 'linear-gradient(135deg, #F87171, #EF4444)', color: '#FFFFFF' }}
                          >
                            Reject
                          </motion.button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Rejection Reason Input */}
                  {rejectingId === doc.id && doc.status === 'pending' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mt-4 ml-8 flex gap-2"
                    >
                      <input
                        type="text"
                        placeholder="Enter rejection reason..."
                        value={rejectionReason}
                        onChange={e => setRejectionReason(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleReject(doc.id); }}
                        className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-red-300"
                        autoFocus
                      />
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.93 }}
                        onClick={() => handleReject(doc.id)}
                        disabled={actionLoading === doc.id || !rejectionReason.trim()}
                        className="px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 cursor-pointer"
                        style={{ background: 'linear-gradient(135deg, #F87171, #EF4444)', color: '#FFFFFF' }}
                      >
                        {actionLoading === doc.id ? 'Rejecting...' : 'Confirm Reject'}
                      </motion.button>
                      <button
                        onClick={() => { setRejectingId(null); setRejectionReason(''); }}
                        className="px-3 py-2 text-gray-500 hover:text-gray-700 text-sm transition-colors"
                      >
                        Cancel
                      </button>
                    </motion.div>
                  )}
                </motion.div>
              ))}
              <Pagination currentPage={currentPage} totalItems={filteredDocuments.length} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
