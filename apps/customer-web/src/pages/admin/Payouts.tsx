import { useMemo, useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { AdminNav } from '../../components/AdminNav';
import { DollarSign, TrendingUp, Clock, CheckCircle, Send, Calendar } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { loadPlatformSettings } from '../../lib/platformSettings';

type PayoutStatus = 'pending' | 'processing' | 'paid' | 'failed';
type WeekMode = 'previous' | 'current';

interface ProviderPayoutRow {
  id: string;
  provider: string;
  providerId: string;
  jobs: number;
  totalEarnings: number;
  totalTips: number;
  platformFee: number;
  payoutAmount: number;
  period: string;
  status: PayoutStatus;
  payoutRecordId?: string | null;
}

interface WeekRange {
  start: Date;
  end: Date;
  endExclusive: Date;
  startDate: string;
  endDate: string;
  label: string;
}

function getWeekStart(value: Date) {
  const d = new Date(value);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekRange(mode: WeekMode): WeekRange {
  const start = getWeekStart(new Date());
  if (mode === 'previous') {
    start.setDate(start.getDate() - 7);
  }
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  const endExclusive = new Date(start);
  endExclusive.setDate(endExclusive.getDate() + 7);

  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);
  const label = `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;

  return { start, end, endExclusive, startDate, endDate, label };
}

function isMissingTableError(error: unknown) {
  return String((error as { message?: string })?.message || '').toLowerCase().includes('does not exist');
}

export function AdminPayouts() {
  const [selectedPayouts, setSelectedPayouts] = useState<string[]>([]);
  const [rows, setRows] = useState<ProviderPayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [platformFeePercent, setPlatformFeePercent] = useState(15);
  const [weekMode, setWeekMode] = useState<WeekMode>('previous');

  const weekRange = useMemo(() => getWeekRange(weekMode), [weekMode]);

  useEffect(() => {
    void loadWeeklyPayouts();
  }, [weekMode]);

  async function loadWeeklyPayouts() {
    try {
      setLoading(true);
      setLoadError(null);
      setActionMessage(null);
      setSelectedPayouts([]);

      const [{ data: jobsData, error: jobsError }, settings] = await Promise.all([
        supabase
          .from('jobs')
          .select('id, provider_id, base_price, tip, total_amount, payment_status, completed_at, created_at')
          .eq('status', 'completed')
          .not('provider_id', 'is', null)
          .gte('completed_at', weekRange.start.toISOString())
          .lt('completed_at', weekRange.endExclusive.toISOString())
          .order('completed_at', { ascending: false }),
        loadPlatformSettings(),
      ]);

      if (jobsError) throw jobsError;

      const { data: payoutRows, error: payoutError } = await supabase
        .from('provider_payouts')
        .select('id, provider_id, total_earnings, total_tips, platform_fee, net_payout, status, period_start, period_end')
        .eq('period_start', weekRange.startDate)
        .eq('period_end', weekRange.endDate);

      if (payoutError && !isMissingTableError(payoutError)) throw payoutError;

      const providerIds = new Set<string>();
      (jobsData || []).forEach((job: any) => {
        if (job.provider_id) providerIds.add(job.provider_id);
      });
      (payoutRows || []).forEach((p: any) => {
        if (p.provider_id) providerIds.add(p.provider_id);
      });

      const { data: providerProfiles } = providerIds.size > 0
        ? await supabase
            .from('profiles')
            .select('id, first_name, last_name, email')
            .in('id', Array.from(providerIds))
        : { data: [] as any[] };

      const providerById = new Map<string, string>();
      (providerProfiles || []).forEach((p: any) => {
        const fullName = `${p.first_name || ''} ${p.last_name || ''}`.trim();
        providerById.set(p.id, fullName || p.email || 'Provider');
      });

      const groupedJobs = new Map<string, any[]>();
      (jobsData || []).forEach((job: any) => {
        const key = job.provider_id;
        if (!groupedJobs.has(key)) groupedJobs.set(key, []);
        groupedJobs.get(key)!.push(job);
      });

      const payoutByProvider = new Map<string, any>();
      (payoutRows || []).forEach((row: any) => {
        payoutByProvider.set(row.provider_id, row);
      });

      const feePercent = settings.platformFee;
      setPlatformFeePercent(feePercent);

      const computed: ProviderPayoutRow[] = Array.from(providerIds).map((providerId) => {
        const providerJobs = groupedJobs.get(providerId) || [];
        const existingPayout = payoutByProvider.get(providerId);

        const totalEarnings = providerJobs.length > 0
          ? providerJobs.reduce((sum, j) => sum + (Number(j.base_price ?? j.total_amount) || 0), 0)
          : Number(existingPayout?.total_earnings || 0);
        const totalTips = providerJobs.length > 0
          ? providerJobs.reduce((sum, j) => sum + (Number(j.tip) || 0), 0)
          : Number(existingPayout?.total_tips || 0);
        const platformFee = providerJobs.length > 0
          ? totalEarnings * (feePercent / 100)
          : Number(existingPayout?.platform_fee || 0);
        const payoutAmount = providerJobs.length > 0
          ? totalEarnings - platformFee + totalTips
          : Number(existingPayout?.net_payout || 0);

        return {
          id: providerId,
          provider: providerById.get(providerId) || 'Provider',
          providerId,
          jobs: providerJobs.length,
          totalEarnings,
          totalTips,
          platformFee,
          payoutAmount,
          period: weekRange.label,
          status: (existingPayout?.status as PayoutStatus) || 'pending',
          payoutRecordId: existingPayout?.id || null,
        };
      });

      setRows(computed.sort((a, b) => b.payoutAmount - a.payoutAmount));
    } catch (e) {
      console.warn('Failed to load weekly payouts:', e);
      setRows([]);
      setLoadError('Could not load weekly payouts right now.');
    } finally {
      setLoading(false);
    }
  }

  const togglePayout = (providerId: string) => {
    setSelectedPayouts((prev) =>
      prev.includes(providerId)
        ? prev.filter((id) => id !== providerId)
        : [...prev, providerId]
    );
  };

  async function handleProcessPayouts() {
    if (selectedPayouts.length === 0) return;

    try {
      setProcessing(true);
      setActionMessage(null);

      let queued = 0;
      let skipped = 0;

      for (const providerId of selectedPayouts) {
        const payout = rows.find((row) => row.providerId === providerId);
        if (!payout) continue;

        if (payout.status === 'paid') {
          skipped += 1;
          continue;
        }

        if (payout.payoutRecordId) {
          const { error } = await supabase
            .from('provider_payouts')
            .update({
              total_earnings: payout.totalEarnings,
              total_tips: payout.totalTips,
              platform_fee: payout.platformFee,
              net_payout: payout.payoutAmount,
              status: 'processing',
            })
            .eq('id', payout.payoutRecordId);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('provider_payouts')
            .insert({
              provider_id: providerId,
              period_start: weekRange.startDate,
              period_end: weekRange.endDate,
              total_earnings: payout.totalEarnings,
              total_tips: payout.totalTips,
              platform_fee: payout.platformFee,
              net_payout: payout.payoutAmount,
              status: 'processing',
            });
          if (error) throw error;
        }

        queued += 1;
      }

      setActionMessage(
        queued > 0
          ? `Queued ${queued} payout(s) for processing.${skipped > 0 ? ` Skipped ${skipped} already paid payout(s).` : ''}`
          : 'No payouts were queued.'
      );
      await loadWeeklyPayouts();
    } catch (e: any) {
      console.warn('Failed to queue payouts:', e);
      setActionMessage(e?.message || 'Failed to queue payouts.');
    } finally {
      setProcessing(false);
    }
  }

  const selectedTotal = rows
    .filter((p) => selectedPayouts.includes(p.id))
    .reduce((sum, p) => sum + p.payoutAmount, 0);

  const pendingRows = useMemo(() => rows.filter((r) => r.status === 'pending' || r.status === 'failed'), [rows]);
  const processingRows = useMemo(() => rows.filter((r) => r.status === 'processing'), [rows]);
  const paidRows = useMemo(() => rows.filter((r) => r.status === 'paid'), [rows]);

  const statusChipClass = (status: PayoutStatus) => {
    if (status === 'paid') return 'bg-green-500/20 text-green-300 border border-green-500/30';
    if (status === 'processing') return 'bg-[#008CE5]/20 text-[#9FFFD8] border border-[#008CE5]/30';
    if (status === 'failed') return 'bg-red-500/20 text-red-300 border border-red-500/30';
    return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30';
  };

  return (
    <div className="min-h-screen bg-[#0F1419] flex">
      <AdminNav />

      <div className="flex-1 ml-64">
        <div className="bg-gradient-to-r from-[#252B3D] to-[#2F3548] p-8">
          <h1 className="text-3xl font-bold text-white mb-2">Provider Payouts</h1>
          <p className="text-white/60">Weekly payout queue and processing ledger</p>
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={() => setWeekMode('previous')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold ${weekMode === 'previous' ? 'bg-[#008CE5] text-white' : 'bg-white/10 text-white/70'}`}
            >
              Previous Week
            </button>
            <button
              onClick={() => setWeekMode('current')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold ${weekMode === 'current' ? 'bg-[#008CE5] text-white' : 'bg-white/10 text-white/70'}`}
            >
              Current Week
            </button>
            <div className="ml-2 text-white/70 text-sm flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              {weekRange.label}
            </div>
          </div>
        </div>

        <div className="p-8">
          <div className="grid grid-cols-4 gap-6 mb-8">
            <div className="glass rounded-[24px] p-6">
              <Clock className="w-8 h-8 text-[#0070B8] mb-3" />
              <p className="text-white/60 text-sm">Pending/Failed</p>
              <p className="text-white text-3xl font-bold">{pendingRows.length}</p>
            </div>
            <div className="glass rounded-[24px] p-6">
              <DollarSign className="w-8 h-8 text-[#008CE5] mb-3" />
              <p className="text-white/60 text-sm">Queued Processing</p>
              <p className="text-white text-3xl font-bold">
                ${processingRows.reduce((sum, p) => sum + p.payoutAmount, 0).toFixed(2)}
              </p>
            </div>
            <div className="glass rounded-[24px] p-6">
              <TrendingUp className="w-8 h-8 text-[#008CE5] mb-3" />
              <p className="text-white/60 text-sm">Platform Fees</p>
              <p className="text-white text-3xl font-bold">
                ${rows.reduce((sum, p) => sum + p.platformFee, 0).toFixed(2)}
              </p>
            </div>
            <div className="glass rounded-[24px] p-6">
              <CheckCircle className="w-8 h-8 text-[#008CE5] mb-3" />
              <p className="text-white/60 text-sm">Paid This Week</p>
              <p className="text-white text-3xl font-bold">
                ${paidRows.reduce((sum, p) => sum + p.payoutAmount, 0).toFixed(2)}
              </p>
            </div>
          </div>

          <div className="glass rounded-[24px] p-6 mb-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-white font-bold text-xl">Weekly Provider Payouts</h2>
              {selectedPayouts.length > 0 && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => void handleProcessPayouts()}
                  disabled={processing}
                  className="bg-gradient-to-r from-[#008CE5] to-[#0070B8] rounded-2xl px-6 py-3 font-semibold text-white flex items-center gap-2 disabled:opacity-60"
                >
                  <Send className="w-5 h-5" />
                  {processing
                    ? 'Queuing...'
                    : `Queue ${selectedPayouts.length} Payout${selectedPayouts.length > 1 ? 's' : ''} ($${selectedTotal.toFixed(2)})`}
                </motion.button>
              )}
            </div>

            {loadError && (
              <div className="mb-4 rounded-2xl p-4 border border-red-500/30 bg-red-500/10 text-red-300 text-sm">
                {loadError}
              </div>
            )}
            {actionMessage && (
              <div className="mb-4 rounded-2xl p-4 border border-[#008CE5]/30 bg-[#008CE5]/10 text-[#9FFFD8] text-sm">
                {actionMessage}
              </div>
            )}

            {loading ? (
              <div className="p-12 text-center">
                <p className="text-white/60">Loading weekly payouts...</p>
              </div>
            ) : rows.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-white/60">No payout data for this week.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {rows.map((payout) => {
                  const selectable = payout.status === 'pending' || payout.status === 'failed';
                  return (
                    <motion.div
                      key={payout.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`bg-white/5 rounded-2xl p-5 transition-all ${selectedPayouts.includes(payout.id) ? 'ring-2 ring-[#008CE5] bg-[#008CE5]/10' : 'hover:bg-white/8'}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <input
                            type="checkbox"
                            checked={selectedPayouts.includes(payout.id)}
                            onChange={() => selectable && togglePayout(payout.id)}
                            disabled={!selectable}
                            title={`Select payout for ${payout.provider}`}
                            className="w-5 h-5 rounded bg-white/10 border-white/20 checked:bg-[#008CE5] disabled:opacity-40"
                          />
                          <div>
                            <h3 className="text-white font-bold">{payout.provider}</h3>
                            <p className="text-white/60 text-sm">{payout.providerId} • {payout.period}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-8">
                          <div className="text-right">
                            <p className="text-white/60 text-sm">Jobs</p>
                            <p className="text-white font-semibold">{payout.jobs}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-white/60 text-sm">Base Earnings</p>
                            <p className="text-white font-semibold">${payout.totalEarnings.toFixed(2)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-white/60 text-sm">Tips</p>
                            <p className="text-[#9FFFD8] font-semibold">+${payout.totalTips.toFixed(2)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-white/60 text-sm">Platform Fee ({platformFeePercent.toFixed(1)}%)</p>
                            <p className="text-red-400 font-semibold">-${payout.platformFee.toFixed(2)}</p>
                          </div>
                          <div className="text-right min-w-[120px]">
                            <p className="text-white/60 text-sm">Payout Amount</p>
                            <p className="text-[#008CE5] font-bold text-xl">${payout.payoutAmount.toFixed(2)}</p>
                          </div>
                          <div className={`px-3 py-1 rounded-full text-xs font-semibold ${statusChipClass(payout.status)}`}>
                            {payout.status.toUpperCase()}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="glass rounded-[24px] p-6">
            <h3 className="text-white font-semibold mb-3">Weekly Payout Rules</h3>
            <ul className="space-y-2 text-white/80 text-sm">
              <li>• Payouts are grouped by week (Monday-Sunday).</li>
              <li>• Provider payout = base earnings - platform fee + tips.</li>
              <li>• Queueing sets payout rows to processing in `provider_payouts`.</li>
              <li>• Mark rows as paid/failed after transfer confirmation to keep the ledger accurate.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
