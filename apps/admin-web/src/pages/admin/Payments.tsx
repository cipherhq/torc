import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'motion/react';
import { AdminLayout } from '../../components/AdminLayout';
import { supabase } from '../../lib/supabase';
import { DollarSign, TrendingUp, Download, RefreshCw, Search, CreditCard, AlertCircle, Loader2 } from 'lucide-react';
import { Pagination } from '../../components/Pagination';

interface PaymentJob {
  id: string;
  customer_id: string;
  provider_id: string;
  total_amount: number;
  payment_status: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  customer_name: string;
  provider_name: string;
}

interface Refund {
  id: string;
  job_id: string;
  amount: number;
  status: string;
  reason: string;
  created_at: string;
}

type FilterStatus = 'all' | 'paid' | 'unpaid' | 'failed' | 'refunded' | 'requires_action';

const STATUS_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  paid: { bg: 'bg-green-100', text: 'text-green-700', label: 'Paid' },
  unpaid: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Unpaid' },
  failed: { bg: 'bg-red-100', text: 'text-red-700', label: 'Failed' },
  refunded: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Refunded' },
  requires_action: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Requires Action' },
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function AdminPayments() {
  const [jobs, setJobs] = useState<PaymentJob[]>([]);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch jobs with payment info
      const { data: jobsData, error: jobsError } = await supabase
        .from('jobs')
        .select('id, customer_id, provider_id, total_amount, payment_status, status, created_at, completed_at')
        .order('created_at', { ascending: false });

      if (jobsError) throw jobsError;

      // Collect all unique profile IDs from customer_id and provider_id
      const profileIds = new Set<string>();
      (jobsData || []).forEach((j: any) => {
        if (j.customer_id) profileIds.add(j.customer_id);
        if (j.provider_id) profileIds.add(j.provider_id);
      });

      // Fetch profiles for name resolution
      let profileMap = new Map<string, string>();
      if (profileIds.size > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', Array.from(profileIds));

        (profilesData || []).forEach((p: any) => {
          profileMap.set(p.id, p.full_name || p.email || p.id.slice(0, 8));
        });
      }

      const merged: PaymentJob[] = (jobsData || []).map((j: any) => ({
        id: j.id,
        customer_id: j.customer_id,
        provider_id: j.provider_id,
        total_amount: Number(j.total_amount) || 0,
        payment_status: j.payment_status || 'unpaid',
        status: j.status,
        created_at: j.created_at,
        completed_at: j.completed_at,
        customer_name: profileMap.get(j.customer_id) || 'Unknown',
        provider_name: profileMap.get(j.provider_id) || 'Unassigned',
      }));

      setJobs(merged);

      // Fetch refunds
      const { data: refundsData, error: refundsError } = await supabase
        .from('refunds')
        .select('id, job_id, amount, status, reason, created_at')
        .order('created_at', { ascending: false });

      if (refundsError) {
        console.warn('Could not load refunds:', refundsError.message);
      }

      setRefunds(refundsData || []);
    } catch (err: any) {
      console.error('Failed to load payment data:', err);
      setError(err?.message || 'Failed to load payment data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time: auto-refresh when payments or refunds change
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debouncedRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => loadData(), 2000);
    };

    const channel = supabase
      .channel('admin-payments-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'refunds' }, debouncedRefresh)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  // Compute stats
  const stats = useMemo(() => {
    const totalCollected = jobs
      .filter((j) => j.payment_status === 'paid')
      .reduce((sum, j) => sum + j.total_amount, 0);

    const pendingPayments = jobs
      .filter((j) => j.payment_status === 'unpaid')
      .reduce((sum, j) => sum + j.total_amount, 0);

    const failedCount = jobs.filter((j) => j.payment_status === 'failed').length;

    const refundsApproved = refunds
      .filter((r) => r.status === 'approved')
      .reduce((sum, r) => sum + Number(r.amount || 0), 0);

    return { totalCollected, pendingPayments, failedCount, refundsApproved };
  }, [jobs, refunds]);

  // Filtered + searched jobs
  const filteredJobs = useMemo(() => {
    return jobs.filter((j) => {
      // Filter by payment status
      if (filter !== 'all' && j.payment_status !== filter) return false;

      // Search by job ID or customer name
      if (search) {
        const q = search.toLowerCase();
        const matchesId = j.id.toLowerCase().includes(q);
        const matchesCustomer = j.customer_name.toLowerCase().includes(q);
        if (!matchesId && !matchesCustomer) return false;
      }

      return true;
    });
  }, [jobs, filter, search]);

  useEffect(() => { setCurrentPage(1); }, [filter, search]);

  const paginatedJobs = useMemo(() =>
    filteredJobs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
  [filteredJobs, currentPage]);

  // CSV export
  const handleExport = () => {
    const headers = ['Job ID', 'Customer', 'Provider', 'Amount', 'Payment Status', 'Job Status', 'Date'];
    const rows = filteredJobs.map((j) => [
      j.id,
      j.customer_name,
      j.provider_name,
      j.total_amount.toFixed(2),
      j.payment_status,
      j.status,
      formatDate(j.created_at),
    ]);

    const csvContent = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `payments-export-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const filterOptions: { key: FilterStatus; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'paid', label: 'Paid' },
    { key: 'unpaid', label: 'Unpaid' },
    { key: 'failed', label: 'Failed' },
    { key: 'refunded', label: 'Refunded' },
    { key: 'requires_action', label: 'Requires Action' },
  ];

  const statCards = [
    {
      label: 'Total Collected',
      value: formatCurrency(stats.totalCollected),
      icon: DollarSign,
      gradient: 'linear-gradient(135deg, #008CE5, #0070B8)',
    },
    {
      label: 'Pending Payments',
      value: formatCurrency(stats.pendingPayments),
      icon: TrendingUp,
      gradient: 'linear-gradient(135deg, #0070B8, #008CE5)',
    },
    {
      label: 'Failed Payments',
      value: String(stats.failedCount),
      icon: AlertCircle,
      gradient: 'linear-gradient(135deg, #EF4444, #DC2626)',
    },
    {
      label: 'Refunds Approved',
      value: formatCurrency(stats.refundsApproved),
      icon: CreditCard,
      gradient: 'linear-gradient(135deg, #F97316, #EA580C)',
    },
  ];

  return (
    <AdminLayout>
      <div className="p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Payments & Transactions</h1>
            <p className="text-gray-500 flex items-center gap-2">
              {jobs.length} total transactions · {filteredJobs.length} shown
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span className="text-green-600 text-xs font-medium">Live</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleExport}
              disabled={filteredJobs.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold hover:shadow-lg transition-all disabled:opacity-50"
              style={{ background: 'linear-gradient(to right, #008CE5, #0070B8)', color: '#FFFFFF' }}
            >
              <Download className="w-4 h-4" />
              Export CSV
            </motion.button>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {statCards.map((card, index) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6"
              >
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: card.gradient }}>
                  <Icon className="w-7 h-7 text-white" />
                </div>
                <p className="text-gray-500 text-sm mb-1">{card.label}</p>
                <p className="text-3xl font-bold text-gray-900">{card.value}</p>
              </motion.div>
            );
          })}
        </div>

        {/* Search + Filters */}
        <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="flex-1 flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
              <Search className="w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by job ID or customer name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-gray-900 placeholder-gray-400 focus:outline-none"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {filterOptions.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap"
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

        {/* Error state */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-[24px] p-6 mb-6 flex items-center gap-4">
            <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0" />
            <div>
              <p className="text-red-800 font-semibold">Failed to load payments</p>
              <p className="text-red-600 text-sm">{error}</p>
            </div>
            <button
              onClick={loadData}
              className="ml-auto px-4 py-2 rounded-xl bg-red-100 text-red-700 font-semibold hover:bg-red-200 transition-all text-sm"
            >
              Retry
            </button>
          </div>
        )}

        {/* Table */}
        <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-[#008CE5]" />
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <CreditCard className="w-12 h-12 text-gray-300 mb-4" />
              <p className="text-gray-500 text-lg">
                {search || filter !== 'all' ? 'No payments match your filters' : 'No payment records found'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Job ID</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Customer</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Provider</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Amount</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Payment Status</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {paginatedJobs.map((job, idx) => {
                    const badge = STATUS_BADGES[job.payment_status] || STATUS_BADGES.unpaid;
                    return (
                      <motion.tr
                        key={job.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: idx * 0.02 }}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-6 py-4 font-mono text-sm text-gray-900">
                          {job.id.slice(0, 8)}...
                        </td>
                        <td className="px-6 py-4 text-gray-700">{job.customer_name}</td>
                        <td className="px-6 py-4 text-gray-700">{job.provider_name}</td>
                        <td className="px-6 py-4 font-semibold text-gray-900">
                          {formatCurrency(job.total_amount)}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold ${badge.bg} ${badge.text}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-500 text-sm">
                          {formatDate(job.created_at)}
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
      </div>
    </AdminLayout>
  );
}
