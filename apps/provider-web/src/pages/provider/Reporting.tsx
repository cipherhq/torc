import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  DollarSign,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { PageHeader } from '../../components/PageHeader';
import { supabase } from '../../lib/supabase';
import { loadPlatformSettings } from '../../lib/platformSettings';

interface ProviderJobRow {
  id: string;
  status: string;
  payment_status: string | null;
  base_price: number | null;
  total_amount: number | null;
  tip: number | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  service_id: string | null;
  customer_id: string | null;
  service: { name: string | null } | null;
  customer: { first_name: string | null; last_name: string | null; email: string | null } | null;
}

interface ProviderPayoutRow {
  id: string;
  period_start: string;
  period_end: string;
  net_payout: number | null;
  status: string | null;
  created_at: string;
  paid_at: string | null;
}

const ACTIVE_STATUSES = ['accepted', 'en_route', 'enroute', 'arrived', 'in_progress', 'inprogress'];

function toCurrency(value: number) {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toDurationMinutes(startedAt: string | null, completedAt: string | null) {
  if (!startedAt || !completedAt) return null;
  return Math.max(0, Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 60000));
}

function toSafeDateLabel(value: string | null | undefined) {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '-';
  return dt.toLocaleDateString();
}

function normalizePayoutStatus(status: string | null | undefined) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'paid' || normalized === 'pending' || normalized === 'processing' || normalized === 'failed') {
    return normalized;
  }
  return 'pending';
}

async function shareOrDownload(filename: string, content: string, mimeType: string) {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      const file = new File([content], filename, { type: mimeType });
      await navigator.share({ files: [file] });
      return;
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
    }
  }
  const blob = new Blob([content], { type: mimeType });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

function saveCsv(filename: string, rows: Array<Array<string | number>>) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  void shareOrDownload(filename, csv, 'text/csv;charset=utf-8;');
}

