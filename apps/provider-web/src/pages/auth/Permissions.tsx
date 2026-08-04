import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router';
import { MapPin, Bell, Check, AlertTriangle, Shield, Navigation } from 'lucide-react';
import { useState, useEffect } from 'react';

type Step = 'location-disclosure' | 'permissions';

export function Permissions() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('location-disclosure');
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

  // Skip disclosure if location already granted
  useEffect(() => {
    if (locationGranted) {
      setStep('permissions');
    }
  }, [locationGranted]);

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

  const handleConsentAndRequestLocation = async () => {
    await requestLocation();
    setStep('permissions');
  };

  const handleContinue = () => {
    navigate('/home');
  };

  const allGranted = locationGranted && notificationsGranted;

  return (
    <div className="min-h-screen bg-[#081427] flex flex-col relative overflow-hidden" style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 bg-[#008CE5] opacity-10 blur-[120px] rounded-full" />
      </div>

      <AnimatePresence mode="wait">
        {step === 'location-disclosure' && (
          <motion.div
            key="location-disclosure"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, x: -50 }}
            className="relative z-10 flex-1 flex flex-col justify-center max-w-md mx-auto w-full p-6"
          >
            {/* Icon */}
            <div className="text-center mb-8">
              <div
                className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#008CE5] to-[#0070B8] flex items-center justify-center mx-auto mb-6"
                style={{ boxShadow: '0 20px 40px rgba(0, 140, 229, 0.3)' }}
              >
                <Navigation className="w-10 h-10 text-[#081427]" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Background Location Access</h1>
              <p className="text-white/50 text-sm">Please read before continuing</p>
            </div>

            {/* Disclosure Card */}
            <div className="glass rounded-3xl p-6 mb-6">
              <div className="flex items-center gap-3 mb-4">
                <Shield className="w-5 h-5 text-[#008CE5] flex-shrink-0" />
                <h2 className="text-white font-semibold">Why we need your location</h2>
              </div>

              <div className="space-y-4 text-white/70 text-sm leading-relaxed">
                <p>
                  Torc Pro uses your location to enable the following features:
                </p>

                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#008CE5] mt-2 flex-shrink-0" />
                    <p><span className="text-white font-medium">Live tracking during active jobs</span> — When you accept a service request, your real-time location is shared with the customer so they can track your arrival. A notification will appear while tracking is active.</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#008CE5] mt-2 flex-shrink-0" />
                    <p><span className="text-white font-medium">Job matching and dispatch</span> — While you are online and available, your location is periodically updated so the system can assign new service requests to the nearest available provider.</p>
                  </div>
                </div>

                <p className="text-white/50 text-xs pt-2 border-t border-white/10">
                  Location data is only shared with the customer during an active job and with the dispatch system while you are online. You can stop sharing your location at any time by going offline or closing the app.
                </p>
              </div>
            </div>

            {/* Consent Buttons */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleConsentAndRequestLocation}
              className="w-full bg-gradient-to-r from-[#008CE5] to-[#0070B8] rounded-[32px] py-4 font-bold text-[#081427] text-base shadow-lg shadow-[#008CE5]/30 mb-3"
            >
              I Understand — Allow Location Access
            </motion.button>

            <button
              onClick={() => setStep('permissions')}
              className="w-full text-white/40 text-sm py-3 hover:text-white/60 transition-colors"
            >
              Skip for now
            </button>
          </motion.div>
        )}

        {step === 'permissions' && (
          <motion.div
            key="permissions"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className="relative z-10 flex-1 flex flex-col justify-center max-w-md mx-auto w-full p-6"
          >
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center mb-10"
            >
              <div
                className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#008CE5] to-[#0070B8] flex items-center justify-center mx-auto mb-6"
                style={{ boxShadow: '0 20px 40px rgba(0, 140, 229, 0.3)' }}
              >
                <MapPin className="w-10 h-10 text-[#081427]" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Enable Permissions</h1>
              <p className="text-white/50 text-sm">To provide the best service experience</p>
            </motion.div>

            <div className="space-y-4 mb-8">
              {/* Location Permission */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                className="glass rounded-[32px] p-6"
              >
                <div className="flex items-start gap-4">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                    locationGranted ? 'bg-gradient-to-br from-[#008CE5] to-[#0070B8]' : 'bg-white/5'
                  }`}>
                    <MapPin className={`w-7 h-7 ${locationGranted ? 'text-[#081427]' : 'text-white/40'}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-white font-semibold">Location Access</h3>
                      <span className="text-[#008CE5] text-xs font-semibold">REQUIRED</span>
                    </div>
                    <p className="text-white/60 text-sm mb-4">Required for live tracking during active jobs and to match you with nearby service requests.</p>
                    {locationGranted ? (
                      <div className="flex items-center gap-2 text-[#008CE5]">
                        <Check className="w-4 h-4" />
                        <span className="text-sm font-semibold">Granted</span>
                      </div>
                    ) : locationDenied ? (
                      <div className="flex items-center gap-2 text-orange-400">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="text-sm">Denied — enable in device settings</span>
                      </div>
                    ) : (
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={requestLocation}
                        className="bg-gradient-to-r from-[#008CE5] to-[#0070B8] rounded-2xl px-6 py-2 text-sm font-semibold text-[#081427]"
                      >
                        Grant Access
                      </motion.button>
                    )}
                  </div>
                </div>
              </motion.div>

              {/* Notifications Permission */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="glass rounded-[32px] p-6"
              >
                <div className="flex items-start gap-4">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                    notificationsGranted ? 'bg-gradient-to-br from-[#008CE5] to-[#0070B8]' : 'bg-white/5'
                  }`}>
                    <Bell className={`w-7 h-7 ${notificationsGranted ? 'text-[#081427]' : 'text-white/40'}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-white font-semibold">Push Notifications</h3>
                      <span className="text-[#008CE5] text-xs font-semibold">REQUIRED</span>
                    </div>
                    <p className="text-white/60 text-sm mb-4">Get real-time alerts when new service requests come in.</p>
                    {notificationsGranted ? (
                      <div className="flex items-center gap-2 text-[#008CE5]">
                        <Check className="w-4 h-4" />
                        <span className="text-sm font-semibold">Granted</span>
                      </div>
                    ) : notificationsDenied ? (
                      <div className="flex items-center gap-2 text-orange-400">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="text-sm">Denied — enable in device settings</span>
                      </div>
                    ) : (
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={requestNotifications}
                        className="bg-gradient-to-r from-[#008CE5] to-[#0070B8] rounded-2xl px-6 py-2 text-sm font-semibold text-[#081427]"
                      >
                        Grant Access
                      </motion.button>
                    )}
                  </div>
                </div>
              </motion.div>
            </div>

            <motion.button
              whileHover={{ scale: allGranted ? 1.02 : 1 }}
              whileTap={{ scale: allGranted ? 0.98 : 1 }}
              onClick={handleContinue}
              disabled={!allGranted}
              className="w-full bg-gradient-to-r from-[#008CE5] to-[#0070B8] rounded-[32px] py-5 font-bold text-[#081427] text-lg shadow-lg shadow-[#008CE5]/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {allGranted ? 'Continue to App' : 'Grant All Permissions to Continue'}
            </motion.button>

            <p className="text-center text-white/40 text-sm mt-6">
              You can change these settings anytime in your device settings
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
