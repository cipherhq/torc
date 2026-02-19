import { motion } from 'motion/react';
import { AdminLayout } from '../../components/AdminLayout';
import { Search, Download, Filter, Check, Clock, X, DollarSign } from 'lucide-react';
import { useMemo, useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface Payout {
  id: string;
  provider: string;
  providerId: string;
  amount: number;
  status: 'completed' | 'pending' | 'failed';
  method: string;
  date: string;
  jobsCount: number;
  avatar: string;
}

export function AdminPayoutHistory() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void loadPayoutHistory();
  }, []);

  async function loadPayoutHistory() {
    try {
      setLoading(true);
      setLoadError(null);

      const { data, error } = await supabase
        .from('jobs')
        .select('id, provider_id, total_amount, payment_status, completed_at, created_at, provider:profiles!jobs_provider_id_fkey(first_name, last_name)')
        .eq('status', 'completed')
        .not('provider_id', 'is', null)
        .order('completed_at', { ascending: false });

      if (error) throw error;

      const providerIds = Array.from(
        new Set((data || []).map((job: any) => job.provider_id).filter(Boolean))
      );
      const { data: payoutMethods } = providerIds.length > 0
        ? await supabase
            .from('provider_payout_methods')
            .select('provider_id, method_type, is_default')
            .in('provider_id', providerIds)
            .order('is_default', { ascending: false })
        : { data: [] as any[] };
      const methodByProvider = new Map<string, string>();
      (payoutMethods || []).forEach((m: any) => {
        if (!methodByProvider.has(m.provider_id)) {
          methodByProvider.set(m.provider_id, m.method_type || 'Not set');
        }
      });

      const grouped = new Map<string, any>();
      (data || []).forEach((job: any) => {
        const completedAt = new Date(job.completed_at || job.created_at);
        const weekStart = new Date(completedAt);
        weekStart.setDate(completedAt.getDate() - completedAt.getDay());
        weekStart.setHours(0, 0, 0, 0);
        const key = `${job.provider_id}-${weekStart.toISOString().slice(0, 10)}`;

        if (!grouped.has(key)) {
          const providerName = `${job.provider?.first_name || ''} ${job.provider?.last_name || ''}`.trim() || 'Provider';
          const initials = providerName
            .split(' ')
            .filter(Boolean)
            .map((p: string) => p[0])
            .slice(0, 2)
            .join('')
            .toUpperCase() || 'PR';
          grouped.set(key, {
            id: key,
            provider: providerName,
            providerId: job.provider_id,
            amount: 0,
            jobsCount: 0,
            statuses: [] as string[],
            latestDate: completedAt,
            avatar: initials,
            method: methodByProvider.get(job.provider_id) || 'Not set',
          });
        }

        const row = grouped.get(key);
        row.amount += Number(job.total_amount) || 0;
        row.jobsCount += 1;
        row.statuses.push(job.payment_status || 'unpaid');
        if (completedAt > row.latestDate) row.latestDate = completedAt;
      });

      const mapped: Payout[] = Array.from(grouped.values()).map((row: any) => {
        const status: 'completed' | 'pending' | 'failed' =
          row.statuses.some((s: string) => s === 'failed') ? 'failed'
          : row.statuses.every((s: string) => s === 'paid') ? 'completed'
          : 'pending';
        return {
          id: row.id,
          provider: row.provider,
          providerId: row.providerId,
          amount: row.amount,
          status,
          method: row.method,
          date: row.latestDate.toLocaleDateString(),
          jobsCount: row.jobsCount,
          avatar: row.avatar,
        };
      });

      setPayouts(mapped.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    } catch (e) {
      console.warn('Failed to load payout history:', e);
      setPayouts([]);
      setLoadError('Could not load payout history right now.');
    } finally {
      setLoading(false);
    }
  }

  const filteredPayouts = useMemo(() => {
    return payouts.filter((p) => {
      const matchesStatus = selectedStatus === 'all' || p.status === selectedStatus;
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !query ||
        p.provider.toLowerCase().includes(query) ||
        p.providerId.toLowerCase().includes(query) ||
        p.id.toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [payouts, selectedStatus, searchQuery]);

  const stats = [
    { 
      label: 'Total Payouts (This Month)', 
      value: `$${payouts.reduce((sum, p) => sum + p.amount, 0).toFixed(2)}`,
      count: `${payouts.length} payouts`,
      color: 'from-[#2EFFAF] to-[#00D68F]' 
    },
    { 
      label: 'Completed', 
      value: `$${payouts.filter((p) => p.status === 'completed').reduce((sum, p) => sum + p.amount, 0).toFixed(2)}`,
      count: `${payouts.filter((p) => p.status === 'completed').length} payouts`,
      color: 'from-[#007AFF] to-[#0051D5]' 
    },
    { 
      label: 'Pending', 
      value: `$${payouts.filter((p) => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0).toFixed(2)}`,
      count: `${payouts.filter((p) => p.status === 'pending').length} payouts`,
      color: 'from-[#FFA500] to-[#FF8C00]' 
    },
    { 
      label: 'Failed', 
      value: `$${payouts.filter((p) => p.status === 'failed').reduce((sum, p) => sum + p.amount, 0).toFixed(2)}`,
      count: `${payouts.filter((p) => p.status === 'failed').length} payouts`,
      color: 'from-[#FF6B6B] to-[#FF5252]' 
    },
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <Check className="w-4 h-4" />;
      case 'pending': return <Clock className="w-4 h-4" />;
      case 'failed': return <X className="w-4 h-4" />;
      default: return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-[#2EFFAF] bg-[#2EFFAF]/20';
      case 'pending': return 'text-yellow-400 bg-yellow-400/20';
      case 'failed': return 'text-red-400 bg-red-400/20';
      default: return 'text-white/60 bg-white/10';
    }
  };

  return (
    <AdminLayout>
      <div className="p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Payout History</h1>
            <p className="text-white/60">Track all provider payouts</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="px-6 py-3 rounded-[20px] bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0F1419] font-bold flex items-center gap-2 shadow-lg shadow-[#2EFFAF]/30"
          >
            <Download className="w-5 h-5" />
            Export Report
          </motion.button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="glass-light rounded-[24px] p-6"
            >
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${stat.color} flex items-center justify-center mb-4`}>
                <DollarSign className="w-6 h-6 text-white" />
              </div>
              <p className="text-white/60 text-sm mb-1">{stat.label}</p>
              <p className="text-white font-bold text-2xl mb-1">{stat.value}</p>
              <p className="text-white/40 text-xs">{stat.count}</p>
            </motion.div>
          ))}
        </div>

        {/* Search and Filters */}
        <div className="glass-light rounded-[24px] p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
              <input
                type="text"
                placeholder="Search by payout ID, provider name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-[16px] text-white placeholder-white/40 focus:outline-none focus:border-[#2EFFAF]/50"
              />
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-4 py-3 bg-white/5 border border-white/10 rounded-[16px] flex items-center gap-2 text-white hover:bg-white/10"
            >
              <Filter className="w-5 h-5" />
              <span>Filters</span>
            </motion.button>
          </div>

          {/* Status filters */}
          <div className="flex gap-2 mt-4">
            {['all', 'completed', 'pending', 'failed'].map((status) => (
              <motion.button
                key={status}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedStatus(status)}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                  selectedStatus === status
                    ? 'bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0F1419]'
                    : 'bg-white/5 text-white/70 hover:bg-white/10'
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Payouts Table */}
        <div className="glass-light rounded-[24px] overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <p className="text-white/60">Loading payout history...</p>
            </div>
          ) : loadError ? (
            <div className="p-12 text-center">
              <p className="text-red-300">{loadError}</p>
            </div>
          ) : filteredPayouts.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-white/60">No payout history</p>
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-white/10">
                <tr>
                  <th className="px-6 py-4 text-left text-white/60 text-sm font-semibold">Payout ID</th>
                  <th className="px-6 py-4 text-left text-white/60 text-sm font-semibold">Provider</th>
                  <th className="px-6 py-4 text-left text-white/60 text-sm font-semibold">Amount</th>
                  <th className="px-6 py-4 text-left text-white/60 text-sm font-semibold">Jobs</th>
                  <th className="px-6 py-4 text-left text-white/60 text-sm font-semibold">Method</th>
                  <th className="px-6 py-4 text-left text-white/60 text-sm font-semibold">Date</th>
                  <th className="px-6 py-4 text-left text-white/60 text-sm font-semibold">Status</th>
                  <th className="px-6 py-4 text-left text-white/60 text-sm font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayouts.map((payout, index) => (
                  <motion.tr
                    key={payout.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <span className="text-white/70 font-mono text-sm">{payout.id}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center">
                          <span className="text-[#0F1419] font-bold text-sm">{payout.avatar}</span>
                        </div>
                        <div>
                          <p className="text-white font-semibold">{payout.provider}</p>
                          <p className="text-white/50 text-sm">{payout.providerId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[#2EFFAF] font-bold text-lg">${payout.amount.toFixed(2)}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-white/70">{payout.jobsCount} jobs</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-white/70">{payout.method}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-white/70">{payout.date}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 w-fit ${getStatusColor(payout.status)}`}>
                        {getStatusIcon(payout.status)}
                        {payout.status.charAt(0).toUpperCase() + payout.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="px-4 py-2 rounded-lg bg-white/5 text-white/70 hover:bg-white/10 text-sm"
                      >
                        View Details
                      </motion.button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
