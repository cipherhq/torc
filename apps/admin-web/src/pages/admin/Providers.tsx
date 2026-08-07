import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'motion/react';
import { AdminLayout } from '../../components/AdminLayout';
import { supabase } from '../../lib/supabase';
import { requireAdminSession } from '../../lib/adminAuth';
import {
  Search, CheckCircle, Clock, XCircle, Star, Briefcase, Shield,
  UserCheck, UserX, Loader2, RefreshCw, ChevronDown,
  Edit3, Save, X, DollarSign, FileText, Truck, Phone,
  Calendar, Ban, AlertCircle,
} from 'lucide-react';
import { Pagination } from '../../components/Pagination';

interface Provider {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  status: string;
  is_verified: boolean;
  is_online: boolean;
  created_at: string;
  rating: number;
  total_jobs: number;
  total_earnings: number;
  acceptance_rate: number;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_year: number | null;
  vehicle_plate: string;
  license_number: string;
  services: string[];
}

interface ProviderJob {
  id: string;
  status: string;
  service_id: string;
  base_price: number;
  total_amount: number;
  payment_status: string;
  rating: number | null;
  pickup_address: string | null;
  created_at: string;
  completed_at: string | null;
}

interface ProviderDocument {
  id: string;
  type: string;
  file_name: string;
  status: string;
  rejection_reason: string | null;
  created_at: string;
}

interface ProviderPayout {
  id: string;
  period_start: string;
  period_end: string;
  total_earnings: number;
  total_tips: number;
  platform_fee: number;
  net_payout: number;
  status: string;
  paid_at: string | null;
}

type FilterStatus = 'all' | 'pending' | 'verified' | 'online' | 'suspended';

