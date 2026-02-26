import { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { AdminLayout } from '../../components/AdminLayout';
import { supabase } from '../../lib/supabase';
import { DollarSign, Search, RefreshCw, Download, Clock, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Pagination } from '../../components/Pagination';

interface PayoutRow {
  id: string;
  provider_id: string;
  period_start: string;
  period_end: string;
  total_earnings: number;
  total_tips: number;
  platform_fee: number;
  net_payout: number;
  status: 'pending' | 'processing' | 'paid' | 'failed';
  paid_at: string | null;
  created_at: string;
  provider_name: string;
}

type FilterStatus = 'all' | 'paid' | 'processing' | 'pending' | 'failed';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatPeriod(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const startStr = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endStr = e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startStr} - ${endStr}`;
}

export function AdminPayoutHistory() {
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<FilterStatus>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;

  async function loadPayouts() {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('provider_payouts')
        .select('id, provider_id, period_start, period_end, total_earnings, total_tips, platform_fee, net_payout, status, paid_at, created_at')
        .order('created_at', { ascending: false });

      if (fetchError) {
        console.error('Error loading payout history:', fetchError);
        setError('Failed to load payout history. Please try again.');
        setPayouts([]);
        return;
      }

      if (!data || data.length === 0) {
        setPayouts([]);
        return;
      }

      // Fetch provider names from profiles
      const providerIds = [...new Set(data.map((p: any) => p.provider_id))];
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', providerIds);

      const profileMap = new Map<string, string>();
      (profileData || []).forEach((p: any) => {
        const name = `${p.first_name || ''} ${p.last_name || ''}`.trim();
        profileMap.set(p.id, name || 'Unknown Provider');
      });

      const rows: PayoutRow[] = data.map((row: any) => ({
        id: row.id,
        provider_id: row.provider_id,
        period_start: row.period_start,
        period_end: row.period_end,
        total_earnings: row.total_earnings || 0,
        total_tips: row.total_tips || 0,
        platform_fee: row.platform_fee || 0,
        net_payout: row.net_payout || 0,
        status: row.status || 'pending',
        paid_at: row.paid_at,
        created_at: row.created_at,
        provider_name: profileMap.get(row.provider_id) || 'Unknown Provider',
      }));

      setPayouts(rows);
    } catch (e) {
      console.error('Payout history error:', e);
      setError('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPayouts();
  }, []);

  // Compute stats
  const stats = useMemo(() => {
    const totalPaid = payouts
      .filter((p) => p.status === 'paid')
      .reduce((sum, p) => sum + p.net_payout, 0);
    const totalProcessing = payouts
      .filter((p) => p.status === 'processing')
      .reduce((sum, p) => sum + p.net_payout, 0);
    const totalPending = payouts
      .filter((p) => p.status === 'pending')
      .reduce((sum, p) => sum + p.net_payout, 0);
    const failedCount = payouts.filter((p) => p.status === 'failed').length;

    return [
      {
        label: 'Total Paid Out',
        value: formatCurrency(totalPaid),
        count: `${payouts.filter((p) => p.status === 'paid').length} payouts`,
        gradient: 'linear-gradient(135deg, #008CE5, #0070B8)',
        icon: <CheckCircle2 className="w-6 h-6 text-white" />,
      },
      {
        label: 'Processing',
        value: formatCurrency(totalProcessing),
        count: `${payouts.filter((p) => p.status === 'processing').length} payouts`,
        gradient: 'linear-gradient(135deg, #007AFF, #0051D5)',
        icon: <RefreshCw className="w-6 h-6 text-white" />,
      },
      {
        label: 'Pending',
        value: formatCurrency(totalPending),
        count: `${payouts.filter((p) => p.status === 'pending').length} payouts`,
        gradient: 'linear-gradient(135deg, #FFA500, #FF8C00)',
        icon: <Clock className="w-6 h-6 text-white" />,
      },
      {
        label: 'Failed',
        value: `${failedCount}`,
        count: `${failedCount === 1 ? '1 payout' : `${failedCount} payouts`}`,
        gradient: 'linear-gradient(135deg, #FF6B6B, #FF5252)',
        icon: <AlertCircle className="w-6 h-6 text-white" />,
      },
    ];
  }, [payouts]);

  // Filter and search
  const filteredPayouts = useMemo(() => {
    return payouts.filter((p) => {
      // Status filter
      if (selectedStatus !== 'all' && p.status !== selectedStatus) return false;

      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesName = p.provider_name.toLowerCase().includes(q);
        const matchesId = p.id.toLowerCase().includes(q);
        if (!matchesName && !matchesId) return false;
      }

      return true;
    });
  }, [payouts, selectedStatus, searchQuery]);

  useEffect(() => { setCurrentPage(1); }, [selectedStatus, searchQuery]);

  const paginatedPayouts = useMemo(() =>
    filteredPayouts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
  [filteredPayouts, currentPage]);

  // CSV export
  function exportCSV() {
    if (filteredPayouts.length === 0) return;

    const headers = ['Payout ID', 'Provider', 'Period Start', 'Period End', 'Gross Earnings', 'Tips', 'Platform Fee', 'Net Payout', 'Status', 'Paid Date'];
    const rows = filteredPayouts.map((p) => [
      p.id,
      p.provider_name,
      p.period_start,
      p.period_end,
      p.total_earnings.toFixed(2),
      p.total_tips.toFixed(2),
      p.platform_fee.toFixed(2),
      p.net_payout.toFixed(2),
      p.status,
      p.paid_at || '',
    ]);

    const csvContent = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `payout-history-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // Status badge helpers
  function getStatusBadge(status: string) {
    switch (status) {
      case 'paid':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 w-fit bg-green-500/15 text-green-600">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Paid
          </span>
        );
      case 'processing':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 w-fit bg-blue-500/15 text-blue-600">
            <RefreshCw className="w-3.5 h-3.5" />
            Processing
          </span>
        );
      case 'pending':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 w-fit bg-yellow-500/15 text-yellow-600">
            <Clock className="w-3.5 h-3.5" />
            Pending
          </span>
        );
      case 'failed':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 w-fit bg-red-500/15 text-red-600">
            <AlertCircle className="w-3.5 h-3.5" />
            Failed
          </span>
        );
      default:
        return <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">{status}</span>;
    }
  }

  const filterOptions: FilterStatus[] = ['all', 'paid', 'processing', 'pending', 'failed'];

  return (
    <AdminLayout>
      <div className="p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Payout History</h1>
            <p className="text-gray-500">Track all provider payouts</p>
          </div>
          <div className="flex items-center gap-3">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={loadPayouts}
              className="flex items-center gap-2 px-4 py-3 rounded-[20px] bg-gray-50 border border-gray-200 text-gray-700 hover:bg-gray-100 transition-all"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={exportCSV}
              disabled={filteredPayouts.length === 0}
              className="px-6 py-3 rounded-[20px] font-bold flex items-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(to right, #008CE5, #0070B8)', color: '#FFFFFF', boxShadow: '0 10px 15px -3px rgba(0,140,229,0.3)' }}
            >
              <Download className="w-5 h-5" />
              Export CSV
            </motion.button>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-[16px] flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-red-700 text-sm">{error}</p>
            <button onClick={loadPayouts} className="ml-auto text-red-600 font-semibold text-sm hover:underline">
              Retry
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6"
            >
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ background: stat.gradient }}>
                {stat.icon}
              </div>
              <p className="text-gray-500 text-sm mb-1">{stat.label}</p>
              <p className="text-gray-900 font-bold text-2xl mb-1">{loading ? '--' : stat.value}</p>
              <p className="text-gray-400 text-xs">{loading ? '' : stat.count}</p>
            </motion.div>
          ))}
        </div>

        {/* Search and Filters */}
        <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by provider name or payout ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-[16px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#008CE5]/50"
              />
            </div>
          </div>

          {/* Status filters */}
          <div className="flex gap-2 mt-4">
            {filterOptions.map((status) => (
              <motion.button
                key={status}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedStatus(status)}
                className="px-4 py-2 rounded-full text-sm font-semibold transition-all"
                style={selectedStatus === status
                  ? { background: 'linear-gradient(to right, #008CE5, #0070B8)', color: '#FFFFFF' }
                  : { backgroundColor: '#F9FAFB', color: '#4B5563' }
                }
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Payouts Table */}
        <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-10 h-10 animate-spin text-[#008CE5] mb-4" />
              <p className="text-gray-400">Loading payout history...</p>
            </div>
          ) : filteredPayouts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <DollarSign className="w-12 h-12 text-gray-300 mb-4" />
              <p className="text-gray-500 text-lg">
                {searchQuery
                  ? 'No payouts match your search'
                  : selectedStatus !== 'all'
                  ? `No ${selectedStatus} payouts found`
                  : 'No payout history yet'}
              </p>
              <p className="text-gray-400 text-sm mt-1">
                {!searchQuery && selectedStatus === 'all' && 'Processed payouts will appear here'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-gray-500 text-sm font-semibold">Provider</th>
                    <th className="px-6 py-4 text-left text-gray-500 text-sm font-semibold">Period</th>
                    <th className="px-6 py-4 text-right text-gray-500 text-sm font-semibold">Gross Earnings</th>
                    <th className="px-6 py-4 text-right text-gray-500 text-sm font-semibold">Tips</th>
                    <th className="px-6 py-4 text-right text-gray-500 text-sm font-semibold">Platform Fee</th>
                    <th className="px-6 py-4 text-right text-gray-500 text-sm font-semibold">Net Payout</th>
                    <th className="px-6 py-4 text-left text-gray-500 text-sm font-semibold">Status</th>
                    <th className="px-6 py-4 text-left text-gray-500 text-sm font-semibold">Paid Date</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedPayouts.map((payout, index) => {
                    const initials = payout.provider_name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .toUpperCase()
                      .slice(0, 2);

                    return (
                      <motion.tr
                        key={payout.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.03 }}
                        className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #008CE5, #0070B8)' }}>
                              <span className="text-white font-bold text-sm">{initials}</span>
                            </div>
                            <div>
                              <p className="text-gray-900 font-semibold">{payout.provider_name}</p>
                              <p className="text-gray-400 text-xs font-mono">{payout.id.slice(0, 8)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-gray-600 text-sm">{formatPeriod(payout.period_start, payout.period_end)}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-gray-900 font-semibold">{formatCurrency(payout.total_earnings)}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-[#008CE5] font-semibold">+{formatCurrency(payout.total_tips)}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-red-400 font-semibold">-{formatCurrency(payout.platform_fee)}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-gray-900 font-bold text-lg">{formatCurrency(payout.net_payout)}</span>
                        </td>
                        <td className="px-6 py-4">
                          {getStatusBadge(payout.status)}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-gray-600 text-sm">{formatDate(payout.paid_at)}</span>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
              <Pagination currentPage={currentPage} totalItems={filteredPayouts.length} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
