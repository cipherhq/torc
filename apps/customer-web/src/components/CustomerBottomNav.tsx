import { motion } from 'motion/react';
import { Home, Activity, MapPin, User, MessageCircle } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router';
import { useTheme } from '../context/ThemeContext';

export function CustomerBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark } = useTheme();

  const tabs = [
    { icon: Home, label: 'Home', path: '/customer/home' },
    { icon: Activity, label: 'Activity', path: '/customer/history' },
    { icon: MessageCircle, label: 'Messages', path: '/customer/messages' },
    { icon: MapPin, label: 'Explore', path: '/customer/explore' },
    { icon: User, label: 'Profile', path: '/customer/profile' },
  ];

  const inactiveColor = isDark ? 'rgba(255,255,255,0.5)' : '#7B8BA3';

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      <div className="px-4 py-3 backdrop-blur-xl"
        style={{
          paddingBottom: 'max(calc(12px + var(--safe-bottom, 0px)), 28px)',
          background: isDark
            ? 'linear-gradient(180deg, rgba(9,20,36,0.92) 0%, rgba(8,16,28,0.92) 100%)'
            : 'linear-gradient(180deg, rgba(245,250,255,0.96) 0%, rgba(238,246,255,0.96) 100%)',
          borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#D3E2F5'}`,
          boxShadow: isDark ? '0 -10px 30px rgba(2,8,23,0.35)' : '0 -8px 28px rgba(15,71,145,0.08)',
        }}
      >
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
                    className="absolute -top-1 left-1/2 -translate-x-1/2 w-12 h-12 rounded-2xl"
                    style={{
                      background: isDark
                        ? 'linear-gradient(135deg, rgba(0,140,229,0.30) 0%, rgba(0,112,184,0.28) 100%)'
                        : 'linear-gradient(135deg, rgba(0,140,229,0.20) 0%, rgba(0,112,184,0.18) 100%)',
                    }}
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <Icon
                  className="w-6 h-6 relative z-10"
                  style={{ color: isActive ? '#008CE5' : inactiveColor }}
                />
                <span
                  className="text-xs relative z-10"
                  style={{ color: isActive ? '#008CE5' : inactiveColor, fontWeight: isActive ? 600 : 500 }}
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
