import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { MapPin, Bell, Check } from 'lucide-react';
import { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';

export function Permissions() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const [location, setLocation] = useState(false);
  const [notifications, setNotifications] = useState(false);

  const textColor = isDark ? '#FFFFFF' : '#14263D';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2';
  const mutedColor = isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF';

  const permissions = [
    {
      id: 'location',
      title: 'Location Access',
      description: 'Required to find providers near you and track service',
      icon: MapPin,
      required: true,
      granted: location,
      onGrant: () => setLocation(true),
    },
    {
      id: 'notifications',
      title: 'Push Notifications',
      description: 'Get real-time updates on your service requests',
      icon: Bell,
      required: true,
      granted: notifications,
      onGrant: () => setNotifications(true),
    },
  ];

  const handleContinue = () => {
    navigate('/home');
  };

  const allGranted = location && notifications;

  return (
    <div className="min-h-screen flex flex-col p-6 relative overflow-hidden" style={{ background: isDark ? 'linear-gradient(180deg, #0A1626 0%, #081427 100%)' : 'linear-gradient(180deg, #F8FBFF 0%, #EAF2FF 100%)', paddingTop: 'var(--safe-top)' }}>
      {/* Background */}
      {isDark && (
        <div className="absolute inset-0">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 bg-[#008CE5] opacity-10 blur-[120px] rounded-full" />
        </div>
      )}

      <div className="relative z-10 flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div
            className="w-24 h-24 rounded-3xl bg-gradient-to-br from-[#008CE5] to-[#0070B8] flex items-center justify-center mx-auto mb-6"
            style={{
              boxShadow: '0 20px 40px rgba(46, 255, 175, 0.3)',
            }}
          >
            <MapPin className="w-12 h-12 text-[#081427]" />
          </div>
          <h1 className="text-3xl font-bold mb-3" style={{ color: textColor }}>
            Enable Permissions
          </h1>
          <p style={{ color: subColor }}>
            To provide the best rescue experience, we need access to:
          </p>
        </motion.div>

        <div className="space-y-4 mb-8">
          {permissions.map((permission, index) => {
            const Icon = permission.icon;

            return (
              <motion.div
                key={permission.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + index * 0.1 }}
                className="rounded-2xl p-6"
                style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                      permission.granted
                        ? 'bg-gradient-to-br from-[#008CE5] to-[#0070B8]'
                        : ''
                    }`}
                    style={!permission.granted ? { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' } : undefined}
                  >
                    <Icon className="w-7 h-7" style={{ color: permission.granted ? '#081427' : mutedColor }} />
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold" style={{ color: textColor }}>{permission.title}</h3>
                      {permission.required && (
                        <span className="text-[#008CE5] text-xs font-semibold">REQUIRED</span>
                      )}
                    </div>
                    <p className="text-sm mb-4" style={{ color: subColor }}>{permission.description}</p>

                    {!permission.granted ? (
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.96 }}
                        onClick={permission.onGrant}
                        className="bg-gradient-to-r from-[#008CE5] to-[#0070B8] rounded-2xl px-6 py-2 text-sm font-semibold text-[#081427]"
                        style={{ boxShadow: '0 8px 24px rgba(78,205,196,0.4)' }}
                      >
                        Grant Access
                      </motion.button>
                    ) : (
                      <div className="flex items-center gap-2 text-[#008CE5]">
                        <Check className="w-4 h-4" />
                        <span className="text-sm font-semibold">Granted</span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        <motion.button
          whileHover={{ scale: allGranted ? 1.02 : 1 }}
          whileTap={{ scale: allGranted ? 0.96 : 1 }}
          onClick={handleContinue}
          disabled={!allGranted}
          className="w-full bg-gradient-to-r from-[#008CE5] to-[#0070B8] rounded-[32px] py-5 font-bold text-[#081427] text-lg disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ boxShadow: '0 8px 24px rgba(78,205,196,0.4)' }}
        >
          {allGranted ? 'Continue to App' : 'Grant All Permissions to Continue'}
        </motion.button>

        <p className="text-center text-sm mt-6" style={{ color: mutedColor }}>
          You can change these settings anytime in your profile
        </p>
      </div>
    </div>
  );
}
