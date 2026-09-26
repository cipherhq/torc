import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'motion/react';
import { AdminLayout } from '../../components/AdminLayout';
import { supabase } from '../../lib/supabase';
import { Activity, MapPin, Clock, RefreshCw, Navigation, AlertCircle, Search, X, User, DollarSign, CalendarClock } from 'lucide-react';

interface JobRow {
  id: string;
  status: string;
  pickup_address: string | null;
  pickup_latitude: number | null;
  pickup_longitude: number | null;
  destination_address: string | null;
  destination_latitude: number | null;
  destination_longitude: number | null;
  service_id: string | null;
  customer_id: string | null;
  provider_id: string | null;
  payment_status: string | null;
  base_price: number | null;
  service_fee: number | null;
  tax: number | null;
  tip: number | null;
  accepted_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  scheduled_for: string | null;
  updated_at: string;
  customer_notes: string | null;
  cancellation_reason: string | null;
  total_amount: number | null;
  created_at: string;
  started_at: string | null;
  customer: { full_name: string | null; email?: string | null; phone?: string | null } | null;
  provider: { full_name: string | null; email?: string | null; phone?: string | null } | null;
  service: { name: string | null } | null;
}

const ACTIVE_STATUSES = ['pending', 'matching', 'accepted', 'enroute', 'arrived', 'inprogress'];