export function AdminProviders() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // On-demand detail data
  const [detailJobs, setDetailJobs] = useState<Record<string, ProviderJob[]>>({});
  const [detailDocs, setDetailDocs] = useState<Record<string, ProviderDocument[]>>({});
  const [detailPayouts, setDetailPayouts] = useState<Record<string, ProviderPayout[]>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);

  // Rejection modal
  const [rejectModalId, setRejectModalId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Edit modal
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [editForm, setEditForm] = useState({
    first_name: '', last_name: '', phone: '',
    vehicle_make: '', vehicle_model: '', vehicle_year: '',
    vehicle_plate: '', license_number: '',
  });
  const [editSaving, setEditSaving] = useState(false);

  const loadProviders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profilesRes, providerProfilesRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, first_name, last_name, email, phone, status, created_at')
          .eq('role', 'provider')
          .order('created_at', { ascending: false }),
        supabase
          .from('provider_profiles')
          .select(`
            id, is_verified, is_online, rating, total_jobs, total_earnings, acceptance_rate,
            vehicle_make, vehicle_model, vehicle_year, vehicle_plate, license_number, services,
            created_at
          `)
          .order('created_at', { ascending: false }),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (providerProfilesRes.error) throw providerProfilesRes.error;

      const profileMap = new Map<string, any>();
      (profilesRes.data || []).forEach((row: any) => profileMap.set(row.id, row));

      const providerProfileMap = new Map<string, any>();
      (providerProfilesRes.data || []).forEach((row: any) => providerProfileMap.set(row.id, row));

      const ids = Array.from(new Set([
        ...(profilesRes.data || []).map((row: any) => row.id),
        ...(providerProfilesRes.data || []).map((row: any) => row.id),
      ]));

      if (ids.length === 0) {
        setProviders([]);
        return;
      }

      const merged: Provider[] = ids.map((id) => {
        const prof = profileMap.get(id) || {};
        const pp = providerProfileMap.get(id) || {};
        return {
          id,
          first_name: prof.first_name || '',
          last_name: prof.last_name || '',
          email: prof.email || '',
          phone: prof.phone || '',
          status: prof.status || 'active',
          is_verified: Boolean(pp.is_verified),
          is_online: Boolean(pp.is_online),
          created_at: prof.created_at || pp.created_at || new Date().toISOString(),
          rating: Number(pp.rating) || 0,
          total_jobs: pp.total_jobs || 0,
          total_earnings: Number(pp.total_earnings) || 0,
          acceptance_rate: Number(pp.acceptance_rate) || 0,
          vehicle_make: pp.vehicle_make || '',
          vehicle_model: pp.vehicle_model || '',
          vehicle_year: pp.vehicle_year || null,
          vehicle_plate: pp.vehicle_plate || '',
          license_number: pp.license_number || '',
          services: pp.services || [],
        };
      });

      merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setProviders(merged);
    } catch (e: any) {
      console.warn('Failed to load providers:', e);
      setError(e?.message || 'Failed to load providers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  // Load detail data on-demand when expanding
  const loadProviderDetails = async (providerId: string) => {
    if (detailJobs[providerId]) return;
    setDetailLoading(providerId);
    try {
      const [jobsRes, docsRes, payoutsRes] = await Promise.all([
        supabase
          .from('jobs')
          .select('id, status, service_id, base_price, total_amount, payment_status, rating, pickup_address, created_at, completed_at')
          .eq('provider_id', providerId)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('documents')
          .select('id, type, file_name, status, rejection_reason, created_at')
          .eq('provider_id', providerId)
          .order('created_at', { ascending: false }),
        supabase
          .from('provider_payouts')
          .select('id, period_start, period_end, total_earnings, total_tips, platform_fee, net_payout, status, paid_at')
          .eq('provider_id', providerId)
          .order('period_end', { ascending: false })
          .limit(5),
      ]);

      setDetailJobs(prev => ({ ...prev, [providerId]: jobsRes.data || [] }));
      setDetailDocs(prev => ({ ...prev, [providerId]: docsRes.data || [] }));
      setDetailPayouts(prev => ({ ...prev, [providerId]: payoutsRes.data || [] }));
    } catch (e) {
      console.warn('Failed to load provider details:', e);
      setDetailJobs(prev => ({ ...prev, [providerId]: [] }));
      setDetailDocs(prev => ({ ...prev, [providerId]: [] }));
      setDetailPayouts(prev => ({ ...prev, [providerId]: [] }));
    } finally {
      setDetailLoading(null);
    }
  };

  const handleToggleExpand = (providerId: string) => {
    if (expandedId === providerId) {
      setExpandedId(null);
    } else {
      setExpandedId(providerId);
      loadProviderDetails(providerId);
    }
  };

  const sendEmail = async (to: string, template: string, data: Record<string, any> = {}) => {
    try {
      await supabase.functions.invoke('send-email', { body: { to, template, data } });
    } catch (err) {
      console.warn('Email send failed:', err);
    }
  };

  const handleApprove = async (providerId: string) => {
    setActionLoading(providerId);
    try {
      const admin = await requireAdminSession();
      const provider = providers.find(p => p.id === providerId);

      // Server-authoritative approval (validates document requirements)
      const { data: result, error: rpcErr } = await supabase.rpc('approve_provider', {
        p_provider_id: providerId,
      });

      if (rpcErr) throw rpcErr;
      if (!result?.success) {
        if (result?.error === 'MISSING_DOCUMENTS') {
          setError('Cannot approve: ' + (result.message || 'Required documents are missing or not approved.'));
        } else {
          setError('Approval failed: ' + (result?.message || result?.error || 'Unknown error'));
        }
        return;
      }

      setProviders(prev => prev.map(p => p.id === providerId ? { ...p, is_verified: true } : p));

      // Best-effort audit
      supabase.from('admin_audit_logs').insert({
        actor_id: admin.userId,
        action: 'approve_provider',
        entity_type: 'provider_profile',
        entity_id: providerId,
      }).then(() => {});

      if (provider?.email) {
        sendEmail(provider.email, 'provider_approved', {
          name: `${provider.first_name} ${provider.last_name}`.trim() || 'Provider',
        });
      }
    } catch (e: any) {
      console.error('Failed to approve provider:', e);
      setError(e?.message || 'Failed to approve provider.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (providerId: string, reason: string) => {
    setActionLoading(providerId);
    try {
      const admin = await requireAdminSession();
      const provider = providers.find(p => p.id === providerId);
      const nowIso = new Date().toISOString();

      const { error: upsertErr } = await supabase
        .from('provider_profiles')
        .upsert({ id: providerId, is_verified: false, updated_at: nowIso }, { onConflict: 'id' });

      if (upsertErr) throw upsertErr;

      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ is_verified: false, updated_at: nowIso })
        .eq('id', providerId);
      if (profileErr && !String(profileErr.message || '').includes('is_verified')) {
        throw profileErr;
      }

      // Update local state only after confirmed DB success
      setProviders(prev => prev.map(p => p.id === providerId ? { ...p, is_verified: false } : p));
      setRejectModalId(null);
      setRejectReason('');

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
          name: `${provider.first_name} ${provider.last_name}`.trim() || 'Provider',
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
      setError(e?.message || 'Failed to reject provider. The database update may have been blocked by permissions.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleSuspend = async (provider: Provider) => {
    const newStatus = provider.status === 'suspended' ? 'active' : 'suspended';
    setActionLoading(provider.id);
    try {
      const admin = await requireAdminSession();
      const updateData: Record<string, any> = { status: newStatus, updated_at: new Date().toISOString() };
      if (newStatus === 'suspended') {
        updateData.suspended_at = new Date().toISOString();
      } else {
        updateData.suspended_at = null;
      }

      const { data: updated, error: suspendErr } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', provider.id)
        .select('id, status');

      if (suspendErr) throw suspendErr;
      if (!updated || updated.length === 0) {
        throw new Error('Update failed — no rows affected. Check admin RLS policies on profiles.');
      }

      await supabase.from('admin_audit_logs').insert({
        actor_id: admin.userId,
        action: newStatus === 'suspended' ? 'suspend_provider' : 'unsuspend_provider',
        entity_type: 'provider_profile',
        entity_id: provider.id,
        details: { provider_name: `${provider.first_name} ${provider.last_name}`, provider_email: provider.email },
      });

      // Send email notification for suspension/unsuspension
      if (provider.email) {
        if (newStatus === 'suspended') {
          sendEmail(provider.email, 'provider_suspended', {
            name: `${provider.first_name} ${provider.last_name}`.trim() || 'Provider',
            reason: 'Your account has been suspended by an administrator. Please contact support for more details.',
          });
        } else {
          sendEmail(provider.email, 'provider_approved', {
            name: `${provider.first_name} ${provider.last_name}`.trim() || 'Provider',
          });
        }
      }

      setProviders(prev => prev.map(p => p.id === provider.id ? { ...p, status: newStatus } : p));
    } catch (e: any) {
      console.error('Failed to toggle suspend:', e);
      setError(e?.message || 'Failed to update suspend status. The database update may have been blocked by permissions.');
    } finally {
      setActionLoading(null);
    }
  };

  const openEditModal = (provider: Provider) => {
    setEditingProvider(provider);
    setEditForm({
      first_name: provider.first_name,
      last_name: provider.last_name,
      phone: provider.phone,
      vehicle_make: provider.vehicle_make,
      vehicle_model: provider.vehicle_model,
      vehicle_year: provider.vehicle_year ? String(provider.vehicle_year) : '',
      vehicle_plate: provider.vehicle_plate,
      license_number: provider.license_number,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingProvider) return;
    setEditSaving(true);
    try {
      const admin = await requireAdminSession();
      await supabase
        .from('profiles')
        .update({
          first_name: editForm.first_name,
          last_name: editForm.last_name,
          full_name: `${editForm.first_name} ${editForm.last_name}`.trim(),
          phone: editForm.phone,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingProvider.id);

      await supabase
        .from('provider_profiles')
        .upsert({
          id: editingProvider.id,
          vehicle_make: editForm.vehicle_make,
          vehicle_model: editForm.vehicle_model,
          vehicle_year: editForm.vehicle_year ? Number(editForm.vehicle_year) : null,
          vehicle_plate: editForm.vehicle_plate,
          license_number: editForm.license_number,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });

      await supabase.from('admin_audit_logs').insert({
        actor_id: admin.userId,
        action: 'edit_provider',
        entity_type: 'provider_profile',
        entity_id: editingProvider.id,
        details: { changes: editForm },
      });

      setProviders(prev =>
        prev.map(p => p.id === editingProvider.id ? {
          ...p,
          first_name: editForm.first_name,
          last_name: editForm.last_name,
          phone: editForm.phone,
          vehicle_make: editForm.vehicle_make,
          vehicle_model: editForm.vehicle_model,
          vehicle_year: editForm.vehicle_year ? Number(editForm.vehicle_year) : null,
          vehicle_plate: editForm.vehicle_plate,
          license_number: editForm.license_number,
        } : p)
      );

      setEditingProvider(null);
    } catch (e) {
      console.warn('Failed to save provider:', e);
    } finally {
      setEditSaving(false);
    }
  };

  const filteredProviders = useMemo(() => {
    return providers.filter(p => {
      const name = `${p.first_name} ${p.last_name}`.toLowerCase();
      const matchesSearch = !search || name.includes(search.toLowerCase()) || p.email.toLowerCase().includes(search.toLowerCase());
      if (filter === 'pending') return matchesSearch && !p.is_verified;
      if (filter === 'verified') return matchesSearch && p.is_verified;
      if (filter === 'online') return matchesSearch && p.is_online;
      if (filter === 'suspended') return matchesSearch && p.status === 'suspended';
      return matchesSearch;
    });
  }, [providers, search, filter]);

  useEffect(() => { setCurrentPage(1); }, [search, filter]);

  const paginatedProviders = useMemo(() =>
    filteredProviders.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
  [filteredProviders, currentPage]);

  const pendingCount = providers.filter(p => !p.is_verified).length;
  const verifiedCount = providers.filter(p => p.is_verified).length;
  const onlineCount = providers.filter(p => p.is_online).length;
  const suspendedCount = providers.filter(p => p.status === 'suspended').length;

  const formatCurrency = (n: number) => `$${n.toFixed(2)}`;
  const formatDate = (d: string | null) => {
    if (!d) return '--';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getStatusStyle = (status: string): React.CSSProperties => {
    switch (status) {
      case 'completed': case 'approved': case 'paid':
        return { backgroundColor: '#DCFCE7', color: '#15803D' };
      case 'cancelled': case 'rejected': case 'failed':
        return { backgroundColor: '#FEE2E2', color: '#B91C1C' };
      case 'pending': case 'matching': case 'processing':
        return { backgroundColor: '#FEF9C3', color: '#A16207' };
      default:
        return { backgroundColor: '#DBEAFE', color: '#1D4ED8' };
    }
  };

  return (
    <AdminLayout>
      <div className="p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Provider Management</h1>
            <p className="text-gray-500">
              {providers.length} total · {pendingCount} pending · {verifiedCount} verified · {onlineCount} online
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={loadProviders}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </motion.button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-6 flex items-center gap-3 bg-red-50 border border-red-200 rounded-[20px] px-5 py-4 text-red-600">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-medium">{error}</p>
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Stats cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Providers', value: providers.length, icon: Shield, gradient: 'linear-gradient(135deg, #008CE5, #0070B8)' },
            { label: 'Pending Approval', value: pendingCount, icon: Clock, gradient: 'linear-gradient(135deg, #FACC15, #F97316)' },
            { label: 'Verified', value: verifiedCount, icon: CheckCircle, gradient: 'linear-gradient(135deg, #4ADE80, #10B981)' },
            { label: 'Online Now', value: onlineCount, icon: Briefcase, gradient: 'linear-gradient(135deg, #60A5FA, #06B6D4)' },
          ].map((stat, index) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-5"
              >
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: stat.gradient }}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <p className="text-gray-500 text-sm">{stat.label}</p>
                <p className="text-gray-900 font-bold text-3xl">{stat.value}</p>
              </motion.div>
            );
          })}
        </div>

        {/* Search + Filter */}
        <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-4 mb-6">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            <div className="flex-1 flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
              <Search className="w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-gray-900 placeholder-gray-400 focus:outline-none"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {([
                { key: 'all' as FilterStatus, label: 'All' },
                { key: 'pending' as FilterStatus, label: `Pending (${pendingCount})` },
                { key: 'verified' as FilterStatus, label: `Verified (${verifiedCount})` },
                { key: 'online' as FilterStatus, label: `Online (${onlineCount})` },
                { key: 'suspended' as FilterStatus, label: `Suspended (${suspendedCount})` },
              ]).map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                  style={filter === f.key
                    ? { background: 'linear-gradient(to right, #008CE5, #0070B8)', color: '#FFFFFF' }
                    : { backgroundColor: '#F9FAFB', color: '#6B7280' }
                  }
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Provider List */}
        <div className="space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-[#008CE5]" />
            </div>
          ) : filteredProviders.length === 0 ? (
            <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-12 text-center">
              <Shield className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">
                {search ? 'No providers match your search' : filter === 'pending' ? 'No pending approvals' : 'No providers found'}
              </p>
            </div>
          ) : (
            paginatedProviders.map((provider, idx) => {
              const initials = `${(provider.first_name || '?')[0]}${(provider.last_name || '')[0] || ''}`.toUpperCase();
              const fullName = `${provider.first_name} ${provider.last_name}`.trim() || 'Unknown Provider';
              const isExpanded = expandedId === provider.id;
              const isProcessing = actionLoading === provider.id;
              const isLoadingDetails = detailLoading === provider.id;
              const jobs = detailJobs[provider.id] || [];
              const docs = detailDocs[provider.id] || [];
              const payouts = detailPayouts[provider.id] || [];

              return (
                <motion.div
                  key={provider.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(idx * 0.03, 0.5) }}
                  className="bg-white shadow-sm border border-gray-100 rounded-[24px] overflow-hidden"
                >
                  {/* Main row */}
                  <div
                    className="p-5 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => handleToggleExpand(provider.id)}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="relative flex-shrink-0">
                        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #008CE5, #0070B8)' }}>
                          <span className="text-white font-bold">{initials}</span>
                        </div>
                        {provider.is_online && (
                          <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-green-500 border-2 border-white" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-gray-900 font-semibold truncate">{fullName}</h3>
                          {provider.is_online && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1" style={{ backgroundColor: '#DCFCE7', color: '#15803D' }}>
                              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#22C55E' }} />
                              Online
                            </span>
                          )}
                          {provider.status === 'suspended' && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: '#FEE2E2', color: '#B91C1C' }}>Suspended</span>
                          )}
                        </div>
                        <p className="text-gray-400 text-sm truncate">{provider.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                      <div className="hidden md:flex items-center gap-4 mr-2">
                        {provider.rating > 0 && (
                          <div className="flex items-center gap-1">
                            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                            <span className="text-gray-700 text-sm font-semibold">{provider.rating.toFixed(1)}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <Briefcase className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-500 text-sm">{provider.total_jobs}</span>
                        </div>
                        <div className="hidden lg:flex items-center gap-1">
                          <DollarSign className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-500 text-sm">{formatCurrency(provider.total_earnings)}</span>
                        </div>
                      </div>

                      {provider.is_verified ? (
                        <span className="px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5" style={{ backgroundColor: '#DCFCE7', color: '#15803D' }}>
                          <CheckCircle className="w-3.5 h-3.5" /> Verified
                        </span>
                      ) : (
                        <span className="px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5" style={{ backgroundColor: '#FEF9C3', color: '#A16207' }}>
                          <Clock className="w-3.5 h-3.5" /> Pending
                        </span>
                      )}

                      <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-5 pb-5 pt-0 border-t border-gray-100">
                      {isLoadingDetails ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="w-6 h-6 animate-spin text-[#008CE5]" />
                          <span className="ml-2 text-gray-500 text-sm">Loading details...</span>
                        </div>
                      ) : (
                        <>
                          {/* Profile & Vehicle Info */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                            <div className="bg-gray-50 rounded-xl p-3">
                              <p className="text-gray-400 text-xs mb-1">Phone</p>
                              <div className="flex items-center gap-1.5">
                                <Phone className="w-3.5 h-3.5 text-gray-400" />
                                <p className="text-gray-900 text-sm font-semibold">{provider.phone || 'N/A'}</p>
                              </div>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-3">
                              <p className="text-gray-400 text-xs mb-1">Joined</p>
                              <div className="flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                                <p className="text-gray-900 text-sm font-semibold">{formatDate(provider.created_at)}</p>
                              </div>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-3">
                              <p className="text-gray-400 text-xs mb-1">Vehicle</p>
                              <div className="flex items-center gap-1.5">
                                <Truck className="w-3.5 h-3.5 text-gray-400" />
                                <p className="text-gray-900 text-sm font-semibold">
                                  {provider.vehicle_make ? `${provider.vehicle_year || ''} ${provider.vehicle_make} ${provider.vehicle_model}`.trim() : 'N/A'}
                                </p>
                              </div>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-3">
                              <p className="text-gray-400 text-xs mb-1">License Plate</p>
                              <p className="text-gray-900 text-sm font-semibold">{provider.vehicle_plate || 'N/A'}</p>
                            </div>
                          </div>

                          {/* Earnings row */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                            <div className="bg-gray-50 rounded-xl p-3">
                              <p className="text-gray-400 text-xs mb-1">Total Earnings</p>
                              <p className="text-gray-900 text-sm font-bold">{formatCurrency(provider.total_earnings)}</p>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-3">
                              <p className="text-gray-400 text-xs mb-1">Total Jobs</p>
                              <p className="text-gray-900 text-sm font-bold">{provider.total_jobs}</p>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-3">
                              <p className="text-gray-400 text-xs mb-1">Acceptance Rate</p>
                              <p className="text-gray-900 text-sm font-bold">{provider.acceptance_rate.toFixed(0)}%</p>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-3">
                              <p className="text-gray-400 text-xs mb-1">License #</p>
                              <p className="text-gray-900 text-sm font-bold">{provider.license_number || 'N/A'}</p>
                            </div>
                          </div>

                          {/* Services Offered */}
                          {provider.services.length > 0 && (
                            <div className="mt-5">
                              <h4 className="text-gray-900 font-semibold text-sm mb-3 flex items-center gap-2">
                                <Briefcase className="w-4 h-4 text-[#008CE5]" />
                                Services Offered ({provider.services.length})
                              </h4>
                              <div className="flex flex-wrap gap-2">
                                {provider.services.map((service: string) => (
                                  <span
                                    key={service}
                                    className="px-3 py-1.5 rounded-full text-xs font-semibold capitalize"
                                    style={{ backgroundColor: '#EFF6FF', color: '#008CE5', border: '1px solid #DBEAFE' }}
                                  >
                                    {service.replace(/_/g, ' ').replace(/-/g, ' ')}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Recent Jobs */}
                          <div className="mt-5">
                            <h4 className="text-gray-900 font-semibold text-sm mb-3 flex items-center gap-2">
                              <Briefcase className="w-4 h-4 text-[#008CE5]" />
                              Recent Jobs ({jobs.length})
                            </h4>
                            {jobs.length === 0 ? (
                              <p className="text-gray-400 text-sm bg-gray-50 rounded-xl p-3">No jobs found</p>
                            ) : (
                              <div className="space-y-2">
                                {jobs.slice(0, 5).map((job) => (
                                  <div key={job.id} className="bg-gray-50 rounded-xl p-3 flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0" style={getStatusStyle(job.status)}>
                                        {job.status}
                                      </span>
                                      <span className="text-gray-500 text-xs flex-shrink-0">{formatDate(job.created_at)}</span>
                                      {job.pickup_address && (
                                        <span className="text-gray-400 text-xs truncate hidden lg:inline">{job.pickup_address}</span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-3 flex-shrink-0">
                                      {job.rating && (
                                        <div className="flex items-center gap-1">
                                          <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                                          <span className="text-gray-600 text-xs">{job.rating}</span>
                                        </div>
                                      )}
                                      <span className="text-gray-900 text-sm font-semibold">
                                        {formatCurrency(Number(job.total_amount) || 0)}
                                      </span>
                                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={getStatusStyle(job.payment_status)}>
                                        {job.payment_status}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Documents */}
                          <div className="mt-5">
                            <h4 className="text-gray-900 font-semibold text-sm mb-3 flex items-center gap-2">
                              <FileText className="w-4 h-4 text-[#008CE5]" />
                              Documents ({docs.length})
                            </h4>
                            {docs.length === 0 ? (
                              <p className="text-gray-400 text-sm bg-gray-50 rounded-xl p-3">No documents uploaded</p>
                            ) : (
                              <div className="space-y-2">
                                {docs.map((doc) => (
                                  <div key={doc.id} className="bg-gray-50 rounded-xl p-3 flex items-center justify-between">
                                    <div className="flex items-center gap-3 min-w-0">
                                      <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                      <div className="min-w-0">
                                        <p className="text-gray-900 text-sm font-medium capitalize">{doc.type.replace(/_/g, ' ')}</p>
                                        <p className="text-gray-400 text-xs truncate">{doc.file_name || 'Unknown file'}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={getStatusStyle(doc.status)}>
                                        {doc.status}
                                      </span>
                                      {doc.rejection_reason && (
                                        <span className="text-red-400 text-xs max-w-[150px] truncate" title={doc.rejection_reason}>{doc.rejection_reason}</span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Payouts */}
                          <div className="mt-5">
                            <h4 className="text-gray-900 font-semibold text-sm mb-3 flex items-center gap-2">
                              <DollarSign className="w-4 h-4 text-[#008CE5]" />
                              Recent Payouts ({payouts.length})
                            </h4>
                            {payouts.length === 0 ? (
                              <p className="text-gray-400 text-sm bg-gray-50 rounded-xl p-3">No payouts found</p>
                            ) : (
                              <div className="space-y-2">
                                {payouts.map((payout) => (
                                  <div key={payout.id} className="bg-gray-50 rounded-xl p-3 flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={getStatusStyle(payout.status)}>
                                        {payout.status}
                                      </span>
                                      <span className="text-gray-500 text-xs">
                                        {formatDate(payout.period_start)} — {formatDate(payout.period_end)}
                                      </span>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-gray-900 text-sm font-semibold">{formatCurrency(Number(payout.net_payout) || 0)}</p>
                                      <p className="text-gray-400 text-xs">
                                        Earned {formatCurrency(Number(payout.total_earnings) || 0)} · Tips {formatCurrency(Number(payout.total_tips) || 0)} · Fee {formatCurrency(Number(payout.platform_fee) || 0)}
                                      </p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Action buttons */}
                          <div className="flex flex-wrap gap-3 mt-5 pt-4 border-t border-gray-100">
                            <motion.button
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={(e) => { e.stopPropagation(); openEditModal(provider); }}
                              className="px-5 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200 transition-colors flex items-center gap-2"
                            >
                              <Edit3 className="w-4 h-4" />
                              Edit Details
                            </motion.button>

                            {!provider.is_verified ? (
                              <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={(e) => { e.stopPropagation(); handleApprove(provider.id); }}
                                disabled={isProcessing}
                                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center gap-2 disabled:opacity-60"
                                style={{ background: 'linear-gradient(to right, #22C55E, #16A34A)' }}
                              >
                                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                                Approve
                              </motion.button>
                            ) : (
                              <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={(e) => { e.stopPropagation(); setRejectReason(''); setRejectModalId(provider.id); }}
                                disabled={isProcessing}
                                className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 disabled:opacity-60"
                                style={{ backgroundColor: '#FFEDD5', color: '#C2410C' }}
                              >
                                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                                Revoke Verification
                              </motion.button>
                            )}

                            <motion.button
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={(e) => { e.stopPropagation(); handleToggleSuspend(provider); }}
                              disabled={isProcessing}
                              className="px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 disabled:opacity-60 transition-colors"
                              style={provider.status === 'suspended'
                                ? { backgroundColor: '#DCFCE7', color: '#15803D' }
                                : { backgroundColor: '#FEE2E2', color: '#B91C1C' }
                              }
                            >
                              {isProcessing ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : provider.status === 'suspended' ? (
                                <UserCheck className="w-4 h-4" />
                              ) : (
                                <Ban className="w-4 h-4" />
                              )}
                              {provider.status === 'suspended' ? 'Unsuspend' : 'Suspend Account'}
                            </motion.button>
                          </div>

                          {/* Provider ID */}
                          <p className="text-gray-500 text-xs mt-3">ID: {provider.id}</p>
                        </>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })
          )}
        </div>

        {/* Pagination */}
        {!loading && filteredProviders.length > 0 && (
          <Pagination currentPage={currentPage} totalItems={filteredProviders.length} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
        )}

        {/* Edit Modal */}
        {editingProvider && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditingProvider(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-[24px] p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">Edit Provider</h2>
                <button onClick={() => setEditingProvider(null)} className="p-2 rounded-xl hover:bg-gray-100">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-gray-500 text-xs font-semibold mb-1 block">First Name</label>
                    <input
                      type="text"
                      value={editForm.first_name}
                      onChange={(e) => setEditForm(prev => ({ ...prev, first_name: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#008CE5]"
                    />
                  </div>
                  <div>
                    <label className="text-gray-500 text-xs font-semibold mb-1 block">Last Name</label>
                    <input
                      type="text"
                      value={editForm.last_name}
                      onChange={(e) => setEditForm(prev => ({ ...prev, last_name: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#008CE5]"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-gray-500 text-xs font-semibold mb-1 block">Phone</label>
                  <input
                    type="text"
                    value={editForm.phone}
                    onChange={(e) => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#008CE5]"
                  />
                </div>

                <hr className="border-gray-100" />
                <h3 className="text-gray-900 font-semibold text-sm">Vehicle Information</h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-gray-500 text-xs font-semibold mb-1 block">Make</label>
                    <input
                      type="text"
                      value={editForm.vehicle_make}
                      onChange={(e) => setEditForm(prev => ({ ...prev, vehicle_make: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#008CE5]"
                    />
                  </div>
                  <div>
                    <label className="text-gray-500 text-xs font-semibold mb-1 block">Model</label>
                    <input
                      type="text"
                      value={editForm.vehicle_model}
                      onChange={(e) => setEditForm(prev => ({ ...prev, vehicle_model: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#008CE5]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-gray-500 text-xs font-semibold mb-1 block">Year</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={editForm.vehicle_year}
                      onChange={(e) => setEditForm(prev => ({ ...prev, vehicle_year: e.target.value.replace(/[^0-9]/g, '') }))}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#008CE5]"
                    />
                  </div>
                  <div>
                    <label className="text-gray-500 text-xs font-semibold mb-1 block">License Plate</label>
                    <input
                      type="text"
                      value={editForm.vehicle_plate}
                      onChange={(e) => setEditForm(prev => ({ ...prev, vehicle_plate: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#008CE5]"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-gray-500 text-xs font-semibold mb-1 block">License Number</label>
                  <input
                    type="text"
                    value={editForm.license_number}
                    onChange={(e) => setEditForm(prev => ({ ...prev, license_number: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#008CE5]"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSaveEdit}
                  disabled={editSaving}
                  className="flex-1 py-3 rounded-xl text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{ background: 'linear-gradient(to right, #008CE5, #0070B8)' }}
                >
                  {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {editSaving ? 'Saving...' : 'Save Changes'}
                </motion.button>
                <button
                  onClick={() => setEditingProvider(null)}
                  className="px-6 py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
        {/* Rejection Reason Modal */}
        {rejectModalId && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => { if (!actionLoading) { setRejectModalId(null); setRejectReason(''); } }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-[32px] p-8 max-w-lg w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-gray-900 font-bold text-2xl mb-2">Revoke Provider Verification</h2>
              <p className="text-gray-500 text-sm mb-6">
                The provider will receive an email and in-app notification with the reason below so they can address the issue.
              </p>

              <div className="mb-4">
                <label className="text-gray-600 text-sm font-medium mb-2 block">Reason for rejection <span className="text-red-400">*</span></label>
                <textarea
                  rows={4}
                  placeholder="e.g. Expired driver's license, blurry insurance document, incomplete vehicle information..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
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
                    onClick={() => setRejectReason(reason)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: rejectReason === reason ? '#FEE2E2' : '#FEF2F2',
                      color: '#DC2626',
                      border: '1px solid #FECACA',
                    }}
                  >
                    {reason}
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => { setRejectModalId(null); setRejectReason(''); }}
                  className="flex-1 px-6 py-3 rounded-[20px] bg-gray-100 text-gray-900 font-semibold"
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleReject(rejectModalId, rejectReason)}
                  disabled={!rejectReason.trim() || actionLoading === rejectModalId}
                  className="flex-1 px-6 py-3 rounded-[20px] bg-red-500 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {actionLoading === rejectModalId ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <XCircle className="w-5 h-5" />
                  )}
                  {actionLoading === rejectModalId ? 'Revoking...' : 'Revoke & Notify'}
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
