import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { CustomerBottomNav } from '../../components/CustomerBottomNav';
import { Menu, Bell } from 'lucide-react';

export function HomeMap() {
  const navigate = useNavigate();

  return (
    <div className="h-screen bg-gradient-to-br from-[#0F1419] via-[#1A1F2E] to-[#252B3D] flex flex-col relative overflow-hidden">
      {/* Animated background accents */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-20 right-20 w-96 h-96 bg-gradient-to-br from-[#2EFFAF]/30 to-transparent blur-3xl rounded-full animate-pulse" />
        <div className="absolute bottom-20 left-20 w-96 h-96 bg-gradient-to-br from-[#007AFF]/30 to-transparent blur-3xl rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      {/* Top bar */}
      <div className="relative z-20 p-6 flex items-center justify-between">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          className="glass rounded-full p-3"
        >
          <Menu className="w-6 h-6 text-white" />
        </motion.button>
        
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xl font-bold bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] bg-clip-text text-transparent"
        >
          TORC
        </motion.h1>
        
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          className="glass rounded-full p-3 relative"
        >
          <Bell className="w-6 h-6 text-white" />
          <div className="absolute top-2 right-2 w-2 h-2 bg-[#2EFFAF] rounded-full shadow-lg shadow-[#2EFFAF]/50" />
        </motion.button>
      </div>

      {/* Map area simulation */}
      <div className="flex-1 relative z-10 mx-6 mb-6 rounded-[32px] overflow-hidden glass-light">
        <div className="absolute inset-0 bg-gradient-to-br from-[#007AFF]/10 to-[#2EFFAF]/10" />
        
        {/* Pulsing location indicator */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-16 h-16 rounded-full bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center shadow-2xl shadow-[#2EFFAF]/50"
          >
            <div className="w-3 h-3 bg-white rounded-full" />
          </motion.div>
        </div>
      </div>

      {/* Current location card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="relative z-10 mt-auto px-6"
      >
        <div className="glass-light rounded-[32px] p-6 text-center">
          <p className="text-white/60 text-sm mb-1">Current Location</p>
          <p className="text-white font-semibold">1234 Tech Boulevard</p>
          <p className="text-white/80 text-sm">San Francisco, CA 94103</p>
        </div>
      </motion.div>

      {/* Quick stats */}
      <div className="relative z-10 px-6 mt-6 mb-6">
        <div className="glass-light rounded-[32px] p-6 grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-[#2EFFAF] text-2xl font-bold">12</p>
            <p className="text-white/60 text-xs mt-1">Total Saves</p>
          </div>
          <div className="text-center border-x border-white/10">
            <p className="text-[#007AFF] text-2xl font-bold">3m</p>
            <p className="text-white/60 text-xs mt-1">Avg Response</p>
          </div>
          <div className="text-center">
            <p className="text-[#2EFFAF] text-2xl font-bold">4.9</p>
            <p className="text-white/60 text-xs mt-1">Your Rating</p>
          </div>
        </div>
      </div>

      {/* Request help button */}
      <div className="relative z-10 px-6 pb-28">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/customer/request')}
          className="w-full py-5 rounded-[32px] bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0F1419] font-bold text-lg shadow-2xl shadow-[#2EFFAF]/30"
        >
          Request Assistance
        </motion.button>
      </div>

      {/* Bottom navigation */}
      <CustomerBottomNav />
    </div>
  );
}
