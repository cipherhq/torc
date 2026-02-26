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
  period: string;
}

function isMissingTableError(error: unknown) {
  return String((error as { message?: string })?.message || '').toLowerCase().includes('does not exist');
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

      const { data: payoutRows, error } = await supabase
        .from('provider_payouts')
        .select('id, provider_id, period_start, period_end, total_earnings, total_tips, platform_fee, net_payout, status, paid_at, created_at')
        .order('created_at', { ascending: false });

      if (error) {
        if (isMissingTableError(error)) {
          setPayouts([]);
          setLoadError('provider_payouts table is not available yet. Run migration 021_provider_payouts.sql.');
          return;
        }
        throw error;
      }

      const providerIds = Array.from(new Set((payoutRows || []).map((row: any) => row.provider_id).filter(Boolean)));

      const [{ data: profiles }, { data: payoutMethods }] = await Promise.all([
        providerIds.length > 0
          ? supabase.from('profiles').select('id, first_name, last_name, email').in('id', providerIds)
          : Promise.resolve({ data: [] as any[] }),
        providerIds.length > 0
          ? supabase
              .from('provider_payout_methods')
              .select('provider_id, method_type, is_default')
              .in('provider_id', providerIds)
              .order('is_default', { ascending: false })
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const profileById = new Map<string, any>();
      (profiles || []).forEach((p: any) => profileById.set(p.id, p));

      const methodByProvider = new Map<string, string>();
      (payoutMethods || []).forEach((m: any) => {
        if (!methodByProvider.has(m.provider_id)) {
          methodByProvider.set(m.provider_id, m.method_type || 'Not set');
        }
      });

      // Pull completed jobs in the union date range so we can show jobs-per-payout accurately.
      let jobsData: any[] = [];
      if ((payoutRows || []).length > 0 && providerIds.length > 0) {
        const startMin = new Date(Math.min(...(payoutRows || []).map((p: any) => new Date(p.period_start).getTime())));
        const endMax = new Date(Math.max(...(payoutRows || []).map((p: any) => new Date(p.period_end).getTime())));
        endMax.setDate(endMax.getDate() + 1); // exclusive upper bound

        const { data: jobs } = await supabase
          .from('jobs')
          .select('provider_id, completed_at')
          .eq('status', 'completed')
          .in('provider_id', providerIds)
          .gte('completed_at', startMin.toISOString())
          .lt('completed_at', endMax.toISOString());
        jobsData = jobs || [];
      }

      const jobsByProvider = new Map<string, Date[]>();
      jobsData.forEach((job: any) => {
        if (!job.provider_id || !job.completed_at) return;
        if (!jobsByProvider.has(job.provider_id)) jobsByProvider.set(job.provider_id, []);
        jobsByProvider.get(job.provider_id)!.push(new Date(job.completed_at));
      });

      const mapped: Payout[] = (payoutRows || []).map((row: any) => {
        const profile = profileById.get(row.provider_id);
        const providerName = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || profile?.email || 'Provider';
        const initials = providerName
          .split(' ')
          .filter(Boolean)
          .map((part: string) => part[0])
          .slice(0, 2)
          .join('')
          .toUpperCase() || 'PR';

        const start = new Date(row.period_start);
        const end = new Date(row.period_end);
        const providerJobDates = jobsByProvider.get(row.provider_id) || [];
        const jobsCount = providerJobDates.filter((d) => d >= start && d <= end).length;

        const status: 'completed' | 'pending' | 'failed' =
          row.status === 'paid' ? 'completed'
          : row.status === 'failed' ? 'failed'
          : 'pending';

        return {
          id: `PO-${String(row.id).slice(0, 8).toUpperCase()}`,
          provider: providerName,
          providerId: row.provider_id,
          amount: Number(row.net_payout || 0),
          status,
          method: methodByProvider.get(row.provider_id) || 'Not set',
          date: new Date(row.paid_at || row.created_at).toLocaleDateString(),
          jobsCount,
          avatar: initials,
          period: `${new Date(row.period_start).toLocaleDateString()} - ${new Date(row.period_end).toLocaleDateString()}`,
        };
      });

      setPayouts(mapped);
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
      label: 'Total Payout Volume',
      value: `$${payouts.reduce((sum, p) => sum + p.amount, 0).toFixed(2)}`,
      count: `${payouts.length} payouts`,
      color: 'from-[#008CE5] to-[#00D68F]',
    },
    {
      label: 'Completed',
      value: `$${payouts.filter((p) => p.status === 'completed').reduce((sum, p) => sum + p.amount, 0).toFixed(2)}`,
      count: `${payouts.filter((p) => p.status === 'completed').length} payouts`,
      color: 'from-[#0070B8] to-[#0051D5]',
    },
    {
      label: 'Pending',
      value: `$${payouts.filter((p) => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0).toFixed(2)}`,
      count: `${payouts.filter((p) => p.status === 'pending').length} payouts`,
      color: 'from-[#FFA500] to-[#FF8C00]',
    },
    {
      label: 'Failed',
      value: `$${payouts.filter((p) => p.status === 'failed').reduce((sum, p) => sum + p.amount, 0).toFixed(2)}`,
      count: `${payouts.filter((p) => p.status === 'failed').length} payouts`,
      color: 'from-[#FF6B6B] to-[#FF5252]',
    },
  ];

  function exportPayoutCsv() {
    const rows = [
      ['payout_id', 'provider_id', 'provider_name', 'period', 'date', 'amount', 'status', 'method', 'jobs_count'],
      ...filteredPayouts.map((p) => [
        p.id,
        p.providerId,
        p.provider,
        p.period,
        p.date,
        p.amount.toFixed(2),
        p.status,
        p.method,
        p.jobsCount,
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `payout-history-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

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
      case 'completed': return 'text-[#008CE5] bg-[#008CE5]/20';
      case 'pending': return 'text-yellow-400 bg-yellow-400/20';
      case 'failed': return 'text-red-400 bg-red-400/20';
      default: return 'text-white/60 bg-white/10';
    }
  };

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Payout History</h1>
            <p className="text-white/60">Track all provider payouts from payout ledger</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={exportPayoutCsv}
            className="px-6 py-3 rounded-[20px] bg-gradient-to-r from-[#008CE5] to-[#0070B8] text-white font-bold flex items-center gap-2 shadow-lg shadow-[#008CE5]/30"
          >
            <Download className="w-5 h-5" />
            Export Report
          </motion.button>
        </div>

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

        <div className="glass-light rounded-[24px] p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
              <input
                type="text"
                placeholder="Search by payout ID, provider name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-[16px] text-white placeholder-white/40 focus:outline-none focus:border-[#008CE5]/50"
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

          <div className="flex gap-2 mt-4">
            {['all', 'completed', 'pending', 'failed'].map((status) => (
              <motion.button
                key={status}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedStatus(status)}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                  selectedStatus === status
                    ? 'bg-gradient-to-r from-[#008CE5] to-[#0070B8] text-white'
                    : 'bg-white/5 text-white/70 hover:bg-white/10'
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </motion.button>
            ))}
          </div>
        </div>

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
                    <th className="px-6 py-4 text-left text-white/60 text-sm font-semibold">Period</th>
                    <th className="px-6 py-4 text-left text-white/60 text-sm font-semibold">Amount</th>
                    <th className="px-6 py-4 text-left text-white/60 text-sm font-semibold">Jobs</th>
                    <th className="px-6 py-4 text-left text-white/60 text-sm font-semibold">Method</th>
                    <th className="px-6 py-4 text-left text-white/60 text-sm font-semibold">Date</th>
                    <th className="px-6 py-4 text-left text-white/60 text-sm font-semibold">Status</th>
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
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#008CE5] to-[#0070B8] flex items-center justify-center">
                            <span className="text-white font-bold text-sm">{payout.avatar}</span>
                          </div>
                          <div>
                            <p className="text-white font-semibold">{payout.provider}</p>
                            <p className="text-white/50 text-sm">{payout.providerId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-white/70">{payout.period}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-[#008CE5] font-bold text-lg">${payout.amount.toFixed(2)}</span>
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
