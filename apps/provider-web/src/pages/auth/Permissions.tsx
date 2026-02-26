import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { MapPin, Bell, Check, AlertTriangle } from 'lucide-react';
import { useState, useEffect } from 'react';

export function Permissions() {
  const navigate = useNavigate();
  const [locationGranted, setLocationGranted] = useState(false);
  const [notificationsGranted, setNotificationsGranted] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  const [notificationsDenied, setNotificationsDenied] = useState(false);

  // Check existing permissions on mount
  useEffect(() => {
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        if (result.state === 'granted') setLocationGranted(true);
        if (result.state === 'denied') setLocationDenied(true);
      }).catch(() => {});
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      setNotificationsGranted(true);
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
      setNotificationsDenied(true);
    }
  }, []);

  const requestLocation = async () => {
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });
      if (pos) setLocationGranted(true);
    } catch {
      setLocationDenied(true);
    }
  };

  const requestNotifications = async () => {
    if (typeof Notification === 'undefined') {
      setNotificationsGranted(true);
      return;
    }
    try {
      const result = await Notification.requestPermission();
      if (result === 'granted') setNotificationsGranted(true);
      else setNotificationsDenied(true);
    } catch {
      setNotificationsDenied(true);
    }
  };

  const permissions = [
    {
      id: 'location',
      title: 'Location Access',
      description: 'Required to show your position on the map and connect you with nearby customers',
      icon: MapPin,
      required: true,
      granted: locationGranted,
      denied: locationDenied,
      onGrant: requestLocation,
    },
    {
      id: 'notifications',
      title: 'Push Notifications',
      description: 'Get real-time alerts when new service requests come in',
      icon: Bell,
      required: true,
      granted: notificationsGranted,
      denied: notificationsDenied,
      onGrant: requestNotifications,
    },
  ];

  const handleContinue = () => {
    navigate('/home');
  };

  const allGranted = locationGranted && notificationsGranted;

  return (
    <div className="min-h-screen bg-[#0A0F1E] flex flex-col relative overflow-hidden" style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 bg-[#008CE5] opacity-10 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 flex-1 flex flex-col justify-center max-w-md mx-auto w-full p-6">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div
            className="w-24 h-24 rounded-3xl bg-gradient-to-br from-[#008CE5] to-[#0070B8] flex items-center justify-center mx-auto mb-6"
            style={{ boxShadow: '0 20px 40px rgba(78, 205, 196, 0.3)' }}
          >
            <MapPin className="w-12 h-12 text-[#0A0F1E]" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">Enable Permissions</h1>
          <p className="text-white/60">To provide the best service experience, we need access to:</p>
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
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                    permission.granted ? 'bg-gradient-to-br from-[#008CE5] to-[#0070B8]' : 'bg-white/5'
                  }`}>
                    <Icon className={`w-7 h-7 ${permission.granted ? 'text-[#0A0F1E]' : 'text-white/40'}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-white font-semibold">{permission.title}</h3>
                      {permission.required && <span className="text-[#008CE5] text-xs font-semibold">REQUIRED</span>}
                    </div>
                    <p className="text-white/60 text-sm mb-4">{permission.description}</p>
                    {permission.granted ? (
                      <div className="flex items-center gap-2 text-[#008CE5]">
                        <Check className="w-4 h-4" />
                        <span className="text-sm font-semibold">Granted</span>
                      </div>
                    ) : permission.denied ? (
                      <div className="flex items-center gap-2 text-orange-400">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="text-sm">Denied — enable in device settings</span>
                      </div>
                    ) : (
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={permission.onGrant}
                        className="bg-gradient-to-r from-[#008CE5] to-[#0070B8] rounded-2xl px-6 py-2 text-sm font-semibold text-[#0A0F1E]"
                      >
                        Grant Access
                      </motion.button>
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
          className="w-full bg-gradient-to-r from-[#008CE5] to-[#0070B8] rounded-[32px] py-5 font-bold text-[#0A0F1E] text-lg shadow-lg shadow-[#008CE5]/30 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {allGranted ? 'Continue to App' : 'Grant All Permissions to Continue'}
        </motion.button>

        <p className="text-center text-white/40 text-sm mt-6">
          You can change these settings anytime in your device settings
        </p>
      </div>
    </div>
  );
}
