import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'motion/react';
import { AdminLayout } from '../../components/AdminLayout';
import { supabase } from '../../lib/supabase';
import {
  FileText, RefreshCw, Search, CheckCircle2, XCircle, Clock, Download, Eye,
  Plus, Edit3, Trash2, X, Save, Loader2, AlertCircle, ToggleLeft, ToggleRight,
  ShieldCheck,
} from 'lucide-react';
import { Pagination } from '../../components/Pagination';

/* ─── Types ─── */

interface DocumentType {
  id: string;
  name: string;
  description: string | null;
  is_required: boolean;
  is_active: boolean;
  display_order: number;
  created_at: string;
}

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
  /* ─── Document Requirements State ─── */
  const [docTypes, setDocTypes] = useState<DocumentType[]>([]);
  const [docTypesLoading, setDocTypesLoading] = useState(true);
  const [showAddType, setShowAddType] = useState(false);
  const [addTypeForm, setAddTypeForm] = useState({ id: '', name: '', description: '', is_required: false });
  const [addTypeSaving, setAddTypeSaving] = useState(false);
  const [addTypeError, setAddTypeError] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<DocumentType | null>(null);
  const [editTypeForm, setEditTypeForm] = useState({ name: '', description: '', is_required: false });
  const [editTypeSaving, setEditTypeSaving] = useState(false);
  const [deletingType, setDeletingType] = useState<DocumentType | null>(null);
  const [deleteTypeConfirming, setDeleteTypeConfirming] = useState(false);
  const [togglingTypeId, setTogglingTypeId] = useState<string | null>(null);

  /* ─── Submitted Documents State ─── */
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

  /* ─── Document Types CRUD ─── */

  const fetchDocTypes = useCallback(async () => {
    setDocTypesLoading(true);
    try {
      const { data, error: fetchErr } = await supabase
        .from('document_types')
        .select('*')
        .order('display_order', { ascending: true });
      if (fetchErr) throw fetchErr;
      setDocTypes(data || []);
    } catch (err: any) {
      console.warn('Failed to load document types:', err);
    } finally {
      setDocTypesLoading(false);
    }
  }, []);

  const handleAddType = async () => {
    const id = addTypeForm.id.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!id || !addTypeForm.name.trim()) {
      setAddTypeError('ID and name are required');
      return;
    }
    if (docTypes.some(dt => dt.id === id)) {
      setAddTypeError('A document type with this ID already exists');
      return;
    }
    setAddTypeSaving(true);
    setAddTypeError(null);
    try {
      const maxOrder = docTypes.length > 0 ? Math.max(...docTypes.map(dt => dt.display_order)) : 0;
      const { error: insertErr } = await supabase.from('document_types').insert({
        id,
        name: addTypeForm.name.trim(),
        description: addTypeForm.description.trim() || null,
        is_required: addTypeForm.is_required,
        is_active: true,
        display_order: maxOrder + 1,
      });
      if (insertErr) throw insertErr;
      setShowAddType(false);
      setAddTypeForm({ id: '', name: '', description: '', is_required: false });
      await fetchDocTypes();
    } catch (e: any) {
      setAddTypeError(e.message || 'Failed to add document type');
    } finally {
      setAddTypeSaving(false);
    }
  };

  const handleEditType = async () => {
    if (!editingType) return;
    setEditTypeSaving(true);
    try {
      const { error: updateErr } = await supabase
        .from('document_types')
        .update({
          name: editTypeForm.name.trim(),
          description: editTypeForm.description.trim() || null,
          is_required: editTypeForm.is_required,
        })
        .eq('id', editingType.id);
      if (updateErr) throw updateErr;
      setDocTypes(prev =>
        prev.map(dt => dt.id === editingType.id
          ? { ...dt, name: editTypeForm.name.trim(), description: editTypeForm.description.trim() || null, is_required: editTypeForm.is_required }
          : dt
        )
      );
      setEditingType(null);
    } catch (e: any) {
      alert('Failed to update: ' + (e.message || 'Unknown error'));
    } finally {
      setEditTypeSaving(false);
    }
  };

  const handleToggleTypeActive = async (dt: DocumentType) => {
    setTogglingTypeId(dt.id);
    try {
      const { error: updateErr } = await supabase
        .from('document_types')
        .update({ is_active: !dt.is_active })
        .eq('id', dt.id);
      if (updateErr) throw updateErr;
      setDocTypes(prev => prev.map(d => d.id === dt.id ? { ...d, is_active: !d.is_active } : d));
    } catch (e: any) {
      console.warn('Failed to toggle document type:', e);
    } finally {
      setTogglingTypeId(null);
    }
  };

  const handleDeleteType = async () => {
    if (!deletingType) return;
    setDeleteTypeConfirming(true);
    try {
      const { error: deleteErr } = await supabase
        .from('document_types')
        .delete()
        .eq('id', deletingType.id);
      if (deleteErr) throw deleteErr;
      setDocTypes(prev => prev.filter(d => d.id !== deletingType.id));
      setDeletingType(null);
    } catch (e: any) {
      alert('Failed to delete: ' + (e.message || 'Unknown error'));
    } finally {
      setDeleteTypeConfirming(false);
    }
  };

  /* ─── Submitted Documents Fetching ─── */

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

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
    fetchDocTypes();
    fetchDocuments();
  }, [fetchDocTypes, fetchDocuments]);

  /* ─── Submitted Documents Logic ─── */

  const stats = useMemo(() => ({
    total: documents.length,
    pending: documents.filter(d => d.status === 'pending').length,
    approved: documents.filter(d => d.status === 'approved').length,
    rejected: documents.filter(d => d.status === 'rejected').length,
  }), [documents]);

  const filteredDocuments = useMemo(() => {
    let filtered = documents;
    if (activeTab !== 'all') filtered = filtered.filter(d => d.status === activeTab);
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
        .update({ status: 'approved', reviewed_by: currentUserId, reviewed_at: new Date().toISOString() })
        .eq('id', docId);
      if (updateError) throw updateError;
      await supabase.from('admin_audit_logs').insert({
        actor_id: currentUserId, action: 'approve_document', entity_type: 'document', entity_id: docId, details: { status: 'approved' },
      });
      setDocuments(prev => prev.map(d => d.id === docId ? { ...d, status: 'approved' as const, reviewed_by: currentUserId, reviewed_at: new Date().toISOString() } : d));
    } catch (err: any) {
      alert('Failed to approve document: ' + (err?.message || 'Unknown error'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (docId: string) => {
    if (!currentUserId) return;
    if (!rejectionReason.trim()) { alert('Please provide a rejection reason.'); return; }
    setActionLoading(docId);
    try {
      const { error: updateError } = await supabase
        .from('documents')
        .update({ status: 'rejected', rejection_reason: rejectionReason.trim(), reviewed_by: currentUserId, reviewed_at: new Date().toISOString() })
        .eq('id', docId);
      if (updateError) throw updateError;
      await supabase.from('admin_audit_logs').insert({
        actor_id: currentUserId, action: 'reject_document', entity_type: 'document', entity_id: docId, details: { status: 'rejected', rejection_reason: rejectionReason.trim() },
      });
      setDocuments(prev => prev.map(d => d.id === docId ? { ...d, status: 'rejected' as const, rejection_reason: rejectionReason.trim(), reviewed_by: currentUserId, reviewed_at: new Date().toISOString() } : d));
      setRejectingId(null);
      setRejectionReason('');
    } catch (err: any) {
      alert('Failed to reject document: ' + (err?.message || 'Unknown error'));
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '--';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
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
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A' }}><Clock className="w-3.5 h-3.5" />Pending</span>;
      case 'approved':
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: '#D1FAE5', color: '#047857', border: '1px solid #A7F3D0' }}><CheckCircle2 className="w-3.5 h-3.5" />Approved</span>;
      case 'rejected':
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}><XCircle className="w-3.5 h-3.5" />Rejected</span>;
      default: return null;
    }
  };

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: stats.total },
    { key: 'pending', label: 'Pending', count: stats.pending },
    { key: 'approved', label: 'Approved', count: stats.approved },
    { key: 'rejected', label: 'Rejected', count: stats.rejected },
  ];

  // Count how many submitted docs exist per type (for delete warning)
  const docCountByType = useMemo(() => {
    const map: Record<string, number> = {};
    documents.forEach(d => { map[d.type] = (map[d.type] || 0) + 1; });
    return map;
  }, [documents]);

  return (
    <AdminLayout>
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-8 pt-8 pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Document Settings</h1>
            <p className="text-base text-gray-500">Manage document requirements and review provider submissions</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => { fetchDocTypes(); fetchDocuments(); }}
            disabled={loading || docTypesLoading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 cursor-pointer"
            style={{ background: 'linear-gradient(to right, #008CE5, #0070B8)', color: '#FFFFFF' }}
          >
            <RefreshCw className={`w-4 h-4 ${loading || docTypesLoading ? 'animate-spin' : ''}`} />
            Refresh
          </motion.button>
        </div>
      </div>

      <div className="p-8">
        {/* ═══════════════════════════════════════════ */}
        {/* SECTION 1: Document Requirements           */}
        {/* ═══════════════════════════════════════════ */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #6366F1, #4F46E5)' }}>
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Document Requirements</h2>
                <p className="text-gray-500 text-sm">Configure which documents providers must upload during onboarding</p>
              </div>
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => { setShowAddType(true); setAddTypeForm({ id: '', name: '', description: '', is_required: false }); setAddTypeError(null); }}
              style={{ background: 'linear-gradient(to right, #008CE5, #0070B8)' }}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-white font-semibold text-sm"
            >
              <Plus className="w-4 h-4" />
              Add Document Type
            </motion.button>
          </div>

          {docTypesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-[#008CE5]" />
            </div>
          ) : docTypes.length === 0 ? (
            <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-12 text-center">
              <ShieldCheck className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">No document types configured</p>
              <p className="text-gray-400 text-sm mt-1">Add document types to require from providers</p>
            </div>
          ) : (
            <div className="space-y-3">
              {docTypes.map((dt, index) => {
                const isToggling = togglingTypeId === dt.id;
                const submissionCount = docCountByType[dt.id] || 0;
                return (
                  <motion.div
                    key={dt.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className="bg-white shadow-sm border border-gray-100 rounded-2xl p-5"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: dt.is_active ? 'linear-gradient(135deg, #6366F1, #4F46E5)' : '#E5E7EB' }}>
                          <FileText className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <h3 className="text-gray-900 font-bold text-sm truncate">{dt.name}</h3>
                            <span className="text-gray-400 text-xs font-mono">({dt.id})</span>
                            {dt.is_required ? (
                              <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-xs font-semibold flex-shrink-0">Required</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs font-semibold flex-shrink-0">Optional</span>
                            )}
                            {!dt.is_active && (
                              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 text-xs font-semibold flex-shrink-0">Inactive</span>
                            )}
                          </div>
                          {dt.description && (
                            <p className="text-gray-500 text-xs truncate">{dt.description}</p>
                          )}
                          {submissionCount > 0 && (
                            <p className="text-gray-400 text-xs mt-0.5">{submissionCount} submission{submissionCount !== 1 ? 's' : ''}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => { setEditingType(dt); setEditTypeForm({ name: dt.name, description: dt.description || '', is_required: dt.is_required }); }}
                          className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                          title="Edit"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeletingType(dt)}
                          className="p-2 rounded-xl hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggleTypeActive(dt)}
                          disabled={isToggling}
                          title={dt.is_active ? 'Deactivate' : 'Activate'}
                          style={{
                            width: 44,
                            height: 24,
                            borderRadius: 9999,
                            position: 'relative',
                            flexShrink: 0,
                            backgroundColor: isToggling ? '#9CA3AF' : dt.is_active ? '#111827' : '#D1D5DB',
                            transition: 'background-color 0.2s',
                            opacity: isToggling ? 0.6 : 1,
                          }}
                        >
                          {isToggling ? (
                            <Loader2 className="w-3 h-3 animate-spin text-white absolute" style={{ top: 5, left: 15 }} />
                          ) : (
                            <div style={{
                              position: 'absolute', width: 16, height: 16, borderRadius: 9999, top: 4,
                              backgroundColor: '#FFFFFF', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                              transition: 'left 0.2s, right 0.2s',
                              ...(dt.is_active ? { right: 4, left: 'auto' } : { left: 4, right: 'auto' }),
                            }} />
                          )}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════ */}
        {/* SECTION 2: Submitted Documents Review      */}
        {/* ═══════════════════════════════════════════ */}

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
                  <span className="ml-2 text-xs font-bold" style={{ color: activeTab === tab.key ? '#FFFFFF' : '#9CA3AF' }}>{tab.count}</span>
                </button>
              ))}
            </div>
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

          {loading && (
            <div className="flex flex-col items-center justify-center py-16">
              <RefreshCw className="w-8 h-8 animate-spin mb-3" style={{ color: '#008CE5' }} />
              <p className="text-gray-500 text-base">Loading documents...</p>
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center justify-center py-16">
              <XCircle className="w-8 h-8 text-red-400 mb-3" />
              <p className="text-gray-900 font-semibold text-base mb-1">Failed to load documents</p>
              <p className="text-gray-500 text-sm mb-4">{error}</p>
              <button onClick={fetchDocuments} className="px-5 py-2.5 text-sm font-semibold rounded-xl" style={{ background: 'linear-gradient(to right, #008CE5, #0070B8)', color: '#FFFFFF' }}>
                Try Again
              </button>
            </div>
          )}

          {!loading && !error && filteredDocuments.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <FileText className="w-8 h-8 text-gray-300 mb-3" />
              <p className="text-gray-900 font-semibold text-base mb-1">No documents found</p>
              <p className="text-gray-500 text-sm">
                {searchQuery ? 'Try adjusting your search query.' : activeTab !== 'all' ? `No ${activeTab} documents at this time.` : 'No documents have been submitted yet.'}
              </p>
            </div>
          )}

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
                          {doc.reviewed_at && <><span className="mx-2">|</span>Reviewed {formatDate(doc.reviewed_at)}</>}
                        </p>
                        {doc.status === 'rejected' && doc.rejection_reason && (
                          <p className="text-red-500 text-sm mt-1">Reason: {doc.rejection_reason}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {doc.file_url && (
                        <>
                          <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="p-2.5 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800 transition-all cursor-pointer" title="View document"><Eye className="w-4 h-4" /></a>
                          <a href={doc.file_url} download={doc.file_name} className="p-2.5 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800 transition-all cursor-pointer" title="Download document"><Download className="w-4 h-4" /></a>
                        </>
                      )}
                      {doc.status === 'pending' && (
                        <>
                          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.93 }} onClick={() => handleApprove(doc.id)} disabled={actionLoading === doc.id} className="px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 cursor-pointer" style={{ background: 'linear-gradient(135deg, #4ADE80, #10B981)', color: '#FFFFFF' }}>
                            {actionLoading === doc.id ? '...' : 'Approve'}
                          </motion.button>
                          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.93 }} onClick={() => { setRejectingId(rejectingId === doc.id ? null : doc.id); setRejectionReason(''); }} disabled={actionLoading === doc.id} className="px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 cursor-pointer" style={{ background: 'linear-gradient(135deg, #F87171, #EF4444)', color: '#FFFFFF' }}>
                            Reject
                          </motion.button>
                        </>
                      )}
                    </div>
                  </div>
                  {rejectingId === doc.id && doc.status === 'pending' && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-4 ml-8 flex gap-2">
                      <input type="text" placeholder="Enter rejection reason..." value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleReject(doc.id); }} className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-red-300" autoFocus />
                      <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.93 }} onClick={() => handleReject(doc.id)} disabled={actionLoading === doc.id || !rejectionReason.trim()} className="px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 cursor-pointer" style={{ background: 'linear-gradient(135deg, #F87171, #EF4444)', color: '#FFFFFF' }}>
                        {actionLoading === doc.id ? 'Rejecting...' : 'Confirm Reject'}
                      </motion.button>
                      <button onClick={() => { setRejectingId(null); setRejectionReason(''); }} className="px-3 py-2 text-gray-500 hover:text-gray-700 text-sm transition-colors">Cancel</button>
                    </motion.div>
                  )}
                </motion.div>
              ))}
              <Pagination currentPage={currentPage} totalItems={filteredDocuments.length} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* MODALS                                     */}
      {/* ═══════════════════════════════════════════ */}

      {/* Add Document Type Modal */}
      {showAddType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-[32px] p-8 max-w-lg w-full shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-gray-900 font-bold text-2xl">Add Document Type</h2>
              <button onClick={() => setShowAddType(false)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"><X className="w-5 h-5" /></button>
            </div>

            {addTypeError && (
              <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />{addTypeError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="text-gray-600 text-sm font-medium mb-1.5 block">Document ID</label>
                <input type="text" value={addTypeForm.id} onChange={e => setAddTypeForm({ ...addTypeForm, id: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-[16px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#008CE5]" placeholder="e.g. cdl-license, background-check" />
                <p className="text-gray-400 text-xs mt-1">Lowercase identifier, auto-formatted</p>
              </div>
              <div>
                <label className="text-gray-600 text-sm font-medium mb-1.5 block">Display Name</label>
                <input type="text" value={addTypeForm.name} onChange={e => setAddTypeForm({ ...addTypeForm, name: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-[16px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#008CE5]" placeholder="e.g. CDL License" />
              </div>
              <div>
                <label className="text-gray-600 text-sm font-medium mb-1.5 block">Description</label>
                <textarea rows={2} value={addTypeForm.description} onChange={e => setAddTypeForm({ ...addTypeForm, description: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-[16px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#008CE5] resize-none" placeholder="Brief description for providers..." />
              </div>
              <div className="flex items-center justify-between bg-gray-50 rounded-[16px] px-4 py-3 border border-gray-200">
                <span className="text-gray-700 text-sm font-medium">Required for onboarding</span>
                <button onClick={() => setAddTypeForm({ ...addTypeForm, is_required: !addTypeForm.is_required })} style={{ width: 56, height: 32, borderRadius: 9999, position: 'relative', flexShrink: 0, backgroundColor: addTypeForm.is_required ? '#DC2626' : '#D1D5DB', transition: 'background-color 0.2s' }}>
                  <div style={{ position: 'absolute', width: 24, height: 24, borderRadius: 9999, top: 4, backgroundColor: '#FFFFFF', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transition: 'left 0.2s, right 0.2s', ...(addTypeForm.is_required ? { right: 4, left: 'auto' } : { left: 4, right: 'auto' }) }} />
                </button>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <motion.button whileTap={{ scale: 0.98 }} onClick={() => setShowAddType(false)} className="flex-1 px-6 py-3 rounded-[20px] bg-gray-100 text-gray-900 font-semibold">Cancel</motion.button>
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleAddType} disabled={addTypeSaving || !addTypeForm.id.trim() || !addTypeForm.name.trim()} style={{ background: 'linear-gradient(to right, #008CE5, #0070B8)', color: '#FFFFFF' }} className="flex-1 px-6 py-3 rounded-[20px] font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                {addTypeSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                {addTypeSaving ? 'Adding...' : 'Add Type'}
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Edit Document Type Modal */}
      {editingType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-[32px] p-8 max-w-lg w-full shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-gray-900 font-bold text-2xl">Edit Document Type</h2>
              <button onClick={() => setEditingType(null)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"><X className="w-5 h-5" /></button>
            </div>

            <div className="mb-4 px-4 py-3 bg-gray-50 rounded-xl">
              <p className="text-gray-400 text-xs">Document ID</p>
              <p className="text-gray-900 font-mono text-sm font-medium">{editingType.id}</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-gray-600 text-sm font-medium mb-1.5 block">Display Name</label>
                <input type="text" value={editTypeForm.name} onChange={e => setEditTypeForm({ ...editTypeForm, name: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-[16px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#008CE5]" />
              </div>
              <div>
                <label className="text-gray-600 text-sm font-medium mb-1.5 block">Description</label>
                <textarea rows={2} value={editTypeForm.description} onChange={e => setEditTypeForm({ ...editTypeForm, description: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-[16px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#008CE5] resize-none" placeholder="Brief description for providers..." />
              </div>
              <div className="flex items-center justify-between bg-gray-50 rounded-[16px] px-4 py-3 border border-gray-200">
                <span className="text-gray-700 text-sm font-medium">Required for onboarding</span>
                <button onClick={() => setEditTypeForm({ ...editTypeForm, is_required: !editTypeForm.is_required })} style={{ width: 56, height: 32, borderRadius: 9999, position: 'relative', flexShrink: 0, backgroundColor: editTypeForm.is_required ? '#DC2626' : '#D1D5DB', transition: 'background-color 0.2s' }}>
                  <div style={{ position: 'absolute', width: 24, height: 24, borderRadius: 9999, top: 4, backgroundColor: '#FFFFFF', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transition: 'left 0.2s, right 0.2s', ...(editTypeForm.is_required ? { right: 4, left: 'auto' } : { left: 4, right: 'auto' }) }} />
                </button>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <motion.button whileTap={{ scale: 0.98 }} onClick={() => setEditingType(null)} className="flex-1 px-6 py-3 rounded-[20px] bg-gray-100 text-gray-900 font-semibold">Cancel</motion.button>
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleEditType} disabled={editTypeSaving || !editTypeForm.name.trim()} style={{ background: 'linear-gradient(to right, #008CE5, #0070B8)', color: '#FFFFFF' }} className="flex-1 px-6 py-3 rounded-[20px] font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                {editTypeSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                {editTypeSaving ? 'Saving...' : 'Save Changes'}
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Delete Document Type Confirmation */}
      {deletingType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-[32px] p-8 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-red-100 flex-shrink-0"><Trash2 className="w-6 h-6 text-red-500" /></div>
              <h2 className="text-gray-900 font-bold text-xl">Delete Document Type</h2>
            </div>
            <p className="text-gray-600 mb-2">Are you sure you want to delete <strong>{deletingType.name}</strong>?</p>
            {(docCountByType[deletingType.id] || 0) > 0 && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-amber-700 text-sm mb-4">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {docCountByType[deletingType.id]} provider submission{docCountByType[deletingType.id] !== 1 ? 's' : ''} use this type. They will remain but providers won't be asked for it anymore.
              </div>
            )}
            <p className="text-gray-400 text-sm mb-6">This action cannot be undone.</p>
            <div className="flex gap-3">
              <motion.button whileTap={{ scale: 0.98 }} onClick={() => setDeletingType(null)} className="flex-1 px-6 py-3 rounded-[20px] bg-gray-100 text-gray-900 font-semibold">Cancel</motion.button>
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleDeleteType} disabled={deleteTypeConfirming} className="flex-1 px-6 py-3 rounded-[20px] bg-red-500 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                {deleteTypeConfirming ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                {deleteTypeConfirming ? 'Deleting...' : 'Delete'}
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </AdminLayout>
  );
}
