import { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { AdminLayout } from '../../components/AdminLayout';
import { supabase } from '../../lib/supabase';
import { MapPin, Clock, User, RefreshCw, Search, Briefcase } from 'lucide-react';
import { Pagination } from '../../components/Pagination';

interface JobRow {
  id: string;
  service_id: string | null;
  customer_id: string | null;
  provider_id: string | null;
  status: string;
  pickup_address: string | null;
  destination_address: string | null;
  total_amount: number | null;
  payment_status: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  rating: number | null;
  customer_name: string;
  provider_name: string | null;
  service_name: string;
}

type FilterTab = 'all' | 'active' | 'completed' | 'cancelled';

const ACTIVE_STATUSES = ['pending', 'matching', 'accepted', 'enroute', 'arrived', 'inprogress'];

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending:    { bg: 'bg-yellow-50',  text: 'text-yellow-700',  label: 'Pending' },
  matching:   { bg: 'bg-blue-50',    text: 'text-blue-700',    label: 'Matching' },
  accepted:   { bg: 'bg-green-50',   text: 'text-green-700',   label: 'Accepted' },
  enroute:    { bg: 'bg-blue-50',    text: 'text-blue-700',    label: 'En Route' },
  arrived:    { bg: 'bg-purple-50',  text: 'text-purple-700',  label: 'Arrived' },
  inprogress: { bg: 'bg-orange-50',  text: 'text-orange-700',  label: 'In Progress' },
  completed:  { bg: 'bg-green-50',   text: 'text-green-700',   label: 'Completed' },
  cancelled:  { bg: 'bg-red-50',     text: 'text-red-700',     label: 'Cancelled' },
};

