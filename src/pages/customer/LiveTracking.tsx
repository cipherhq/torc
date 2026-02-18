import { motion } from 'motion/react';
import { useNavigate, useParams } from 'react-router';
import { MapWithRoute } from '../../components/MapWithRoute';
import { PulsePin } from '../../components/PulsePin';
import { Phone, MessageCircle, Share2, Shield, Star, Navigation, Clock, MapPin } from 'lucide-react';
import { useState, useEffect } from 'react';

export function LiveTracking() {
  const navigate = useNavigate();
  const { jobId } = useParams();
  const [eta, setEta] = useState(12);
  const [status, setStatus] = useState<'accepted' | 'enroute' | 'arrived' | 'inprogress'>('enroute');
  const [providerPosition, setProviderPosition] = useState({ x: 30, y: 70 });

  // Simulate ETA countdown
  useEffect(() => {
    if (status === 'enroute') {
      const interval = setInterval(() => {
        setEta(prev => {
          if (prev <= 1) {
            setStatus('arrived');
            return 0;
          }
          return prev - 1;
        });
      }, 3000);

      return () => clearInterval(interval);
    }
  }, [status]);

  // Simulate provider moving closer
  useEffect(() => {
    if (status === 'enroute') {
      const interval = setInterval(() => {
        setProviderPosition(prev => ({
          x: Math.min(prev.x + 2, 48), // Move toward center (50%)
          y: Math.max(prev.y - 2, 52), // Move toward center (50%)
        }));
      }, 1000);

      return () => clearInterval(interval);
    } else if (status === 'arrived') {
      // Snap to customer location when arrived
      setProviderPosition({ x: 50, y: 50 });
    }
  }, [status]);

  const handleConfirmArrival = () => {
    setStatus('inprogress');
  };

  const handleComplete = () => {
    navigate(`/completion/${jobId}`);
  };

  const statusMessages = {
    accepted: 'Provider accepted your request',
    enroute: 'Provider is on the way',
    arrived: 'Provider has arrived at your location',
    inprogress: 'Service in progress',
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#252B3D]">
      <MapWithRoute 
        providerPosition={providerPosition}
        customerPosition={{ x: 50, y: 50 }}
        showRoute={status === 'enroute'}
      />

      {/* Top status bar */}
      <div className="relative z-20 p-6">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-[24px] px-6 py-4 text-center"
        >
          <p className="text-white/60 text-sm mb-1">{statusMessages[status]}</p>
          {status === 'enroute' && (
            <p className="text-[#2EFFAF] font-bold text-2xl">{eta} min</p>
          )}
          {status === 'arrived' && (
            <p className="text-[#2EFFAF] font-bold text-lg">Tap to confirm arrival</p>
          )}
          {status === 'inprogress' && (
            <p className="text-[#2EFFAF] font-bold text-lg">Working on your vehicle</p>
          )}
        </motion.div>
      </div>

      {/* Map with customer and provider locations */}
      <div className="relative z-10 h-[40vh] flex items-center justify-center">
        {/* Customer location (center, pulsing pin) */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <PulsePin />
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
            <div className="glass rounded-full px-3 py-1">
              <span className="text-white text-xs font-semibold">📍 You are here</span>
            </div>
          </div>
        </div>

        {/* Provider location (moving toward customer) */}
        {status !== 'arrived' && status !== 'inprogress' && (
          <motion.div
            animate={{
              left: `${providerPosition.x}%`,
              top: `${providerPosition.y}%`,
            }}
            transition={{ duration: 1, ease: "easeInOut" }}
            className="absolute -translate-x-1/2 -translate-y-1/2"
          >
            <motion.div
              animate={{
                rotate: [0, 360],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "linear",
              }}
              className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center shadow-lg shadow-[#2EFFAF]/50"
            >
              <Navigation className="w-8 h-8 text-[#0A0F1E]" />
            </motion.div>
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
              <div className="glass rounded-full px-3 py-1">
                <span className="text-[#2EFFAF] text-xs font-semibold">🚗 Provider</span>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Bottom sheet - Provider info */}
      <div className="fixed bottom-0 left-0 right-0 z-30">
        <motion.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          className="glass rounded-t-[32px] p-6 border-t border-white/10"
        >
          {/* Provider card */}
          <div className="mb-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center text-3xl font-bold text-[#0A0F1E]">
                MR
              </div>
              <div className="flex-1">
                <h3 className="text-white font-bold text-xl">Marcus Rodriguez</h3>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-[#2EFFAF] fill-[#2EFFAF]" />
                    <span className="text-[#2EFFAF] font-semibold">4.9</span>
                  </div>
                  <span className="text-white/40">•</span>
                  <span className="text-white/60 text-sm">247 rescues</span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <div className="px-2 py-1 rounded-lg bg-[#2EFFAF]/20 text-[#2EFFAF] text-xs font-semibold">
                    VERIFIED
                  </div>
                  <div className="px-2 py-1 rounded-lg bg-[#007AFF]/20 text-[#007AFF] text-xs font-semibold">
                    TOP PRO
                  </div>
                </div>
              </div>
            </div>

            {/* Vehicle info */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="glass rounded-2xl p-3 text-center">
                <p className="text-white/60 text-xs mb-1">Vehicle</p>
                <p className="text-white text-sm font-semibold">Ford F-350</p>
              </div>
              <div className="glass rounded-2xl p-3 text-center">
                <p className="text-white/60 text-xs mb-1">License</p>
                <p className="text-white text-sm font-semibold">CA #12345</p>
              </div>
              <div className="glass rounded-2xl p-3 text-center">
                <p className="text-white/60 text-xs mb-1">Plate</p>
                <p className="text-white text-sm font-semibold">VAN 789</p>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          {status === 'arrived' ? (
            <motion.button
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleConfirmArrival}
              className="w-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-[32px] py-5 font-bold text-[#0A0F1E] text-lg shadow-lg shadow-[#2EFFAF]/30 mb-4"
            >
              Confirm Provider Arrived
            </motion.button>
          ) : status === 'inprogress' ? (
            <motion.button
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleComplete}
              className="w-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-[32px] py-5 font-bold text-[#0A0F1E] text-lg shadow-lg shadow-[#2EFFAF]/30 mb-4"
            >
              Service Complete
            </motion.button>
          ) : null}

          <div className="grid grid-cols-3 gap-3">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="glass rounded-[24px] py-4 flex flex-col items-center gap-2"
            >
              <Phone className="w-6 h-6 text-[#2EFFAF]" />
              <span className="text-white text-sm font-semibold">Call</span>
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="glass rounded-[24px] py-4 flex flex-col items-center gap-2"
            >
              <MessageCircle className="w-6 h-6 text-[#2EFFAF]" />
              <span className="text-white text-sm font-semibold">Message</span>
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="glass rounded-[24px] py-4 flex flex-col items-center gap-2"
            >
              <Share2 className="w-6 h-6 text-[#2EFFAF]" />
              <span className="text-white text-sm font-semibold">Share</span>
            </motion.button>
          </div>

          {/* Safety button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="w-full mt-4 glass rounded-[24px] py-4 flex items-center justify-center gap-3 border border-red-500/30"
          >
            <Shield className="w-5 h-5 text-red-400" />
            <span className="text-red-400 font-semibold">Safety & Support</span>
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
}