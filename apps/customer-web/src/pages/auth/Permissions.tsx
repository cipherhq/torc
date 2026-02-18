import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { MapPin, Bell, Check } from 'lucide-react';
import { useState } from 'react';

export function Permissions() {
  const navigate = useNavigate();
  const [location, setLocation] = useState(false);
  const [notifications, setNotifications] = useState(false);

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
    <div className="min-h-screen bg-[#0A0F1E] flex flex-col p-6 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 bg-[#2EFFAF] opacity-10 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div 
            className="w-24 h-24 rounded-3xl bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center mx-auto mb-6"
            style={{
              boxShadow: '0 20px 40px rgba(46, 255, 175, 0.3)',
            }}
          >
            <MapPin className="w-12 h-12 text-[#0A0F1E]" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">
            Enable Permissions
          </h1>
          <p className="text-white/60">
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
                className="glass rounded-[32px] p-6"
              >
                <div className="flex items-start gap-4">
                  <div 
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                      permission.granted
                        ? 'bg-gradient-to-br from-[#2EFFAF] to-[#007AFF]'
                        : 'bg-white/5'
                    }`}
                  >
                    <Icon className={`w-7 h-7 ${
                      permission.granted ? 'text-[#0A0F1E]' : 'text-white/40'
                    }`} />
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-white font-semibold">{permission.title}</h3>
                      {permission.required && (
                        <span className="text-[#2EFFAF] text-xs font-semibold">REQUIRED</span>
                      )}
                    </div>
                    <p className="text-white/60 text-sm mb-4">{permission.description}</p>

                    {!permission.granted ? (
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={permission.onGrant}
                        className="bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-2xl px-6 py-2 text-sm font-semibold text-[#0A0F1E]"
                      >
                        Grant Access
                      </motion.button>
                    ) : (
                      <div className="flex items-center gap-2 text-[#2EFFAF]">
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
          whileTap={{ scale: allGranted ? 0.98 : 1 }}
          onClick={handleContinue}
          disabled={!allGranted}
          className="w-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-[32px] py-5 font-bold text-[#0A0F1E] text-lg shadow-lg shadow-[#2EFFAF]/30 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {allGranted ? 'Continue to App' : 'Grant All Permissions to Continue'}
        </motion.button>

        <p className="text-center text-white/40 text-sm mt-6">
          You can change these settings anytime in your profile
        </p>
      </div>
    </div>
  );
}
