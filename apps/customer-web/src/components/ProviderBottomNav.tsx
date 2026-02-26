import { Home, DollarSign, User, MessageCircle, Compass } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router';

export function ProviderBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const tabs = [
    { icon: Home, label: 'Home', path: '/provider/home' },
    { icon: Compass, label: 'Explore', path: '/provider/explore' },
    { icon: MessageCircle, label: 'Messages', path: '/provider/messages' },
    { icon: DollarSign, label: 'Earnings', path: '/provider/earnings' },
    { icon: User, label: 'Profile', path: '/provider/profile' },
  ];

  const activePath = location.pathname;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      <div className="px-4 py-3 backdrop-blur-xl"
        style={{
          paddingBottom: 'max(calc(12px + env(safe-area-inset-bottom, 0px)), 28px)',
          backgroundColor: 'rgba(255,255,255,0.92)',
          borderTop: '1px solid #E5E7EB',
        }}
      >
        <div className="flex items-center justify-around max-w-lg mx-auto">
          {tabs.map((tab) => {
            const isActive = activePath === tab.path;
            const Icon = tab.icon;

            return (
              <button
                key={tab.path}
                onClick={() => navigate(tab.path)}
                className="flex flex-col items-center gap-1 relative"
                style={{ touchAction: 'manipulation', background: 'none', border: 'none', padding: '4px 8px' }}
              >
                {isActive && (
                  <div
                    className="absolute -top-1 left-1/2 -translate-x-1/2 w-12 h-12 rounded-2xl"
                    style={{ backgroundColor: 'rgba(78,205,196,0.1)' }}
                  />
                )}
                <Icon
                  className="w-6 h-6 relative z-10"
                  style={{ color: isActive ? '#008CE5' : '#9CA3AF' }}
                />
                <span
                  className="text-xs relative z-10"
                  style={{ color: isActive ? '#008CE5' : '#9CA3AF', fontWeight: isActive ? 600 : 400 }}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
