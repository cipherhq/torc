import { useNavigate, useLocation } from 'react-router';
import { ProviderBottomNav } from '../../components/ProviderBottomNav';
import { Power, Settings, DollarSign, MapPin, Clock, TrendingUp, Navigation, User, Bell, Star, CheckCircle, X } from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { useGoogleMaps } from '../../context/GoogleMapsContext';
import { useLocation as useLocationCtx } from '../../context/LocationContext';
import { GoogleMap, MarkerF, CircleF } from '@react-google-maps/api';
import { supabase } from '../../lib/supabase';
import { showToast } from '../../components/NotificationToast';
import { initAudio, playRequestRingtone, stopRequestRingtone } from '../../utils/audio';

const mapContainerStyle = { width: '100%', height: '100%' };
const INCOMING_REQUEST_TIMEOUT_SECONDS = 30;

interface PendingJob {
  id: string;
  pickup_address: string;
  total_amount: number | null;
  base_price: number | null;
  created_at: string;
  status: string;
  service?: { name: string } | null;
  customer?: { first_name: string; last_name: string } | null;
}

export function ProviderHome() {
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const { user, profile } = useAuth();
  const { isLoaded, loadError } = useGoogleMaps();
  const { currentLocation } = useLocationCtx();
  const [isOnline, setIsOnline] = useState(false);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [providerRating, setProviderRating] = useState(0);
  const [acceptanceRate, setAcceptanceRate] = useState(0);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [pendingJobs, setPendingJobs] = useState<PendingJob[]>([]);
  const [incomingJob, setIncomingJob] = useState<PendingJob | null>(null);
  const [incomingCountdown, setIncomingCountdown] = useState(0);
  const declinedJobs = useRef<Set<string>>(new Set());
  const announcedJobs = useRef<Set<string>>(new Set());
  const navigatingToJob = useRef(false);
  const incomingJobRef = useRef<PendingJob | null>(null);
  const incomingQueueRef = useRef<PendingJob[]>([]);
  const incomingTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const incomingCountdownRef = useRef<ReturnType<typeof window.setInterval> | null>(null);

  const center = currentLocation
    ? { lat: currentLocation.latitude, lng: currentLocation.longitude }
    : { lat: 33.749, lng: -84.388 };

  const onLoad = useCallback((m: google.maps.Map) => setMap(m), []);
  const onUnmount = useCallback(() => setMap(null), []);

  const clearIncomingTimers = useCallback(() => {
    if (incomingTimeoutRef.current) {
      window.clearTimeout(incomingTimeoutRef.current);
      incomingTimeoutRef.current = null;
    }
    if (incomingCountdownRef.current) {
      window.clearInterval(incomingCountdownRef.current);
      incomingCountdownRef.current = null;
    }
  }, []);

  const closeIncomingRequest = useCallback(() => {
    setIncomingJob(null);
    setIncomingCountdown(0);
    stopRequestRingtone();
    if (navigator.vibrate) navigator.vibrate(0);
    clearIncomingTimers();
  }, [clearIncomingTimers]);

  const openIncomingRequest = useCallback((job: PendingJob) => {
    setIncomingJob(job);
    setIncomingCountdown(INCOMING_REQUEST_TIMEOUT_SECONDS);
    initAudio();
    playRequestRingtone();
    // WebView can resume audio context a moment late; retry once.
    setTimeout(() => playRequestRingtone(), 220);
    if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 300, 100, 300]);
    showToast('notification', 'Incoming Service Request', 'Accept or decline this request.');
  }, []);

  const dismissJob = useCallback((jobId: string, showNotice = true) => {
    declinedJobs.current.add(jobId);
    announcedJobs.current.add(jobId);
    incomingQueueRef.current = incomingQueueRef.current.filter(j => j.id !== jobId);
    setPendingJobs(prev => prev.filter(j => j.id !== jobId));
    if (showNotice) showToast('info', 'Request Dismissed', 'Removed from your queue.');
  }, []);

  const announceIncomingJob = useCallback((job: PendingJob) => {
    if (!job?.id || announcedJobs.current.has(job.id)) return;
    announcedJobs.current.add(job.id);

    // Always show incoming request as its own full page, not layered under Home.
    if (navigatingToJob.current) return;
    navigatingToJob.current = true;
    stopRequestRingtone();
    closeIncomingRequest();
    navigate(`/provider/request/${job.id}`, { state: { broadcastJob: job } });
  }, [closeIncomingRequest, navigate]);

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

          // Acceptance rate = completed / (completed + cancelled by provider)
          const completed = jobs.filter(j => j.status === 'completed').length;
          const cancelled = jobs.filter(j => j.status === 'cancelled').length;
          const total = completed + cancelled;
          setAcceptanceRate(total > 0 ? Math.round((completed / total) * 100) : 100);
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

  // Load pending jobs for the queue
  const loadPendingJobs = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('jobs')
        .select('id, pickup_address, total_amount, base_price, created_at, status, service:services(name)')
        .eq('status', 'pending')
        .is('provider_id', null)
        .order('created_at', { ascending: false })
        .limit(10);

      if (data) {
        const visible = (data as PendingJob[]).filter(j => !declinedJobs.current.has(j.id));
        setPendingJobs(visible);
        if (isOnline) {
          const unseen = visible.filter(j => !announcedJobs.current.has(j.id));
          if (unseen.length > 0) announceIncomingJob(unseen[0]);
        }
      }
    } catch (e) {
      console.warn('Failed to load pending jobs:', e);
    }
  }, [isOnline, announceIncomingJob]);

  // Load pending jobs when online
  useEffect(() => {
    if (!isOnline || !user) {
      setPendingJobs([]);
      return;
    }
    loadPendingJobs();
    // Refresh every 10 seconds
    const interval = setInterval(loadPendingJobs, 10000);
    return () => clearInterval(interval);
  }, [isOnline, user, loadPendingJobs]);

  // Subscribe to job changes to update the queue in real-time
  useEffect(() => {
    if (!isOnline || !user) return;

    const channel = supabase
      .channel('pending-jobs-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'jobs',
      }, () => {
        loadPendingJobs();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isOnline, user, loadPendingJobs]);

  const toggleOnline = async () => {
    // Unlock AudioContext on user gesture so notification bells work later
    initAudio();
    const newStatus = !isOnline;
    setIsOnline(newStatus);
    if (user) {
      await supabase.from('provider_profiles').upsert({ id: user.id, is_online: newStatus }).select();
    }
  };

  // Dismiss a pending job from the queue
  const handleDismissJob = (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    dismissJob(jobId);
  };

  // Capture declined/cancelled job IDs passed via navigation state
  useEffect(() => {
    const state = routerLocation.state as any;
    if (state?.declinedJobId) {
      declinedJobs.current.add(state.declinedJobId);
      navigatingToJob.current = false;
    }
    if (state?.cancelledJobId) {
      declinedJobs.current.add(state.cancelledJobId);
      navigatingToJob.current = false;
    }
  }, [routerLocation.state]);

  // Listen for new job broadcasts when online
  useEffect(() => {
    if (!isOnline || !user) return;
    navigatingToJob.current = false;

    const handleNewJob = async (payload: any) => {
      if (navigatingToJob.current) return;
      const jobId = payload.payload?.id;
      const declinedBy = payload.payload?.declined_by;

      if (!jobId || declinedJobs.current.has(jobId)) return;
      if (declinedBy === user.id) return;

      // Check if provider already has an active job — don't interrupt
      try {
        const { data: activeJobs } = await supabase
          .from('jobs')
          .select('id')
          .eq('provider_id', user.id)
          .in('status', ['accepted', 'en_route', 'enroute', 'arrived', 'in_progress', 'inprogress'])
          .limit(1);

        if (activeJobs && activeJobs.length > 0) {
          // Provider is busy with an active job — silently refresh queue but don't ring/navigate
          loadPendingJobs();
          return;
        }
      } catch {
        // If check fails, continue
      }

      // Verify the job is still pending and unassigned before navigating
      try {
        const { data: job } = await supabase
          .from('jobs')
          .select('id, status, provider_id')
          .eq('id', jobId)
          .single();

        if (!job || job.status !== 'pending' || job.provider_id) {
          loadPendingJobs();
          return;
        }
      } catch {
        // If check fails, still try to navigate
      }

      // Ensure audio is unlocked/resumed before playing request tone.
      const { data: jobData } = await supabase
        .from('jobs')
        .select('id, pickup_address, total_amount, base_price, created_at, status, service:services(name)')
        .eq('id', jobId)
        .single();

      if (jobData) {
        const job = jobData as PendingJob;
        setPendingJobs(prev => (prev.some(j => j.id === job.id) ? prev : [job, ...prev]));
        announceIncomingJob(job);
      } else {
        loadPendingJobs();
      }
    };

    const channel = supabase
      .channel('new-job-broadcast')
      .on('broadcast', { event: 'new_job' }, handleNewJob)
      .subscribe();

    const rebroadcastChannel = supabase
      .channel('new-job-rebroadcast')
      .on('broadcast', { event: 'new_job' }, handleNewJob)
      .subscribe();

    return () => {
      stopRequestRingtone();
      supabase.removeChannel(channel);
      supabase.removeChannel(rebroadcastChannel);
    };
  }, [isOnline, user, loadPendingJobs, announceIncomingJob]);

  // Also check for any pending jobs when going online
  useEffect(() => {
    if (!isOnline || !user) return;

    async function checkPendingJobs() {
      try {
        // First check if provider already has an active job
        const { data: activeJobs } = await supabase
          .from('jobs')
          .select('id')
          .eq('provider_id', user!.id)
          .in('status', ['accepted', 'en_route', 'enroute', 'arrived', 'in_progress', 'inprogress'])
          .limit(1);

        if (activeJobs && activeJobs.length > 0) {
          // Provider has an active job — don't navigate to new request
          return;
        }

        const { data: jobs } = await supabase
          .from('jobs')
          .select('id, pickup_address, total_amount, base_price, created_at, status, service:services(name)')
          .eq('status', 'pending')
          .is('provider_id', null)
          .order('created_at', { ascending: false })
          .limit(1);

        if (jobs && jobs.length > 0) {
          const job = jobs[0] as PendingJob;
          if (!declinedJobs.current.has(job.id)) {
            announceIncomingJob(job);
          }
        }
      } catch (e) {
        console.warn('Failed to check pending jobs:', e);
      }
    }
    checkPendingJobs();
  }, [isOnline, user, announceIncomingJob]);

  useEffect(() => {
    incomingJobRef.current = incomingJob;
  }, [incomingJob]);

  useEffect(() => {
    if (!isOnline || incomingJob || incomingQueueRef.current.length === 0) return;
    const next = incomingQueueRef.current.shift();
    if (next) openIncomingRequest(next);
  }, [incomingJob, isOnline, openIncomingRequest]);

  // Defensive fallback: if requests are visible but no popup is active, surface one.
  useEffect(() => {
    if (!isOnline || incomingJob || pendingJobs.length === 0) return;
    const candidate = pendingJobs.find((j) => j?.id && !declinedJobs.current.has(j.id));
    if (candidate) announceIncomingJob(candidate);
  }, [isOnline, incomingJob, pendingJobs, announceIncomingJob]);

  useEffect(() => {
    clearIncomingTimers();
    if (!incomingJob?.id) return;

    let remaining = INCOMING_REQUEST_TIMEOUT_SECONDS;
    setIncomingCountdown(remaining);

    incomingCountdownRef.current = window.setInterval(() => {
      remaining -= 1;
      setIncomingCountdown(Math.max(remaining, 0));
    }, 1000);

    incomingTimeoutRef.current = window.setTimeout(() => {
      const jobId = incomingJob.id;
      closeIncomingRequest();
      dismissJob(jobId, false);
      showToast('info', 'Request Expired', 'Incoming request timed out.');
    }, INCOMING_REQUEST_TIMEOUT_SECONDS * 1000);

    return () => clearIncomingTimers();
  }, [incomingJob, clearIncomingTimers, closeIncomingRequest, dismissJob]);

  const stats = [
    { label: 'Rating', value: providerRating > 0 ? providerRating.toFixed(1) : '-', icon: Star, color: '#F59E0B' },
    { label: 'Jobs', value: `${completedCount}`, icon: CheckCircle, color: '#008CE5' },
    { label: 'Acceptance', value: `${acceptanceRate}%`, icon: TrendingUp, color: '#22C55E' },
  ];

  // Filter out declined jobs from the pending list
  const visiblePendingJobs = pendingJobs.filter(j => !declinedJobs.current.has(j.id));

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ backgroundColor: '#FFFFFF' }}>
      {/* Full-screen map background */}
      <div className="absolute inset-0 z-0">
        {isLoaded && !loadError ? (
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={center}
            zoom={15}
            onLoad={onLoad}
            onUnmount={onUnmount}
            options={{
              disableDefaultUI: true,
              gestureHandling: 'greedy',
            }}
          >
            {currentLocation && (
              <>
                <MarkerF
                  position={{ lat: currentLocation.latitude, lng: currentLocation.longitude }}
                  icon={{
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 10,
                    fillColor: isOnline ? '#22C55E' : '#6B7280',
                    fillOpacity: 1,
                    strokeColor: '#FFFFFF',
                    strokeWeight: 3,
                  }}
                />
                <CircleF
                  center={{ lat: currentLocation.latitude, lng: currentLocation.longitude }}
                  radius={currentLocation.accuracy || 50}
                  options={{
                    fillColor: isOnline ? '#22C55E' : '#6B7280',
                    fillOpacity: 0.08,
                    strokeColor: isOnline ? '#22C55E' : '#6B7280',
                    strokeOpacity: 0.2,
                    strokeWeight: 1,
                  }}
                />
              </>
            )}
          </GoogleMap>
        ) : (
          <div className="h-full bg-gray-100" />
        )}
        {/* Gradient overlays for readability — white fading */}
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white/80 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-80 bg-gradient-to-t from-white via-white/90 to-transparent" />
      </div>

      {/* Incoming request overlay */}
      {incomingJob && createPortal(
        <div
          className="fixed inset-0 z-[2147483000] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(10, 16, 28, 0.72)' }}
        >
          <div
            className="w-full max-w-md rounded-[28px] p-5 border"
            style={{
              background: 'linear-gradient(180deg, rgba(0,140,229,0.2) 0%, rgba(255,255,255,0.96) 28%, rgba(255,255,255,0.99) 100%)',
              borderColor: 'rgba(0,140,229,0.25)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
              maxHeight: 'min(86vh, 760px)',
              overflowY: 'auto',
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="relative w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'rgba(0,140,229,0.14)' }}>
                  <Bell className="w-6 h-6" style={{ color: '#008CE5' }} />
                  <span className="absolute inset-0 rounded-2xl border border-[#008CE5]/50 animate-ping" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#6B7280' }}>Incoming Request</p>
                  <p className="font-bold text-lg" style={{ color: '#1A1F2E' }}>Accept Job?</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold" style={{ color: '#6B7280' }}>Auto-dismiss</p>
                <p className="text-xl font-extrabold tabular-nums" style={{ color: '#EF4444' }}>{incomingCountdown}s</p>
              </div>
            </div>

            <div className="rounded-2xl p-4 mb-4" style={{ backgroundColor: '#F8FAFC', border: '1px solid #E5E7EB' }}>
              <p className="font-semibold text-base mb-1" style={{ color: '#1A1F2E' }}>{(incomingJob.service as any)?.name || 'Service Request'}</p>
              <p className="text-sm mb-2" style={{ color: '#374151' }}>{incomingJob.pickup_address || 'Nearby location'}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium" style={{ color: '#6B7280' }}>Arrived {getTimeAgo(incomingJob.created_at)}</span>
                <span className="font-bold text-lg" style={{ color: '#008CE5' }}>
                  ${(Number(incomingJob.total_amount) || Number(incomingJob.base_price) || 0).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  const jobId = incomingJob.id;
                  closeIncomingRequest();
                  dismissJob(jobId, false);
                }}
                className="h-12 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
                style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.35)', touchAction: 'manipulation' }}
              >
                <X className="w-4 h-4" />
                Decline
              </button>
              <button
                onClick={() => {
                  const selected = incomingJob;
                  closeIncomingRequest();
                  navigatingToJob.current = true;
                  navigate(`/provider/request/${selected.id}`);
                }}
                className="h-12 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 text-white"
                style={{ background: 'linear-gradient(135deg, #008CE5, #0070B8)', boxShadow: '0 10px 20px rgba(0,140,229,0.35)', touchAction: 'manipulation' }}
              >
                Accept
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Header */}
      <div className="relative z-10 p-6 flex items-center justify-between" style={{ paddingTop: 'calc(env(safe-area-inset-top, 16px) + 16px)' }}>
        <div>
          <p className="text-sm" style={{ color: '#6B7280' }}>Provider Dashboard</p>
          <h1 className="text-2xl font-bold" style={{ color: '#1A1F2E' }}>
            {profile?.first_name ? `Hey, ${profile.first_name}` : 'TORC Provider'}
          </h1>
        </div>
        <button
          onClick={() => navigate('/provider/profile')}
          className="rounded-full p-3"
          style={{ backgroundColor: 'rgba(0,0,0,0.06)', touchAction: 'manipulation' }}
        >
          <Settings className="w-6 h-6" style={{ color: '#1A1F2E' }} />
        </button>
      </div>

      {/* Big online/offline toggle */}
      <div className="relative z-10 px-6 mt-4 mb-6">
        <button
          onClick={toggleOnline}
          className="w-full rounded-[28px] p-6 text-left border-2 transition-all duration-300"
          style={isOnline ? {
            background: 'linear-gradient(135deg, #22C55E, #16A34A)',
            borderColor: '#22C55E',
            boxShadow: '0 12px 40px rgba(34, 197, 94, 0.4)',
            touchAction: 'manipulation',
          } : {
            background: 'rgba(255,255,255,0.92)',
            borderColor: '#E5E7EB',
            boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
            touchAction: 'manipulation',
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ backgroundColor: isOnline ? 'rgba(255,255,255,0.25)' : '#F3F4F6' }}
              >
                <Power className="w-8 h-8" style={{ color: isOnline ? '#FFFFFF' : '#9CA3AF' }} />
              </div>
              <div>
                <h2 className="text-2xl font-bold" style={{ color: isOnline ? '#FFFFFF' : '#1A1F2E' }}>
                  {isOnline ? "You're Online" : "You're Offline"}
                </h2>
                <p className="text-sm" style={{ color: isOnline ? 'rgba(255,255,255,0.85)' : '#6B7280' }}>
                  {isOnline ? 'Accepting requests nearby' : 'Tap to go online'}
                </p>
              </div>
            </div>
            {/* Toggle switch */}
            <div className="w-14 h-8 rounded-full relative transition-all duration-300"
              style={{ backgroundColor: isOnline ? 'rgba(255,255,255,0.3)' : '#E5E7EB' }}
            >
              <div className="absolute w-6 h-6 rounded-full top-1 transition-all duration-300 shadow-lg"
                style={isOnline
                  ? { right: '4px', backgroundColor: '#FFFFFF' }
                  : { left: '4px', backgroundColor: '#9CA3AF' }
                }
              />
            </div>
          </div>
        </button>
      </div>

      {/* Stats row */}
      <div className="relative z-10 px-6 mb-4">
        <div className="grid grid-cols-3 gap-3">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="rounded-2xl p-4 text-center"
                style={{ backgroundColor: 'rgba(255,255,255,0.92)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid #E5E7EB' }}
              >
                <Icon className="w-5 h-5 mx-auto mb-1.5" style={{ color: stat.color }} />
                <p className="font-bold text-lg" style={{ color: '#1A1F2E' }}>{stat.value}</p>
                <p className="text-xs" style={{ color: '#6B7280' }}>{stat.label}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Active requests / pending jobs queue */}
      <div className="relative z-10 px-6">
        <div className="rounded-[24px] p-5"
          style={{ backgroundColor: 'rgba(255,255,255,0.92)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid #E5E7EB' }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-base" style={{ color: '#1A1F2E' }}>Active Requests</h3>
            {visiblePendingJobs.length > 0 && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: '#008CE5', color: '#FFFFFF' }}>
                {visiblePendingJobs.length}
              </span>
            )}
          </div>

          {isOnline ? (
            visiblePendingJobs.length > 0 ? (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {visiblePendingJobs.map((job) => {
                  const price = job.total_amount
                    ? `$${Number(job.total_amount).toFixed(2)}`
                    : (job.base_price ? `$${Number(job.base_price).toFixed(2)}` : '-');
                  const serviceName = (job.service as any)?.name || 'Service Request';
                  const timeAgo = getTimeAgo(job.created_at);

                  return (
                    <div key={job.id} className="relative">
                      <button
                        onClick={() => {
                          closeIncomingRequest();
                          navigate(`/provider/request/${job.id}`);
                        }}
                        className="w-full rounded-2xl p-4 text-left transition-all"
                        style={{
                          backgroundColor: '#F9FAFB',
                          border: '1px solid #E5E7EB',
                          touchAction: 'manipulation',
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ background: 'linear-gradient(135deg, #008CE5, #0070B8)' }}>
                            <Navigation className="w-5 h-5" style={{ color: '#FFFFFF' }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-0.5">
                              <p className="font-semibold text-sm truncate" style={{ color: '#1A1F2E' }}>{serviceName}</p>
                              <p className="font-bold text-sm flex-shrink-0 ml-2" style={{ color: '#22C55E' }}>{price}</p>
                            </div>
                            <p className="text-xs truncate" style={{ color: '#6B7280' }}>
                              {job.pickup_address || 'Location pending'}
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: '#9CA3AF' }}>{timeAgo}</p>
                          </div>
                        </div>
                      </button>
                      {/* Dismiss / remove button */}
                      <button
                        onClick={(e) => handleDismissJob(job.id, e)}
                        className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center"
                        style={{
                          backgroundColor: 'rgba(0,0,0,0.06)',
                          touchAction: 'manipulation',
                        }}
                      >
                        <X className="w-4 h-4" style={{ color: '#6B7280' }} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3"
                  style={{ backgroundColor: 'rgba(34,197,94,0.1)' }}
                >
                  <MapPin className="w-8 h-8" style={{ color: '#22C55E' }} />
                </div>
                <p className="text-sm mb-1" style={{ color: '#374151' }}>Waiting for requests...</p>
                <p className="text-xs" style={{ color: '#9CA3AF' }}>We'll notify you when someone needs help</p>
              </div>
            )
          ) : (
            <div className="text-center py-8">
              <p className="text-sm" style={{ color: '#9CA3AF' }}>Go online to start receiving requests</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="relative z-10 px-6 mt-4 pb-28">
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => navigate('/provider/earnings')}
            className="rounded-2xl p-4 text-left"
            style={{ backgroundColor: 'rgba(255,255,255,0.92)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid #E5E7EB', touchAction: 'manipulation' }}
          >
            <DollarSign className="w-7 h-7 mb-2" style={{ color: '#008CE5' }} />
            <p className="font-semibold text-sm" style={{ color: '#1A1F2E' }}>Earnings</p>
            <p className="text-xs" style={{ color: '#6B7280' }}>View payouts</p>
          </button>
          <button
            onClick={() => navigate('/provider/profile')}
            className="rounded-2xl p-4 text-left"
            style={{ backgroundColor: 'rgba(255,255,255,0.92)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid #E5E7EB', touchAction: 'manipulation' }}
          >
            <Settings className="w-7 h-7 mb-2" style={{ color: '#0070B8' }} />
            <p className="font-semibold text-sm" style={{ color: '#1A1F2E' }}>Settings</p>
            <p className="text-xs" style={{ color: '#6B7280' }}>Manage profile</p>
          </button>
        </div>
      </div>

      <ProviderBottomNav />
    </div>
  );
}

function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}