const STATUS_BADGE: Record<string, { bg: string; label: string }> = {
  pending:    { bg: 'bg-yellow-100 text-yellow-800', label: 'Pending' },
  matching:   { bg: 'bg-blue-100 text-blue-800', label: 'Matching' },
  accepted:   { bg: 'bg-sky-100 text-sky-800', label: 'Accepted' },
  enroute:    { bg: 'bg-indigo-100 text-indigo-800', label: 'En Route' },
  arrived:    { bg: 'bg-purple-100 text-purple-800', label: 'Arrived' },
  inprogress: { bg: 'bg-orange-100 text-orange-800', label: 'In Progress' },
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.floor(diffMs / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function AdminLiveDispatch() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobRow | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchJobs = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);

      // jobs has no PostgREST foreign-key relationships in production. Load the
      // rows first, then resolve people/services explicitly to avoid the
      // "could not find a relationship" error.
      const { data, error: fetchError } = await supabase
        .from('jobs')
        .select(`
          id, status, pickup_address, pickup_latitude, pickup_longitude,
          destination_address, destination_latitude, destination_longitude,
          total_amount, base_price, service_fee, tax, tip, payment_status,
          created_at, updated_at, started_at, accepted_at, completed_at,
          cancelled_at, scheduled_for, customer_notes, cancellation_reason,
          customer_id, provider_id, service_id
        `)
        .in('status', ACTIVE_STATUSES)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      const rows = (data || []) as unknown as JobRow[];
      const profileIds = Array.from(new Set(rows.flatMap(j => [j.customer_id, j.provider_id].filter(Boolean) as string[])));
      const serviceIds = Array.from(new Set(rows.map(j => j.service_id).filter(Boolean) as string[]));
      const [{ data: profiles }, { data: services }] = await Promise.all([
        profileIds.length ? supabase.from('profiles').select('id, full_name, email, phone').in('id', profileIds) : Promise.resolve({ data: [] as any[] }),
        serviceIds.length ? supabase.from('services').select('id, name').in('id', serviceIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
      const serviceMap = new Map((services || []).map((s: any) => [String(s.id), s]));
      setJobs(rows.map(job => ({
        ...job,
        customer: job.customer_id ? profileMap.get(job.customer_id) || null : null,
        provider: job.provider_id ? profileMap.get(job.provider_id) || null : null,
        service: job.service_id ? serviceMap.get(String(job.service_id)) || null : null,
      })));
      setLastUpdated(new Date());
    } catch (err: any) {
      setError(err.message ?? 'Failed to load jobs');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial fetch + 30-second polling
  useEffect(() => {
    fetchJobs();
    const interval = setInterval(() => fetchJobs(true), 30_000);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  // Realtime subscription for live updates
  useEffect(() => {
    const channel = supabase
      .channel('live-dispatch-jobs')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'jobs' },
        () => fetchJobs(true),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchJobs]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchJobs(true);
  };

  // Derived stats
  const stats = useMemo(() => {
    const active = jobs.length;
    const pending = jobs.filter(j => j.status === 'pending' || j.status === 'matching').length;
    const enroute = jobs.filter(j => j.status === 'enroute' || j.status === 'accepted').length;
    const inprogress = jobs.filter(j => j.status === 'inprogress' || j.status === 'arrived').length;

    return [
      { label: 'Active Jobs', value: active, icon: Activity, bgColor: '#008CE5' },
      { label: 'Pending', value: pending, icon: AlertCircle, bgColor: '#EAB308' },
      { label: 'En Route', value: enroute, icon: Navigation, bgColor: '#6366F1' },
      { label: 'In Progress', value: inprogress, icon: Clock, bgColor: '#F97316' },
    ];
  }, [jobs]);

  // Filtered jobs
  const filteredJobs = useMemo(() => {
    if (!search.trim()) return jobs;
    const q = search.toLowerCase();
    return jobs.filter(j => {
      const customerName = j.customer?.full_name?.toLowerCase() ?? '';
      const providerName = j.provider?.full_name?.toLowerCase() ?? '';
      const address = j.pickup_address?.toLowerCase() ?? '';
      const dest = j.destination_address?.toLowerCase() ?? '';
      return (
        customerName.includes(q) ||
        providerName.includes(q) ||
        address.includes(q) ||
        dest.includes(q)
      );
    });
  }, [jobs, search]);

  return (
    <AdminLayout>
      <div className="p-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-gray-900 text-3xl font-bold mb-1">Live Dispatch</h1>
            <p className="text-gray-500 text-sm">Real-time active job monitoring</p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer"
            style={{ background: 'linear-gradient(to right, #008CE5, #0070B8)', color: '#FFFFFF' }}
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-8">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
                className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: stat.bgColor }}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-gray-500 text-sm font-medium">{stat.label}</span>
                </div>
                <p className="text-gray-900 text-3xl font-bold">{stat.value}</p>
              </motion.div>
            );
          })}
        </div>

        {/* Search */}
        <div className="mb-6 relative max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or address..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#008CE5]/30 focus:border-[#008CE5]"
          />
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-red-700 text-sm">{error}</p>
            <button
              onClick={handleRefresh}
              className="ml-auto text-red-600 text-sm font-medium underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24">
            <RefreshCw className="w-8 h-8 text-[#008CE5] animate-spin mb-4" />
            <p className="text-gray-500 text-sm">Loading active jobs...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filteredJobs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 bg-white shadow-sm border border-gray-100 rounded-[24px]">
            <Activity className="w-12 h-12 text-gray-300 mb-4" />
            <p className="text-gray-900 font-semibold text-lg mb-1">No active jobs</p>
            <p className="text-gray-500 text-sm">
              {search.trim() ? 'No jobs match your search.' : 'There are no active jobs at this time.'}
            </p>
          </div>
        )}

        {/* Job List */}
        {!loading && filteredJobs.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredJobs.map((job, index) => {
              const badge = STATUS_BADGE[job.status] ?? { bg: 'bg-gray-100 text-gray-700', label: job.status };
              const customerName = job.customer?.full_name ?? 'Unknown Customer';
              const providerName = job.provider?.full_name ?? null;
              const serviceName = job.service?.name ?? 'Service';

              return (
                <motion.div
                  key={job.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04 }}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedJob(job)}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedJob(job); }}
                className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-5 hover:shadow-md transition-shadow cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#008CE5]/40"
                >
                  {/* Top row: service + badge */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-gray-900 font-bold text-base">{serviceName}</p>
                      <p className="text-gray-400 text-xs mt-0.5">ID: {job.id.slice(0, 8)}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${badge.bg}`}>
                      {badge.label}
                    </span>
                  </div>

                  {/* People */}
                  <div className="space-y-1.5 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 text-xs w-16 flex-shrink-0">Customer</span>
                      <span className="text-gray-900 text-sm font-medium truncate">{customerName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 text-xs w-16 flex-shrink-0">Provider</span>
                      <span className={`text-sm font-medium truncate ${providerName ? 'text-gray-900' : 'text-gray-400 italic'}`}>
                        {providerName ?? 'Unassigned'}
                      </span>
                    </div>
                  </div>

                  {/* Address */}
                  {job.pickup_address && (
                    <div className="flex items-start gap-2 mb-3">
                      <MapPin className="w-4 h-4 text-[#008CE5] flex-shrink-0 mt-0.5" />
                      <p className="text-gray-600 text-xs leading-relaxed line-clamp-2">{job.pickup_address}</p>
                    </div>
                  )}

                  {/* Footer: time */}
                  <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                    <Clock className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-gray-500 text-xs">{timeAgo(job.created_at)}</span>
                    {job.total_amount != null && (
                      <>
                        <span className="text-gray-300 text-xs mx-1">|</span>
                        <span className="text-gray-900 text-xs font-semibold">${job.total_amount.toFixed(2)}</span>
                      </>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
        {lastUpdated && <p className="mt-4 text-xs text-gray-400">Live updates enabled · refreshed {lastUpdated.toLocaleTimeString()}</p>}
      </div>
      {selectedJob && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 p-4 sm:p-8 flex items-center justify-center" onClick={() => setSelectedJob(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-5 flex items-center justify-between">
              <div><p className="text-xs uppercase tracking-wider text-slate-400">Job details</p><h2 className="text-xl font-bold text-slate-900">{selectedJob.service?.name || 'Service request'}</h2><p className="text-xs text-slate-400 font-mono">{selectedJob.id}</p></div>
              <button aria-label="Close job details" onClick={() => setSelectedJob(null)} className="p-2 rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm">
              <div className="sm:col-span-2 flex flex-wrap gap-2"><span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE[selectedJob.status]?.bg || 'bg-slate-100 text-slate-700'}`}>{STATUS_BADGE[selectedJob.status]?.label || selectedJob.status}</span><span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs">Payment: {selectedJob.payment_status || 'not recorded'}</span></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-400 mb-2"><User className="inline w-3.5 h-3.5 mr-1" />Customer</p><p className="font-semibold">{selectedJob.customer?.full_name || 'Unassigned'}</p><p className="text-slate-500">{selectedJob.customer?.email || ''}</p><p className="text-slate-500">{selectedJob.customer?.phone || ''}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-400 mb-2"><User className="inline w-3.5 h-3.5 mr-1" />Provider</p><p className="font-semibold">{selectedJob.provider?.full_name || 'Unassigned'}</p><p className="text-slate-500">{selectedJob.provider?.email || ''}</p><p className="text-slate-500">{selectedJob.provider?.phone || ''}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-400 mb-2"><MapPin className="inline w-3.5 h-3.5 mr-1" />Route</p><p><b>Pickup:</b> {selectedJob.pickup_address || '—'}</p><p className="text-slate-600"><b>Drop-off:</b> {selectedJob.destination_address || '—'}</p><p className="text-xs text-slate-400 mt-2">{selectedJob.pickup_latitude ?? '—'}, {selectedJob.pickup_longitude ?? '—'} → {selectedJob.destination_latitude ?? '—'}, {selectedJob.destination_longitude ?? '—'}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-400 mb-2"><DollarSign className="inline w-3.5 h-3.5 mr-1" />Financials</p><p>Base {selectedJob.base_price == null ? '—' : `$${Number(selectedJob.base_price).toFixed(2)}`}</p><p>Fee {selectedJob.service_fee == null ? '—' : `$${Number(selectedJob.service_fee).toFixed(2)}`} · Tax {selectedJob.tax == null ? '—' : `$${Number(selectedJob.tax).toFixed(2)}`}</p><p>Tip {selectedJob.tip == null ? '—' : `$${Number(selectedJob.tip).toFixed(2)}`} · <b>Total {selectedJob.total_amount == null ? '—' : `$${Number(selectedJob.total_amount).toFixed(2)}`}</b></p></div>
              <div className="rounded-2xl bg-slate-50 p-4 sm:col-span-2"><p className="text-xs text-slate-400 mb-2"><CalendarClock className="inline w-3.5 h-3.5 mr-1" />Timeline</p><div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs"><span>Created<br/><b>{new Date(selectedJob.created_at).toLocaleString()}</b></span><span>Accepted<br/><b>{selectedJob.accepted_at ? new Date(selectedJob.accepted_at).toLocaleString() : '—'}</b></span><span>Started<br/><b>{selectedJob.started_at ? new Date(selectedJob.started_at).toLocaleString() : '—'}</b></span><span>Completed<br/><b>{selectedJob.completed_at ? new Date(selectedJob.completed_at).toLocaleString() : '—'}</b></span></div></div>
              {selectedJob.customer_notes && <div className="sm:col-span-2"><p className="text-xs text-slate-400">Notes</p><p className="mt-1 text-slate-700">{selectedJob.customer_notes}</p></div>}
              {selectedJob.cancellation_reason && <div className="sm:col-span-2"><p className="text-xs text-red-500">Cancellation reason</p><p className="mt-1 text-red-700">{selectedJob.cancellation_reason}</p></div>}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
