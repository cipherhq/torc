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
import { AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export function AdminAnalytics() {
  const revenueData = [
    { month: 'Jan', revenue: 45000, jobs: 180, providers: 25 },
    { month: 'Feb', revenue: 52000, jobs: 210, providers: 28 },
    { month: 'Mar', revenue: 48000, jobs: 195, providers: 30 },
    { month: 'Apr', revenue: 61000, jobs: 245, providers: 32 },
    { month: 'May', revenue: 68000, jobs: 270, providers: 35 },
    { month: 'Jun', revenue: 72000, jobs: 290, providers: 38 },
  ];

  const serviceData = [
    { name: 'Towing', value: 45, color: '#2EFFAF' },
    { name: 'Battery', value: 25, color: '#007AFF' },
    { name: 'Tire Change', value: 20, color: '#FF6B6B' },
    { name: 'Fuel Delivery', value: 10, color: '#FFA500' },
  ];

  const hourlyData = [
    { hour: '12am', jobs: 5 },
    { hour: '4am', jobs: 8 },
    { hour: '8am', jobs: 45 },
    { hour: '12pm', jobs: 68 },
    { hour: '4pm', jobs: 72 },
    { hour: '8pm', jobs: 52 },
  ];

  const stats = [
    {
      icon: DollarSign,
      label: 'Total Revenue',
      value: '$346,000',
      change: '+12.5%',
      trend: 'up',
      color: 'from-[#2EFFAF] to-[#00D68F]',
    },
    {
      icon: Briefcase,
      label: 'Total Jobs',
      value: '1,390',
      change: '+8.2%',
      trend: 'up',
      color: 'from-[#007AFF] to-[#0051D5]',
    },
    {
      icon: Users,
      label: 'Active Providers',
      value: '38',
      change: '+5 new',
      trend: 'up',
      color: 'from-[#FF6B6B] to-[#FF5252]',
    },
    {
      icon: Star,
      label: 'Avg. Rating',
      value: '4.8',
      change: '+0.2',
      trend: 'up',
      color: 'from-[#FFA500] to-[#FF8C00]',
    },
  ];

  const metrics = [
    { label: 'Avg Response Time', value: '3.2 min', icon: Clock, color: '#2EFFAF' },
    { label: 'Completion Rate', value: '96.5%', icon: Target, color: '#007AFF' },
    { label: 'Customer Satisfaction', value: '4.7/5', icon: Star, color: '#FFA500' },
    { label: 'Provider Utilization', value: '78%', icon: TrendingUp, color: '#FF6B6B' },
  ];

  return (
    <AdminLayout>
      <div className="p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Analytics</h1>
          <p className="text-white/60">Platform performance and insights</p>
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
                className="glass-light rounded-[24px] p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex items-center gap-1">
                    {stat.trend === 'up' ? (
                      <TrendingUp className="w-4 h-4 text-[#2EFFAF]" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-red-400" />
                    )}
                    <span className={stat.trend === 'up' ? 'text-[#2EFFAF] text-sm font-semibold' : 'text-red-400 text-sm font-semibold'}>
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
                    <stop offset="5%" stopColor="#2EFFAF" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#2EFFAF" stopOpacity={0}/>
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
                <Area type="monotone" dataKey="revenue" stroke="#2EFFAF" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
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
                <Bar dataKey="jobs" fill="#007AFF" radius={[8, 8, 0, 0]} />
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
                <Line type="monotone" dataKey="providers" stroke="#2EFFAF" strokeWidth={3} dot={{ fill: '#2EFFAF', r: 6 }} />
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
      </div>
    </AdminLayout>
  );
}
