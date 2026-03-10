import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { CustomerBottomNav } from '../../components/CustomerBottomNav';
import { PageHeader } from '../../components/PageHeader';
import { Clock, CheckCircle, Calendar, ChevronRight, DollarSign } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../lib/supabase';

export function Activity() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [upcomingJobs, setUpcomingJobs] = useState([]);
  const [pastJobs, setPastJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [upcomingHasMore, setUpcomingHasMore] = useState(true);
  const [pastHasMore, setPastHasMore] = useState(true);

  const PAGE_SIZE = 10;
  const UPCOMING_STATUSES = ['pending', 'matching', 'accepted', 'enroute', 'en_route', 'arrived', 'in_progress', 'inprogress'];
  const PAST_STATUSES = ['completed', 'cancelled'];

  const textColor = isDark ? '#FFFFFF' : '#14263D';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2';

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    async function loadInitial() {
      try {
        const [upcoming, past] = await Promise.all([
          supabase.from('jobs').select('*, service:services(*)')
            .eq('customer_id', user.id).in('status', UPCOMING_STATUSES)
            .order('created_at', { ascending: false }).limit(PAGE_SIZE),
          supabase.from('jobs').select('*, service:services(*)')
            .eq('customer_id', user.id).in('status', PAST_STATUSES)
            .order('created_at', { ascending: false }).limit(PAGE_SIZE),
        ]);
        if (upcoming.data) {
          setUpcomingJobs(upcoming.data);
          setUpcomingHasMore(upcoming.data.length === PAGE_SIZE);
        }
        if (past.data) {
          setPastJobs(past.data);
          setPastHasMore(past.data.length === PAGE_SIZE);
        }
      } catch (e) {
        console.warn('Failed to load jobs:', e);
      } finally {
        setLoading(false);
      }
    }
    loadInitial();
  }, [user]);

  // Real-time: listen for job status changes (accepted, enroute, etc.)
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('activity-job-updates')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'jobs',
        filter: `customer_id=eq.${user.id}`,
      }, (payload) => {
        const updated = payload.new as any;
        if (!updated?.id) return;

        // If provider started heading (enroute), navigate to live tracking
        if (updated.status === 'enroute' || updated.status === 'en_route') {
          navigate(`/tracking/${updated.id}`);
          return;
        }

        // Update job in the list
        setUpcomingJobs((prev: any[]) =>
          prev.map((j: any) => j.id === updated.id ? { ...j, ...updated } : j)
        );
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, navigate]);

  const loadMore = async () => {
    if (!user || loadingMore) return;
    setLoadingMore(true);
    try {
      const isUpcoming = activeTab === 'upcoming';
      const currentJobs = isUpcoming ? upcomingJobs : pastJobs;
      const statuses = isUpcoming ? UPCOMING_STATUSES : PAST_STATUSES;
      const offset = currentJobs.length;

      const { data } = await supabase.from('jobs').select('*, service:services(*)')
        .eq('customer_id', user.id).in('status', statuses)
        .order('created_at', { ascending: false }).range(offset, offset + PAGE_SIZE - 1);

      if (data) {
        if (isUpcoming) {
          setUpcomingJobs(prev => [...prev, ...data]);
          setUpcomingHasMore(data.length === PAGE_SIZE);
        } else {
          setPastJobs(prev => [...prev, ...data]);
          setPastHasMore(data.length === PAGE_SIZE);
        }
      }
    } catch (e) {
      console.warn('Failed to load more:', e);
    } finally {
      setLoadingMore(false);
    }
  };

  const tabs = [
    { id: 'upcoming' as const, label: 'Upcoming', count: upcomingJobs.length },
    { id: 'past' as const, label: 'Past', count: pastJobs.length },
  ];

  const displayJobs = activeTab === 'upcoming' ? upcomingJobs : pastJobs;
  const hasMore = activeTab === 'upcoming' ? upcomingHasMore : pastHasMore;

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: isDark ? 'linear-gradient(180deg, #0A1626 0%, #081427 100%)' : 'linear-gradient(180deg, #F8FBFF 0%, #EAF2FF 100%)', paddingBottom: 'calc(96px + var(--safe-bottom, 0px))' }}>
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-[#008CE5] opacity-10 blur-[120px] rounded-full" />
      </div>

      <PageHeader title="Activity" onBack={() => navigate('/customer/home')} />
      <div style={{ paddingTop: 'calc(var(--safe-top) + 64px)' }} />

      {/* Tabs */}
      <div className="relative z-10 px-6 mb-6">
        <div className="rounded-2xl p-2 flex" style={{ backgroundColor: cardBg, border: '1px solid ' + cardBorder }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 rounded-[18px] font-semibold transition-all relative`}
              style={{ color: activeTab === tab.id ? '#081427' : subColor }}
            >
              {activeTab === tab.id && (
                <motion.div
                  layoutId="activeActivityTab"
                  className="absolute inset-0 bg-gradient-to-r from-[#008CE5] to-[#0070B8] rounded-[18px]"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <span className="relative z-10 flex items-center justify-center gap-2">
                {tab.label}
                {tab.count > 0 && (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: activeTab === tab.id
                        ? 'rgba(10,15,30,0.2)'
                        : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
                    }}
                  >
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
            className="rounded-2xl p-12 text-center"
            style={{ backgroundColor: cardBg, border: '1px solid ' + cardBorder }}
          >
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }}
            >
              <div className="w-10 h-10 border-4 border-[#008CE5] border-t-transparent rounded-full animate-spin" />
            </div>
            <p style={{ color: subColor }}>Loading your activity...</p>
          </motion.div>
        ) : displayJobs.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl p-12 text-center"
            style={{ backgroundColor: cardBg, border: '1px solid ' + cardBorder }}
          >
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }}
            >
              {activeTab === 'upcoming' ? (
                <Calendar className="w-10 h-10" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }} />
              ) : (
                <Clock className="w-10 h-10" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }} />
              )}
            </div>
            <p style={{ color: subColor }}>
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
                transition={{ delay: Math.min(index, 5) * 0.1 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate(`/job/${job.id}`)}
                className="w-full rounded-2xl p-6 text-left group active:opacity-80"
                style={{ backgroundColor: cardBg, border: '1px solid ' + cardBorder }}
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                      job.status === 'completed'
                        ? 'bg-gradient-to-br from-[#008CE5] to-[#0070B8]'
                        : 'bg-gradient-to-br from-[#0070B8]/20 to-[#008CE5]/20'
                    }`}
                  >
                    {job.status === 'completed' ? (
                      <CheckCircle className="w-7 h-7 text-[#081427]" />
                    ) : (
                      <Clock className="w-7 h-7 text-[#008CE5]" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-semibold text-lg" style={{ color: textColor }}>{job.service?.name || job.service_id || 'Service'}</h3>
                        <p className="text-sm truncate" style={{ color: subColor }}>Vehicle</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-[#008CE5] group-hover:translate-x-1 transition-transform flex-shrink-0" />
                    </div>

                    <p className="text-sm mb-3 truncate" style={{ color: subColor }}>{job.pickup_address || 'No location'}</p>

                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-[#008CE5]" />
                        <span className="text-sm" style={{ color: isDark ? 'rgba(255,255,255,0.8)' : '#374151' }}>
                          {job.status === 'completed' && job.completed_at
                            ? new Date(job.completed_at).toLocaleDateString()
                            : (job.scheduled_for || job.created_at)
                            ? new Date(job.scheduled_for || job.created_at).toLocaleDateString()
                            : 'No date'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-[#008CE5]" />
                        <span className="text-[#008CE5] font-semibold text-sm">
                          ${job.total_amount || job.total_price || job.base_price || '-'}
                        </span>
                      </div>
                    </div>
                    {/* Status badge */}
                    {activeTab === 'upcoming' && (
                      <div className="mt-2">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full" style={{
                          backgroundColor: job.status === 'accepted' ? 'rgba(0,140,229,0.1)' : job.status === 'pending' ? 'rgba(245,158,11,0.1)' : 'rgba(0,140,229,0.1)',
                          color: job.status === 'accepted' ? '#008CE5' : job.status === 'pending' ? '#F59E0B' : '#008CE5',
                        }}>
                          {job.status === 'pending' && 'Awaiting Provider'}
                          {job.status === 'accepted' && 'Provider Accepted'}
                          {(job.status === 'enroute' || job.status === 'en_route') && 'Provider En Route'}
                          {job.status === 'arrived' && 'Provider Arrived'}
                          {(job.status === 'inprogress' || job.status === 'in_progress') && 'Service In Progress'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.button>
            ))}

            {/* Load More */}
            {hasMore && displayJobs.length > 0 && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                whileTap={{ scale: 0.97 }}
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full rounded-2xl py-4 font-semibold text-center"
                style={{ backgroundColor: cardBg, border: '1px solid ' + cardBorder, color: '#008CE5' }}
              >
                {loadingMore ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-[#008CE5] border-t-transparent rounded-full animate-spin" />
                    Loading...
                  </span>
                ) : (
                  'Load More'
                )}
              </motion.button>
            )}
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