export function ProviderReporting() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [jobs, setJobs] = useState<ProviderJobRow[]>([]);
  const [payouts, setPayouts] = useState<ProviderPayoutRow[]>([]);
  const [platformFeePercent, setPlatformFeePercent] = useState(15);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    async function loadReporting() {
      try {
        setLoading(true);
        setLoadError(null);

        const [jobsRes, payoutsRes, settings] = await Promise.all([
          supabase
            .from('jobs')
            .select('id, status, payment_status, base_price, total_amount, tip, created_at, started_at, completed_at, service_id, customer_id')
            .eq('provider_id', user.id)
            .order('created_at', { ascending: false })
            .limit(500),
          supabase
            .from('provider_payouts')
            .select('id, period_start, period_end, net_payout, status, created_at, paid_at')
            .eq('provider_id', user.id)
            .order('period_start', { ascending: false })
            .limit(250),
          loadPlatformSettings(),
        ]);

        if (jobsRes.error) throw jobsRes.error;
        if (payoutsRes.error && !String(payoutsRes.error.message || '').toLowerCase().includes('does not exist')) {
          throw payoutsRes.error;
        }

        const rawJobs = (jobsRes.data || []) as Array<ProviderJobRow>;
        const serviceIds = Array.from(new Set(rawJobs.map((row) => row.service_id).filter(Boolean))) as string[];
        const customerIds = Array.from(new Set(rawJobs.map((row) => row.customer_id).filter(Boolean))) as string[];

        const [servicesRes, customersRes] = await Promise.all([
          serviceIds.length > 0
            ? supabase.from('services').select('id, name').in('id', serviceIds)
            : Promise.resolve({ data: [], error: null }),
          customerIds.length > 0
            ? supabase.from('profiles').select('id, first_name, last_name, email').in('id', customerIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (servicesRes.error) {
          console.warn('Failed to load service names for reporting:', servicesRes.error);
        }
        if (customersRes.error) {
          console.warn('Failed to load customer names for reporting:', customersRes.error);
        }

        const serviceMap: Record<string, { name: string | null }> = {};
        for (const row of ((servicesRes.data || []) as Array<{ id: string; name: string | null }>)) {
          serviceMap[row.id] = { name: row.name ?? null };
        }
        const customerMap: Record<string, { first_name: string | null; last_name: string | null; email: string | null }> = {};
        for (const row of ((customersRes.data || []) as Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }>)) {
          customerMap[row.id] = {
            first_name: row.first_name ?? null,
            last_name: row.last_name ?? null,
            email: row.email ?? null,
          };
        }

        const hydratedJobs = rawJobs.map((row) => ({
          ...row,
          service: row.service_id ? serviceMap[row.service_id] || null : null,
          customer: row.customer_id ? customerMap[row.customer_id] || null : null,
        }));

        setJobs(hydratedJobs);
        setPayouts((payoutsRes.data || []) as ProviderPayoutRow[]);
        setPlatformFeePercent(settings.platformFee);
      } catch (error: any) {
        console.warn('Failed to load provider reporting:', error);
        setLoadError(error?.message || 'Could not load reporting metrics.');
        setJobs([]);
        setPayouts([]);
      } finally {
        setLoading(false);
      }
    }

    void loadReporting();
  }, [user?.id]);

  const metrics = useMemo(() => {
    const completed = jobs.filter((j) => j.status === 'completed');
    const active = jobs.filter((j) => ACTIVE_STATUSES.includes(j.status));
    const paidJobs = jobs.filter((j) => j.payment_status === 'paid');
    const startedRows = jobs.filter((j) => Boolean(j.started_at));
    const lifecycleRows = completed.filter((j) => Boolean(j.started_at));

    const earningsBase = completed.reduce((sum, row) => sum + Number(row.base_price ?? row.total_amount ?? 0), 0);
    const tips = completed.reduce((sum, row) => sum + Number(row.tip || 0), 0);
    const estimatedFee = earningsBase * (platformFeePercent / 100);
    const estimatedNet = earningsBase - estimatedFee + tips;
    const paidPayouts = payouts.filter((p) => normalizePayoutStatus(p.status) === 'paid').reduce((sum, p) => sum + Number(p.net_payout || 0), 0);
    const queuedPayouts = payouts
      .filter((p) => {
        const status = normalizePayoutStatus(p.status);
        return status === 'pending' || status === 'processing';
      })
      .reduce((sum, p) => sum + Number(p.net_payout || 0), 0);
    const avgStartDelay = startedRows.length > 0
      ? startedRows.reduce((sum, row) => sum + ((new Date(row.started_at!).getTime() - new Date(row.created_at).getTime()) / 60000), 0) / startedRows.length
      : 0;
    const avgServiceDuration = lifecycleRows.length > 0
      ? lifecycleRows.reduce((sum, row) => sum + ((new Date(row.completed_at!).getTime() - new Date(row.started_at!).getTime()) / 60000), 0) / lifecycleRows.length
      : 0;

    return {
      totalJobs: jobs.length,
      completedJobs: completed.length,
      activeJobs: active.length,
      paidJobs: paidJobs.length,
      earningsBase,
      tips,
      estimatedFee,
      estimatedNet,
      paidPayouts,
      queuedPayouts,
      avgStartDelay,
      avgServiceDuration,
    };
  }, [jobs, payouts, platformFeePercent]);

  function exportProviderReport() {
    saveCsv(`provider-report-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['job_id', 'status', 'payment_status', 'service', 'customer', 'created_at', 'started_at', 'completed_at', 'duration_minutes', 'base_price', 'tip', 'total_amount'],
      ...jobs.map((row) => {
        const customerName = row.customer
          ? `${row.customer.first_name || ''} ${row.customer.last_name || ''}`.trim() || row.customer.email || ''
          : '';
        return [
          row.id,
          row.status,
          row.payment_status || '',
          row.service?.name || 'Service',
          customerName,
          row.created_at,
          row.started_at || '',
          row.completed_at || '',
          toDurationMinutes(row.started_at, row.completed_at) ?? '',
          Number(row.base_price ?? row.total_amount ?? 0).toFixed(2),
          Number(row.tip || 0).toFixed(2),
          Number(row.total_amount || 0).toFixed(2),
        ];
      }),
    ]);
  }

  const textColor = isDark ? '#FFFFFF' : '#14263D';
  const subColor = isDark ? 'rgba(255,255,255,0.58)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const borderColor = isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2';
  const pageBg = isDark ? '#0A1626' : '#EEF4FF';

  return (
    <div className="min-h-screen" style={{ background: pageBg , paddingBottom: 'calc(96px + var(--safe-bottom, 0px))' }}>
      <PageHeader title="Reporting" onBack={() => navigate('/profile')} />

      <div className="px-6 space-y-6" style={{ paddingTop: 'calc(var(--safe-top) + 64px)' }}>
        {loading ? (
          <div className="rounded-2xl p-5" style={{ backgroundColor: cardBg, border: `1px solid ${borderColor}` }}>
            <p style={{ color: subColor }}>Loading your report...</p>
          </div>
        ) : loadError ? (
          <div className="rounded-2xl p-5" style={{ backgroundColor: cardBg, border: '1px solid rgba(239,68,68,0.3)' }}>
            <p className="text-red-500 text-sm">{loadError}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <motion.div className="rounded-2xl p-4" style={{ backgroundColor: cardBg, border: `1px solid ${borderColor}` }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="w-4 h-4 text-[#008CE5]" />
                  <p className="text-xs uppercase tracking-wide" style={{ color: subColor }}>Jobs</p>
                </div>
                <p className="text-2xl font-bold" style={{ color: textColor }}>{metrics.totalJobs}</p>
                <p className="text-xs mt-1" style={{ color: subColor }}>
                  {metrics.completedJobs} completed | {metrics.activeJobs} active
                </p>
              </motion.div>

              <motion.div className="rounded-2xl p-4" style={{ backgroundColor: cardBg, border: `1px solid ${borderColor}` }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }}>
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-4 h-4 text-[#008CE5]" />
                  <p className="text-xs uppercase tracking-wide" style={{ color: subColor }}>Estimated Net</p>
                </div>
                <p className="text-2xl font-bold" style={{ color: textColor }}>${toCurrency(metrics.estimatedNet)}</p>
                <p className="text-xs mt-1" style={{ color: subColor }}>
                  Fee {platformFeePercent.toFixed(1)}% (${toCurrency(metrics.estimatedFee)})
                </p>
              </motion.div>

              <motion.div className="rounded-2xl p-4" style={{ backgroundColor: cardBg, border: `1px solid ${borderColor}` }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
                <div className="flex items-center gap-2 mb-2">
                  <Wallet className="w-4 h-4 text-[#008CE5]" />
                  <p className="text-xs uppercase tracking-wide" style={{ color: subColor }}>Payouts</p>
                </div>
                <p className="text-2xl font-bold" style={{ color: textColor }}>${toCurrency(metrics.paidPayouts)}</p>
                <p className="text-xs mt-1" style={{ color: subColor }}>Queued ${toCurrency(metrics.queuedPayouts)}</p>
              </motion.div>

              <motion.div className="rounded-2xl p-4" style={{ backgroundColor: cardBg, border: `1px solid ${borderColor}` }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.09 }}>
                <div className="flex items-center gap-2 mb-2">
                  <Clock3 className="w-4 h-4 text-[#008CE5]" />
                  <p className="text-xs uppercase tracking-wide" style={{ color: subColor }}>Lifecycle</p>
                </div>
                <p className="text-2xl font-bold" style={{ color: textColor }}>{Math.round(metrics.avgServiceDuration)}m</p>
                <p className="text-xs mt-1" style={{ color: subColor }}>
                  Avg start {Math.round(metrics.avgStartDelay)}m
                </p>
              </motion.div>
            </div>

            <div className="rounded-2xl p-5" style={{ backgroundColor: cardBg, border: `1px solid ${borderColor}` }}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold" style={{ color: textColor }}>Recent Payouts</h2>
              </div>
              <div className="space-y-3">
                {payouts.slice(0, 8).map((payout) => (
                  <div key={payout.id} className="rounded-xl p-4" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC' }}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-semibold" style={{ color: textColor }}>
                        {toSafeDateLabel(payout.period_start)} - {toSafeDateLabel(payout.period_end)}
                      </p>
                      <p className="font-semibold" style={{ color: textColor }}>${toCurrency(Number(payout.net_payout || 0))}</p>
                    </div>
                    <div className="flex items-center justify-between text-xs" style={{ color: subColor }}>
                      <p>{normalizePayoutStatus(payout.status).toUpperCase()}</p>
                      <p>{toSafeDateLabel(payout.created_at)}</p>
                    </div>
                  </div>
                ))}
                {payouts.length === 0 && (
                  <p className="text-sm" style={{ color: subColor }}>No payouts recorded yet.</p>
                )}
              </div>
            </div>

            <div className="rounded-2xl p-5" style={{ backgroundColor: cardBg, border: `1px solid ${borderColor}` }}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold" style={{ color: textColor }}>Recent Completed Jobs</h2>
                <button
                  onClick={exportProviderReport}
                  className="px-3 py-2 rounded-xl text-sm font-semibold flex items-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #008CE5, #0070B8)', color: '#FFFFFF' }}
                >
                  <Download className="w-4 h-4" />
                  Export
                </button>
              </div>
              <div className="space-y-3">
                {jobs.filter((j) => j.status === 'completed').slice(0, 8).map((row) => {
                  const customerName = row.customer
                    ? `${row.customer.first_name || ''} ${row.customer.last_name || ''}`.trim() || row.customer.email || 'Customer'
                    : 'Customer';
                  const duration = toDurationMinutes(row.started_at, row.completed_at);
                  return (
                    <div key={row.id} className="rounded-xl p-4" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC' }}>
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-semibold" style={{ color: textColor }}>{row.service?.name || 'Service'}</p>
                        <p className="font-semibold" style={{ color: textColor }}>
                          ${toCurrency(Number(row.base_price ?? row.total_amount ?? 0) + Number(row.tip || 0))}
                        </p>
                      </div>
                      <div className="flex items-center justify-between text-xs" style={{ color: subColor }}>
                        <p>{customerName}</p>
                        <p>{toSafeDateLabel(row.completed_at || row.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: subColor }}>
                        <span className="inline-flex items-center gap-1"><CalendarDays className="w-3 h-3" /> Job {String(row.id || '').slice(0, 8).toUpperCase() || '-'}</span>
                        <span className="inline-flex items-center gap-1"><Clock3 className="w-3 h-3" /> {duration != null ? `${duration} min` : '-'}</span>
                        <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> {row.payment_status || 'paid'}</span>
                      </div>
                    </div>
                  );
                })}
                {jobs.filter((j) => j.status === 'completed').length === 0 && (
                  <p className="text-sm" style={{ color: subColor }}>No completed jobs yet.</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
