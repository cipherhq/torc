import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft, DollarSign, TrendingUp, Download, Clock, Calendar,
  Building2, ChevronRight, Receipt, Percent, Wallet, BadgeDollarSign,
  CreditCard, FileText, ChevronDown, ChevronUp, Info,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../lib/supabase';

interface Job {
  id: string;
  status: string;
  base_price: number;
  service_fee: number;
  tax: number;
  tip: number;
  total_amount: number;
  payment_status: string;
  completed_at: string | null;
  created_at: string;
  service: { name: string } | null;
  customer: { first_name: string; last_name: string } | null;
}

const FALLBACK_COMMISSION_PCT = 15;

export function ProviderEarnings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [commissionPct, setCommissionPct] = useState(FALLBACK_COMMISSION_PCT);
  const [activeTab, setActiveTab] = useState<'week' | 'month' | 'all'>('week');
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [payoutMethods, setPayoutMethods] = useState<any[]>([]);

  // ── Fetch data ────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) { setLoading(false); return; }

    async function load() {
      try {
        setLoadError(null);
        setLoading(true);

        // Fetch in parallel: jobs, platform settings, payout methods
        const [jobsRes, settingsRes, payoutRes] = await Promise.all([
          supabase
            .from('jobs')
            .select('*, service:services(name), customer:profiles!jobs_customer_id_fkey(first_name, last_name)')
            .eq('provider_id', user!.id)
            .order('created_at', { ascending: false }),
          supabase
            .from('platform_settings')
            .select('value')
            .eq('key', 'platform_commission_pct')
            .single(),
          supabase
            .from('provider_payout_methods')
            .select('*')
            .eq('provider_id', user!.id)
            .eq('status', 'active'),
        ]);

        if (jobsRes.data) setJobs(jobsRes.data);
        if (settingsRes.data?.value) setCommissionPct(Number(settingsRes.data.value) || FALLBACK_COMMISSION_PCT);
        if (payoutRes.data) setPayoutMethods(payoutRes.data);
      } catch (e) {
        console.warn('Failed to load earnings:', e);
        setLoadError('Could not load earnings right now.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user]);

  // ── Computed values ───────────────────────────────────────────────
  const completedJobs = useMemo(() => jobs.filter(j => j.status === 'completed'), [jobs]);
  const pendingJobs = useMemo(() =>
    jobs.filter(j => ['accepted', 'enroute', 'en_route', 'arrived', 'inprogress', 'in_progress'].includes(j.status)),
    [jobs]
  );

  const calcProviderEarnings = (jobList: Job[]) => {
    let grossBase = 0;
    let totalTips = 0;
    let totalCommission = 0;

    jobList.forEach(j => {
      const base = Number(j.base_price) || 0;
      const tip = Number(j.tip) || 0;
      grossBase += base;
      totalTips += tip;
      totalCommission += base * (commissionPct / 100);
    });

    const grossEarnings = grossBase + totalTips;
    const netEarnings = grossBase - totalCommission + totalTips;

    return { grossBase, totalTips, totalCommission, grossEarnings, netEarnings, jobCount: jobList.length };
  };

  const now = new Date();
  const weekStart = useMemo(() => {
    const d = new Date(now);
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); // Monday start
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const monthStart = useMemo(() => new Date(now.getFullYear(), now.getMonth(), 1), []);

  const weekJobs = useMemo(
    () => completedJobs.filter(j => new Date(j.completed_at || j.created_at) >= weekStart),
    [completedJobs, weekStart]
  );
  const monthJobs = useMemo(
    () => completedJobs.filter(j => new Date(j.completed_at || j.created_at) >= monthStart),
    [completedJobs, monthStart]
  );

  const allTimeStats = useMemo(() => calcProviderEarnings(completedJobs), [completedJobs, commissionPct]);
  const weekStats = useMemo(() => calcProviderEarnings(weekJobs), [weekJobs, commissionPct]);
  const monthStats = useMemo(() => calcProviderEarnings(monthJobs), [monthJobs, commissionPct]);
  const pendingStats = useMemo(() => calcProviderEarnings(pendingJobs), [pendingJobs, commissionPct]);

  const activeStats = activeTab === 'week' ? weekStats : activeTab === 'month' ? monthStats : allTimeStats;

  // Chart data
  const chartData = useMemo(() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dayMap = [1, 2, 3, 4, 5, 6, 0]; // JS getDay() mapping
    const totals: Record<string, number> = {};
    days.forEach(d => { totals[d] = 0; });

    weekJobs.forEach(j => {
      const jsDay = new Date(j.completed_at || j.created_at).getDay();
      const idx = dayMap.indexOf(jsDay);
      if (idx >= 0) {
        const base = Number(j.base_price) || 0;
        const tip = Number(j.tip) || 0;
        totals[days[idx]] += base * (1 - commissionPct / 100) + tip;
      }
    });

    return days.map(d => ({ day: d, amount: Math.round(totals[d] * 100) / 100 }));
  }, [weekJobs, commissionPct]);

  // Per-job breakdown for recent jobs
  const recentJobsDetailed = useMemo(() => {
    return jobs.slice(0, 20).map(j => {
      const base = Number(j.base_price) || 0;
      const tip = Number(j.tip) || 0;
      const commission = base * (commissionPct / 100);
      const net = base - commission + tip;
      return {
        id: j.id,
        service: j.service?.name || 'Service',
        customer: j.customer
          ? `${j.customer.first_name || ''} ${(j.customer.last_name || '')[0] || ''}.`
          : 'Customer',
        basePrice: base,
        tip,
        commission,
        net,
        status: j.status,
        paymentStatus: j.payment_status,
        date: new Date(j.completed_at || j.created_at).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric',
        }),
        dateShort: new Date(j.completed_at || j.created_at).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric',
        }),
      };
    });
  }, [jobs, commissionPct]);

  // Payout history — group completed+paid jobs by week
  const payoutHistory = useMemo(() => {
    const paidJobs = completedJobs.filter(j => j.payment_status === 'paid');
    if (paidJobs.length === 0) return [];

    const weeks: Record<string, { start: Date; end: Date; jobs: Job[] }> = {};
    paidJobs.forEach(j => {
      const d = new Date(j.completed_at || j.created_at);
      const weekKey = getWeekKey(d);
      if (!weeks[weekKey]) {
        const ws = getWeekStart(d);
        const we = new Date(ws);
        we.setDate(we.getDate() + 6);
        weeks[weekKey] = { start: ws, end: we, jobs: [] };
      }
      weeks[weekKey].jobs.push(j);
    });

    return Object.entries(weeks)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 8)
      .map(([key, week]) => {
        const stats = calcProviderEarnings(week.jobs);
        const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return {
          id: key,
          period: `${fmt(week.start)} – ${fmt(week.end)}`,
          jobCount: week.jobs.length,
          gross: stats.grossEarnings,
          commission: stats.totalCommission,
          tips: stats.totalTips,
          net: stats.netEarnings,
          status: 'paid' as const,
        };
      });
  }, [completedJobs, commissionPct]);

  const defaultPayout = payoutMethods.find(m => m.is_default) || payoutMethods[0];

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── Styles ────────────────────────────────────────────────────────
  const bg = isDark
    ? 'linear-gradient(180deg, #1A1F2E 0%, #0F1419 100%)'
    : 'linear-gradient(180deg, #F8FAFB 0%, #FFFFFF 100%)';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB';
  const textPrimary = isDark ? '#FFFFFF' : '#1A1F2E';
  const textSecondary = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const textTertiary = isDark ? 'rgba(255,255,255,0.35)' : '#9CA3AF';

  return (
    <div className="min-h-screen relative overflow-hidden pb-28" style={{ background: bg }}>
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/4 right-1/4 w-96 h-96 rounded-full"
          style={{ backgroundColor: '#008CE5', filter: 'blur(160px)', opacity: isDark ? 0.08 : 0.04 }}
        />
      </div>

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="relative z-10 p-6 flex items-center gap-4" style={{ paddingTop: 'var(--safe-top)' }}>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}
        >
          <ArrowLeft className="w-5 h-5" style={{ color: textPrimary }} />
        </motion.button>
        <h1 className="text-2xl font-bold" style={{ color: textPrimary }}>Earnings</h1>
      </div>

      {loading && (
        <div className="relative z-10 px-6 mb-6">
          <div className="rounded-2xl p-5" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#008CE5', borderTopColor: 'transparent' }} />
              <p style={{ color: textSecondary }}>Loading earnings...</p>
            </div>
          </div>
        </div>
      )}

      {loadError && (
        <div className="relative z-10 px-6 mb-6">
          <div className="rounded-2xl p-5" style={{ backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#FEF2F2', border: '1px solid rgba(239,68,68,0.2)' }}>
            <p className="text-red-500 text-sm">{loadError}</p>
          </div>
        </div>
      )}

      {!loading && !loadError && (
        <div className="relative z-10">

          {/* ── Available Balance Card ────────────────────────────── */}
          <div className="px-6 mb-5">
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-3xl p-6 overflow-hidden relative"
              style={{
                background: 'linear-gradient(135deg, #008CE5 0%, #0070B8 50%, #005A94 100%)',
                boxShadow: '0 8px 32px rgba(0,140,229,0.3)',
              }}
            >
              <div className="absolute top-0 right-0 w-40 h-40 rounded-full" style={{ background: 'rgba(255,255,255,0.08)', filter: 'blur(40px)' }} />
              <p className="text-white/70 text-sm mb-1">Available Balance</p>
              <h2 className="text-white font-bold text-4xl mb-1">${fmt(allTimeStats.netEarnings)}</h2>
              <p className="text-white/50 text-xs mb-5">Net after {commissionPct}% platform fee</p>

              <div className="flex items-center gap-3">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => navigate('/bank-accounts')}
                  className="flex-1 py-3 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2"
                  style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: '#FFFFFF' }}
                >
                  <Download className="w-4 h-4" /> Cash Out
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => navigate('/bank-accounts')}
                  className="py-3 px-4 rounded-2xl"
                  style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
                >
                  <Building2 className="w-5 h-5 text-white" />
                </motion.button>
              </div>

              {pendingStats.netEarnings > 0 && (
                <div className="mt-4 pt-4 border-t border-white/15 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-white/50" />
                    <span className="text-white/60 text-sm">Pending</span>
                  </div>
                  <span className="text-white font-semibold">${fmt(pendingStats.netEarnings)}</span>
                </div>
              )}
            </motion.div>
          </div>

          {/* ── Tab Switcher ─────────────────────────────────────── */}
          <div className="px-6 mb-5">
            <div className="flex rounded-2xl p-1" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6' }}>
              {(['week', 'month', 'all'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    backgroundColor: activeTab === tab ? (isDark ? 'rgba(0,140,229,0.2)' : '#FFFFFF') : 'transparent',
                    color: activeTab === tab ? '#008CE5' : textSecondary,
                    boxShadow: activeTab === tab ? (isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.08)') : 'none',
                  }}
                >
                  {tab === 'week' ? 'This Week' : tab === 'month' ? 'This Month' : 'All Time'}
                </button>
              ))}
            </div>
          </div>

          {/* ── Earnings Breakdown Card ──────────────────────────── */}
          <div className="px-6 mb-5">
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="rounded-3xl p-5"
              style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
            >
              <div className="flex items-center gap-2 mb-4">
                <Receipt className="w-5 h-5" style={{ color: '#008CE5' }} />
                <h3 className="font-semibold" style={{ color: textPrimary }}>Earnings Breakdown</h3>
                <span className="text-xs px-2 py-0.5 rounded-full ml-auto" style={{ backgroundColor: 'rgba(0,140,229,0.1)', color: '#008CE5' }}>
                  {activeStats.jobCount} job{activeStats.jobCount !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="space-y-3">
                {/* Gross base earnings */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#008CE5' }} />
                    <span className="text-sm" style={{ color: textSecondary }}>Service earnings</span>
                  </div>
                  <span className="font-semibold text-sm" style={{ color: textPrimary }}>${fmt(activeStats.grossBase)}</span>
                </div>

                {/* Platform fee */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#EF4444' }} />
                    <span className="text-sm" style={{ color: textSecondary }}>Platform fee ({commissionPct}%)</span>
                  </div>
                  <span className="font-semibold text-sm text-red-500">−${fmt(activeStats.totalCommission)}</span>
                </div>

                {/* Tips */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#10B981' }} />
                    <span className="text-sm" style={{ color: textSecondary }}>Tips (100% yours)</span>
                  </div>
                  <span className="font-semibold text-sm" style={{ color: '#10B981' }}>+${fmt(activeStats.totalTips)}</span>
                </div>

                {/* Divider */}
                <div className="border-t pt-3 mt-1" style={{ borderColor: cardBorder }}>
                  <div className="flex items-center justify-between">
                    <span className="font-bold" style={{ color: textPrimary }}>Net Earnings</span>
                    <span className="font-bold text-lg" style={{ color: '#008CE5' }}>${fmt(activeStats.netEarnings)}</span>
                  </div>
                </div>
              </div>

              {/* Info note */}
              <div className="mt-4 flex items-start gap-2 rounded-xl p-3" style={{ backgroundColor: isDark ? 'rgba(0,140,229,0.08)' : 'rgba(0,140,229,0.05)' }}>
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#008CE5' }} />
                <p className="text-xs" style={{ color: textSecondary }}>
                  Torc charges a {commissionPct}% platform fee on service earnings. Tips are never deducted — you keep 100%.
                </p>
              </div>
            </motion.div>
          </div>

          {/* ── Quick Stats Row ───────────────────────────────────── */}
          <div className="px-6 mb-5">
            <div className="grid grid-cols-3 gap-3">
              <motion.div
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
                className="rounded-2xl p-4 text-center"
                style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
              >
                <Calendar className="w-5 h-5 mx-auto mb-1" style={{ color: '#008CE5' }} />
                <p className="text-xs mb-0.5" style={{ color: textSecondary }}>This Week</p>
                <p className="font-bold text-lg" style={{ color: textPrimary }}>${fmt(weekStats.netEarnings)}</p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}
                className="rounded-2xl p-4 text-center"
                style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
              >
                <TrendingUp className="w-5 h-5 mx-auto mb-1" style={{ color: '#0070B8' }} />
                <p className="text-xs mb-0.5" style={{ color: textSecondary }}>This Month</p>
                <p className="font-bold text-lg" style={{ color: textPrimary }}>${fmt(monthStats.netEarnings)}</p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}
                className="rounded-2xl p-4 text-center"
                style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
              >
                <BadgeDollarSign className="w-5 h-5 mx-auto mb-1" style={{ color: '#008CE5' }} />
                <p className="text-xs mb-0.5" style={{ color: textSecondary }}>All Time</p>
                <p className="font-bold text-lg" style={{ color: textPrimary }}>${fmt(allTimeStats.netEarnings)}</p>
              </motion.div>
            </div>
          </div>

          {/* ── Weekly Chart ──────────────────────────────────────── */}
          <div className="px-6 mb-5">
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="rounded-3xl p-5"
              style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
            >
              <h3 className="font-semibold mb-4" style={{ color: textPrimary }}>Weekly Earnings (Net)</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} barCategoryGap="25%">
                  <XAxis
                    dataKey="day"
                    stroke={textTertiary}
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke={textTertiary}
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => `$${v}`}
                    width={45}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="rounded-lg px-3 py-2 text-xs shadow-lg"
                          style={{ backgroundColor: isDark ? '#2A3040' : '#FFFFFF', border: `1px solid ${cardBorder}` }}
                        >
                          <span style={{ color: textPrimary }} className="font-semibold">
                            ${fmt(payload[0].value as number)}
                          </span>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="amount" fill="url(#earningsGrad)" radius={[6, 6, 0, 0]} />
                  <defs>
                    <linearGradient id="earningsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#008CE5" />
                      <stop offset="100%" stopColor="#0070B8" />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            </motion.div>
          </div>

          {/* ── Payout Method ────────────────────────────────────── */}
          <div className="px-6 mb-5">
            <motion.button
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate('/bank-accounts')}
              className="w-full rounded-2xl p-4 flex items-center gap-3"
              style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(0,140,229,0.1)' }}>
                {defaultPayout?.method_type === 'paypal' ? (
                  <Wallet className="w-5 h-5" style={{ color: '#008CE5' }} />
                ) : defaultPayout?.method_type === 'venmo' ? (
                  <CreditCard className="w-5 h-5" style={{ color: '#008CE5' }} />
                ) : (
                  <Building2 className="w-5 h-5" style={{ color: '#008CE5' }} />
                )}
              </div>
              <div className="flex-1 text-left">
                <p className="font-semibold text-sm" style={{ color: textPrimary }}>
                  {defaultPayout
                    ? `${defaultPayout.display_name || defaultPayout.bank_name || defaultPayout.method_type}`
                    : 'No payout method'}
                </p>
                <p className="text-xs" style={{ color: textSecondary }}>
                  {defaultPayout
                    ? defaultPayout.account_last4
                      ? `····${defaultPayout.account_last4}`
                      : defaultPayout.paypal_email || defaultPayout.venmo_handle || 'Default'
                    : 'Tap to add a payout method'}
                </p>
              </div>
              <ChevronRight className="w-5 h-5" style={{ color: textTertiary }} />
            </motion.button>
          </div>

          {/* ── Recent Jobs ──────────────────────────────────────── */}
          <div className="px-6 mb-5">
            <h3 className="font-semibold mb-3" style={{ color: textPrimary }}>Recent Jobs</h3>
            {recentJobsDetailed.length === 0 ? (
              <div className="rounded-2xl p-5" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
                <p className="text-sm" style={{ color: textSecondary }}>No jobs yet. Start accepting requests to earn!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentJobsDetailed.map((job, index) => {
                  const isExpanded = expandedJob === job.id;
                  const statusColor = job.status === 'completed'
                    ? '#10B981'
                    : job.status === 'cancelled' ? '#EF4444' : '#F59E0B';
                  const statusLabel = job.status === 'completed'
                    ? 'Completed'
                    : job.status === 'cancelled' ? 'Cancelled' : 'In Progress';

                  return (
                    <motion.div
                      key={job.id}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.25 + index * 0.03 }}
                      className="rounded-2xl overflow-hidden"
                      style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
                    >
                      <button
                        onClick={() => setExpandedJob(isExpanded ? null : job.id)}
                        className="w-full p-4 flex items-center gap-3"
                      >
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: 'rgba(0,140,229,0.1)' }}
                        >
                          <DollarSign className="w-5 h-5" style={{ color: '#008CE5' }} />
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-sm truncate" style={{ color: textPrimary }}>{job.service}</p>
                            <span className="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: `${statusColor}15`, color: statusColor }}
                            >
                              {statusLabel}
                            </span>
                          </div>
                          <p className="text-xs truncate" style={{ color: textSecondary }}>{job.customer} · {job.dateShort}</p>
                        </div>
                        <div className="text-right flex-shrink-0 flex items-center gap-2">
                          <div>
                            <p className="font-bold text-sm" style={{ color: textPrimary }}>${fmt(job.net)}</p>
                            {job.tip > 0 && <p className="text-xs" style={{ color: '#10B981' }}>+${fmt(job.tip)} tip</p>}
                          </div>
                          {isExpanded
                            ? <ChevronUp className="w-4 h-4" style={{ color: textTertiary }} />
                            : <ChevronDown className="w-4 h-4" style={{ color: textTertiary }} />
                          }
                        </div>
                      </button>

                      {/* Expanded breakdown */}
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          className="px-4 pb-4"
                        >
                          <div className="rounded-xl p-3 space-y-2"
                            style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F9FAFB' }}
                          >
                            <div className="flex justify-between text-sm">
                              <span style={{ color: textSecondary }}>Base price</span>
                              <span style={{ color: textPrimary }}>${fmt(job.basePrice)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span style={{ color: textSecondary }}>Platform fee ({commissionPct}%)</span>
                              <span className="text-red-500">−${fmt(job.commission)}</span>
                            </div>
                            {job.tip > 0 && (
                              <div className="flex justify-between text-sm">
                                <span style={{ color: textSecondary }}>Tip</span>
                                <span style={{ color: '#10B981' }}>+${fmt(job.tip)}</span>
                              </div>
                            )}
                            <div className="border-t pt-2" style={{ borderColor: cardBorder }}>
                              <div className="flex justify-between">
                                <span className="font-semibold text-sm" style={{ color: textPrimary }}>Your earnings</span>
                                <span className="font-bold" style={{ color: '#008CE5' }}>${fmt(job.net)}</span>
                              </div>
                            </div>
                            <div className="flex justify-between text-xs pt-1">
                              <span style={{ color: textTertiary }}>Payment</span>
                              <span style={{
                                color: job.paymentStatus === 'paid' ? '#10B981' : '#F59E0B',
                              }}>
                                {job.paymentStatus === 'paid' ? 'Paid' : job.paymentStatus === 'refunded' ? 'Refunded' : 'Pending'}
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Payout History ────────────────────────────────────── */}
          <div className="px-6 mb-5">
            <h3 className="font-semibold mb-3" style={{ color: textPrimary }}>Payout History</h3>
            {payoutHistory.length === 0 ? (
              <div className="rounded-2xl p-5" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
                <p className="text-sm" style={{ color: textSecondary }}>No payouts yet. Complete jobs to start earning!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {payoutHistory.map((payout, index) => (
                  <motion.div
                    key={payout.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + index * 0.03 }}
                    className="rounded-2xl p-4"
                    style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-semibold text-sm" style={{ color: textPrimary }}>{payout.period}</p>
                        <p className="text-xs" style={{ color: textSecondary }}>{payout.jobCount} job{payout.jobCount !== 1 ? 's' : ''} completed</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold" style={{ color: '#008CE5' }}>${fmt(payout.net)}</p>
                        <span className="text-xs px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: 'rgba(16,185,129,0.1)', color: '#10B981' }}
                        >
                          Paid
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-4 text-xs" style={{ color: textTertiary }}>
                      <span>Gross: ${fmt(payout.gross)}</span>
                      <span>Fee: −${fmt(payout.commission)}</span>
                      <span>Tips: ${fmt(payout.tips)}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* ── Tax Summary ──────────────────────────────────────── */}
          <div className="px-6 mb-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
              className="rounded-3xl p-5"
              style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
            >
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-5 h-5" style={{ color: '#008CE5' }} />
                <h3 className="font-semibold" style={{ color: textPrimary }}>{now.getFullYear()} Tax Summary</h3>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span style={{ color: textSecondary }}>Gross income (1099)</span>
                  <span className="font-semibold" style={{ color: textPrimary }}>${fmt(allTimeStats.grossBase + allTimeStats.totalTips)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: textSecondary }}>Platform fees (deductible)</span>
                  <span className="font-semibold text-red-500">−${fmt(allTimeStats.totalCommission)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: textSecondary }}>Net income</span>
                  <span className="font-semibold" style={{ color: '#008CE5' }}>${fmt(allTimeStats.netEarnings)}</span>
                </div>
                <div className="border-t pt-3" style={{ borderColor: cardBorder }}>
                  <div className="flex justify-between text-sm">
                    <span style={{ color: textSecondary }}>Total jobs completed</span>
                    <span className="font-semibold" style={{ color: textPrimary }}>{allTimeStats.jobCount}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span style={{ color: textSecondary }}>Avg. per job</span>
                    <span className="font-semibold" style={{ color: textPrimary }}>
                      ${allTimeStats.jobCount > 0 ? fmt(allTimeStats.netEarnings / allTimeStats.jobCount) : '0.00'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-start gap-2 rounded-xl p-3" style={{ backgroundColor: isDark ? 'rgba(0,140,229,0.08)' : 'rgba(0,140,229,0.05)' }}>
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#008CE5' }} />
                <p className="text-xs" style={{ color: textSecondary }}>
                  You may receive a 1099 form if your annual earnings exceed $600. Platform fees are typically deductible as business expenses. Consult a tax professional for advice.
                </p>
              </div>
            </motion.div>
          </div>

        </div>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekKey(date: Date): string {
  const ws = getWeekStart(date);
  return ws.toISOString().slice(0, 10);
}
