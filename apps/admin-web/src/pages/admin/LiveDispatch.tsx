import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'motion/react';
import { AdminLayout } from '../../components/AdminLayout';
import { supabase } from '../../lib/supabase';
import { Activity, MapPin, Clock, RefreshCw, Navigation, AlertCircle, Search } from 'lucide-react';

interface JobRow {
  id: string;
  status: string;
  pickup_address: string | null;
  pickup_latitude: number | null;
  pickup_longitude: number | null;
  destination_address: string | null;
  total_amount: number | null;
  created_at: string;
  started_at: string | null;
  customer: { full_name: string | null } | null;
  provider: { full_name: string | null } | null;
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

  const fetchJobs = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('jobs')
        .select(`
          id,
          status,
          pickup_address,
          pickup_latitude,
          pickup_longitude,
          destination_address,
          total_amount,
          created_at,
          started_at,
          customer:profiles!jobs_customer_id_fkey ( full_name ),
          provider:profiles!jobs_provider_id_fkey ( full_name ),
          service:services!jobs_service_id_fkey ( name )
        `)
        .in('status', ACTIVE_STATUSES)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setJobs((data as unknown as JobRow[]) ?? []);
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
                  className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-5 hover:shadow-md transition-shadow"
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
      </div>
    </AdminLayout>
  );
}
