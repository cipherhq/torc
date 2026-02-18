import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { Users, Briefcase, DollarSign, MapPin, TrendingUp, AlertCircle } from 'lucide-react';
import { AdminLayout } from '../../components/AdminLayout';

export function AdminDashboard() {
  const navigate = useNavigate();

  const stats = [
    { label: 'Active Jobs', value: '24', icon: Briefcase, color: 'from-[#2EFFAF] to-[#007AFF]', path: '/admin/jobs' },
    { label: 'Online Providers', value: '156', icon: Users, color: 'from-[#007AFF] to-[#2EFFAF]', path: '/admin/providers' },
    { label: 'Today Revenue', value: '$12.4K', icon: DollarSign, color: 'from-[#2EFFAF] to-[#007AFF]', path: '/admin/payments' },
    { label: 'Coverage Areas', value: '8', icon: MapPin, color: 'from-[#007AFF] to-[#2EFFAF]', path: '/admin/directory' },
  ];

  const recentAlerts = [
    { id: 1, type: 'warning', message: 'Job #1234 - Provider late by 15 min', time: '2 min ago' },
    { id: 2, type: 'info', message: 'New provider verification pending', time: '5 min ago' },
    { id: 3, type: 'warning', message: 'Customer dispute opened - Job #5678', time: '12 min ago' },
  ];

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
                <div
                  key={alert.id}
                  className="flex items-start gap-4 p-4 rounded-2xl glass hover:bg-white/10 transition-colors"
                >
                  <AlertCircle className={`w-5 h-5 flex-shrink-0 ${
                    alert.type === 'warning' ? 'text-orange-400' : 'text-[#007AFF]'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium">{alert.message}</p>
                    <p className="text-white/50 text-sm mt-1">{alert.time}</p>
                  </div>
                </div>
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
            </div>
          </motion.div>
        </div>
      </div>
    </AdminLayout>
  );
}