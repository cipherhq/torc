import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { User, Truck, Shield, Globe } from 'lucide-react';

export function AppSelector() {
  const navigate = useNavigate();

  const apps = [
    {
      id: 'customer',
      title: 'Customer App',
      description: 'Mobile customer experience',
      icon: User,
      path: '/home',
      gradient: 'from-[#2EFFAF] to-[#007AFF]',
    },
    {
      id: 'provider',
      title: 'Provider App',
      description: 'Driver dispatch & earnings',
      icon: Truck,
      path: '/provider/home',
      gradient: 'from-[#007AFF] to-[#2EFFAF]',
    },
    {
      id: 'admin',
      title: 'Admin Dashboard',
      description: 'Operations & management',
      icon: Shield,
      path: '/admin',
      gradient: 'from-[#2EFFAF] to-[#007AFF]',
    },
    {
      id: 'website',
      title: 'Public Website',
      description: 'Marketing & information',
      icon: Globe,
      path: '/website',
      gradient: 'from-[#007AFF] to-[#2EFFAF]',
    },
  ];

  return (
    <div className="min-h-screen bg-[#1A1F2E] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#2EFFAF] opacity-10 blur-[120px] rounded-full" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#007AFF] opacity-10 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 w-full max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-5xl font-bold text-white mb-3">TORC Platform</h1>
          <p className="text-white/60 text-lg">Select which app to explore</p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6">
          {apps.map((app, index) => {
            const Icon = app.icon;

            return (
              <motion.button
                key={app.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + index * 0.1 }}
                whileHover={{ scale: 1.02, y: -4 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate(app.path)}
                className="glass rounded-[32px] p-8 text-left group relative overflow-hidden"
              >
                {/* Hover gradient */}
                <div className={`absolute inset-0 bg-gradient-to-r ${app.gradient} opacity-0 group-hover:opacity-10 transition-opacity`} />

                {/* Icon */}
                <div 
                  className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${app.gradient} flex items-center justify-center mb-6`}
                  style={{
                    boxShadow: '0 8px 24px rgba(46, 255, 175, 0.3)',
                  }}
                >
                  <Icon className="w-10 h-10 text-white" />
                </div>

                {/* Content */}
                <h2 className="text-2xl font-bold text-white mb-2">{app.title}</h2>
                <p className="text-white/60">{app.description}</p>

                {/* Arrow */}
                <svg className="absolute bottom-8 right-8 w-6 h-6 text-[#2EFFAF] group-hover:translate-x-2 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </motion.button>
            );
          })}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-center text-white/40 text-sm mt-8"
        >
          Unified entrypoint for the complete TORC ecosystem
        </motion.p>
      </div>
    </div>
  );
}
