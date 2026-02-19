import { useMemo, useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { AdminNav } from '../../components/AdminNav';
import { DollarSign, TrendingUp, Clock, CheckCircle, Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { loadPlatformSettings } from '../../lib/platformSettings';

interface ProviderPayoutRow {
  id: string;
  provider: string;
  providerId: string;
  jobs: number;
  totalEarnings: number;
  platformFee: number;
  payoutAmount: number;
  period: string;
  status: 'pending' | 'completed';
}

export function AdminPayouts() {
  const [selectedPayouts, setSelectedPayouts] = useState<string[]>([]);
  const [rows, setRows] = useState<ProviderPayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [platformFeePercent, setPlatformFeePercent] = useState(15);

  useEffect(() => {
    void loadPendingPayouts();
  }, []);

  async function loadPendingPayouts() {
    try {
      setLoading(true);
      setLoadError(null);

      const [{ data, error }, settings] = await Promise.all([
        supabase
          .from('jobs')
          .select('id, provider_id, total_amount, payment_status, completed_at, created_at, provider:profiles!jobs_provider_id_fkey(first_name, last_name)')
          .eq('status', 'completed')
          .not('provider_id', 'is', null)
          .order('completed_at', { ascending: false }),
        loadPlatformSettings(),
      ]);

      if (error) throw error;
      const feePercent = settings.platformFee;
      setPlatformFeePercent(feePercent);

      const grouped = new Map<string, any>();
      (data || []).forEach((job: any) => {
        const key = job.provider_id;
        if (!grouped.has(key)) {
          grouped.set(key, {
            providerId: key,
            providerName: `${job.provider?.first_name || ''} ${job.provider?.last_name || ''}`.trim() || 'Provider',
            jobs: [],
          });
        }
        grouped.get(key).jobs.push(job);
      });

      const computed: ProviderPayoutRow[] = Array.from(grouped.values()).map((group: any) => {
        const jobs = group.jobs as any[];
        const total = jobs.reduce((sum, j) => sum + (Number(j.total_amount) || 0), 0);
        const fee = total * (feePercent / 100);
        const minDate = jobs.reduce(
          (min, j) => Math.min(min, new Date(j.completed_at || j.created_at).getTime()),
          Number.MAX_SAFE_INTEGER
        );
        const maxDate = jobs.reduce(
          (max, j) => Math.max(max, new Date(j.completed_at || j.created_at).getTime()),
          0
        );
        const status: 'pending' | 'completed' = jobs.some((j) => j.payment_status !== 'paid') ? 'pending' : 'completed';

        return {
          id: group.providerId,
          provider: group.providerName,
          providerId: group.providerId,
          jobs: jobs.length,
          totalEarnings: total,
          platformFee: fee,
          payoutAmount: total - fee,
          period: `${new Date(minDate).toLocaleDateString()} - ${new Date(maxDate).toLocaleDateString()}`,
          status,
        };
      });

      setRows(computed.sort((a, b) => b.payoutAmount - a.payoutAmount));
    } catch (e) {
      console.warn('Failed to load pending payouts:', e);
      setRows([]);
      setLoadError('Could not load payouts right now.');
    } finally {
      setLoading(false);
    }
  }

  const togglePayout = (payoutId: string) => {
    setSelectedPayouts(prev =>
      prev.includes(payoutId)
        ? prev.filter(id => id !== payoutId)
        : [...prev, payoutId]
    );
  };

  const handleProcessPayouts = () => {
    setActionMessage(
      'Selected payouts are based on live DB totals. Connect your payout processor to execute transfers.'
    );
  };

  const selectedTotal = rows
    .filter(p => selectedPayouts.includes(p.id))
    .reduce((sum, p) => sum + p.payoutAmount, 0);

  const pendingRows = useMemo(() => rows.filter((r) => r.status === 'pending'), [rows]);
  const paidThisWeek = useMemo(() => {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    return rows
      .filter((r) => r.status === 'completed')
      .reduce((sum, r) => sum + r.payoutAmount, 0);
  }, [rows]);

  return (
    <div className="min-h-screen bg-[#0F1419] flex">
      <AdminNav />

      <div className="flex-1 ml-64">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#252B3D] to-[#2F3548] p-8">
          <h1 className="text-3xl font-bold text-white mb-2">Provider Payouts</h1>
          <p className="text-white/60">Process weekly provider earnings</p>
        </div>

        <div className="p-8">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-6 mb-8">
            <div className="glass rounded-[24px] p-6">
              <Clock className="w-8 h-8 text-[#007AFF] mb-3" />
              <p className="text-white/60 text-sm">Pending Payouts</p>
              <p className="text-white text-3xl font-bold">{pendingRows.length}</p>
            </div>
            <div className="glass rounded-[24px] p-6">
              <DollarSign className="w-8 h-8 text-[#2EFFAF] mb-3" />
              <p className="text-white/60 text-sm">Total Pending</p>
              <p className="text-white text-3xl font-bold">
                ${pendingRows.reduce((sum, p) => sum + p.payoutAmount, 0).toFixed(2)}
              </p>
            </div>
            <div className="glass rounded-[24px] p-6">
              <TrendingUp className="w-8 h-8 text-[#2EFFAF] mb-3" />
              <p className="text-white/60 text-sm">Platform Fees</p>
              <p className="text-white text-3xl font-bold">
                ${pendingRows.reduce((sum, p) => sum + p.platformFee, 0).toFixed(2)}
              </p>
            </div>
            <div className="glass rounded-[24px] p-6">
              <CheckCircle className="w-8 h-8 text-[#2EFFAF] mb-3" />
              <p className="text-white/60 text-sm">Paid This Week</p>
              <p className="text-white text-3xl font-bold">${paidThisWeek.toFixed(2)}</p>
            </div>
          </div>

          {/* Pending Payouts */}
          <div className="glass rounded-[24px] p-6 mb-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-white font-bold text-xl">Pending Payouts</h2>
              {selectedPayouts.length > 0 && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleProcessPayouts}
                  className="bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-2xl px-6 py-3 font-semibold text-[#0F1419] flex items-center gap-2"
                >
                  <Send className="w-5 h-5" />
                  Process {selectedPayouts.length} Payout{selectedPayouts.length > 1 ? 's' : ''} (${selectedTotal.toFixed(2)})
                </motion.button>
              )}
            </div>

            {loadError && (
              <div className="mb-4 rounded-2xl p-4 border border-red-500/30 bg-red-500/10 text-red-300 text-sm">
                {loadError}
              </div>
            )}
            {actionMessage && (
              <div className="mb-4 rounded-2xl p-4 border border-[#2EFFAF]/30 bg-[#2EFFAF]/10 text-[#9FFFD8] text-sm">
                {actionMessage}
              </div>
            )}

            {loading ? (
              <div className="p-12 text-center">
                <p className="text-white/60">Loading payouts...</p>
              </div>
            ) : pendingRows.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-white/60">No pending payouts</p>
              </div>
            ) : (
            <div className="space-y-3">
              {pendingRows.map((payout) => (
                <motion.div
                  key={payout.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`bg-white/5 rounded-2xl p-5 cursor-pointer transition-all ${
                    selectedPayouts.includes(payout.id)
                      ? 'ring-2 ring-[#2EFFAF] bg-[#2EFFAF]/10'
                      : 'hover:bg-white/8'
                  }`}
                  onClick={() => togglePayout(payout.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <input
                        type="checkbox"
                        checked={selectedPayouts.includes(payout.id)}
                        onChange={() => togglePayout(payout.id)}
                        title={`Select payout for ${payout.provider}`}
                        className="w-5 h-5 rounded bg-white/10 border-white/20 checked:bg-[#2EFFAF]"
                      />
                      <div>
                        <h3 className="text-white font-bold">{payout.provider}</h3>
                        <p className="text-white/60 text-sm">{payout.providerId} • {payout.period}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-8">
                      <div className="text-right">
                        <p className="text-white/60 text-sm">Jobs Completed</p>
                        <p className="text-white font-semibold">{payout.jobs} jobs</p>
                      </div>
                      <div className="text-right">
                        <p className="text-white/60 text-sm">Total Earnings</p>
                        <p className="text-white font-semibold">${payout.totalEarnings.toFixed(2)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-white/60 text-sm">Platform Fee ({platformFeePercent.toFixed(1)}%)</p>
                        <p className="text-red-400 font-semibold">-${payout.platformFee.toFixed(2)}</p>
                      </div>
                      <div className="text-right min-w-[120px]">
                        <p className="text-white/60 text-sm">Payout Amount</p>
                        <p className="text-[#2EFFAF] font-bold text-xl">${payout.payoutAmount.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Breakdown */}
                  <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-white/60">Customer Charges</p>
                      <p className="text-white">${payout.totalEarnings.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-white/60">Provider Receives</p>
                      <p className="text-[#2EFFAF]">${payout.payoutAmount.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-white/60">TORC Platform Revenue</p>
                      <p className="text-white">${payout.platformFee.toFixed(2)}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
            )}
          </div>

          {/* Info Box */}
          <div className="glass rounded-[24px] p-6">
            <h3 className="text-white font-semibold mb-3">💡 Payout Process</h3>
            <ul className="space-y-2 text-white/80 text-sm">
              <li>• Totals above are computed from live completed jobs in the database.</li>
              <li>• Platform fee ({platformFeePercent.toFixed(1)}%) is deducted from gross provider earnings.</li>
              <li>• Connect a payout processor webhook/job to execute transfers.</li>
              <li>• This dashboard is now data-backed and ready for processor integration.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
