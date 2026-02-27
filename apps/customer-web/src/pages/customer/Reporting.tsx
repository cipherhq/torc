import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  DollarSign,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../lib/supabase';
import { CustomerBottomNav } from '../../components/CustomerBottomNav';

interface CustomerJobRow {
  id: string;
  status: string;
  total_amount: number | null;
  tip: number | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  service: { name: string } | null;
  provider: { first_name: string | null; last_name: string | null; email: string | null } | null;
}

function toCurrency(value: number) {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toDurationMinutes(startedAt: string | null, completedAt: string | null) {
  if (!startedAt || !completedAt) return null;
  return Math.max(0, Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 60000));
}

function saveCsv(filename: string, rows: Array<Array<string | number>>) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function CustomerReporting() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [jobs, setJobs] = useState<CustomerJobRow[]>([]);
  const [ticketCounts, setTicketCounts] = useState({ open: 0, resolved: 0 });
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

        const [jobsRes, ticketsRes] = await Promise.all([
          supabase
            .from('jobs')
            .select(`
              id,
              status,
              total_amount,
              tip,
              created_at,
              started_at,
              completed_at,
              service:services(name),
              provider:profiles!jobs_provider_id_fkey(first_name, last_name, email)
            `)
            .eq('customer_id', user.id)
            .order('created_at', { ascending: false })
            .limit(500),
          supabase
            .from('support_tickets')
            .select('status')
            .eq('requester_id', user.id)
            .limit(500),
        ]);

        if (jobsRes.error) throw jobsRes.error;
        if (ticketsRes.error && !String(ticketsRes.error.message || '').toLowerCase().includes('does not exist')) {
          throw ticketsRes.error;
        }

        const loadedJobs = (jobsRes.data || []) as CustomerJobRow[];
        const tickets = ticketsRes.data || [];
        setJobs(loadedJobs);
        setTicketCounts({
          open: tickets.filter((t: any) => t.status === 'open' || t.status === 'in_progress').length,
          resolved: tickets.filter((t: any) => t.status === 'resolved' || t.status === 'closed').length,
        });
      } catch (error: any) {
        console.warn('Failed to load customer reporting:', error);
        setLoadError(error?.message || 'Could not load reporting metrics.');
        setJobs([]);
        setTicketCounts({ open: 0, resolved: 0 });
      } finally {
        setLoading(false);
      }
    }

    void loadReporting();
  }, [user?.id]);

  const metrics = useMemo(() => {
    const completed = jobs.filter((j) => j.status === 'completed');
    const cancelled = jobs.filter((j) => j.status === 'cancelled');
    const startedRows = jobs.filter((j) => Boolean(j.started_at));
    const lifecycleRows = completed.filter((j) => Boolean(j.started_at));

    const totalSpent = completed.reduce((sum, row) => sum + Number(row.total_amount || 0) + Number(row.tip || 0), 0);
    const completionRate = jobs.length > 0 ? (completed.length / jobs.length) * 100 : 0;
    const avgStartDelay = startedRows.length > 0
      ? startedRows.reduce((sum, row) => sum + ((new Date(row.started_at!).getTime() - new Date(row.created_at).getTime()) / 60000), 0) / startedRows.length
      : 0;
    const avgServiceDuration = lifecycleRows.length > 0
      ? lifecycleRows.reduce((sum, row) => sum + ((new Date(row.completed_at!).getTime() - new Date(row.started_at!).getTime()) / 60000), 0) / lifecycleRows.length
      : 0;

    const monthKey = new Date().toISOString().slice(0, 7);
    const thisMonthSpend = completed
      .filter((row) => (row.completed_at || row.created_at || '').slice(0, 7) === monthKey)
      .reduce((sum, row) => sum + Number(row.total_amount || 0) + Number(row.tip || 0), 0);

    return {
      totalJobs: jobs.length,
      completedJobs: completed.length,
      cancelledJobs: cancelled.length,
      completionRate,
      totalSpent,
      thisMonthSpend,
      avgStartDelay,
      avgServiceDuration,
    };
  }, [jobs]);

  function exportMyReport() {
    saveCsv(`customer-report-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['job_id', 'status', 'service', 'provider', 'created_at', 'started_at', 'completed_at', 'duration_minutes', 'total_amount', 'tip'],
      ...jobs.map((row) => {
        const providerName = row.provider
          ? `${row.provider.first_name || ''} ${row.provider.last_name || ''}`.trim() || row.provider.email || ''
          : '';
        return [
          row.id,
          row.status,
          row.service?.name || 'Service',
          providerName,
          row.created_at,
          row.started_at || '',
          row.completed_at || '',
          toDurationMinutes(row.started_at, row.completed_at) ?? '',
          Number(row.total_amount || 0).toFixed(2),
          Number(row.tip || 0).toFixed(2),
        ];
      }),
    ]);
  }

  const textColor = isDark ? '#FFFFFF' : '#14263D';
  const subColor = isDark ? 'rgba(255,255,255,0.6)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const borderColor = isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2';
  const pageBg = isDark ? '#0A1626' : '#EEF4FF';

  return (
    <div className="min-h-screen pb-28" style={{ background: pageBg }}>
      <div className="p-6" style={{ paddingTop: 'var(--safe-top)' }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/customer/profile')}
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF2F7' }}
            title="Back to profile"
          >
            <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
          </button>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: textColor }}>My Reporting</h1>
            <p className="text-sm" style={{ color: subColor }}>Service, spend, and completion metrics</p>
          </div>
        </div>
      </div>

      <div className="px-6 space-y-6">
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
                <p className="text-xs mt-1" style={{ color: subColor }}>{metrics.completedJobs} completed</p>
              </motion.div>

              <motion.div className="rounded-2xl p-4" style={{ backgroundColor: cardBg, border: `1px solid ${borderColor}` }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }}>
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-4 h-4 text-[#008CE5]" />
                  <p className="text-xs uppercase tracking-wide" style={{ color: subColor }}>Total Spent</p>
                </div>
                <p className="text-2xl font-bold" style={{ color: textColor }}>${toCurrency(metrics.totalSpent)}</p>
                <p className="text-xs mt-1" style={{ color: subColor }}>This month ${toCurrency(metrics.thisMonthSpend)}</p>
              </motion.div>

              <motion.div className="rounded-2xl p-4" style={{ backgroundColor: cardBg, border: `1px solid ${borderColor}` }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
                <div className="flex items-center gap-2 mb-2">
                  <Clock3 className="w-4 h-4 text-[#008CE5]" />
                  <p className="text-xs uppercase tracking-wide" style={{ color: subColor }}>Avg Start</p>
                </div>
                <p className="text-2xl font-bold" style={{ color: textColor }}>{Math.round(metrics.avgStartDelay)}m</p>
                <p className="text-xs mt-1" style={{ color: subColor }}>Request to service start</p>
              </motion.div>

              <motion.div className="rounded-2xl p-4" style={{ backgroundColor: cardBg, border: `1px solid ${borderColor}` }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.09 }}>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-4 h-4 text-[#008CE5]" />
                  <p className="text-xs uppercase tracking-wide" style={{ color: subColor }}>Completion</p>
                </div>
                <p className="text-2xl font-bold" style={{ color: textColor }}>{metrics.completionRate.toFixed(0)}%</p>
                <p className="text-xs mt-1" style={{ color: subColor }}>
                  {metrics.cancelledJobs} cancelled
                </p>
              </motion.div>
            </div>

            <div className="rounded-2xl p-5" style={{ backgroundColor: cardBg, border: `1px solid ${borderColor}` }}>
              <h2 className="text-lg font-bold mb-3" style={{ color: textColor }}>Support Status</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl p-4" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC' }}>
                  <div className="flex items-center gap-2">
                    <Clock3 className="w-4 h-4 text-[#008CE5]" />
                    <p className="text-xs uppercase tracking-wide" style={{ color: subColor }}>Open Tickets</p>
                  </div>
                  <p className="text-xl font-bold mt-2" style={{ color: textColor }}>{ticketCounts.open}</p>
                </div>
                <div className="rounded-xl p-4" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC' }}>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#008CE5]" />
                    <p className="text-xs uppercase tracking-wide" style={{ color: subColor }}>Resolved</p>
                  </div>
                  <p className="text-xl font-bold mt-2" style={{ color: textColor }}>{ticketCounts.resolved}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl p-5" style={{ backgroundColor: cardBg, border: `1px solid ${borderColor}` }}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold" style={{ color: textColor }}>Recent Completed Services</h2>
                <button
                  onClick={exportMyReport}
                  className="px-3 py-2 rounded-xl text-sm font-semibold flex items-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #008CE5, #0070B8)', color: '#FFFFFF' }}
                >
                  <Download className="w-4 h-4" />
                  Export
                </button>
              </div>
              <div className="space-y-3">
                {jobs.filter((j) => j.status === 'completed').slice(0, 8).map((row) => {
                  const providerName = row.provider
                    ? `${row.provider.first_name || ''} ${row.provider.last_name || ''}`.trim() || row.provider.email || 'Provider'
                    : 'Provider';
                  const duration = toDurationMinutes(row.started_at, row.completed_at);
                  return (
                    <div key={row.id} className="rounded-xl p-4" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC' }}>
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <p className="font-semibold" style={{ color: textColor }}>{row.service?.name || 'Service'}</p>
                        <p className="font-semibold" style={{ color: textColor }}>${toCurrency(Number(row.total_amount || 0) + Number(row.tip || 0))}</p>
                      </div>
                      <div className="flex items-center justify-between text-xs" style={{ color: subColor }}>
                        <p>{providerName}</p>
                        <p>{new Date(row.completed_at || row.created_at).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: subColor }}>
                        <span className="inline-flex items-center gap-1"><CalendarDays className="w-3 h-3" /> Job {row.id.slice(0, 8).toUpperCase()}</span>
                        <span className="inline-flex items-center gap-1"><Clock3 className="w-3 h-3" /> {duration != null ? `${duration} min` : '-'}</span>
                        <span className="inline-flex items-center gap-1">
                          {row.status === 'completed' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {row.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {jobs.filter((j) => j.status === 'completed').length === 0 && (
                  <p className="text-sm" style={{ color: subColor }}>No completed services yet.</p>
                )}
              </div>
            </div>

            <div className="rounded-2xl p-5" style={{ backgroundColor: cardBg, border: `1px solid ${borderColor}` }}>
              <h2 className="text-lg font-bold mb-2" style={{ color: textColor }}>Lifecycle Metrics</h2>
              <p className="text-sm" style={{ color: subColor }}>
                Average service duration: {Math.round(metrics.avgServiceDuration)} minutes. Metrics are collected from job start and completion timestamps.
              </p>
            </div>
          </>
        )}
      </div>

      <CustomerBottomNav />
    </div>
  );
}

