import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ProviderBottomNav } from '../../components/ProviderBottomNav';
import { Power, Settings, DollarSign, MapPin, Clock, TrendingUp } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

export function ProviderHome() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [isOnline, setIsOnline] = useState(false);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [providerRating, setProviderRating] = useState(0);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    async function loadStats() {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const { data: jobs } = await supabase
          .from('jobs')
          .select('total_amount, status, created_at')
          .eq('provider_id', user!.id);

        if (jobs) {
          const todayJobs = jobs.filter(j => j.status === 'completed' && new Date(j.created_at) >= today);
          setTodayEarnings(todayJobs.reduce((sum, j) => sum + (j.total_amount || 0), 0));
          setCompletedCount(jobs.filter(j => j.status === 'completed').length);
        }

        const { data: pp } = await supabase
          .from('provider_profiles')
          .select('rating, is_online')
          .eq('id', user!.id)
          .single();

        if (pp) {
          setProviderRating(pp.rating || 0);
          setIsOnline(pp.is_online || false);
        }
      } catch (e) { console.warn('Failed to load provider stats:', e); }
    }
    loadStats();
  }, [user]);

  const toggleOnline = async () => {
    const newStatus = !isOnline;
    setIsOnline(newStatus);
    if (user) {
      await supabase.from('provider_profiles').upsert({ id: user.id, is_online: newStatus }).select();
    }
  };

  const stats = [
    { label: 'Today', value: `$${todayEarnings}`, icon: DollarSign, color: 'text-[#2EFFAF]' },
    { label: 'Completed', value: `${completedCount}`, icon: Clock, color: 'text-[#007AFF]' },
    { label: 'Rating', value: providerRating > 0 ? providerRating.toFixed(1) : '-', icon: TrendingUp, color: 'text-[#2EFFAF]' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0F1419] via-[#1A1F2E] to-[#252B3D] relative overflow-hidden pb-24">
      {/* Background accents */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-20 right-20 w-96 h-96 bg-gradient-to-br from-[#2EFFAF]/30 to-transparent blur-3xl rounded-full animate-pulse" />
        <div className="absolute bottom-40 left-20 w-96 h-96 bg-gradient-to-br from-[#007AFF]/30 to-transparent blur-3xl rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      {/* Header */}
      <div className="relative z-10 p-6 flex items-center justify-between">
        <div>
          <p className="text-white/60 text-sm">Provider Dashboard</p>
          <h1 className="text-3xl font-bold text-white">TORC Provider</h1>
        </div>
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate('/provider/profile')}
          className="glass rounded-full p-3"
        >
          <Settings className="w-6 h-6 text-white" />
        </motion.button>
      </div>

      {/* Online status toggle */}
      <div className="relative z-10 px-6 mb-6">
        <motion.div
          whileTap={{ scale: 0.98 }}
          onClick={toggleOnline}
          className={isOnline
            ? 'rounded-[32px] p-6 cursor-pointer transition-all bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] shadow-2xl shadow-[#2EFFAF]/40'
            : 'rounded-[32px] p-6 cursor-pointer transition-all glass'}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={isOnline ? 'w-16 h-16 rounded-2xl flex items-center justify-center bg-white/20' : 'w-16 h-16 rounded-2xl flex items-center justify-center bg-white/5'}>
                <Power className={isOnline ? 'w-8 h-8 text-[#0F1419]' : 'w-8 h-8 text-white/40'} />
              </div>
              <div>
                <h2 className={isOnline ? 'text-2xl font-bold text-[#0F1419]' : 'text-2xl font-bold text-white'}>
                  {isOnline ? 'You\'re Online' : 'You\'re Offline'}
                </h2>
                <p className={isOnline ? 'text-sm text-[#0F1419]/80' : 'text-sm text-white/60'}>
                  {isOnline ? 'Ready to accept requests' : 'Tap to go online'}
                </p>
              </div>
            </div>
            <div className={isOnline ? 'w-12 h-7 rounded-full relative transition-all bg-[#0F1419]/30' : 'w-12 h-7 rounded-full relative transition-all bg-white/10'}>
              <div className={isOnline ? 'absolute w-5 h-5 bg-[#0F1419] rounded-full top-1 right-1 transition-all shadow-lg' : 'absolute w-5 h-5 bg-white/50 rounded-full top-1 left-1 transition-all'} />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Stats */}
      <div className="relative z-10 px-6 mb-6">
        <div className="grid grid-cols-3 gap-3">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="glass-light rounded-[24px] p-4 text-center"
              >
                <Icon className={`w-6 h-6 ${stat.color} mx-auto mb-2`} />
                <p className="text-white font-bold text-xl">{stat.value}</p>
                <p className="text-white/60 text-xs">{stat.label}</p>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Active requests / waiting */}
      <div className="relative z-10 px-6">
        <div className="glass-light rounded-[32px] p-6">
          <h3 className="text-white font-semibold text-lg mb-4">Active Requests</h3>
          
          {isOnline ? (
            <div className="text-center py-12">
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-20 h-20 rounded-full bg-[#2EFFAF]/20 flex items-center justify-center mx-auto mb-4"
              >
                <MapPin className="w-10 h-10 text-[#2EFFAF]" />
              </motion.div>
              <p className="text-white/80 mb-2">Waiting for requests...</p>
              <p className="text-white/50 text-sm">We'll notify you when someone needs help</p>
              
              {/* Mock request button for demo */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate('/provider/request/demo-123')}
                className="mt-6 px-6 py-3 rounded-2xl bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0F1419] font-semibold shadow-lg shadow-[#2EFFAF]/30"
              >
                Simulate Request (Demo)
              </motion.button>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-white/60">Go online to start receiving requests</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="relative z-10 px-6 mt-6 pb-6">
        <div className="grid grid-cols-2 gap-3">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/provider/earnings')}
            className="glass-light rounded-[24px] p-5 text-left"
          >
            <DollarSign className="w-8 h-8 text-[#2EFFAF] mb-2" />
            <p className="text-white font-semibold">Earnings</p>
            <p className="text-white/60 text-sm">View payouts</p>
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/provider/profile')}
            className="glass-light rounded-[24px] p-5 text-left"
          >
            <Settings className="w-8 h-8 text-[#007AFF] mb-2" />
            <p className="text-white font-semibold">Settings</p>
            <p className="text-white/60 text-sm">Manage profile</p>
          </motion.button>
        </div>
      </div>

      {/* Bottom navigation */}
      <ProviderBottomNav />
    </div>
  );
}
