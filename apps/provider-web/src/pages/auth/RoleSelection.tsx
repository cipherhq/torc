import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { User, Truck } from 'lucide-react';

export function RoleSelection() {
  const navigate = useNavigate();

  const roles = [
    {
      id: 'customer',
      title: 'Customer',
      description: 'Get help when you need it',
      icon: User,
      gradient: 'from-[#2EFFAF] to-[#007AFF]',
    },
    {
      id: 'provider',
      title: 'Provider',
      description: 'Help others and earn money',
      icon: Truck,
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

      <div className="relative z-10 w-full max-w-md">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl font-bold text-white mb-3">Welcome to TORC</h1>
          <p className="text-white/60 text-lg">How would you like to use TORC?</p>
        </motion.div>

        <div className="space-y-4">
          {roles.map((role, index) => {
            const Icon = role.icon;

            return (
              <motion.button
                key={role.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + index * 0.1 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate(role.id === 'provider' ? '/provider/login' : '/login')}
                className="w-full glass rounded-[32px] p-8 flex items-center gap-6 group relative overflow-hidden"
              >
                {/* Hover gradient */}
                <div className={`absolute inset-0 bg-gradient-to-r ${role.gradient} opacity-0 group-hover:opacity-10 transition-opacity`} />

                {/* Icon */}
                <div 
                  className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${role.gradient} flex items-center justify-center flex-shrink-0`}
                  style={{
                    boxShadow: '0 8px 24px rgba(46, 255, 175, 0.3)',
                  }}
                >
                  <Icon className="w-10 h-10 text-[#0A0F1E]" />
                </div>

                {/* Content */}
                <div className="flex-1 text-left">
                  <h2 className="text-2xl font-bold text-white mb-1">{role.title}</h2>
                  <p className="text-white/60">{role.description}</p>
                </div>

                {/* Arrow */}
                <svg className="w-6 h-6 text-[#2EFFAF] group-hover:translate-x-2 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </motion.button>
            );
          })}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center text-white/40 text-sm mt-8"
        >
          You can always switch between roles in settings
        </motion.p>
      </div>
    </div>
  );
}