import { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { AdminLayout } from '../../components/AdminLayout';
import { supabase } from '../../lib/supabase';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  Briefcase,
  Star,
  Clock,
  Target,
  Loader2,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface JobRow {
  id: string;
  total_amount: number | null;
  status: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  service_id: string | null;
}

interface ProviderRow {
  id: string;
  is_online: boolean | null;
  is_verified: boolean | null;
  created_at: string;
}

interface ServiceRow {
  id: string;
  name: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const PIE_COLORS = ['#008CE5', '#0070B8', '#005A9E', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#0096FF'];

const HOUR_BUCKETS = [
  { label: '12am', min: 0, max: 3 },
  { label: '4am', min: 4, max: 7 },
  { label: '8am', min: 8, max: 11 },
  { label: '12pm', min: 12, max: 15 },
  { label: '4pm', min: 16, max: 19 },
  { label: '8pm', min: 20, max: 23 },
];

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function fmtMoney(value: number) {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const tooltipStyle = {
  backgroundColor: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function AdminAnalytics() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [userCount, setUserCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ----- Fetch data on mount ----- */

  useEffect(() => {
    void loadAnalytics();
  }, []);

  async function loadAnalytics() {
    try {
      setLoading(true);
      setError(null);

      const [jobsRes, providersRes, usersRes, servicesRes] = await Promise.all([
        supabase
          .from('jobs')
          .select('id, total_amount, status, created_at, started_at, completed_at, service_id')
          .order('created_at', { ascending: false })
          .limit(5000),
        supabase
          .from('provider_profiles')
          .select('id, is_online, is_verified, created_at')
          .limit(5000),
        supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true }),
        supabase
          .from('services')
          .select('id, name')
          .eq('is_active', true),
      ]);

      if (jobsRes.error) throw jobsRes.error;
      if (providersRes.error) throw providersRes.error;

      setJobs((jobsRes.data || []) as JobRow[]);
      setProviders((providersRes.data || []) as ProviderRow[]);
      setUserCount(usersRes.count || 0);
      setServices((servicesRes.data || []) as ServiceRow[]);
    } catch (err: any) {
      console.warn('Analytics load error:', err);
      setError(err?.message || 'Failed to load analytics data.');
    } finally {
      setLoading(false);
    }
  }

  /* ----- Build a service-id-to-name lookup ----- */

  const serviceMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of services) map[s.id] = s.name;
    return map;
  }, [services]);

  /* ----- Stat cards ----- */

  const stats = useMemo(() => {
    const completedJobs = jobs.filter((j) => j.status === 'completed');
    const totalRevenue = completedJobs.reduce((sum, j) => sum + Number(j.total_amount || 0), 0);
    const totalJobs = jobs.length;
    const activeProviders = providers.filter((p) => p.is_online === true).length;

    return [
      {
        icon: DollarSign,
        label: 'Total Revenue',
        value: totalRevenue > 0 ? `$${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00',
        change: `${completedJobs.length} completed`,
        trend: 'up' as const,
        gradient: 'linear-gradient(135deg, #008CE5, #0070B8)',
      },
      {
        icon: Briefcase,
        label: 'Total Jobs',
        value: totalJobs.toLocaleString(),
        change: `${userCount} users`,
        trend: 'up' as const,
        gradient: 'linear-gradient(135deg, #0070B8, #005A94)',
      },
      {
        icon: Users,
        label: 'Active Providers',
        value: String(activeProviders),
        change: `${providers.length} total`,
        trend: activeProviders > 0 ? ('up' as const) : ('down' as const),
        gradient: 'linear-gradient(135deg, #34D399, #059669)',
      },
      {
        icon: Star,
        label: 'Avg. Rating',
        value: 'N/A',
        change: 'No ratings table',
        trend: 'up' as const,
        gradient: 'linear-gradient(135deg, #F59E0B, #D97706)',
      },
    ];
  }, [jobs, providers, userCount]);

  /* ----- Revenue trend chart (last 6 months) ----- */

  const revenueData = useMemo(() => {
    const completedJobs = jobs.filter((j) => j.status === 'completed' && j.completed_at);
    const now = new Date();
    const months: { key: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: monthKey(d), label: MONTH_LABELS[d.getMonth()] });
    }

    const buckets: Record<string, number> = {};
    for (const m of months) buckets[m.key] = 0;

    for (const j of completedJobs) {
      const d = new Date(j.completed_at!);
      const k = monthKey(d);
      if (k in buckets) buckets[k] += Number(j.total_amount || 0);
    }

    return months.map((m) => ({ month: m.label, revenue: Math.round(buckets[m.key]) }));
  }, [jobs]);

  /* ----- Service distribution pie chart ----- */

  const serviceData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const j of jobs) {
      const key = j.service_id || 'unknown';
      counts[key] = (counts[key] || 0) + 1;
    }

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id, value], idx) => ({
        name: serviceMap[id] || (id === 'unknown' ? 'Unknown' : id.slice(0, 8)),
        value,
        color: PIE_COLORS[idx % PIE_COLORS.length],
      }));
  }, [jobs, serviceMap]);

  /* ----- Jobs by time of day bar chart ----- */

  const hourlyData = useMemo(() => {
    const bucketCounts = HOUR_BUCKETS.map(() => 0);
    for (const j of jobs) {
      const hour = new Date(j.created_at).getHours();
      const idx = HOUR_BUCKETS.findIndex((b) => hour >= b.min && hour <= b.max);
      if (idx >= 0) bucketCounts[idx]++;
    }
    return HOUR_BUCKETS.map((b, i) => ({ hour: b.label, jobs: bucketCounts[i] }));
  }, [jobs]);

  /* ----- Provider growth line chart (cumulative by month) ----- */

  const providerGrowthData = useMemo(() => {
    if (providers.length === 0) return [];

    const sorted = [...providers].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    const now = new Date();
    const months: { key: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: monthKey(d), label: MONTH_LABELS[d.getMonth()] });
    }

    // Count providers created up to and including each month
    return months.map((m) => {
      const [year, month] = m.key.split('-').map(Number);
      const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
      const cumulative = sorted.filter((p) => new Date(p.created_at) <= endOfMonth).length;
      return { month: m.label, providers: cumulative };
    });
  }, [providers]);

  /* ----- Bottom metrics ----- */

  const metrics = useMemo(() => {
    const completedJobs = jobs.filter((j) => j.status === 'completed');
    const totalJobs = jobs.length;

    // Avg response time: mean of (started_at - created_at) for jobs that have started_at
    let avgResponseTime = 'N/A';
    const jobsWithStart = jobs.filter((j) => j.started_at);
    if (jobsWithStart.length > 0) {
      const totalMinutes = jobsWithStart.reduce((sum, j) => {
        const diff = (new Date(j.started_at!).getTime() - new Date(j.created_at).getTime()) / 60000;
        return sum + Math.max(0, diff);
      }, 0);
      const avg = totalMinutes / jobsWithStart.length;
      avgResponseTime = avg < 1 ? `${Math.round(avg * 60)}s` : `${avg.toFixed(1)} min`;
    }

    // Completion rate
    const completionRate = totalJobs > 0 ? ((completedJobs.length / totalJobs) * 100).toFixed(1) + '%' : 'N/A';

    // Provider utilization: online / total
    const totalProviders = providers.length;
    const onlineProviders = providers.filter((p) => p.is_online === true).length;
    const utilization = totalProviders > 0 ? ((onlineProviders / totalProviders) * 100).toFixed(0) + '%' : 'N/A';

    return [
      { label: 'Avg Response Time', value: avgResponseTime, icon: Clock, color: '#008CE5' },
      { label: 'Completion Rate', value: completionRate, icon: Target, color: '#0070B8' },
      { label: 'Customer Satisfaction', value: 'N/A', icon: Star, color: '#F59E0B' },
      { label: 'Provider Utilization', value: utilization, icon: TrendingUp, color: '#34D399' },
    ];
  }, [jobs, providers]);

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-full min-h-[60vh]">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-10 h-10 text-[#008CE5] animate-spin" />
            <p className="text-gray-500 text-lg font-medium">Loading analytics...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout>
        <div className="p-8">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Analytics</h1>
            <p className="text-gray-500">Platform performance and insights</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-700">
            <p className="font-semibold mb-1">Failed to load analytics</p>
            <p className="text-sm">{error}</p>
            <button
              onClick={() => void loadAnalytics()}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Analytics</h1>
          <p className="text-gray-500">Platform performance and insights</p>
        </div>

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
                className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center"
                    style={{ background: stat.gradient }}
                  >
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex items-center gap-1">
                    {stat.trend === 'up' ? (
                      <TrendingUp className="w-4 h-4 text-green-600" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-red-500" />
                    )}
                    <span
                      className={
                        stat.trend === 'up'
                          ? 'text-green-600 text-sm font-semibold'
                          : 'text-red-500 text-sm font-semibold'
                      }
                    >
                      {stat.change}
                    </span>
                  </div>
                </div>
                <p className="text-gray-500 text-sm mb-1">{stat.label}</p>
                <p className="text-gray-900 font-bold text-3xl">{stat.value}</p>
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
            className="col-span-2 bg-white shadow-sm border border-gray-100 rounded-[24px] p-6"
          >
            <h3 className="text-gray-900 font-bold text-xl mb-6">Revenue Trend</h3>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#008CE5" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#008CE5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" stroke="#9ca3af" tick={{ fill: '#6b7280', fontSize: 12 }} />
                <YAxis
                  stroke="#9ca3af"
                  tick={{ fill: '#6b7280', fontSize: 12 }}
                  tickFormatter={(v) => fmtMoney(v)}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: '#111827', fontWeight: 600 }}
                  formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#008CE5"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorRevenue)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Service Distribution */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6"
          >
            <h3 className="text-gray-900 font-bold text-xl mb-6">Service Distribution</h3>
            {serviceData.length === 0 ? (
              <div className="flex items-center justify-center h-[300px] text-gray-400 text-sm">
                No job data available
              </div>
            ) : (
              <>
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
                      contentStyle={tooltipStyle}
                      formatter={(value: number, name: string) => [value, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  {serviceData.map((service) => (
                    <div key={service.name} className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: service.color }}
                      />
                      <span className="text-gray-600 text-xs truncate">{service.name}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Jobs by Time */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6"
          >
            <h3 className="text-gray-900 font-bold text-xl mb-6">Jobs by Time of Day</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="hour" stroke="#9ca3af" tick={{ fill: '#6b7280', fontSize: 12 }} />
                <YAxis stroke="#9ca3af" tick={{ fill: '#6b7280', fontSize: 12 }} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: '#111827', fontWeight: 600 }}
                />
                <Bar dataKey="jobs" fill="#008CE5" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Provider Growth */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6"
          >
            <h3 className="text-gray-900 font-bold text-xl mb-6">Provider Growth</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={providerGrowthData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" stroke="#9ca3af" tick={{ fill: '#6b7280', fontSize: 12 }} />
                <YAxis stroke="#9ca3af" tick={{ fill: '#6b7280', fontSize: 12 }} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: '#111827', fontWeight: 600 }}
                />
                <Line
                  type="monotone"
                  dataKey="providers"
                  stroke="#008CE5"
                  strokeWidth={3}
                  dot={{ fill: '#008CE5', r: 5, stroke: '#fff', strokeWidth: 2 }}
                />
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
                className="bg-gray-50 border border-gray-200 rounded-[20px] p-5"
              >
                <Icon className="w-8 h-8 mb-3" style={{ color: metric.color }} />
                <p className="text-gray-500 text-sm mb-1">{metric.label}</p>
                <p className="text-gray-900 font-bold text-2xl">{metric.value}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </AdminLayout>
  );
}
