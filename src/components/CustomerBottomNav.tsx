import { motion } from 'motion/react';
import { Home, History, MapPin, User } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router';

export function CustomerBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const tabs = [
    { icon: Home, label: 'Home', path: '/customer/home' },
    { icon: History, label: 'History', path: '/customer/history' },
    { icon: MapPin, label: 'Explore', path: '/customer/explore' },
    { icon: User, label: 'Profile', path: '/customer/profile' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 pb-safe">
      <div className="glass-light border-t border-white/20 px-4 py-3">
        <div className="flex items-center justify-around max-w-lg mx-auto">
          {tabs.map((tab) => {
            const isActive = location.pathname === tab.path;
            const Icon = tab.icon;

            return (
              <motion.button
                key={tab.path}
                whileTap={{ scale: 0.9 }}
                onClick={() => navigate(tab.path)}
                className="flex flex-col items-center gap-1 relative"
              >
                {isActive && (
                  <motion.div
                    layoutId="activeCustomerTab"
                    className="absolute -top-1 left-1/2 -translate-x-1/2 w-12 h-12 rounded-2xl bg-gradient-to-br from-[#2EFFAF]/30 to-[#007AFF]/30"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <Icon 
                  className={`w-6 h-6 relative z-10 ${
                    isActive ? 'text-[#2EFFAF]' : 'text-white/60'
                  }`}
                />
                <span 
                  className={`text-xs relative z-10 ${
                    isActive ? 'text-[#2EFFAF] font-semibold' : 'text-white/60'
                  }`}
                >
                  {tab.label}
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