function formatCurrency(amount: number | null): string {
  if (amount == null) return '$0.00';
  return `$${amount.toFixed(2)}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function shortId(id: string): string {
  return `J-${id.slice(0, 6).toUpperCase()}`;
}

export function AdminJobs() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;

  const fetchJobs = async () => {
    try {
      setError(null);

      // Fetch jobs
      const { data: jobRows, error: jobErr } = await supabase
        .from('jobs')
        .select('id, service_id, customer_id, provider_id, status, pickup_address, destination_address, total_amount, payment_status, created_at, started_at, completed_at, cancelled_at, rating')
        .order('created_at', { ascending: false });

      if (jobErr) throw jobErr;
      if (!jobRows) {
        setJobs([]);
        return;
      }

      // Gather unique profile IDs and service IDs
      const profileIds = new Set<string>();
      const serviceIds = new Set<string>();
      for (const j of jobRows) {
        if (j.customer_id) profileIds.add(j.customer_id);
        if (j.provider_id) profileIds.add(j.provider_id);
        if (j.service_id) serviceIds.add(j.service_id);
      }

      // Fetch profiles
      let profileMap: Record<string, string> = {};
      if (profileIds.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name')
          .in('id', Array.from(profileIds));
        if (profiles) {
          for (const p of profiles) {
            const first = p.first_name || '';
            const last = p.last_name ? `${p.last_name.charAt(0)}.` : '';
            profileMap[p.id] = `${first} ${last}`.trim() || 'Unknown';
          }
        }
      }

      // Fetch services
      let serviceMap: Record<string, string> = {};
      if (serviceIds.size > 0) {
        const { data: services } = await supabase
          .from('services')
          .select('id, name')
          .in('id', Array.from(serviceIds));
        if (services) {
          for (const s of services) {
            serviceMap[s.id] = s.name || 'Unknown Service';
          }
        }
      }

      // Map rows
      const mapped: JobRow[] = jobRows.map((j) => ({
        ...j,
        customer_name: j.customer_id ? (profileMap[j.customer_id] || 'Unknown') : 'Unknown',
        provider_name: j.provider_id ? (profileMap[j.provider_id] || 'Unknown') : null,
        service_name: j.service_id ? (serviceMap[j.service_id] || 'Unknown Service') : 'Unknown Service',
      }));

      setJobs(mapped);
    } catch (err: any) {
      console.error('Error fetching jobs:', err);
      setError(err.message || 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  // Real-time: auto-refresh when jobs change
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debouncedRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fetchJobs(), 2000);
    };

    const channel = supabase
      .channel('admin-jobs-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, debouncedRefresh)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchJobs();
    setRefreshing(false);
  };

  // Filter + search
  const filteredJobs = useMemo(() => {
    let result = jobs;

    // Tab filter
    if (filter === 'active') {
      result = result.filter((j) => ACTIVE_STATUSES.includes(j.status));
    } else if (filter === 'completed') {
      result = result.filter((j) => j.status === 'completed');
    } else if (filter === 'cancelled') {
      result = result.filter((j) => j.status === 'cancelled');
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (j) =>
          j.id.toLowerCase().includes(q) ||
          shortId(j.id).toLowerCase().includes(q) ||
          j.customer_name.toLowerCase().includes(q) ||
          (j.provider_name && j.provider_name.toLowerCase().includes(q)) ||
          (j.pickup_address && j.pickup_address.toLowerCase().includes(q)) ||
          (j.destination_address && j.destination_address.toLowerCase().includes(q))
      );
    }

    return result;
  }, [jobs, filter, search]);

  useEffect(() => { setCurrentPage(1); }, [filter, search]);

  const paginatedJobs = useMemo(() =>
    filteredJobs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
  [filteredJobs, currentPage]);

  // Stats
  const stats = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    const totalJobs = jobs.length;
    const activeJobs = jobs.filter((j) => ACTIVE_STATUSES.includes(j.status)).length;
    const completedToday = jobs.filter(
      (j) => j.status === 'completed' && j.completed_at && j.completed_at >= todayISO
    ).length;
    const revenueToday = jobs
      .filter((j) => j.status === 'completed' && j.completed_at && j.completed_at >= todayISO)
      .reduce((sum, j) => sum + (j.total_amount || 0), 0);

    return { totalJobs, activeJobs, completedToday, revenueToday };
  }, [jobs]);

  const filterTabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: jobs.length },
    { key: 'active', label: 'Active', count: stats.activeJobs },
    { key: 'completed', label: 'Completed', count: jobs.filter((j) => j.status === 'completed').length },
    { key: 'cancelled', label: 'Cancelled', count: jobs.filter((j) => j.status === 'cancelled').length },
  ];

  return (
    <AdminLayout>
      <div className="min-h-screen bg-white">
        {/* Header */}
        <div className="border-b border-gray-100 px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(to right, #008CE5, #0070B8)' }}>
                <Briefcase className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Jobs</h1>
                <p className="text-gray-500 text-sm flex items-center gap-2">
                  Monitor and manage all service requests
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  <span className="text-green-600 text-xs font-medium">Live</span>
                </p>
              </div>
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm shadow-sm hover:shadow-md transition-shadow"
              style={{ background: 'linear-gradient(to right, #008CE5, #0070B8)', color: '#FFFFFF' }}
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </motion.button>
          </div>
        </div>

        <div className="px-8 py-6 space-y-6">
          {/* Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total Jobs', value: stats.totalJobs.toLocaleString(), icon: Briefcase, gradient: 'linear-gradient(135deg, #008CE5, #0070B8)' },
              { label: 'Active Jobs', value: stats.activeJobs.toLocaleString(), icon: Clock, gradient: 'linear-gradient(135deg, #0070B8, #008CE5)' },
              { label: 'Completed Today', value: stats.completedToday.toLocaleString(), icon: MapPin, gradient: 'linear-gradient(135deg, #008CE5, #0070B8)' },
              { label: 'Revenue Today', value: formatCurrency(stats.revenueToday), icon: Briefcase, gradient: 'linear-gradient(135deg, #0070B8, #008CE5)' },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-5"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-gray-500 text-sm font-medium">{stat.label}</span>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: stat.gradient }}>
                    <stat.icon className="w-5 h-5 text-white" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-gray-900">{loading ? '...' : stat.value}</p>
              </motion.div>
            ))}
          </div>

          {/* Filters + Search */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex gap-2 flex-wrap">
              {filterTabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className="px-4 py-2 rounded-xl font-semibold text-sm transition-all"
                  style={filter === tab.key
                    ? { background: 'linear-gradient(to right, #008CE5, #0070B8)', color: '#FFFFFF', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }
                    : { backgroundColor: '#FFFFFF', color: '#4B5563', border: '1px solid #E5E7EB' }
                  }
                >
                  {tab.label}
                  <span style={{ marginLeft: 6, opacity: filter === tab.key ? 0.8 : 1, color: filter === tab.key ? '#FFFFFF' : '#9CA3AF' }}>
                    {loading ? '-' : tab.count}
                  </span>
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search jobs..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#008CE5]/20 focus:border-[#008CE5] bg-white"
              />
            </div>
          </div>

          {/* Error State */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-[24px] p-4 text-sm">
              {error}
              <button onClick={handleRefresh} className="ml-2 underline font-medium">
                Retry
              </button>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-12 flex flex-col items-center justify-center">
              <RefreshCw className="w-8 h-8 text-[#008CE5] animate-spin mb-3" />
              <p className="text-gray-500 text-sm">Loading jobs...</p>
            </div>
          )}

          {/* Jobs Table */}
          {!loading && !error && (
            <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] overflow-hidden">
              {filteredJobs.length === 0 ? (
                <div className="p-12 flex flex-col items-center justify-center">
                  <Briefcase className="w-10 h-10 text-gray-300 mb-3" />
                  <p className="text-gray-500 text-sm font-medium">
                    {search ? 'No jobs match your search' : 'No jobs found'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50/80 border-b border-gray-100">
                        <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Job ID</th>
                        <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Service</th>
                        <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer</th>
                        <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Provider</th>
                        <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Pickup</th>
                        <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                        <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {paginatedJobs.map((job, i) => {
                        const style = STATUS_STYLES[job.status] || { bg: 'bg-gray-50', text: 'text-gray-700', label: job.status };
                        return (
                          <motion.tr
                            key={job.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: i * 0.02 }}
                            className="hover:bg-gray-50/50 transition-colors"
                          >
                            <td className="px-6 py-4">
                              <span className="font-mono text-sm font-semibold text-gray-900">{shortId(job.id)}</span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-sm text-gray-900">{job.service_name}</span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <User className="w-4 h-4 text-gray-400" />
                                <span className="text-sm text-gray-900">{job.customer_name}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              {job.provider_name ? (
                                <div className="flex items-center gap-2">
                                  <User className="w-4 h-4 text-gray-400" />
                                  <span className="text-sm text-gray-900">{job.provider_name}</span>
                                </div>
                              ) : (
                                <span className="text-sm text-orange-500 font-semibold">Unassigned</span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${style.bg} ${style.text}`}>
                                {style.label}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2 max-w-[200px]">
                                <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                <span className="text-sm text-gray-600 truncate">{job.pickup_address || '-'}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-sm font-semibold text-gray-900">{formatCurrency(job.total_amount)}</span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-gray-400" />
                                <span className="text-sm text-gray-500">{formatTime(job.created_at)}</span>
                              </div>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <Pagination currentPage={currentPage} totalItems={filteredJobs.length} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
