import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import {
  Users, Briefcase, DollarSign, ShieldCheck, AlertCircle,
  FileText, Wallet, UserX, MessageSquare, Wrench, LifeBuoy, LineChart,
} from 'lucide-react';
import { AdminLayout } from '../../components/AdminLayout';
import { DashboardSkeleton } from '../../components/PageSkeleton';
import { supabase } from '../../lib/supabase';
import { useState, useEffect, useRef } from 'react';
import { loadPlatformSettings } from '../../lib/platformSettings';

interface DashboardAlert {
  id: string;
  type: 'info' | 'warning' | 'critical';
  message: string;
  time: string;
  path: string;
  createdAt: string;
}

function getTimeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.floor(diffMs / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState([
    { label: 'Active Jobs', value: '0', icon: Briefcase, gradient: 'linear-gradient(135deg, #008CE5, #0070B8)', path: '/jobs' },
    { label: 'Online Providers', value: '0', icon: Users, gradient: 'linear-gradient(135deg, #0070B8, #008CE5)', path: '/providers' },
    { label: 'Today Revenue', value: '$0', icon: DollarSign, gradient: 'linear-gradient(135deg, #008CE5, #0070B8)', path: '/payments' },
    { label: 'Total Users', value: '0', icon: Users, gradient: 'linear-gradient(135deg, #0070B8, #008CE5)', path: '/users' },
  ]);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [ops, setOps] = useState({
    pendingProviders: 0,
    suspendedUsers: 0,
    pendingDocs: 0,
    openTickets: 0,
    pendingRefunds: 0,
    failedPayments: 0,
    refundsExposure: 0,
    totalServices: 0,
    serviceFeePercent: 10,
    slaBreaches: 0,
  });
  const [pendingProviderRows, setPendingProviderRows] = useState<any[]>([]);
  const [urgentTicketRows, setUrgentTicketRows] = useState<any[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<DashboardAlert[]>([]);

  const actionCards = [
    { label: 'Approve Providers', value: `${ops.pendingProviders}`, subtitle: 'Pending verification', icon: ShieldCheck, path: '/providers' },
    { label: 'Manage Users', value: `${ops.suspendedUsers}`, subtitle: 'Suspended users', icon: UserX, path: '/users' },
    { label: 'Review Documents', value: `${ops.pendingDocs}`, subtitle: 'Pending document checks', icon: FileText, path: '/settings' },
    { label: 'Manage Payouts', value: `${ops.pendingRefunds}`, subtitle: `Torc fee ${ops.serviceFeePercent.toFixed(1)}%`, icon: Wallet, path: '/payouts' },
    { label: 'Live Dispatch', value: stats[0]?.value || '0', subtitle: 'Currently active jobs', icon: MessageSquare, path: '/jobs' },
    { label: 'Service Pricing', value: `${ops.totalServices}`, subtitle: 'Configured services', icon: Wrench, path: '/settings' },
    { label: 'Support Tickets', value: `${ops.openTickets}`, subtitle: `${ops.slaBreaches} SLA breach(es)`, icon: LifeBuoy, path: '/support-tickets' },
    { label: 'Financial Hub', value: `$${ops.refundsExposure.toFixed(0)}`, subtitle: `Pending refund exposure @ ${ops.serviceFeePercent.toFixed(1)}% Torc fee`, icon: LineChart, path: '/finance' },
    { label: 'Reporting Hub', value: `${ops.failedPayments}`, subtitle: 'Failed payments to review', icon: LineChart, path: '/reporting' },
  ];

  const loadStatsRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    async function loadStats() {
      try {
        setLoading(true);
        const settings = await loadPlatformSettings();

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const { count: userCount } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true });

        const { count: activeJobsCount } = await supabase
          .from('jobs')
          .select('*', { count: 'exact', head: true })
          .in('status', ['pending', 'matching', 'matched', 'accepted', 'enroute', 'en_route', 'arrived', 'inprogress', 'in_progress']);

        const { data: revenueData } = await supabase
          .from('jobs')
          .select('total_amount')
          .eq('status', 'completed')
          .gte('completed_at', today.toISOString());

        const revenue = revenueData?.reduce((sum, job) => sum + (Number(job.total_amount) || 0), 0) || 0;
        const revenueFormatted = revenue >= 1000 ? `$${(revenue / 1000).toFixed(1)}K` : `$${revenue.toFixed(0)}`;

        const { data: providerRoleRows, error: providerRoleErr } = await supabase
          .from('profiles')
          .select('id, full_name, email, created_at')
          .eq('role', 'provider');
        if (providerRoleErr) throw providerRoleErr;

        let providerProfileRows: any[] = [];
        try {
          const { data, error } = await supabase
            .from('provider_profiles')
            .select('id, is_online, is_verified, created_at');
          if (error) throw error;
          providerProfileRows = data || [];
        } catch {
          providerProfileRows = [];
        }

        const providerProfileMap = new Map<string, any>();
        providerProfileRows.forEach((row: any) => providerProfileMap.set(row.id, row));

        const providerRoleMap = new Map<string, any>();
        (providerRoleRows || []).forEach((row: any) => providerRoleMap.set(row.id, row));

        const providerIds = Array.from(new Set([
          ...(providerRoleRows || []).map((row: any) => row.id),
          ...providerProfileRows.map((row: any) => row.id),
        ]));

        const providersCount = providerProfileRows.filter((row: any) => Boolean(row.is_online)).length;
        const pendingProviderIds = providerIds.filter((id) => !providerProfileMap.get(id)?.is_verified);

        let suspendedCount = 0;
        try {
          const { count } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'suspended');
          suspendedCount = count || 0;
        } catch { suspendedCount = 0; }

        let pendingDocsCount = 0;
        try {
          const { count } = await supabase
            .from('documents')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');
          pendingDocsCount = count || 0;
        } catch { pendingDocsCount = 0; }

        let openTicketsCount = 0;
        let slaBreachesCount = 0;
        try {
          const { count } = await supabase
            .from('support_tickets')
            .select('*', { count: 'exact', head: true })
            .in('status', ['open', 'in_progress']);
          openTicketsCount = count || 0;

          const { data: openTicketsData } = await supabase
            .from('support_tickets')
            .select('priority, created_at, status')
            .in('status', ['open', 'in_progress']);

          const now = Date.now();
          slaBreachesCount = (openTicketsData || []).filter((t: any) => {
            const ageHours = (now - new Date(t.created_at).getTime()) / 36e5;
            return t.priority === 'urgent' ? ageHours > settings.urgentSlaHours : ageHours > settings.standardSlaHours;
          }).length;
        } catch {
          openTicketsCount = 0;
          slaBreachesCount = 0;
        }

        let pendingRefundsCount = 0;
        let pendingRefundAmount = 0;
        try {
          const { count, data } = await supabase
            .from('refunds')
            .select('amount', { count: 'exact' })
            .eq('status', 'pending');
          pendingRefundsCount = count || 0;
          pendingRefundAmount = (data || []).reduce((sum: number, row: any) => sum + (Number(row.amount) || 0), 0);
        } catch {
          pendingRefundsCount = 0;
          pendingRefundAmount = 0;
        }

        let failedPaymentsCount = 0;
        try {
          const { count } = await supabase
            .from('jobs')
            .select('*', { count: 'exact', head: true })
            .eq('payment_status', 'failed');
          failedPaymentsCount = count || 0;
        } catch { failedPaymentsCount = 0; }

        let servicesCount = 0;
        try {
          const { count } = await supabase
            .from('services')
            .select('*', { count: 'exact', head: true });
          servicesCount = count || 0;
        } catch { servicesCount = 0; }

        const providerQueue = pendingProviderIds
          .map((id) => {
            const profile = providerRoleMap.get(id) || {};
            const providerProfile = providerProfileMap.get(id) || {};
            return {
              id,
              full_name: profile.full_name || '',
              email: profile.email || '',
              created_at: profile.created_at || providerProfile.created_at || new Date().toISOString(),
            };
          })
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 5);

        setPendingProviderRows(providerQueue || []);

        const { data: urgentTickets } = await supabase
          .from('support_tickets')
          .select('id, subject, priority, requester_role, created_at, status')
          .in('status', ['open', 'in_progress'])
          .in('priority', ['high', 'urgent'])
          .order('created_at', { ascending: false })
          .limit(5);

        setUrgentTicketRows(urgentTickets || []);

        const { data: pendingRefundRows } = await supabase
          .from('refunds')
          .select('id, amount, reason, created_at')
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(5);

        const builtAlerts: DashboardAlert[] = [
          ...(urgentTickets || []).map((t: any) => ({
            id: `ticket-${t.id}`,
            type: t.priority === 'urgent' ? 'critical' as const : 'warning' as const,
            message: `${t.priority.toUpperCase()} ticket (${t.requester_role}): ${t.subject}`,
            time: getTimeAgo(t.created_at),
            path: '/support-tickets',
            createdAt: t.created_at,
          })),
          ...(providerQueue || []).map((p: any) => ({
            id: `provider-${p.id}`,
            type: 'info' as const,
            message: `New provider signup: ${p.full_name || p.email || p.id.slice(0, 8)}`,
            time: getTimeAgo(p.created_at),
            path: '/providers',
            createdAt: p.created_at,
          })),
          ...(pendingRefundRows || []).map((r: any) => ({
            id: `refund-${r.id}`,
            type: 'warning' as const,
            message: `Pending refund $${Number(r.amount || 0).toFixed(2)}${r.reason ? ` - ${r.reason}` : ''}`,
            time: getTimeAgo(r.created_at),
            path: '/finance',
            createdAt: r.created_at,
          })),
          ...(slaBreachesCount > 0 ? [{
            id: 'sla-breach-summary',
            type: 'critical' as const,
            message: `${slaBreachesCount} support ticket(s) are beyond SLA target`,
            time: 'Now',
            path: '/support-tickets',
            createdAt: new Date().toISOString(),
          }] : []),
        ]
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 8);

        setRecentAlerts(builtAlerts.length > 0 ? builtAlerts : [
          {
            id: 'system-ok',
            type: 'info',
            message: 'No urgent items at the moment.',
            time: 'Now',
            path: '/dashboard',
            createdAt: new Date().toISOString(),
          },
        ]);

        setStats([
          { label: 'Active Jobs', value: String(activeJobsCount || 0), icon: Briefcase, gradient: 'linear-gradient(135deg, #008CE5, #0070B8)', path: '/jobs' },
          { label: 'Online Providers', value: String(providersCount || 0), icon: Users, gradient: 'linear-gradient(135deg, #0070B8, #008CE5)', path: '/providers' },
          { label: 'Today Revenue', value: revenueFormatted, icon: DollarSign, gradient: 'linear-gradient(135deg, #008CE5, #0070B8)', path: '/payments' },
          { label: 'Total Users', value: String(userCount || 0), icon: Users, gradient: 'linear-gradient(135deg, #0070B8, #008CE5)', path: '/users' },
        ]);
        setOps({
          pendingProviders: pendingProviderIds.length,
          suspendedUsers: suspendedCount,
          pendingDocs: pendingDocsCount,
          openTickets: openTicketsCount,
          pendingRefunds: pendingRefundsCount,
          failedPayments: failedPaymentsCount,
          refundsExposure: pendingRefundAmount,
          totalServices: servicesCount,
          serviceFeePercent: settings.serviceFee,
          slaBreaches: slaBreachesCount,
        });
      } catch (error) {
        console.warn('Failed to load dashboard stats:', error);
      } finally {
        setLoading(false);
        setInitialLoad(false);
      }
    }
    loadStatsRef.current = loadStats;
    loadStats();
  }, []);

  // Real-time: auto-refresh dashboard when data changes in key tables
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debouncedRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => loadStatsRef.current?.(), 2000);
    };

    const channel = supabase
      .channel('admin-dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'provider_profiles' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'refunds' }, debouncedRefresh)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, []);

  if (initialLoad && loading) {
    return (
      <AdminLayout>
        <DashboardSkeleton />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Dashboard</h1>
          <p className="text-gray-500 flex items-center gap-2">
            Real-time platform overview
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
            </span>
            <span className="text-green-600 text-xs font-medium">Live</span>
          </p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <motion.button
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ scale: 1.02, y: -4 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate(stat.path)}
                className="bg-white rounded-[24px] p-6 text-left shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
              >
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: stat.gradient }}>
                  <Icon className="w-7 h-7 text-white" />
                </div>
                <p className="text-gray-500 text-sm mb-1">{stat.label}</p>
                <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
              </motion.button>
            );
          })}
        </div>

        {/* Platform Management */}
        <div className="bg-white rounded-[24px] p-6 mb-8 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">Platform Management</h2>
            {loading && <span className="text-gray-400 text-sm">Refreshing...</span>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {actionCards.map((card, index) => {
              const Icon = card.icon;
              return (
                <motion.button
                  key={card.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + index * 0.05 }}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => navigate(card.path)}
                  className="text-left rounded-2xl p-4 bg-gray-50 hover:bg-gray-100 border border-gray-100 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <Icon className="w-5 h-5 text-[#008CE5]" />
                    <span className="text-gray-900 font-bold text-lg">{card.value}</span>
                  </div>
                  <p className="text-gray-900 font-semibold">{card.label}</p>
                  <p className="text-gray-500 text-sm">{card.subtitle}</p>
                </motion.button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Alerts */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="lg:col-span-2 bg-white rounded-[24px] p-6 shadow-sm border border-gray-100"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Recent Alerts</h2>
            </div>

            <div className="space-y-4">
              {recentAlerts.map((alert) => (
                <button
                  key={alert.id}
                  onClick={() => navigate(alert.path)}
                  className="w-full flex items-start gap-4 p-4 rounded-2xl bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                >
                  <AlertCircle
                    className="w-5 h-5 flex-shrink-0 mt-0.5"
                    style={{ color: alert.type === 'critical' ? '#EF4444' : alert.type === 'warning' ? '#F97316' : '#008CE5' }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 font-medium">{alert.message}</p>
                    <p className="text-gray-400 text-sm mt-1">{alert.time}</p>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>

          {/* Quick Actions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-white rounded-[24px] p-6 shadow-sm border border-gray-100"
          >
            <h2 className="text-xl font-bold text-gray-900 mb-6">Quick Actions</h2>
            <div className="space-y-3">
              <button
                onClick={() => navigate('/jobs')}
                className="w-full p-4 rounded-2xl font-semibold hover:shadow-lg transition-all"
                style={{ background: 'linear-gradient(to right, #008CE5, #0070B8)', color: '#FFFFFF' }}
              >
                Monitor Active Jobs
              </button>
              <button
                onClick={() => navigate('/providers')}
                className="w-full p-4 rounded-2xl bg-gray-50 text-gray-900 font-semibold hover:bg-gray-100 transition-all border border-gray-100"
              >
                Verify Providers
              </button>
              <button
                onClick={() => navigate('/analytics')}
                className="w-full p-4 rounded-2xl bg-gray-50 text-gray-900 font-semibold hover:bg-gray-100 transition-all border border-gray-100"
              >
                View Analytics
              </button>
              <button
                onClick={() => navigate('/support-tickets')}
                className="w-full p-4 rounded-2xl bg-gray-50 text-gray-900 font-semibold hover:bg-gray-100 transition-all border border-gray-100"
              >
                Review Support Tickets
              </button>
              <button
                onClick={() => navigate('/finance')}
                className="w-full p-4 rounded-2xl bg-gray-50 text-gray-900 font-semibold hover:bg-gray-100 transition-all border border-gray-100"
              >
                Open Financial Hub
              </button>
              <button
                onClick={() => navigate('/reporting')}
                className="w-full p-4 rounded-2xl bg-gray-50 text-gray-900 font-semibold hover:bg-gray-100 transition-all border border-gray-100"
              >
                Open Reporting Hub
              </button>
            </div>
          </motion.div>
        </div>

        {/* Pending Providers + Urgent Tickets */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="bg-white rounded-[24px] p-6 shadow-sm border border-gray-100"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Pending Provider Queue</h2>
              <button onClick={() => navigate('/providers')} className="text-[#008CE5] text-sm font-semibold hover:underline">
                View queue
              </button>
            </div>
            {pendingProviderRows.length === 0 ? (
              <p className="text-gray-400 text-sm">No pending providers.</p>
            ) : (
              <div className="space-y-3">
                {pendingProviderRows.map((row: any) => (
                  <button
                    key={row.id}
                    onClick={() => navigate('/providers')}
                    className="w-full text-left rounded-2xl p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <p className="text-gray-900 font-medium">{row.full_name || row.email || row.id.slice(0, 8)}</p>
                    <p className="text-gray-400 text-xs mt-1">{row.email || 'No email'} · {getTimeAgo(row.created_at)}</p>
                  </button>
                ))}
              </div>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="bg-white rounded-[24px] p-6 shadow-sm border border-gray-100"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Urgent Tickets</h2>
              <button onClick={() => navigate('/support-tickets')} className="text-[#008CE5] text-sm font-semibold hover:underline">
                View tickets
              </button>
            </div>
            {urgentTicketRows.length === 0 ? (
              <p className="text-gray-400 text-sm">No high-priority open tickets.</p>
            ) : (
              <div className="space-y-3">
                {urgentTicketRows.map((row: any) => (
                  <button
                    key={row.id}
                    onClick={() => navigate('/support-tickets')}
                    className="w-full text-left rounded-2xl p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <p className="text-gray-900 font-medium truncate">{row.subject}</p>
                    <p className="text-gray-400 text-xs mt-1 uppercase">{row.priority} · {row.requester_role} · {getTimeAgo(row.created_at)}</p>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </AdminLayout>
  );
}
