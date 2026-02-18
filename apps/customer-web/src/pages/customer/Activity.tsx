import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { CustomerBottomNav } from '../../components/CustomerBottomNav';
import { Clock, CheckCircle, Calendar, ChevronRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

export function Activity() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past' | 'family'>('upcoming');
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    async function loadJobs() {
      try {
        const { data, error } = await supabase
          .from('jobs')
          .select('*, service:services(*)')
          .eq('customer_id', user.id)
          .order('created_at', { ascending: false });
        if (!error && data) setJobs(data);
      } catch (e) {
        console.warn('Failed to load jobs:', e);
      } finally {
        setLoading(false);
      }
    }
    loadJobs();
  }, [user]);

  const upcomingJobs = jobs.filter(j => ['pending', 'matching', 'accepted', 'enroute'].includes(j.status));
  const pastJobs = jobs.filter(j => ['completed', 'cancelled'].includes(j.status));

  const tabs = [
    { id: 'upcoming' as const, label: 'Upcoming', count: upcomingJobs.length },
    { id: 'past' as const, label: 'Past', count: pastJobs.length },
    { id: 'family' as const, label: 'Family', count: 0 },
  ];

  const displayJobs = activeTab === 'upcoming' ? upcomingJobs : activeTab === 'past' ? pastJobs : [];

  return (
    <div className="min-h-screen bg-[#0A0F1E] pb-24 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-[#2EFFAF] opacity-10 blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <div className="relative z-10 p-6">
        <h1 className="text-3xl font-bold text-white mb-2">Activity</h1>
        <p className="text-white/60">Your rescue history and upcoming services</p>
      </div>

      {/* Tabs */}
      <div className="relative z-10 px-6 mb-6">
        <div className="glass rounded-[24px] p-2 flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 rounded-[18px] font-semibold transition-all relative ${
                activeTab === tab.id
                  ? 'text-[#0A0F1E]'
                  : 'text-white/60'
              }`}
            >
              {activeTab === tab.id && (
                <motion.div
                  layoutId="activeActivityTab"
                  className="absolute inset-0 bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-[18px]"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <span className="relative z-10 flex items-center justify-center gap-2">
                {tab.label}
                {tab.count > 0 && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    activeTab === tab.id
                      ? 'bg-[#0A0F1E]/20'
                      : 'bg-white/10'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Jobs list */}
      <div className="relative z-10 px-6">
        {loading ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-[32px] p-12 text-center"
          >
            <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
              <div className="w-10 h-10 border-4 border-[#2EFFAF] border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-white/60">Loading your activity...</p>
          </motion.div>
        ) : activeTab === 'family' ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-[32px] p-12 text-center"
          >
            <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
              <Calendar className="w-10 h-10 text-white/40" />
            </div>
            <p className="text-white/60">No family members added yet</p>
          </motion.div>
        ) : displayJobs.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-[32px] p-12 text-center"
          >
            <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
              {activeTab === 'upcoming' ? (
                <Calendar className="w-10 h-10 text-white/40" />
              ) : (
                <Clock className="w-10 h-10 text-white/40" />
              )}
            </div>
            <p className="text-white/60">
              {activeTab === 'upcoming'
                ? 'No services yet. Request assistance to get started!'
                : 'No past services'}
            </p>
          </motion.div>
        ) : (
          <div className="space-y-4">
            {displayJobs.map((job, index) => (
              <motion.button
                key={job.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate(`/job/${job.id}`)}
                className="w-full glass rounded-[32px] p-6 text-left group"
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div 
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                      job.status === 'completed'
                        ? 'bg-gradient-to-br from-[#2EFFAF] to-[#007AFF]'
                        : 'bg-gradient-to-br from-[#007AFF]/20 to-[#2EFFAF]/20'
                    }`}
                  >
                    {job.status === 'completed' ? (
                      <CheckCircle className="w-7 h-7 text-[#0A0F1E]" />
                    ) : (
                      <Clock className="w-7 h-7 text-[#2EFFAF]" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="text-white font-semibold text-lg">{job.service?.name || job.service_id || 'Service'}</h3>
                        <p className="text-white/60 text-sm truncate">Vehicle</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-[#2EFFAF] group-hover:translate-x-1 transition-transform flex-shrink-0" />
                    </div>

                    <p className="text-white/60 text-sm mb-3 truncate">{job.pickup_address || 'No location'}</p>

                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-[#2EFFAF]" />
                        <span className="text-white/80 text-sm">
                          {job.status === 'completed' && job.completed_at
                            ? new Date(job.completed_at).toLocaleDateString()
                            : (job.scheduled_for || job.created_at)
                            ? new Date(job.scheduled_for || job.created_at).toLocaleDateString()
                            : 'No date'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-[#2EFFAF]" />
                        <span className="text-[#2EFFAF] font-semibold text-sm">
                          ${job.total_price || job.base_price || '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </div>

      <CustomerBottomNav />
    </div>
  );
}

function DollarSign(props: any) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"></line>
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
    </svg>
  );
}
