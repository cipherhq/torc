import { motion } from 'motion/react';
import { Home, DollarSign, User, MessageCircle, Compass } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router';
import { useTheme } from '../context/ThemeContext';

export function ProviderBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark } = useTheme();

  const tabs = [
    { icon: Home, label: 'Home', path: '/home' },
    { icon: Compass, label: 'Explore', path: '/explore' },
    { icon: MessageCircle, label: 'Messages', path: '/provider/messages' },
    { icon: DollarSign, label: 'Earnings', path: '/earnings' },
    { icon: User, label: 'Profile', path: '/profile' },
  ];

  const inactiveColor = isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF';
  const activePath = location.pathname;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      <div className="px-4 py-3 backdrop-blur-xl"
        style={{
          paddingBottom: 'max(calc(12px + env(safe-area-inset-bottom, 0px)), 28px)',
          backgroundColor: isDark ? 'rgba(15,20,25,0.85)' : 'rgba(255,255,255,0.92)',
          borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#E8E4DE'}`,
        }}
      >
        <div className="flex items-center justify-around max-w-lg mx-auto">
          {tabs.map((tab) => {
            const isActive =
              activePath === tab.path ||
              (tab.path === '/provider/messages' && activePath === '/messages') ||
              (tab.path === '/earnings' && activePath === '/provider/earnings');
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
                    layoutId="activeProviderTab"
                    className="absolute -top-1 left-1/2 -translate-x-1/2 w-12 h-12 rounded-2xl"
                    style={{ backgroundColor: isDark ? 'rgba(0,140,229,0.12)' : 'rgba(0,140,229,0.1)' }}
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <Icon
                  className="w-6 h-6 relative z-10"
                  style={{ color: isActive ? '#008CE5' : inactiveColor }}
                />
                <span
                  className="text-xs relative z-10"
                  style={{ color: isActive ? '#008CE5' : inactiveColor, fontWeight: isActive ? 600 : 400 }}
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
