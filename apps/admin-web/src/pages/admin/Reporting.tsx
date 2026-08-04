import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { AdminLayout } from '../../components/AdminLayout';
import { supabase } from '../../lib/supabase';
import { Download, RefreshCw, FileBarChart2 } from 'lucide-react';
import { loadPlatformSettings } from '../../lib/platformSettings';

interface JobRow {
  id: string;
  total_amount: number | null;
  status: string;
  payment_status: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface RefundRow {
  id: string;
  job_id: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  reason: string;
  created_at: string;
}

interface TicketRow {
  id: string;
  subject: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  created_at: string;
  resolved_at: string | null;
}

interface AuditRow {
  id: string;
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, any> | null;
  created_at: string;
}

interface ProviderProfileRow {
  id: string;
  is_online: boolean | null;
  is_verified: boolean | null;
  created_at: string;
}

interface ProfileRow {
  id: string;
  role: 'customer' | 'provider' | 'admin' | string;
  created_at: string;
  terms_accepted_at?: string | null;
  terms_version?: string | null;
}

interface PayoutRow {
  id: string;
  provider_id: string;
  period_start: string;
  period_end: string;
  net_payout: number | null;
  status: 'pending' | 'processing' | 'paid' | 'failed';
  created_at: string;
  paid_at: string | null;
}

function escapeCsv(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function saveCsv(filename: string, rows: Array<Array<unknown>>) {
  const csv = rows.map((r) => r.map(escapeCsv).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function AdminReporting() {
  const [jobs, setJobs] = useState([] as JobRow[]);
  const [refunds, setRefunds] = useState([] as RefundRow[]);
  const [tickets, setTickets] = useState([] as TicketRow[]);
  const [audits, setAudits] = useState([] as AuditRow[]);
  const [providers, setProviders] = useState([] as ProviderProfileRow[]);
  const [profiles, setProfiles] = useState([] as ProfileRow[]);
  const [payouts, setPayouts] = useState([] as PayoutRow[]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null as string | null);
  const [slaThresholds, setSlaThresholds] = useState({
    urgentHours: 2,
    standardHours: 24,
  });
  const [serviceFeePercent, setServiceFeePercent] = useState(10);

  async function loadReportsData() {
    try {
      setLoading(true);
      setLoadError(null);
      const [jobsRes, refundsRes, ticketsRes, auditsRes, providerProfilesRes, profilesRes, payoutsRes, settings] = await Promise.all([
        supabase
          .from('jobs')
          .select('id, total_amount, status, payment_status, created_at, started_at, completed_at')
          .not('total_amount', 'is', null)
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('refunds')
          .select('id, job_id, amount, status, reason, created_at')
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('support_tickets')
          .select('id, subject, status, priority, created_at, resolved_at')
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('admin_audit_logs')
          .select('id, actor_id, action, entity_type, entity_id, details, created_at')
          .order('created_at', { ascending: false })
          .limit(1000),
        supabase
          .from('provider_profiles')
          .select('id, is_online, is_verified, created_at')
          .limit(1000),
        supabase
          .from('profiles')
          .select('id, role, created_at')
          .limit(2000),
        supabase
          .from('provider_payouts')
          .select('id, provider_id, period_start, period_end, net_payout, status, created_at, paid_at')
          .order('created_at', { ascending: false })
          .limit(1000),
        loadPlatformSettings(),
      ]);

      if (jobsRes.error) throw jobsRes.error;
      if (refundsRes.error && !String(refundsRes.error.message || '').toLowerCase().includes('does not exist')) throw refundsRes.error;
      if (ticketsRes.error && !String(ticketsRes.error.message || '').toLowerCase().includes('does not exist')) throw ticketsRes.error;
      if (auditsRes.error && !String(auditsRes.error.message || '').toLowerCase().includes('does not exist')) throw auditsRes.error;
      if (providerProfilesRes.error && !String(providerProfilesRes.error.message || '').toLowerCase().includes('does not exist')) throw providerProfilesRes.error;
      if (profilesRes.error && !String(profilesRes.error.message || '').toLowerCase().includes('does not exist')) throw profilesRes.error;
      if (payoutsRes.error && !String(payoutsRes.error.message || '').toLowerCase().includes('does not exist')) throw payoutsRes.error;

      setJobs((jobsRes.data || []) as JobRow[]);
      setRefunds((refundsRes.data || []) as RefundRow[]);
      setTickets((ticketsRes.data || []) as TicketRow[]);
      setAudits((auditsRes.data || []) as AuditRow[]);
      setProviders((providerProfilesRes.data || []) as ProviderProfileRow[]);
      setPayouts((payoutsRes.data || []) as PayoutRow[]);

      const baseProfiles = (profilesRes.data || []) as ProfileRow[];
      const profileIds = baseProfiles.map((row) => row.id).filter(Boolean);

      if (profileIds.length > 0) {
        try {
          const { data: termsRows, error: termsErr } = await supabase
            .from('profiles')
            .select('id, terms_accepted_at, terms_version')
            .in('id', profileIds);

          if (!termsErr && termsRows) {
            const termsById = new Map<string, { terms_accepted_at: string | null; terms_version: string | null }>();
            termsRows.forEach((row: any) => {
              termsById.set(row.id, {
                terms_accepted_at: row.terms_accepted_at || null,
                terms_version: row.terms_version || null,
              });
            });

            setProfiles(baseProfiles.map((row) => ({
              ...row,
              terms_accepted_at: termsById.get(row.id)?.terms_accepted_at ?? null,
              terms_version: termsById.get(row.id)?.terms_version ?? null,
            })));
          } else {
            setProfiles(baseProfiles);
          }
        } catch {
          setProfiles(baseProfiles);
        }
      } else {
        setProfiles([]);
      }

      setSlaThresholds({
        urgentHours: settings.urgentSlaHours,
        standardHours: settings.standardSlaHours,
      });
      setServiceFeePercent(settings.serviceFee);
    } catch (error: any) {
      console.warn('Failed to load reporting data:', error);
      setLoadError(error?.message || 'Could not load reporting data.');
      setJobs([]);
      setRefunds([]);
      setTickets([]);
      setAudits([]);
      setProviders([]);
      setProfiles([]);
      setPayouts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReportsData();
  }, []);

  const rollups = useMemo(() => {
    const grossSales = jobs.filter((j) => j.status === 'completed').reduce((sum, j) => sum + Number(j.total_amount || 0), 0);
    const approvedRefunds = refunds.filter((r) => r.status === 'approved').reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const pendingRefunds = refunds.filter((r) => r.status === 'pending').reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const netRevenue = (grossSales * (serviceFeePercent / 100)) - approvedRefunds;

    const openTickets = tickets.filter((t) => t.status === 'open' || t.status === 'in_progress');
    const now = Date.now();
    const breaches = openTickets.filter((t) => {
      const ageHours = (now - new Date(t.created_at).getTime()) / 36e5;
      return t.priority === 'urgent' ? ageHours > slaThresholds.urgentHours : ageHours > slaThresholds.standardHours;
    }).length;

    const last7d = new Date();
    last7d.setDate(last7d.getDate() - 7);
    const auditLast7d = audits.filter((a) => new Date(a.created_at) >= last7d);
    const bulkLast7d = auditLast7d.filter((a) => Boolean(a.details?.bulk_action)).length;

    const lifecycleRows = jobs.filter((j) => j.started_at && j.completed_at);
    const avgServiceDurationMinutes = lifecycleRows.length > 0
      ? lifecycleRows.reduce((sum, row) => sum + ((new Date(row.completed_at!).getTime() - new Date(row.started_at!).getTime()) / 60000), 0) / lifecycleRows.length
      : 0;
    const startDelayRows = jobs.filter((j) => j.started_at);
    const avgStartDelayMinutes = startDelayRows.length > 0
      ? startDelayRows.reduce((sum, row) => sum + ((new Date(row.started_at!).getTime() - new Date(row.created_at).getTime()) / 60000), 0) / startDelayRows.length
      : 0;

    const paidPayouts = payouts.filter((p) => p.status === 'paid').reduce((sum, p) => sum + Number(p.net_payout || 0), 0);
    const queuedPayouts = payouts
      .filter((p) => p.status === 'pending' || p.status === 'processing')
      .reduce((sum, p) => sum + Number(p.net_payout || 0), 0);

    const providerIdsFromProfiles = profiles.filter((p) => p.role === 'provider').map((p) => p.id);
    const providerIdsFromProviderProfiles = providers.map((p) => p.id);
    const allProviderIds = new Set([...providerIdsFromProfiles, ...providerIdsFromProviderProfiles]);
    const verifiedProviderIds = new Set(
      providers.filter((p) => Boolean(p.is_verified)).map((p) => p.id),
    );
    const onlineProviderIds = new Set(
      providers.filter((p) => Boolean(p.is_online)).map((p) => p.id),
    );

    const customerProfiles = profiles.filter((p) => p.role === 'customer');
    const providerProfiles = profiles.filter((p) => p.role === 'provider');
    const totalTrackedProfiles = customerProfiles.length + providerProfiles.length;
    const termsAcceptedProfiles = [...customerProfiles, ...providerProfiles].filter((p) => Boolean(p.terms_accepted_at)).length;
    const termsAcceptancePct = totalTrackedProfiles > 0
      ? (termsAcceptedProfiles / totalTrackedProfiles) * 100
      : 0;

    return {
      grossSales,
      netRevenue,
      pendingRefunds,
      openTickets: openTickets.length,
      breaches,
      auditLast7d: auditLast7d.length,
      bulkLast7d,
      providerCount: allProviderIds.size,
      onlineProviders: onlineProviderIds.size,
      unverifiedProviders: Math.max(allProviderIds.size - verifiedProviderIds.size, 0),
      customerCount: customerProfiles.length,
      providerTermsAccepted: providerProfiles.filter((p) => Boolean(p.terms_accepted_at)).length,
      customerTermsAccepted: customerProfiles.filter((p) => Boolean(p.terms_accepted_at)).length,
      termsAcceptancePct,
      paidPayouts,
      queuedPayouts,
      avgServiceDurationMinutes,
      avgStartDelayMinutes,
    };
  }, [jobs, refunds, tickets, audits, providers, profiles, payouts, slaThresholds, serviceFeePercent]);

  function exportPayments() {
    saveCsv(`report-payments-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['job_id', 'amount', 'status', 'payment_status', 'created_at', 'started_at', 'completed_at', 'service_duration_minutes'],
      ...jobs.map((j) => {
        const duration = j.started_at && j.completed_at
          ? Math.round((new Date(j.completed_at).getTime() - new Date(j.started_at).getTime()) / 60000)
          : '';
        return [
          j.id,
          Number(j.total_amount || 0).toFixed(2),
          j.status,
          j.payment_status || '',
          j.created_at,
          j.started_at || '',
          j.completed_at || '',
          duration,
        ];
      }),
    ]);
  }

  function exportRefunds() {
    saveCsv(`report-refunds-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['refund_id', 'job_id', 'amount', 'status', 'reason', 'created_at'],
      ...refunds.map((r) => [r.id, r.job_id, Number(r.amount || 0).toFixed(2), r.status, r.reason, r.created_at]),
    ]);
  }

  function exportTickets() {
    saveCsv(`report-tickets-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['ticket_id', 'subject', 'status', 'priority', 'created_at', 'resolved_at'],
      ...tickets.map((t) => [t.id, t.subject, t.status, t.priority, t.created_at, t.resolved_at || '']),
    ]);
  }

  function exportAudits() {
    saveCsv(`report-audits-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['audit_id', 'actor_id', 'action', 'entity_type', 'entity_id', 'bulk_action', 'created_at', 'details_json'],
      ...audits.map((a) => [
        a.id, a.actor_id, a.action, a.entity_type, a.entity_id, Boolean(a.details?.bulk_action), a.created_at, JSON.stringify(a.details || {}),
      ]),
    ]);
  }

  function exportPayouts() {
    saveCsv(`report-payouts-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['payout_id', 'provider_id', 'period_start', 'period_end', 'net_payout', 'status', 'created_at', 'paid_at'],
      ...payouts.map((p) => [
        p.id,
        p.provider_id,
        p.period_start,
        p.period_end,
        Number(p.net_payout || 0).toFixed(2),
        p.status,
        p.created_at,
        p.paid_at || '',
      ]),
    ]);
  }

  function exportProviders() {
    const providerProfileMap = new Map<string, ProviderProfileRow>();
    providers.forEach((row) => providerProfileMap.set(row.id, row));

    const providerRoleRows = profiles.filter((row) => row.role === 'provider');
    const providerIds = Array.from(new Set([
      ...providerRoleRows.map((row) => row.id),
      ...providers.map((row) => row.id),
    ]));

    const profileMap = new Map<string, ProfileRow>();
    providerRoleRows.forEach((row) => profileMap.set(row.id, row));

    saveCsv(`report-providers-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['provider_id', 'is_online', 'is_verified', 'created_at', 'terms_accepted_at', 'terms_version'],
      ...providerIds.map((providerId) => {
        const providerProfile = providerProfileMap.get(providerId);
        const profile = profileMap.get(providerId);
        return [
          providerId,
          Boolean(providerProfile?.is_online),
          Boolean(providerProfile?.is_verified),
          profile?.created_at || providerProfile?.created_at || '',
          profile?.terms_accepted_at || '',
          profile?.terms_version || '',
        ];
      }),
    ]);
  }

  function exportAll() {
    exportPayments();
    setTimeout(exportRefunds, 150);
    setTimeout(exportTickets, 300);
    setTimeout(exportProviders, 450);
    setTimeout(exportPayouts, 600);
    setTimeout(exportAudits, 750);
  }

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Reporting Hub</h1>
            <p className="text-gray-500">Central exports and operational rollups</p>
          </div>
          <button
            onClick={() => void loadReportsData()}
            className="rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-900 px-4 py-2 text-sm flex items-center gap-2"
            title="Refresh reporting data"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-8 text-gray-600">Loading report data...</div>
        ) : loadError ? (
          <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-8 text-red-500">{loadError}</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6">
                <p className="text-gray-500 text-sm">Gross Sales</p>
                <p className="text-gray-900 text-3xl font-bold">${rollups.grossSales.toFixed(2)}</p>
                <p className="text-gray-400 text-xs mt-1">Pending refunds: ${rollups.pendingRefunds.toFixed(2)}</p>
              </div>
              <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6">
                <p className="text-gray-500 text-sm">Net Platform Revenue</p>
                <p className="text-gray-900 text-3xl font-bold">${rollups.netRevenue.toFixed(2)}</p>
                <p className="text-gray-400 text-xs mt-1">{serviceFeePercent.toFixed(1)}% Torc fee less approved refunds</p>
              </div>
              <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6">
                <p className="text-gray-500 text-sm">Ticket SLA</p>
                <p className="text-gray-900 text-3xl font-bold">{rollups.breaches}</p>
                <p className="text-gray-400 text-xs mt-1">
                  {rollups.openTickets} open | thresholds: {slaThresholds.urgentHours}h/{slaThresholds.standardHours}h
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
              <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6">
                <p className="text-gray-500 text-sm">Providers</p>
                <p className="text-gray-900 text-3xl font-bold">{rollups.providerCount}</p>
                <p className="text-gray-400 text-xs mt-1">
                  {rollups.onlineProviders} online | {rollups.unverifiedProviders} unverified | {rollups.customerCount} customers
                </p>
              </div>
              <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6">
                <p className="text-gray-500 text-sm">Payouts Paid</p>
                <p className="text-gray-900 text-3xl font-bold">${rollups.paidPayouts.toFixed(2)}</p>
                <p className="text-gray-400 text-xs mt-1">
                  Queued: ${rollups.queuedPayouts.toFixed(2)}
                </p>
              </div>
              <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6">
                <p className="text-gray-500 text-sm">Avg Start Delay</p>
                <p className="text-gray-900 text-3xl font-bold">{Math.round(rollups.avgStartDelayMinutes)}m</p>
                <p className="text-gray-400 text-xs mt-1">created_at to started_at</p>
              </div>
              <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6">
                <p className="text-gray-500 text-sm">Avg Service Time</p>
                <p className="text-gray-900 text-3xl font-bold">{Math.round(rollups.avgServiceDurationMinutes)}m</p>
                <p className="text-gray-400 text-xs mt-1">started_at to completed_at</p>
              </div>
              <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6">
                <p className="text-gray-500 text-sm">Terms Acceptance</p>
                <p className="text-gray-900 text-3xl font-bold">{Math.round(rollups.termsAcceptancePct)}%</p>
                <p className="text-gray-400 text-xs mt-1">
                  Customers {rollups.customerTermsAccepted} | Providers {rollups.providerTermsAccepted}
                </p>
              </div>
            </div>

            <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6 mb-8">
              <h2 className="text-gray-900 text-xl font-bold mb-4">Audit Activity (7 days)</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-gray-500 text-sm">All Actions</p>
                  <p className="text-gray-900 text-2xl font-bold">{rollups.auditLast7d}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-gray-500 text-sm">Bulk Actions</p>
                  <p className="text-gray-900 text-2xl font-bold">{rollups.bulkLast7d}</p>
                </div>
              </div>
            </div>

            <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6 mb-8">
              <h2 className="text-gray-900 text-xl font-bold mb-4">Lifecycle Coverage</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-gray-500 text-sm">Jobs Tracked</p>
                  <p className="text-gray-900 text-2xl font-bold">{jobs.length}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-gray-500 text-sm">Started Jobs</p>
                  <p className="text-gray-900 text-2xl font-bold">{jobs.filter((j) => Boolean(j.started_at)).length}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-gray-500 text-sm">Completed Jobs</p>
                  <p className="text-gray-900 text-2xl font-bold">{jobs.filter((j) => j.status === 'completed').length}</p>
                </div>
              </div>
            </div>

            <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6">
              <h2 className="text-gray-900 text-xl font-bold mb-4">Export Bundles</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-3">
                <motion.button whileTap={{ scale: 0.98 }} onClick={exportPayments} className="rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-900 px-4 py-3 text-sm flex items-center justify-center gap-2">
                  <Download className="w-4 h-4" /> Payments
                </motion.button>
                <motion.button whileTap={{ scale: 0.98 }} onClick={exportRefunds} className="rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-900 px-4 py-3 text-sm flex items-center justify-center gap-2">
                  <Download className="w-4 h-4" /> Refunds
                </motion.button>
                <motion.button whileTap={{ scale: 0.98 }} onClick={exportTickets} className="rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-900 px-4 py-3 text-sm flex items-center justify-center gap-2">
                  <Download className="w-4 h-4" /> Tickets
                </motion.button>
                <motion.button whileTap={{ scale: 0.98 }} onClick={exportProviders} className="rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-900 px-4 py-3 text-sm flex items-center justify-center gap-2">
                  <Download className="w-4 h-4" /> Providers
                </motion.button>
                <motion.button whileTap={{ scale: 0.98 }} onClick={exportPayouts} className="rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-900 px-4 py-3 text-sm flex items-center justify-center gap-2">
                  <Download className="w-4 h-4" /> Payouts
                </motion.button>
                <motion.button whileTap={{ scale: 0.98 }} onClick={exportAudits} className="rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-900 px-4 py-3 text-sm flex items-center justify-center gap-2">
                  <Download className="w-4 h-4" /> Audit Logs
                </motion.button>
                <motion.button whileTap={{ scale: 0.98 }} onClick={exportAll} className="rounded-xl px-4 py-3 text-sm font-semibold flex items-center justify-center gap-2" style={{ background: 'linear-gradient(to right, #008CE5, #0070B8)', color: '#FFFFFF' }}>
                  <FileBarChart2 className="w-4 h-4" /> Export All
                </motion.button>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
