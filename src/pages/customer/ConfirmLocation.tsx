import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, MapPin, AlertTriangle, Navigation } from 'lucide-react';
import { MapBackground } from '../../components/MapBackground';
import { PulsePin } from '../../components/PulsePin';
import { updateRequestContext } from '../../data/requestContext';
import { useState } from 'react';

export function ConfirmLocation() {
  const navigate = useNavigate();
  const [isHazardous, setIsHazardous] = useState(false);
  const [address, setAddress] = useState('1234 Tech Boulevard, San Francisco, CA 94103');

  const handleContinue = () => {
    updateRequestContext({
      location: {
        lat: 37.7749,
        lng: -122.4194,
        address,
      },
      isHazardous,
    });
    navigate('/service-selection');
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <MapBackground />

      {/* Header */}
      <div className="relative z-20 p-6 flex items-center gap-4">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate('/who-needs-help')}
          className="glass rounded-full p-3"
        >
          <ArrowLeft className="w-6 h-6 text-white" />
        </motion.button>
        <h1 className="text-2xl font-bold text-white">Confirm Location</h1>
      </div>

      {/* Map with pin */}
      <div className="relative z-10 flex items-center justify-center mt-12">
        <PulsePin />
      </div>

      {/* Bottom sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-30">
        <motion.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          className="glass rounded-t-[32px] p-6 border-t border-white/10"
        >
          {/* Address input */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <MapPin className="w-5 h-5 text-[#2EFFAF]" />
              <p className="text-white font-semibold">Service Location</p>
            </div>
            <div className="relative">
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl pl-4 pr-12 py-4 text-white placeholder-white/40 focus:outline-none focus:border-[#2EFFAF] transition-colors"
              />
              <button className="absolute right-3 top-1/2 -translate-y-1/2 glass rounded-xl p-2">
                <Navigation className="w-5 h-5 text-[#2EFFAF]" />
              </button>
            </div>
            <p className="text-white/40 text-sm mt-2">
              Drag the pin to adjust your location
            </p>
          </div>

          {/* Hazard toggle */}
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => setIsHazardous(!isHazardous)}
            className={`w-full rounded-[24px] p-5 flex items-center gap-4 mb-6 transition-all ${
              isHazardous
                ? 'bg-gradient-to-r from-red-500/20 to-orange-500/20 border-2 border-red-500/50'
                : 'glass'
            }`}
          >
            <div 
              className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                isHazardous
                  ? 'bg-red-500'
                  : 'bg-white/5'
              }`}
            >
              <AlertTriangle className={`w-6 h-6 ${
                isHazardous ? 'text-white' : 'text-white/40'
              }`} />
            </div>
            <div className="flex-1 text-left">
              <h3 className={`font-semibold ${isHazardous ? 'text-red-400' : 'text-white'}`}>
                In a dangerous spot
              </h3>
              <p className="text-white/60 text-sm">
                Highway, busy road, or unsafe location
              </p>
            </div>
            <div 
              className={`w-12 h-7 rounded-full relative transition-colors ${
                isHazardous ? 'bg-red-500' : 'bg-white/20'
              }`}
            >
              <motion.div
                className="absolute top-1 w-5 h-5 rounded-full bg-white shadow-lg"
                animate={{ left: isHazardous ? 25 : 4 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            </div>
          </motion.button>

          {isHazardous && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="glass rounded-2xl p-4 mb-6 border border-red-500/30"
            >
              <p className="text-red-400 text-sm font-semibold mb-2">⚠️ Safety First</p>
              <ul className="text-white/80 text-sm space-y-1">
                <li>• Turn on hazard lights if possible</li>
                <li>• Stay in your vehicle if on highway</li>
                <li>• Provider will be notified of hazardous location</li>
              </ul>
            </motion.div>
          )}

          {/* Confirm button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleContinue}
            className="w-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-[32px] py-5 font-bold text-[#0A0F1E] text-lg shadow-lg shadow-[#2EFFAF]/30"
          >
            Confirm Location
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
}
