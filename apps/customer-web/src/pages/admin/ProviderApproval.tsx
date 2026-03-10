import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { AdminNav } from '../../components/AdminNav';
import { CheckCircle, XCircle, Clock, FileText, User, Car, Shield, DollarSign, Eye, Calendar, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export function ProviderApproval() {
  const [selectedProvider, setSelectedProvider] = useState<any>(null);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<any>(null);
  const [pendingProviders, setPendingProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningProviderId, setActioningProviderId] = useState<string | null>(null);

  /* Per-document action state */
  const [docActionLoading, setDocActionLoading] = useState<string | null>(null);
  const [rejectingDocId, setRejectingDocId] = useState<string | null>(null);
  const [docRejectReason, setDocRejectReason] = useState('');

  const [stats, setStats] = useState({
    approvedToday: 0,
    rejectedToday: 0,
    activeProviders: 0,
  });

  async function loadPendingProviders() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('provider_profiles')
        .select(`
          id,
          account_type,
          company_name,
          created_at,
          user:profiles(full_name, email, phone)
        `)
        .eq('is_verified', false)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formattedProviders = await Promise.all((data || []).map(async (provider: any) => {
        const { data: documents } = await supabase
          .from('documents')
          .select('*')
          .eq('provider_id', provider.id)
          .order('updated_at', { ascending: false });

        const { data: providerServices } = await supabase
          .from('provider_services')
          .select('service:services(name)')
          .eq('provider_id', provider.id);

        const servicesOffered = providerServices?.map((ps: any) => ps.service?.name).filter(Boolean) || [];
        const name = provider.user?.full_name || provider.user?.email?.split('@')[0] || 'Unknown';
        const submittedAt = new Date(provider.created_at).toLocaleString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });

        return {
          id: `PR-${provider.id.slice(0, 8)}`,
          providerId: provider.id,
          name,
          email: provider.user?.email || '-',
          phone: provider.user?.phone || '-',
          accountType: provider.account_type === 'company' ? 'Company' : 'Individual',
          companyName: provider.company_name,
          submittedAt,
          documents: documents?.map((doc: any) => ({
            id: doc.id,
            type: doc.type?.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) || 'Document',
            status: doc.status || 'pending',
            file: doc.file_name || 'document.pdf',
            url: doc.file_url || null,
            rejectionReason: doc.rejection_reason || null,
            expires_at: doc.expires_at || null,
          })) || [],
          backgroundCheck: 'pending',
          servicesOffered,
        };
      }));

      setPendingProviders(formattedProviders);

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const [{ count: approvedToday }, { count: rejectedToday }, { count: activeProviders }] = await Promise.all([
        supabase
          .from('documents')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'approved')
          .gte('reviewed_at', startOfDay.toISOString()),
        supabase
          .from('documents')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'rejected')
          .gte('reviewed_at', startOfDay.toISOString()),
        supabase
          .from('provider_profiles')
          .select('*', { count: 'exact', head: true })
          .eq('is_verified', true),
      ]);

      setStats({
        approvedToday: approvedToday || 0,
        rejectedToday: rejectedToday || 0,
        activeProviders: activeProviders || 0,
      });
    } catch (error) {
      console.warn('Failed to load pending providers:', error);
      setPendingProviders([]);
      setStats({ approvedToday: 0, rejectedToday: 0, activeProviders: 0 });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPendingProviders();
  }, []);

  const handleUpdateDocExpiry = async (docId: string, expiryDate: string | null) => {
    try {
      const { error } = await supabase
        .from('documents')
        .update({ expires_at: expiryDate || null })
        .eq('id', docId);
      if (error) throw error;
      setPendingProviders(prev => prev.map((p: any) => ({
        ...p,
        documents: p.documents.map((d: any) =>
          d.id === docId ? { ...d, expires_at: expiryDate } : d
        ),
      })));
    } catch (e: any) {
      console.error('Failed to update document expiry:', e);
    }
  };

  const handleApproveDoc = async (docId: string) => {
    setDocActionLoading(docId);
    try {
      const { error } = await supabase
        .from('documents')
        .update({ status: 'approved', rejection_reason: null, reviewed_at: new Date().toISOString() })
        .eq('id', docId);
      if (error) throw error;
      setPendingProviders(prev => prev.map((p: any) => ({
        ...p,
        documents: p.documents.map((d: any) =>
          d.id === docId ? { ...d, status: 'approved', rejectionReason: null } : d
        ),
      })));
    } catch (e: any) {
      window.alert('Failed to approve document: ' + (e.message || 'Unknown error'));
    } finally {
      setDocActionLoading(null);
    }
  };

  const handleRejectDoc = async (docId: string, reason: string) => {
    setDocActionLoading(docId);
    try {
      const { error } = await supabase
        .from('documents')
        .update({ status: 'rejected', rejection_reason: reason || 'Rejected by admin', reviewed_at: new Date().toISOString() })
        .eq('id', docId);
      if (error) throw error;
      setPendingProviders(prev => prev.map((p: any) => ({
        ...p,
        documents: p.documents.map((d: any) =>
          d.id === docId ? { ...d, status: 'rejected', rejectionReason: reason || 'Rejected by admin' } : d
        ),
      })));
      setRejectingDocId(null);
      setDocRejectReason('');
    } catch (e: any) {
      window.alert('Failed to reject document: ' + (e.message || 'Unknown error'));
    } finally {
      setDocActionLoading(null);
    }
  };

  const handleRequestDocUpdate = async (providerId: string, docId: string, docType: string, reason: string) => {
    setDocActionLoading(docId);
    try {
      const { error } = await supabase
        .from('documents')
        .update({ status: 'rejected', rejection_reason: reason || 'Please upload an updated document.', reviewed_at: new Date().toISOString() })
        .eq('id', docId);
      if (error) throw error;

      setPendingProviders(prev => prev.map((p: any) => ({
        ...p,
        documents: p.documents.map((d: any) =>
          d.id === docId ? { ...d, status: 'rejected', rejectionReason: reason || 'Please upload an updated document.' } : d
        ),
      })));

      // Send notification to provider
      await supabase.from('notifications').insert({
        user_id: providerId,
        type: 'alert',
        title: 'Document Update Required',
        message: `Your ${docType.replace(/_/g, ' ')} needs to be updated: ${reason || 'Please upload an updated document.'}`,
        action_url: '/documents',
      });

      setRejectingDocId(null);
      setDocRejectReason('');
    } catch (e: any) {
      window.alert('Failed to request document update: ' + (e.message || 'Unknown error'));
    } finally {
      setDocActionLoading(null);
    }
  };

  const handleApprove = async (providerId: string) => {
    try {
      setActioningProviderId(providerId);
      const { error: docsError } = await supabase
        .from('documents')
        .update({
          status: 'approved',
          rejection_reason: null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('provider_id', providerId);
      if (docsError) throw docsError;

      const { error: providerError } = await supabase
        .from('provider_profiles')
        .update({ is_verified: true })
        .eq('id', providerId);
      if (providerError) throw providerError;

      await loadPendingProviders();
    } catch (error: any) {
      console.warn('Approve provider failed:', error);
      window.alert(error?.message || 'Failed to approve provider.');
    } finally {
      setActioningProviderId(null);
    }
  };

  const handleReject = async (providerId: string) => {
    const reason = window.prompt('Reason for rejection:', 'Document did not meet verification requirements');
    if (reason === null) return;

    try {
      setActioningProviderId(providerId);
      const { error: docsError } = await supabase
        .from('documents')
        .update({
          status: 'rejected',
          rejection_reason: reason.trim() || 'Rejected by admin',
          reviewed_at: new Date().toISOString(),
        })
        .eq('provider_id', providerId);
      if (docsError) throw docsError;

      const { error: providerError } = await supabase
        .from('provider_profiles')
        .update({ is_verified: false })
        .eq('id', providerId);
      if (providerError) throw providerError;

      await loadPendingProviders();
    } catch (error: any) {
      console.warn('Reject provider failed:', error);
      window.alert(error?.message || 'Failed to reject provider.');
    } finally {
      setActioningProviderId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A1626] flex">
      <AdminNav />

      <div className="flex-1 ml-64">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#1B2F4A] to-[#2F3548] p-8">
          <h1 className="text-3xl font-bold text-white mb-2">Provider Approval</h1>
          <p className="text-white/60">Review and approve provider applications</p>
        </div>

        <div className="p-8">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-6 mb-8">
            <div className="glass rounded-[24px] p-6">
              <Clock className="w-8 h-8 text-[#0070B8] mb-3" />
              <p className="text-white/60 text-sm">Pending Review</p>
              <p className="text-white text-3xl font-bold">{pendingProviders.length}</p>
            </div>
            <div className="glass rounded-[24px] p-6">
              <CheckCircle className="w-8 h-8 text-[#008CE5] mb-3" />
              <p className="text-white/60 text-sm">Approved Today</p>
              <p className="text-white text-3xl font-bold">{stats.approvedToday}</p>
            </div>
            <div className="glass rounded-[24px] p-6">
              <XCircle className="w-8 h-8 text-red-400 mb-3" />
              <p className="text-white/60 text-sm">Rejected Today</p>
              <p className="text-white text-3xl font-bold">{stats.rejectedToday}</p>
            </div>
            <div className="glass rounded-[24px] p-6">
              <Shield className="w-8 h-8 text-[#008CE5] mb-3" />
              <p className="text-white/60 text-sm">Active Providers</p>
              <p className="text-white text-3xl font-bold">{stats.activeProviders}</p>
            </div>
          </div>

          {/* Pending Applications */}
          <div className="glass rounded-[24px] p-6">
            <h2 className="text-white font-bold text-xl mb-6">Pending Applications</h2>

            {loading ? (
              <div className="p-12 text-center">
                <p className="text-white/60">Loading pending providers...</p>
              </div>
            ) : pendingProviders.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-white/60">No pending provider applications</p>
              </div>
            ) : (
            <div className="space-y-4">
              {pendingProviders.map((provider) => (
                <motion.div
                  key={provider.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white/5 rounded-2xl p-6 hover:bg-white/8 transition-colors"
                >
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex items-start gap-4">
                      <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#008CE5] to-[#0070B8] flex items-center justify-center">
                        <User className="w-8 h-8 text-white" />
                      </div>
                      <div>
                        <h3 className="text-white font-bold text-lg">{provider.name}</h3>
                        <p className="text-white/60 text-sm">{provider.id}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-white/80 text-sm">{provider.email}</span>
                          <span className="text-white/40">•</span>
                          <span className="text-white/80 text-sm">{provider.phone}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="px-3 py-1 rounded-full bg-[#0070B8]/20 text-[#0070B8] text-xs font-semibold">
                            {provider.accountType}
                          </span>
                          {provider.companyName && (
                            <span className="text-white/60 text-xs">{provider.companyName}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-white/60 text-sm">Submitted</p>
                      <p className="text-white text-sm">{provider.submittedAt}</p>
                    </div>
                  </div>

                  {/* Documents */}
                  <div className="mb-6">
                    <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Documents
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      {provider.documents.map((doc: any) => (
                        <div key={doc.id || doc.type} className="bg-white/5 rounded-xl p-3">
                          {/* Document preview */}
                          {doc.url && (
                            <div className="mb-3">
                              {(doc.file || '').match(/\.(jpg|jpeg|png|gif|webp)$/i) || (doc.url || '').match(/\.(jpg|jpeg|png|gif|webp)/i) ? (
                                <a href={doc.url} target="_blank" rel="noopener noreferrer" className="block">
                                  <img src={doc.url} alt={doc.type} className="w-full h-32 object-cover rounded-lg hover:opacity-90 transition-opacity" />
                                </a>
                              ) : (
                                <a href={doc.url} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center gap-2 text-[#008CE5] text-sm font-semibold hover:underline py-1">
                                  <Eye className="w-4 h-4" />
                                  View Document
                                </a>
                              )}
                            </div>
                          )}

                          {/* Info row */}
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <span className="text-white/80 text-sm block">{doc.type}</span>
                              <span className={`text-[10px] uppercase tracking-wide ${
                                doc.status === 'approved'
                                  ? 'text-[#008CE5]'
                                  : doc.status === 'rejected'
                                    ? 'text-red-400'
                                    : 'text-yellow-400'
                              }`}>
                                {doc.status}
                              </span>
                            </div>
                            {!doc.url && (
                              <span className="text-white/40 text-xs">No file</span>
                            )}
                          </div>

                          {/* Rejection reason display */}
                          {doc.status === 'rejected' && doc.rejectionReason && (
                            <p className="text-xs text-red-400 mb-2">Reason: {doc.rejectionReason}</p>
                          )}

                          {/* Per-document action buttons */}
                          <div className="flex gap-2 mb-2">
                            <button
                              onClick={() => handleApproveDoc(doc.id)}
                              disabled={doc.status === 'approved' || docActionLoading === doc.id}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${
                                doc.status === 'approved'
                                  ? 'bg-[#008CE5]/20 text-[#008CE5] border border-[#008CE5]/30'
                                  : 'bg-white/5 text-white/60 hover:bg-[#008CE5]/20 hover:text-[#008CE5] border border-white/10 hover:border-[#008CE5]/30'
                              } disabled:opacity-50`}
                            >
                              {docActionLoading === doc.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                              Approve
                            </button>
                            <button
                              onClick={() => {
                                if (rejectingDocId === doc.id) {
                                  setRejectingDocId(null);
                                  setDocRejectReason('');
                                } else {
                                  setRejectingDocId(doc.id);
                                  setDocRejectReason(doc.rejectionReason || '');
                                }
                              }}
                              disabled={docActionLoading === doc.id}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${
                                doc.status === 'rejected'
                                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                  : 'bg-white/5 text-white/60 hover:bg-red-500/20 hover:text-red-400 border border-white/10 hover:border-red-500/30'
                              } disabled:opacity-50`}
                            >
                              <XCircle className="w-3 h-3" />
                              Reject
                            </button>
                          </div>

                          {/* Inline reject/request-update reason input */}
                          {rejectingDocId === doc.id && (
                            <div className="mb-2">
                              <input
                                type="text"
                                placeholder="Reason (sent to provider)..."
                                value={docRejectReason}
                                onChange={(e) => setDocRejectReason(e.target.value)}
                                className="w-full text-xs bg-white/5 border border-red-500/30 rounded-lg px-3 py-2 text-white/80 placeholder-white/30 focus:outline-none focus:border-red-400 mb-1.5"
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleRequestDocUpdate(provider.providerId, doc.id, doc.type, docRejectReason)}
                                  disabled={!docRejectReason.trim() || docActionLoading === doc.id}
                                  className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-orange-500 text-white disabled:opacity-50 flex items-center justify-center gap-1"
                                >
                                  {docActionLoading === doc.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <AlertTriangle className="w-3 h-3" />}
                                  Send Update Request
                                </button>
                                <button
                                  onClick={() => { setRejectingDocId(null); setDocRejectReason(''); }}
                                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 text-white/60"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Expiry date */}
                          <div className="pt-2 border-t border-white/10">
                            {(() => {
                              if (!doc.expires_at) return null;
                              const today = new Date(); today.setHours(0,0,0,0);
                              const expiry = new Date(doc.expires_at + 'T00:00:00');
                              const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000*60*60*24));
                              if (diffDays < 0) return <p className="text-xs font-semibold text-red-400 mb-1.5">Expired {Math.abs(diffDays)}d ago</p>;
                              if (diffDays === 0) return <p className="text-xs font-semibold text-red-400 mb-1.5">Expires today</p>;
                              if (diffDays <= 30) return <p className="text-xs font-semibold text-yellow-400 mb-1.5">Expires in {diffDays}d</p>;
                              return null;
                            })()}
                            <div className="flex items-center gap-2">
                              <Calendar className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
                              <span className="text-white/30 text-xs whitespace-nowrap">Expires:</span>
                              <input
                                type="date"
                                value={doc.expires_at || ''}
                                onChange={(e) => handleUpdateDocExpiry(doc.id, e.target.value || null)}
                                className="flex-1 text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white/70 focus:outline-none focus:border-[#008CE5] min-w-0"
                                style={{ colorScheme: 'dark' }}
                              />
                            </div>
                          </div>

                          {/* Request Update button */}
                          <button
                            onClick={() => {
                              setRejectingDocId(doc.id);
                              setDocRejectReason(doc.expires_at && new Date(doc.expires_at + 'T00:00:00') < new Date(new Date().toDateString())
                                ? 'Document has expired. Please upload a current version.'
                                : '');
                            }}
                            className="w-full mt-2 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 bg-orange-500/15 text-orange-400 border border-orange-500/30 hover:bg-orange-500/25 transition-colors"
                          >
                            <AlertTriangle className="w-3 h-3" />
                            Request Update
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Background Check */}
                  <div className="mb-6">
                    <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      Background Check
                    </h4>
                    <div className="bg-white/5 rounded-xl p-3 flex items-center justify-between">
                      <span className="text-white/80 text-sm">Checkr Background Verification</span>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        provider.backgroundCheck === 'cleared'
                          ? 'bg-[#008CE5]/20 text-[#008CE5]'
                          : 'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {provider.backgroundCheck === 'cleared' ? 'Cleared ✓' : 'Pending...'}
                      </span>
                    </div>
                  </div>

                  {/* Services */}
                  <div className="mb-6">
                    <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                      <Car className="w-4 h-4" />
                      Services Offered
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {provider.servicesOffered.map((service: string) => (
                        <span key={service} className="px-3 py-1 rounded-full bg-white/5 text-white/80 text-sm">
                          {service}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleApprove(provider.providerId)}
                      disabled={actioningProviderId === provider.providerId}
                      className="flex-1 bg-gradient-to-r from-[#008CE5] to-[#0070B8] rounded-2xl py-3 font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      <CheckCircle className="w-5 h-5" />
                      {actioningProviderId === provider.providerId ? 'Saving...' : 'Approve Provider'}
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleReject(provider.providerId)}
                      disabled={actioningProviderId === provider.providerId}
                      className="flex-1 bg-red-500/20 border border-red-500/30 rounded-2xl py-3 font-semibold text-red-400 flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      <XCircle className="w-5 h-5" />
                      {actioningProviderId === provider.providerId ? 'Saving...' : 'Reject'}
                    </motion.button>
                  </div>
                </motion.div>
              ))}
            </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}