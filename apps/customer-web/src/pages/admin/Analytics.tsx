import { motion } from 'motion/react';
import { AdminLayout } from '../../components/AdminLayout';
import { 
  TrendingUp, 
  TrendingDown,
  DollarSign, 
  Users, 
  Briefcase,
  Star,
  Clock,
  Target
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export function AdminAnalytics() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [serviceNames, setServiceNames] = useState<Record<string, string>>({});

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setLoadError(null);
        const [{ data: jobsData, error: jobsError }, { data: providersData, error: providersError }, { data: servicesData, error: servicesError }] = await Promise.all([
          supabase
            .from('jobs')
            .select('id, service_id, status, total_amount, created_at, completed_at, rating'),
          supabase
            .from('provider_profiles')
            .select('id, is_online, rating, created_at'),
          supabase
            .from('services')
            .select('id, name'),
        ]);

        if (jobsError) throw jobsError;
        if (providersError) throw providersError;
        if (servicesError) throw servicesError;
        setJobs(jobsData || []);
        setProviders(providersData || []);
        const map: Record<string, string> = {};
        (servicesData || []).forEach((s: any) => {
          map[s.id] = s.name;
        });
        setServiceNames(map);
      } catch (error: any) {
        console.warn('Failed to load analytics data:', error);
        setLoadError(error?.message || 'Could not load analytics.');
        setJobs([]);
        setProviders([]);
        setServiceNames({});
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const revenueData = useMemo(() => {
    const months = new Map<string, { month: string; revenue: number; jobs: number; providers: number }>();
    jobs.forEach((job) => {
      const d = new Date(job.completed_at || job.created_at);
      const month = d.toLocaleString('en-US', { month: 'short' });
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const current = months.get(key) || { month, revenue: 0, jobs: 0, providers: 0 };
      current.jobs += 1;
      if (job.status === 'completed') {
        current.revenue += Number(job.total_amount || 0);
      }
      months.set(key, current);
    });
    providers.forEach((provider) => {
      const d = new Date(provider.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const current = months.get(key) || { month: d.toLocaleString('en-US', { month: 'short' }), revenue: 0, jobs: 0, providers: 0 };
      current.providers += 1;
      months.set(key, current);
    });
    return Array.from(months.entries())
      .map(([k, v]) => ({ k, ...v }))
      .sort((a, b) => (a.k < b.k ? -1 : 1))
      .slice(-6)
      .map(({ month, revenue, jobs: jobCount, providers: providerCount }) => ({
        month,
        revenue,
        jobs: jobCount,
        providers: providerCount,
      }));
  }, [jobs, providers]);

  const serviceData = useMemo(() => {
    const colors = ['#008CE5', '#0070B8', '#FF6B6B', '#FFA500', '#8B5CF6'];
    const byService = new Map<string, number>();
    jobs.forEach((job) => {
      const key = job.service_id || 'unknown';
      byService.set(key, (byService.get(key) || 0) + 1);
    });
    return Array.from(byService.entries())
      .map(([id, value], idx) => ({ name: serviceNames[id] || id, value, color: colors[idx % colors.length] }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [jobs, serviceNames]);

  const hourlyData = useMemo(() => {
    const buckets = new Map<string, number>([
      ['12am', 0], ['4am', 0], ['8am', 0], ['12pm', 0], ['4pm', 0], ['8pm', 0],
    ]);
    jobs.forEach((job) => {
      const h = new Date(job.created_at).getHours();
      const key = h < 4 ? '12am' : h < 8 ? '4am' : h < 12 ? '8am' : h < 16 ? '12pm' : h < 20 ? '4pm' : '8pm';
      buckets.set(key, (buckets.get(key) || 0) + 1);
    });
    return Array.from(buckets.entries()).map(([hour, count]) => ({ hour, jobs: count }));
  }, [jobs]);

  const stats = useMemo(() => {
    const totalRevenue = jobs.filter((j) => j.status === 'completed').reduce((sum, j) => sum + Number(j.total_amount || 0), 0);
    const totalJobs = jobs.length;
    const activeProviders = providers.filter((p) => p.is_online).length;
    const ratings = jobs.filter((j) => j.rating != null).map((j) => Number(j.rating));
    const avgRating = ratings.length > 0 ? ratings.reduce((s, r) => s + r, 0) / ratings.length : 0;
    const currentMonth = revenueData[revenueData.length - 1];
    const prevMonth = revenueData.length > 1 ? revenueData[revenueData.length - 2] : null;
    const pct = (curr: number, prev: number) => (prev > 0 ? ((curr - prev) / prev) * 100 : 0);
    const revenuePct = currentMonth && prevMonth ? pct(currentMonth.revenue, prevMonth.revenue) : 0;
    const jobsPct = currentMonth && prevMonth ? pct(currentMonth.jobs, prevMonth.jobs) : 0;
    const providersPct = currentMonth && prevMonth ? pct(currentMonth.providers, prevMonth.providers) : 0;
    const monthName = currentMonth?.month || 'Current';
    return [
      {
        icon: DollarSign,
        label: 'Total Revenue',
        value: `$${totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
        change: `${revenuePct >= 0 ? '+' : ''}${revenuePct.toFixed(1)}% vs prev`,
        trend: revenuePct >= 0 ? 'up' : 'down',
        color: 'from-[#008CE5] to-[#00D68F]',
      },
      {
        icon: Briefcase,
        label: 'Total Jobs',
        value: `${totalJobs.toLocaleString()}`,
        change: `${jobsPct >= 0 ? '+' : ''}${jobsPct.toFixed(1)}% vs prev`,
        trend: jobsPct >= 0 ? 'up' : 'down',
        color: 'from-[#0070B8] to-[#0051D5]',
      },
      {
        icon: Users,
        label: 'Online Providers',
        value: `${activeProviders}`,
        change: `${providersPct >= 0 ? '+' : ''}${providersPct.toFixed(1)}% vs prev`,
        trend: providersPct >= 0 ? 'up' : 'down',
        color: 'from-[#FF6B6B] to-[#FF5252]',
      },
      {
        icon: Star,
        label: 'Avg. Rating',
        value: avgRating > 0 ? avgRating.toFixed(1) : '-',
        change: `${monthName} quality`,
        trend: 'up',
        color: 'from-[#FFA500] to-[#FF8C00]',
      },
    ] as const;
  }, [jobs, providers, revenueData]);

  const metrics = useMemo(() => {
    const completed = jobs.filter((j) => j.status === 'completed').length;
    const completionRate = jobs.length > 0 ? (completed / jobs.length) * 100 : 0;
    const ratings = jobs.filter((j) => j.rating != null).map((j) => Number(j.rating));
    const customerSatisfaction = ratings.length > 0 ? ratings.reduce((s, r) => s + r, 0) / ratings.length : 0;
    const providerUtilization = providers.length > 0 ? (providers.filter((p) => p.is_online).length / providers.length) * 100 : 0;
    const completionHours = jobs
      .filter((j) => j.status === 'completed' && j.completed_at)
      .map((j) => (new Date(j.completed_at).getTime() - new Date(j.created_at).getTime()) / 36e5)
      .filter((h) => Number.isFinite(h) && h >= 0);
    const avgCompletionHours = completionHours.length > 0
      ? completionHours.reduce((sum, h) => sum + h, 0) / completionHours.length
      : 0;
    return [
      { label: 'Avg Time to Complete', value: avgCompletionHours > 0 ? `${avgCompletionHours.toFixed(1)}h` : '-', icon: Clock, color: '#008CE5' },
      { label: 'Completion Rate', value: `${completionRate.toFixed(1)}%`, icon: Target, color: '#0070B8' },
      { label: 'Customer Satisfaction', value: customerSatisfaction > 0 ? `${customerSatisfaction.toFixed(1)}/5` : '-', icon: Star, color: '#FFA500' },
      { label: 'Provider Utilization', value: `${providerUtilization.toFixed(1)}%`, icon: TrendingUp, color: '#FF6B6B' },
    ];
  }, [jobs, providers]);

  return (
    <AdminLayout>
      <div className="p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Analytics</h1>
          <p className="text-white/60">Platform performance and insights</p>
        </div>

        {loading ? (
          <div className="glass-light rounded-[24px] p-8 text-white/70">Loading analytics...</div>
        ) : loadError ? (
          <div className="glass-light rounded-[24px] p-8 text-red-300">{loadError}</div>
        ) : (
          <>
        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="glass-light rounded-[24px] p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex items-center gap-1">
                    {stat.trend === 'up' ? (
                      <TrendingUp className="w-4 h-4 text-[#008CE5]" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-red-400" />
                    )}
                    <span className={stat.trend === 'up' ? 'text-[#008CE5] text-sm font-semibold' : 'text-red-400 text-sm font-semibold'}>
                      {stat.change}
                    </span>
                  </div>
                </div>
                <p className="text-white/60 text-sm mb-1">{stat.label}</p>
                <p className="text-white font-bold text-3xl">{stat.value}</p>
              </motion.div>
            );
          })}
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-3 gap-6 mb-6">
          {/* Revenue Chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="col-span-2 glass-light rounded-[24px] p-6"
          >
            <h3 className="text-white font-bold text-xl mb-6">Revenue Trend</h3>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#008CE5" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#008CE5" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="month" stroke="#ffffff60" />
                <YAxis stroke="#ffffff60" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(255,255,255,0.1)', 
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '12px',
                    backdropFilter: 'blur(10px)'
                  }}
                  labelStyle={{ color: '#fff' }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#008CE5" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Service Distribution */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="glass-light rounded-[24px] p-6"
          >
            <h3 className="text-white font-bold text-xl mb-6">Service Distribution</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={serviceData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {serviceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(255,255,255,0.1)', 
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '12px'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-2 mt-4">
              {serviceData.map((service) => (
                <div key={service.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: service.color }} />
                  <span className="text-white/70 text-xs">{service.name}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Jobs by Time */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="glass-light rounded-[24px] p-6"
          >
            <h3 className="text-white font-bold text-xl mb-6">Jobs by Time of Day</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="hour" stroke="#ffffff60" />
                <YAxis stroke="#ffffff60" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(255,255,255,0.1)', 
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '12px'
                  }}
                />
                <Bar dataKey="jobs" fill="#0070B8" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Provider Growth */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="glass-light rounded-[24px] p-6"
          >
            <h3 className="text-white font-bold text-xl mb-6">Provider Growth</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="month" stroke="#ffffff60" />
                <YAxis stroke="#ffffff60" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(255,255,255,0.1)', 
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '12px'
                  }}
                />
                <Line type="monotone" dataKey="providers" stroke="#008CE5" strokeWidth={3} dot={{ fill: '#008CE5', r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </motion.div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-4 gap-6">
          {metrics.map((metric, index) => {
            const Icon = metric.icon;
            return (
              <motion.div
                key={metric.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 + index * 0.1 }}
                className="glass rounded-[20px] p-5 border border-white/10"
              >
                <Icon className="w-8 h-8 mb-3" style={{ color: metric.color }} />
                <p className="text-white/60 text-sm mb-1">{metric.label}</p>
                <p className="text-white font-bold text-2xl">{metric.value}</p>
              </motion.div>
            );
          })}
        </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
