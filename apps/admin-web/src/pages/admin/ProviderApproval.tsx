import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'motion/react';
import { AdminLayout } from '../../components/AdminLayout';
import { supabase } from '../../lib/supabase';
import { requireAdminSession } from '../../lib/adminAuth';
import {
  ShieldCheck,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  Car,
  User,
  Loader2,
  AlertTriangle,
  ChevronDown,
  Briefcase,
  Phone,
  Mail,
  Calendar,
  Hash,
  Eye,
} from 'lucide-react';
import { Pagination } from '../../components/Pagination';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ProviderDoc {
  id: string;
  type: string;
  file_name: string;
  file_url: string | null;
  file_path: string | null;
  mime_type: string | null;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  created_at: string;
  expires_at: string | null;
}

interface PendingProvider {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  services: string[];
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_year: number | null;
  vehicle_plate: string | null;
  license_number: string | null;
  created_at: string;
  documents: ProviderDoc[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function docStatusBadge(status: string) {
  switch (status) {
    case 'approved':
      return 'bg-green-50 text-green-600 border border-green-200';
    case 'rejected':
      return 'bg-red-50 text-red-600 border border-red-200';
    default:
      return 'bg-yellow-50 text-yellow-600 border border-yellow-200';
  }
}

function getDocExpiryLabel(expiresAt: string | null): { label: string; color: string } | null {
  if (!expiresAt) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiresAt + 'T00:00:00');
  const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { label: `Expired ${Math.abs(diffDays)}d ago`, color: '#EF4444' };
  if (diffDays === 0) return { label: 'Expires today', color: '#EF4444' };
  if (diffDays <= 30) return { label: `Expires in ${diffDays}d`, color: '#F59E0B' };
  return { label: `Exp ${expiry.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`, color: '#9CA3AF' };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ProviderApproval() {
  const [providers, setProviders] = useState<PendingProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  /* Deny modal state */
  const [denyModalId, setDenyModalId] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState('');

  /* Per-document action state */
  const [docActionLoading, setDocActionLoading] = useState<string | null>(null);
  const [rejectingDocId, setRejectingDocId] = useState<string | null>(null);
  const [docRejectReason, setDocRejectReason] = useState('');

  /* ---- data fetching ---- */

  const loadProviders = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [profileRes, providerProfileRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, email, phone, role, created_at')
          .eq('role', 'provider')
          .order('created_at', { ascending: false }),
        supabase
          .from('provider_profiles')
          .select(
            'id, services, vehicle_make, vehicle_model, vehicle_year, vehicle_plate, license_number, is_verified, created_at',
          ),
      ]);

      if (profileRes.error) throw profileRes.error;
      if (providerProfileRes.error) throw providerProfileRes.error;

      const profileRows = profileRes.data || [];
      const providerProfileRows = providerProfileRes.data || [];

      const profileMap = new Map<string, any>();
      profileRows.forEach((p: any) => profileMap.set(p.id, p));

      const providerProfileMap = new Map<string, any>();
      providerProfileRows.forEach((p: any) => providerProfileMap.set(p.id, p));

      const allProviderIds = Array.from(new Set([
        ...profileRows.map((p: any) => p.id),
        ...providerProfileRows.map((p: any) => p.id),
      ]));

      const pendingIds = allProviderIds.filter((id) => !providerProfileMap.get(id)?.is_verified);

      if (pendingIds.length === 0) {
        setProviders([]);
        return;
      }

      // 2. Profile info (name, email, phone)
      const { data: profileData, error: profErr } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, created_at')
        .in('id', pendingIds);

      if (profErr) throw profErr;

      const mergedProfileMap = new Map<string, any>();
      (profileData || []).forEach((p: any) => mergedProfileMap.set(p.id, p));

      // 3. Documents for these providers
      const { data: docData, error: docErr } = await supabase
        .from('documents')
        .select('id, provider_id, type, file_name, file_url, file_path, mime_type, status, rejection_reason, created_at, expires_at')
        .in('provider_id', pendingIds)
        .order('created_at', { ascending: true });

      if (docErr) throw docErr;

      // Generate signed URLs for documents with file_path (private bucket)
      const docsWithSignedUrls = await Promise.all(
        (docData || []).map(async (d: any) => {
          let resolvedUrl = d.file_url || null;
          if (d.file_path) {
            const { data: signed } = await supabase.storage
              .from('provider-documents')
              .createSignedUrl(d.file_path, 3600);
            if (signed?.signedUrl) resolvedUrl = signed.signedUrl;
          }
          return { ...d, file_url: resolvedUrl };
        })
      );

      const docMap = new Map<string, ProviderDoc[]>();
      docsWithSignedUrls.forEach((d: any) => {
        const existing = docMap.get(d.provider_id) || [];
        existing.push({
          id: d.id,
          type: d.type,
          file_name: d.file_name,
          file_url: d.file_url || null,
          file_path: d.file_path || null,
          mime_type: d.mime_type || null,
          status: d.status,
          rejection_reason: d.rejection_reason || null,
          created_at: d.created_at,
          expires_at: d.expires_at || null,
        });
        docMap.set(d.provider_id, existing);
      });

      // 4. Merge
      const merged: PendingProvider[] = pendingIds.map((id) => {
        const pp = providerProfileMap.get(id) || {};
        const prof = mergedProfileMap.get(id) || {};
        return {
          id,
          full_name: prof.full_name || 'Unknown',
          email: prof.email || '',
          phone: prof.phone || '',
          services: pp.services || [],
          vehicle_make: pp.vehicle_make || null,
          vehicle_model: pp.vehicle_model || null,
          vehicle_year: pp.vehicle_year || null,
          vehicle_plate: pp.vehicle_plate || null,
          license_number: pp.license_number || null,
          created_at: prof.created_at || pp.created_at || new Date().toISOString(),
          documents: docMap.get(id) || [],
        };
      });

      setProviders(merged);
    } catch (e: any) {
      console.error('Failed to load pending providers:', e);
      setError(e.message || 'Failed to load pending providers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  /* ---- actions ---- */

  /* Send email via edge function */
  const sendEmail = async (to: string, template: string, data: Record<string, any> = {}) => {
    try {
      await supabase.functions.invoke('send-email', {
        body: { to, template, data },
      });
    } catch (err) {
      console.warn('Email send failed:', err);
    }
  };

  const handleUpdateDocExpiry = async (docId: string, expiryDate: string | null) => {
    try {
      const { error } = await supabase
        .from('documents')
        .update({ expires_at: expiryDate || null })
        .eq('id', docId);
      if (error) throw error;
      setProviders(prev => prev.map(p => ({
        ...p,
        documents: p.documents.map(d =>
          d.id === docId ? { ...d, expires_at: expiryDate } : d
        ),
      })));
    } catch (e: any) {
      console.error('Failed to update document expiry:', e);
      alert('Failed to update expiry date');
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
      setProviders(prev => prev.map(p => ({
        ...p,
        documents: p.documents.map(d =>
          d.id === docId ? { ...d, status: 'approved' as const, rejection_reason: null } : d
        ),
      })));
    } catch (e: any) {
      alert('Failed to approve document: ' + (e.message || 'Unknown error'));
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

      // Find the provider who owns this document and send notification email
      const ownerProvider = providers.find(p => p.documents.some(d => d.id === docId));
      const rejectedDoc = ownerProvider?.documents.find(d => d.id === docId);
      if (ownerProvider?.email && rejectedDoc) {
        sendEmail(ownerProvider.email, 'document_request', {
          name: ownerProvider.full_name || 'Provider',
          reason: `Your ${rejectedDoc.type.replace(/_/g, ' ')} was rejected: ${reason || 'Please upload an updated document.'}`,
        });
      }

      setProviders(prev => prev.map(p => ({
        ...p,
        documents: p.documents.map(d =>
          d.id === docId ? { ...d, status: 'rejected' as const, rejection_reason: reason || 'Rejected by admin' } : d
        ),
      })));
      setRejectingDocId(null);
      setDocRejectReason('');
    } catch (e: any) {
      alert('Failed to reject document: ' + (e.message || 'Unknown error'));
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

      // Update local state
      setProviders(prev => prev.map(p => ({
        ...p,
        documents: p.documents.map(d =>
          d.id === docId ? { ...d, status: 'rejected' as const, rejection_reason: reason || 'Please upload an updated document.' } : d
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

      // Send email
      const provider = providers.find(p => p.id === providerId);
      if (provider?.email) {
        sendEmail(provider.email, 'document_request', {
          name: provider.full_name || 'Provider',
          reason: `Your ${docType.replace(/_/g, ' ')} needs to be updated: ${reason || 'Please upload an updated document.'}`,
        });
      }

      setRejectingDocId(null);
      setDocRejectReason('');
    } catch (e: any) {
      alert('Failed to request document update: ' + (e.message || 'Unknown error'));
    } finally {
      setDocActionLoading(null);
    }
  };

  const handleApprove = async (providerId: string) => {
    setActionLoading(providerId);
    try {
      const admin = await requireAdminSession();
      const provider = providers.find((p) => p.id === providerId);
      const nowIso = new Date().toISOString();

      // Mark all documents as approved
      const { error: docsErr } = await supabase
        .from('documents')
        .update({ status: 'approved', rejection_reason: null, reviewed_at: nowIso })
        .eq('provider_id', providerId);
      if (docsErr) throw docsErr;

      const { error: updateErr } = await supabase
        .from('provider_profiles')
        .upsert({ id: providerId, is_verified: true, updated_at: nowIso }, { onConflict: 'id' });

      if (updateErr) throw updateErr;

      // Also mark profiles.is_verified if column exists
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ is_verified: true, updated_at: nowIso })
        .eq('id', providerId);
      if (profileErr && !String(profileErr.message || '').includes('is_verified')) {
        throw profileErr;
      }

      // Remove from local list immediately after DB success
      setProviders((prev) => prev.filter((p) => p.id !== providerId));

      // Best-effort: audit log, email, notification (don't block UI)
      supabase.from('admin_audit_logs').insert({
        actor_id: admin.userId,
        action: 'approve_provider',
        entity_type: 'provider_profile',
        entity_id: providerId,
        details: { is_verified: true },
      }).then(() => {});

      if (provider?.email) {
        sendEmail(provider.email, 'provider_approved', {
          name: provider.full_name || 'Provider',
        });
      }

      supabase.from('notifications').insert({
        user_id: providerId,
        type: 'info',
        title: 'Application Approved!',
        message: 'Your provider application has been approved. You can now go online and start accepting service requests.',
        action_url: '/home',
      }).then(() => {});
    } catch (e: any) {
      console.error('Failed to approve provider:', e);
      alert('Failed to approve provider: ' + (e.message || 'Unknown error'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (providerId: string, reason: string) => {
    setActionLoading(providerId);
    try {
      const admin = await requireAdminSession();
      const provider = providers.find((p) => p.id === providerId);
      const nowIso = new Date().toISOString();

      const { error: updateErr } = await supabase
        .from('provider_profiles')
        .upsert({
          id: providerId,
          is_verified: false,
          updated_at: nowIso,
        }, { onConflict: 'id' });

      if (updateErr) throw updateErr;

      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ is_verified: false, updated_at: nowIso })
        .eq('id', providerId);
      if (profileErr && !String(profileErr.message || '').includes('is_verified')) {
        throw profileErr;
      }

      // Remove from local list immediately after DB success
      setProviders((prev) => prev.filter((p) => p.id !== providerId));
      setDenyModalId(null);
      setDenyReason('');

      // Best-effort: audit log, email, notification (don't block UI)
      supabase.from('admin_audit_logs').insert({
        actor_id: admin.userId,
        action: 'reject_provider',
        entity_type: 'provider_profile',
        entity_id: providerId,
        details: { rejected: true, reason: reason || 'No reason provided' },
      }).then(() => {});

      if (provider?.email) {
        sendEmail(provider.email, 'document_request', {
          name: provider.full_name || 'Provider',
          reason: reason || 'Your application did not meet our requirements. Please review and resubmit.',
        });
      }

      supabase.from('notifications').insert({
        user_id: providerId,
        type: 'alert',
        title: 'Application Update Required',
        message: reason || 'Your application needs attention. Please review and resubmit your documents.',
        action_url: '/documents',
      }).then(() => {});
    } catch (e: any) {
      console.error('Failed to reject provider:', e);
      alert('Failed to reject provider: ' + (e.message || 'Unknown error'));
    } finally {
      setActionLoading(null);
    }
  };

  /* ---- derived state ---- */

  const filtered = useMemo(() => {
    if (!search.trim()) return providers;
    const q = search.toLowerCase();
    return providers.filter(
      (p) =>
        p.full_name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q),
    );
  }, [providers, search]);

  useEffect(() => { setCurrentPage(1); }, [search]);

  const paginatedProviders = useMemo(() =>
    filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
  [filtered, currentPage]);

  const pendingDocCount = useMemo(
    () => providers.reduce((sum, p) => sum + p.documents.filter((d) => d.status === 'pending').length, 0),
    [providers],
  );

  /* ---- render ---- */

  return (
    <AdminLayout>
      <div className="p-8 min-h-screen bg-white">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-1">Provider Approval</h1>
            <p className="text-gray-500">Review and approve pending provider applications</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={loadProviders}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all text-sm font-semibold disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </motion.button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
          <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #008CE5, #0070B8)' }}>
              <Clock className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-3xl font-bold text-gray-900">{providers.length}</p>
              <p className="text-gray-500 text-sm">Pending Approval</p>
            </div>
          </div>

          <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #FACC15, #F97316)' }}>
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-3xl font-bold text-gray-900">{pendingDocCount}</p>
              <p className="text-gray-500 text-sm">Documents Pending</p>
            </div>
          </div>

          <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #4ADE80, #10B981)' }}>
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-3xl font-bold text-gray-900">
                {providers.reduce((sum, p) => sum + p.documents.filter((d) => d.status === 'approved').length, 0)}
              </p>
              <p className="text-gray-500 text-sm">Docs Approved</p>
            </div>
          </div>
        </div>

        {/* Search bar */}
        <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-4 mb-6">
          <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
            <Search className="w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-gray-900 placeholder-gray-400 focus:outline-none text-sm"
            />
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-[24px] p-5 mb-6 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-red-600 text-sm">{error}</p>
            <button
              onClick={loadProviders}
              className="ml-auto text-red-600 text-sm font-semibold underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-[#008CE5]" />
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && filtered.length === 0 && (
          <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-16 text-center">
            <ShieldCheck className="w-14 h-14 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-500 text-lg font-medium">
              {search ? 'No providers match your search' : 'No pending provider applications'}
            </p>
            <p className="text-gray-400 text-sm mt-1">
              {search ? 'Try adjusting your search terms' : 'All caught up! Check back later.'}
            </p>
          </div>
        )}

        {/* Provider list */}
        {!loading && filtered.length > 0 && (
          <div className="space-y-4">
            {paginatedProviders.map((provider, idx) => {
              const isExpanded = expandedId === provider.id;
              const isProcessing = actionLoading === provider.id;
              const initials = provider.full_name
                .split(' ')
                .map((w) => w[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);
              const vehicleStr = [provider.vehicle_year, provider.vehicle_make, provider.vehicle_model]
                .filter(Boolean)
                .join(' ');

              return (
                <motion.div
                  key={provider.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  className="bg-white shadow-sm border border-gray-100 rounded-[24px] overflow-hidden"
                >
                  {/* Collapsed row */}
                  <div
                    className="p-5 flex items-center justify-between cursor-pointer hover:bg-gray-50/60 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : provider.id)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #008CE5, #0070B8)' }}>
                        <span className="text-white font-bold text-sm">{initials}</span>
                      </div>
                      <div>
                        <h3 className="text-gray-900 font-semibold">{provider.full_name}</h3>
                        <p className="text-gray-400 text-sm">{provider.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="px-3 py-1.5 rounded-full bg-yellow-50 text-yellow-600 text-xs font-bold flex items-center gap-1.5 border border-yellow-200">
                        <Clock className="w-3.5 h-3.5" />
                        Pending
                      </span>
                      <span className="text-gray-400 text-sm hidden sm:block">{formatDate(provider.created_at)}</span>
                      <ChevronDown
                        className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      />
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-5 pb-6 pt-0 border-t border-gray-100">
                      {/* Info grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5 mb-6">
                        <div className="bg-gray-50 rounded-xl p-3">
                          <p className="text-gray-400 text-xs mb-1 flex items-center gap-1">
                            <Phone className="w-3 h-3" /> Phone
                          </p>
                          <p className="text-gray-900 text-sm font-semibold">{provider.phone || 'Not provided'}</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-3">
                          <p className="text-gray-400 text-xs mb-1 flex items-center gap-1">
                            <Mail className="w-3 h-3" /> Email
                          </p>
                          <p className="text-gray-900 text-sm font-semibold truncate">{provider.email || 'Not provided'}</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-3">
                          <p className="text-gray-400 text-xs mb-1 flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> Applied
                          </p>
                          <p className="text-gray-900 text-sm font-semibold">{formatDate(provider.created_at)}</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-3">
                          <p className="text-gray-400 text-xs mb-1 flex items-center gap-1">
                            <Hash className="w-3 h-3" /> License
                          </p>
                          <p className="text-gray-900 text-sm font-semibold">{provider.license_number || 'Not provided'}</p>
                        </div>
                      </div>

                      {/* Vehicle info */}
                      <div className="mb-6">
                        <h4 className="text-gray-900 font-semibold text-sm mb-3 flex items-center gap-2">
                          <Car className="w-4 h-4 text-gray-500" />
                          Vehicle Information
                        </h4>
                        {vehicleStr ? (
                          <div className="bg-gray-50 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                            {provider.vehicle_year && (
                              <div>
                                <p className="text-gray-400 text-xs">Year</p>
                                <p className="text-gray-900 text-sm font-semibold">{provider.vehicle_year}</p>
                              </div>
                            )}
                            {provider.vehicle_make && (
                              <div>
                                <p className="text-gray-400 text-xs">Make</p>
                                <p className="text-gray-900 text-sm font-semibold">{provider.vehicle_make}</p>
                              </div>
                            )}
                            {provider.vehicle_model && (
                              <div>
                                <p className="text-gray-400 text-xs">Model</p>
                                <p className="text-gray-900 text-sm font-semibold">{provider.vehicle_model}</p>
                              </div>
                            )}
                            {provider.vehicle_plate && (
                              <div>
                                <p className="text-gray-400 text-xs">Plate</p>
                                <p className="text-gray-900 text-sm font-semibold">{provider.vehicle_plate}</p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-gray-400 text-sm">No vehicle information provided</p>
                        )}
                      </div>

                      {/* Services offered */}
                      {provider.services.length > 0 && (
                        <div className="mb-6">
                          <h4 className="text-gray-900 font-semibold text-sm mb-3 flex items-center gap-2">
                            <Briefcase className="w-4 h-4 text-gray-500" />
                            Services Offered
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {provider.services.map((service) => (
                              <span
                                key={service}
                                className="px-3 py-1.5 rounded-full bg-blue-50 text-[#008CE5] text-xs font-semibold border border-blue-100"
                              >
                                {service}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Documents */}
                      <div className="mb-6">
                        <h4 className="text-gray-900 font-semibold text-sm mb-3 flex items-center gap-2">
                          <FileText className="w-4 h-4 text-gray-500" />
                          Documents
                          {provider.documents.length > 0 && (
                            <span className="text-gray-400 text-xs font-normal">({provider.documents.length})</span>
                          )}
                        </h4>
                        {provider.documents.length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {provider.documents.map((doc) => (
                              <div
                                key={doc.id}
                                className="bg-gray-50 rounded-xl p-4"
                              >
                                {/* Document preview */}
                                {doc.file_url && (
                                  <div className="mb-3">
                                    {(doc.mime_type || '').startsWith('image/') ? (
                                      <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="block">
                                        <img src={doc.file_url} alt={doc.type} className="w-full h-40 object-cover rounded-lg hover:opacity-90 transition-opacity" />
                                      </a>
                                    ) : (
                                      <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                                        className="flex items-center gap-2 text-[#008CE5] text-sm font-semibold hover:underline py-2">
                                        <Eye className="w-4 h-4" />
                                        View Document
                                      </a>
                                    )}
                                  </div>
                                )}

                                {/* Info row */}
                                <div className="flex items-center justify-between mb-2">
                                  <div className="min-w-0">
                                    <p className="text-gray-900 text-sm font-medium truncate">{doc.type}</p>
                                    <p className="text-gray-400 text-xs truncate">{doc.file_name}</p>
                                  </div>
                                  <span
                                    className={`flex-shrink-0 ml-3 px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${docStatusBadge(doc.status)}`}
                                  >
                                    {doc.status}
                                  </span>
                                </div>

                                {/* Rejection reason display */}
                                {doc.status === 'rejected' && doc.rejection_reason && (
                                  <p className="text-xs text-red-500 mb-2">Reason: {doc.rejection_reason}</p>
                                )}

                                {/* Per-document action buttons */}
                                <div className="flex gap-2 mb-2">
                                  <button
                                    onClick={() => handleApproveDoc(doc.id)}
                                    disabled={doc.status === 'approved' || docActionLoading === doc.id}
                                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${
                                      doc.status === 'approved'
                                        ? 'bg-green-50 text-green-600 border border-green-200'
                                        : 'bg-gray-100 text-gray-600 hover:bg-green-50 hover:text-green-600 border border-gray-200 hover:border-green-200'
                                    } disabled:opacity-50`}
                                  >
                                    {docActionLoading === doc.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (rejectingDocId === doc.id) {
                                        setRejectingDocId(null);
                                        setDocRejectReason('');
                                      } else {
                                        setRejectingDocId(doc.id);
                                        setDocRejectReason(doc.rejection_reason || '');
                                      }
                                    }}
                                    disabled={docActionLoading === doc.id}
                                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${
                                      doc.status === 'rejected'
                                        ? 'bg-red-50 text-red-600 border border-red-200'
                                        : 'bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600 border border-gray-200 hover:border-red-200'
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
                                      className="w-full text-xs bg-white border border-red-200 rounded-lg px-3 py-2 text-gray-700 focus:outline-none focus:border-red-400 mb-1.5"
                                    />
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => handleRequestDocUpdate(provider.id, doc.id, doc.type, docRejectReason)}
                                        disabled={!docRejectReason.trim() || docActionLoading === doc.id}
                                        className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-orange-500 text-white disabled:opacity-50 flex items-center justify-center gap-1"
                                      >
                                        {docActionLoading === doc.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <AlertTriangle className="w-3 h-3" />}
                                        Send Update Request
                                      </button>
                                      <button
                                        onClick={() => { setRejectingDocId(null); setDocRejectReason(''); }}
                                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {/* Expiry date */}
                                <div className="pt-2 border-t border-gray-100">
                                  {(() => {
                                    const expiryInfo = getDocExpiryLabel(doc.expires_at);
                                    return expiryInfo ? (
                                      <p className="text-xs font-semibold mb-1.5" style={{ color: expiryInfo.color }}>
                                        {expiryInfo.label}
                                      </p>
                                    ) : null;
                                  })()}
                                  <div className="flex items-center gap-2">
                                    <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                    <span className="text-gray-400 text-xs whitespace-nowrap">Expires:</span>
                                    <input
                                      type="date"
                                      value={doc.expires_at || ''}
                                      onChange={(e) => handleUpdateDocExpiry(doc.id, e.target.value || null)}
                                      className="flex-1 text-xs bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 focus:outline-none focus:border-[#008CE5] min-w-0"
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
                                  className="w-full mt-2 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100 transition-colors"
                                >
                                  <AlertTriangle className="w-3 h-3" />
                                  Request Update
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-gray-400 text-sm">No documents uploaded</p>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-3 pt-2">
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleApprove(provider.id);
                          }}
                          disabled={isProcessing}
                          style={{ background: 'linear-gradient(to right, #008CE5, #0070B8)', color: '#FFFFFF' }}
                          className="flex-1 rounded-2xl py-3 font-semibold flex items-center justify-center gap-2 text-sm disabled:opacity-50 transition-opacity"
                        >
                          {isProcessing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                          Approve Provider
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDenyReason('');
                            setDenyModalId(provider.id);
                          }}
                          disabled={isProcessing}
                          className="flex-1 bg-red-50 text-red-600 border border-red-200 rounded-2xl py-3 font-semibold flex items-center justify-center gap-2 text-sm disabled:opacity-50 transition-opacity"
                        >
                          <XCircle className="w-4 h-4" />
                          Deny
                        </motion.button>
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
            <Pagination currentPage={currentPage} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
          </div>
        )}
        {/* Deny Reason Modal */}
        {denyModalId && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => { if (!actionLoading) { setDenyModalId(null); setDenyReason(''); } }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-[32px] p-8 max-w-lg w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-gray-900 font-bold text-2xl mb-2">Deny Provider Application</h2>
              <p className="text-gray-500 text-sm mb-6">
                The provider will receive an email with the reason below so they can address the issue and reapply.
              </p>

              <div className="mb-4">
                <label className="text-gray-600 text-sm font-medium mb-2 block">Reason for denial <span className="text-red-400">*</span></label>
                <textarea
                  rows={4}
                  placeholder="e.g. Expired driver's license, blurry insurance document, incomplete vehicle information..."
                  value={denyReason}
                  onChange={(e) => setDenyReason(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-[16px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-red-300 resize-none"
                />
              </div>

              {/* Quick reason buttons */}
              <div className="flex flex-wrap gap-2 mb-6">
                {[
                  'Expired or unreadable documents',
                  'Missing vehicle registration',
                  'Background check not cleared',
                  'Incomplete profile information',
                ].map((reason) => (
                  <button
                    key={reason}
                    onClick={() => setDenyReason(reason)}
                    className="px-3 py-1.5 rounded-full bg-red-50 text-red-600 text-xs font-medium border border-red-100 hover:bg-red-100 transition-colors"
                  >
                    {reason}
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => { setDenyModalId(null); setDenyReason(''); }}
                  className="flex-1 px-6 py-3 rounded-[20px] bg-gray-100 text-gray-900 font-semibold"
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleReject(denyModalId, denyReason)}
                  disabled={!denyReason.trim() || actionLoading === denyModalId}
                  className="flex-1 px-6 py-3 rounded-[20px] bg-red-500 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {actionLoading === denyModalId ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <XCircle className="w-5 h-5" />
                  )}
                  {actionLoading === denyModalId ? 'Denying...' : 'Deny & Send Email'}
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
