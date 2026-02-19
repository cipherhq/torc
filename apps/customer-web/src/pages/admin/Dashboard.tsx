import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { Users, Briefcase, DollarSign, ShieldCheck, AlertCircle, FileText, Wallet, UserX, MessageSquare, Wrench, LifeBuoy, LineChart } from 'lucide-react';
import { AdminLayout } from '../../components/AdminLayout';
import { supabase } from '../../lib/supabase';
import { useState, useEffect } from 'react';
import { loadPlatformSettings } from '../../lib/platformSettings';

interface DashboardAlert {
  id: string;
  type: 'info' | 'warning' | 'critical';
  message: string;
  time: string;
  path: string;
  createdAt: string;
}

export function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState([
    { label: 'Active Jobs', value: '0', icon: Briefcase, color: 'from-[#2EFFAF] to-[#007AFF]', path: '/admin/jobs' },
    { label: 'Online Providers', value: '0', icon: Users, color: 'from-[#007AFF] to-[#2EFFAF]', path: '/admin/providers' },
    { label: 'Today Revenue', value: '$0', icon: DollarSign, color: 'from-[#2EFFAF] to-[#007AFF]', path: '/admin/payments' },
    { label: 'Total Users', value: '0', icon: Users, color: 'from-[#007AFF] to-[#2EFFAF]', path: '/admin/users' },
  ]);
  const [loading, setLoading] = useState(true);
  const [ops, setOps] = useState({
    pendingProviders: 0,
    newUsersToday: 0,
    suspendedUsers: 0,
    pendingDocs: 0,
    openTickets: 0,
    pendingRefunds: 0,
    failedPayments: 0,
    refundsExposure: 0,
    totalServices: 0,
    platformFeePercent: 15,
    slaBreaches: 0,
  });
  const [pendingProviderRows, setPendingProviderRows] = useState<any[]>([]);
  const [urgentTicketRows, setUrgentTicketRows] = useState<any[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<DashboardAlert[]>([]);

  const actionCards = [
    { label: 'Approve Providers', value: `${ops.pendingProviders}`, subtitle: 'Pending verification', icon: ShieldCheck, path: '/admin/provider-approval' },
    { label: 'Manage Users', value: `${ops.suspendedUsers}`, subtitle: 'Suspended users', icon: UserX, path: '/admin/users' },
    { label: 'Review Documents', value: `${ops.pendingDocs}`, subtitle: 'Pending document checks', icon: FileText, path: '/admin/document-settings' },
    { label: 'Manage Payouts', value: `${ops.pendingRefunds}`, subtitle: `Fee model ${ops.platformFeePercent.toFixed(1)}%`, icon: Wallet, path: '/admin/payouts' },
    { label: 'Live Dispatch', value: stats[0]?.value || '0', subtitle: 'Currently active jobs', icon: MessageSquare, path: '/admin/live-dispatch' },
    { label: 'Service Pricing', value: `${ops.totalServices}`, subtitle: 'Configured services', icon: Wrench, path: '/admin/services' },
    { label: 'Support Tickets', value: `${ops.openTickets}`, subtitle: `${ops.slaBreaches} SLA breach(es)`, icon: LifeBuoy, path: '/admin/support' },
    { label: 'Finance (P&L)', value: `$${ops.refundsExposure.toFixed(0)}`, subtitle: `Pending refund exposure @ ${ops.platformFeePercent.toFixed(1)}% fee`, icon: LineChart, path: '/admin/finance' },
    { label: 'Reporting Hub', value: `${ops.failedPayments}`, subtitle: 'Failed payments to review', icon: LineChart, path: '/admin/reporting' },
  ];

  function getTimeAgo(iso: string) {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.max(1, Math.floor(diffMs / 60000));
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  useEffect(() => {
    async function loadStats() {
      try {
        setLoading(true);
        const settings = await loadPlatformSettings();
        
        // Total users: count from profiles table
        const { count: userCount } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true });

        // Active jobs: count from jobs table where status in active states
        const { count: activeJobsCount } = await supabase
          .from('jobs')
          .select('*', { count: 'exact', head: true })
          .in('status', ['pending', 'matching', 'matched', 'accepted', 'enroute', 'en_route', 'arrived', 'inprogress', 'in_progress']);

        // Revenue: sum of total_amount from completed jobs (today)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const { data: revenueData } = await supabase
          .from('jobs')
          .select('total_amount')
          .eq('status', 'completed')
          .gte('completed_at', today.toISOString());
        
        const revenue = revenueData?.reduce((sum, job) => sum + (Number(job.total_amount) || 0), 0) || 0;
        const revenueFormatted = revenue >= 1000 ? `$${(revenue / 1000).toFixed(1)}K` : `$${revenue.toFixed(0)}`;

        // Online providers count
        const { count: providersCount } = await supabase
          .from('provider_profiles')
          .select('*', { count: 'exact', head: true })
          .eq('is_online', true);

        // Pending provider approvals
        const { count: pendingProvidersCount } = await supabase
          .from('provider_profiles')
          .select('*', { count: 'exact', head: true })
          .eq('is_verified', false);

        // New users today
        const { count: newUsersTodayCount } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', today.toISOString());

        // Suspended users (if status field exists)
        let suspendedCount = 0;
        try {
          const { count } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'suspended');
          suspendedCount = count || 0;
        } catch {
          suspendedCount = 0;
        }

        // Pending document reviews (if table exists)
        let pendingDocsCount = 0;
        try {
          const { count } = await supabase
            .from('documents')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');
          pendingDocsCount = count || 0;
        } catch {
          pendingDocsCount = 0;
        }

        // Support tickets + pending refunds (if tables exist)
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

          const urgentSlaHours = settings.urgentSlaHours;
          const standardSlaHours = settings.standardSlaHours;

          const now = Date.now();
          slaBreachesCount = (openTicketsData || []).filter((t: any) => {
            const ageHours = (now - new Date(t.created_at).getTime()) / 36e5;
            return t.priority === 'urgent' ? ageHours > urgentSlaHours : ageHours > standardSlaHours;
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
        } catch {
          failedPaymentsCount = 0;
        }

        let servicesCount = 0;
        try {
          const { count } = await supabase
            .from('services')
            .select('*', { count: 'exact', head: true });
          servicesCount = count || 0;
        } catch {
          servicesCount = 0;
        }

        let feePercent = 15;
        try {
          feePercent = settings.platformFee;
        } catch {
          feePercent = 15;
        }

        const { data: providerQueue } = await supabase
          .from('provider_profiles')
          .select('id, created_at, user:profiles(full_name, email)')
          .eq('is_verified', false)
          .order('created_at', { ascending: false })
          .limit(5);

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
            type: t.priority === 'urgent' ? 'critical' : 'warning',
            message: `${t.priority.toUpperCase()} ticket (${t.requester_role}): ${t.subject}`,
            time: getTimeAgo(t.created_at),
            path: '/admin/support',
            createdAt: t.created_at,
          })),
          ...(providerQueue || []).map((p: any) => ({
            id: `provider-${p.id}`,
            type: 'info',
            message: `New provider signup: ${p.user?.full_name || p.user?.email || p.id.slice(0, 8)}`,
            time: getTimeAgo(p.created_at),
            path: '/admin/provider-approval',
            createdAt: p.created_at,
          })),
          ...(pendingRefundRows || []).map((r: any) => ({
            id: `refund-${r.id}`,
            type: 'warning',
            message: `Pending refund $${Number(r.amount || 0).toFixed(2)}${r.reason ? ` - ${r.reason}` : ''}`,
            time: getTimeAgo(r.created_at),
            path: '/admin/finance',
            createdAt: r.created_at,
          })),
          ...(slaBreachesCount > 0 ? [{
            id: 'sla-breach-summary',
            type: 'critical' as const,
            message: `${slaBreachesCount} support ticket(s) are beyond SLA target`,
            time: 'Now',
            path: '/admin/support',
            createdAt: new Date().toISOString(),
          }] : []),
        ]
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 8);

        setRecentAlerts(builtAlerts);

        if (builtAlerts.length === 0) {
          setRecentAlerts([
            {
              id: 'system-ok',
              type: 'info',
              message: 'No urgent items at the moment.',
              time: 'Now',
              path: '/admin',
              createdAt: new Date().toISOString(),
            },
          ]);
        }

        setStats([
          { label: 'Active Jobs', value: String(activeJobsCount || 0), icon: Briefcase, color: 'from-[#2EFFAF] to-[#007AFF]', path: '/admin/jobs' },
          { label: 'Online Providers', value: String(providersCount || 0), icon: Users, color: 'from-[#007AFF] to-[#2EFFAF]', path: '/admin/providers' },
          { label: 'Today Revenue', value: revenueFormatted, icon: DollarSign, color: 'from-[#2EFFAF] to-[#007AFF]', path: '/admin/payments' },
          { label: 'Total Users', value: String(userCount || 0), icon: Users, color: 'from-[#007AFF] to-[#2EFFAF]', path: '/admin/users' },
        ]);
        setOps({
          pendingProviders: pendingProvidersCount || 0,
          newUsersToday: newUsersTodayCount || 0,
          suspendedUsers: suspendedCount,
          pendingDocs: pendingDocsCount,
          openTickets: openTicketsCount,
          pendingRefunds: pendingRefundsCount,
          failedPayments: failedPaymentsCount,
          refundsExposure: pendingRefundAmount,
          totalServices: servicesCount,
          platformFeePercent: feePercent,
          slaBreaches: slaBreachesCount,
        });
      } catch (error) {
        console.warn('Failed to load dashboard stats:', error);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  return (
    <AdminLayout>
      <div className="p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Dashboard</h1>
          <p className="text-white/60">Real-time platform overview</p>
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
                className="glass-light rounded-[24px] p-6 text-left"
              >
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${stat.color} flex items-center justify-center mb-4`}>
                  <Icon className="w-7 h-7 text-white" />
                </div>
                <p className="text-white/60 text-sm mb-1">{stat.label}</p>
                <p className="text-3xl font-bold text-white">{stat.value}</p>
              </motion.button>
            );
          })}
        </div>

        {/* Admin operations */}
        <div className="glass-light rounded-[24px] p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">Platform Management</h2>
            {loading && <span className="text-white/50 text-sm">Refreshing...</span>}
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
                  className="text-left rounded-2xl p-4 bg-white/5 hover:bg-white/10 border border-white/10"
                >
                  <div className="flex items-center justify-between mb-2">
                    <Icon className="w-5 h-5 text-[#2EFFAF]" />
                    <span className="text-white font-bold text-lg">{card.value}</span>
                  </div>
                  <p className="text-white font-semibold">{card.label}</p>
                  <p className="text-white/60 text-sm">{card.subtitle}</p>
                </motion.button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent alerts */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="lg:col-span-2 glass-light rounded-[24px] p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Recent Alerts</h2>
              <button className="text-[#2EFFAF] text-sm font-semibold hover:underline">
                View All
              </button>
            </div>

            <div className="space-y-4">
              {recentAlerts.map((alert) => (
                <button
                  key={alert.id}
                  onClick={() => navigate(alert.path)}
                  className="flex items-start gap-4 p-4 rounded-2xl glass hover:bg-white/10 transition-colors"
                >
                  <AlertCircle className={`w-5 h-5 flex-shrink-0 ${
                    alert.type === 'critical'
                      ? 'text-red-400'
                      : alert.type === 'warning'
                        ? 'text-orange-400'
                        : 'text-[#007AFF]'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium">{alert.message}</p>
                    <p className="text-white/50 text-sm mt-1">{alert.time}</p>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>

          {/* Quick actions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="glass-light rounded-[24px] p-6"
          >
            <h2 className="text-xl font-bold text-white mb-6">Quick Actions</h2>
            <div className="space-y-3">
              <button 
                onClick={() => navigate('/admin/jobs')}
                className="w-full p-4 rounded-2xl bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0F1419] font-semibold hover:shadow-lg transition-all"
              >
                Monitor Active Jobs
              </button>
              <button 
                onClick={() => navigate('/admin/provider-approval')}
                className="w-full p-4 rounded-2xl glass text-white font-semibold hover:bg-white/10 transition-all"
              >
                Verify Providers
              </button>
              <button 
                onClick={() => navigate('/admin/analytics')}
                className="w-full p-4 rounded-2xl glass text-white font-semibold hover:bg-white/10 transition-all"
              >
                View Analytics
              </button>
              <button 
                onClick={() => navigate('/admin/services')}
                className="w-full p-4 rounded-2xl glass text-white font-semibold hover:bg-white/10 transition-all"
              >
                Update Service Pricing
              </button>
              <button 
                onClick={() => navigate('/admin/support')}
                className="w-full p-4 rounded-2xl glass text-white font-semibold hover:bg-white/10 transition-all"
              >
                Review Support Tickets
              </button>
              <button 
                onClick={() => navigate('/admin/finance')}
                className="w-full p-4 rounded-2xl glass text-white font-semibold hover:bg-white/10 transition-all"
              >
                Open Finance (P&amp;L)
              </button>
              <button
                onClick={() => navigate('/admin/reporting')}
                className="w-full p-4 rounded-2xl glass text-white font-semibold hover:bg-white/10 transition-all"
              >
                Open Reporting Hub
              </button>
            </div>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="glass-light rounded-[24px] p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Pending Provider Queue</h2>
              <button onClick={() => navigate('/admin/provider-approval')} className="text-[#2EFFAF] text-sm font-semibold hover:underline">
                View queue
              </button>
            </div>
            {pendingProviderRows.length === 0 ? (
              <p className="text-white/60 text-sm">No pending providers.</p>
            ) : (
              <div className="space-y-3">
                {pendingProviderRows.map((row: any) => (
                  <button
                    key={row.id}
                    onClick={() => navigate('/admin/provider-approval')}
                    className="w-full text-left rounded-2xl p-3 bg-white/5 hover:bg-white/10"
                  >
                    <p className="text-white font-medium">{row.user?.full_name || row.user?.email || row.id.slice(0, 8)}</p>
                    <p className="text-white/50 text-xs mt-1">{row.user?.email || 'No email'} • {getTimeAgo(row.created_at)}</p>
                  </button>
                ))}
              </div>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="glass-light rounded-[24px] p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Urgent Tickets</h2>
              <button onClick={() => navigate('/admin/support')} className="text-[#2EFFAF] text-sm font-semibold hover:underline">
                View tickets
              </button>
            </div>
            {urgentTicketRows.length === 0 ? (
              <p className="text-white/60 text-sm">No high-priority open tickets.</p>
            ) : (
              <div className="space-y-3">
                {urgentTicketRows.map((row: any) => (
                  <button
                    key={row.id}
                    onClick={() => navigate('/admin/support')}
                    className="w-full text-left rounded-2xl p-3 bg-white/5 hover:bg-white/10"
                  >
                    <p className="text-white font-medium truncate">{row.subject}</p>
                    <p className="text-white/50 text-xs mt-1 uppercase">{row.priority} • {row.requester_role} • {getTimeAgo(row.created_at)}</p>
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