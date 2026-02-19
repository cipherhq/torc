import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router';
import { Power, Settings, DollarSign, MapPin, Clock, TrendingUp, Navigation, Bell, MessageCircle } from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useGoogleMaps } from '../../context/GoogleMapsContext';
import { GoogleMap, Marker } from '@react-google-maps/api';
import { supabase } from '../../lib/supabase';

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

    // Ring pattern: 3 cycles, then stop.
    const ringOffsets = [0, 0.7, 1.4];
    ringOffsets.forEach((offset) => {
      const oscA = ctx.createOscillator();
      const oscB = ctx.createOscillator();
      const gain = ctx.createGain();

      oscA.type = 'sine';
      oscB.type = 'triangle';
      oscA.frequency.setValueAtTime(880, ctx.currentTime + offset);
      oscB.frequency.setValueAtTime(1175, ctx.currentTime + offset);

      gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.28, ctx.currentTime + offset + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.45);

      oscA.connect(gain);
      oscB.connect(gain);
      gain.connect(ctx.destination);

      oscA.start(ctx.currentTime + offset);
      oscB.start(ctx.currentTime + offset + 0.08);
      oscA.stop(ctx.currentTime + offset + 0.45);
      oscB.stop(ctx.currentTime + offset + 0.45);
    });
  } catch { /* Audio not supported */ }
}

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#1A1F2E' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1A1F2E' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6B7280' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2A3040' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1A1F2E' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#333B4D' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0E1621' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

const lightMapStyle = [
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry.fill', stylers: [{ color: '#c9e7f7' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#E5E7EB' }] },
  { featureType: 'landscape', elementType: 'geometry.fill', stylers: [{ color: '#F0F4F8' }] },
];

const mapContainerStyle = { width: '100%', height: '100%' };

export function ProviderHome() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { isDark } = useTheme();
  const { isLoaded } = useGoogleMaps();
  const [isOnline, setIsOnline] = useState(false);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [providerRating, setProviderRating] = useState(0);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [currentPos, setCurrentPos] = useState<{ lat: number; lng: number } | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const [incomingJob, setIncomingJob] = useState<any>(null);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  // Get provider's current location
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCurrentPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setCurrentPos(null),
      { enableHighAccuracy: true }
    );

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCurrentPos(newPos);
        if (mapRef.current) mapRef.current.panTo(newPos);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

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
          .maybeSingle();

        if (pp) {
          setProviderRating(pp.rating || 0);
          setIsOnline(pp.is_online || false);
        }
      } catch (e) { console.warn('Failed to load provider stats:', e); }
    }
    loadStats();
  }, [user]);

  // Listen for new jobs via Broadcast (doesn't require RLS)
  useEffect(() => {
    if (!isOnline || !user) return;

    const channel = supabase
      .channel('new-job-broadcast')
      .on('broadcast', { event: 'new_job' }, (payload) => {
        const job = payload.payload;
        if (job?.id) {
          setPendingRequests(prev => {
            if (prev.some(r => r.id === job.id)) return prev;
            return [job, ...prev];
          });
          // Play notification sound + vibrate
          playNotificationSound();
          if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification('New TORC service request', {
              body: job.pickup_address || 'A customer nearby needs help.',
              tag: `job-${job.id}`,
              requireInteraction: true,
            });
          }
          // Show incoming job banner
          setIncomingJob(job);
          // Auto-navigate after 3 seconds
          setTimeout(() => {
            setIncomingJob(null);
            navigate(`/request/${job.id}`, { state: { broadcastJob: job } });
          }, 3000);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isOnline, user, navigate]);

  // Also poll for pending jobs (backup in case broadcast is missed)
  useEffect(() => {
    if (!isOnline || !user) return;

    async function loadPending() {
      const { data } = await supabase
        .from('jobs')
        .select('id, service_id, pickup_address, total_amount, created_at')
        .eq('status', 'pending')
        .is('provider_id', null)
        .order('created_at', { ascending: false });
      if (data) setPendingRequests(data);
    }
    loadPending();

    // Poll every 10 seconds as a backup
    const pollInterval = setInterval(loadPending, 10000);

    return () => { clearInterval(pollInterval); };
  }, [isOnline, user]);

  const toggleOnline = async () => {
    const newStatus = !isOnline;
    setIsOnline(newStatus);
    if (user) {
      await supabase.from('provider_profiles').upsert({ id: user.id, is_online: newStatus }).select();
    }
  };

  const stats = [
    { label: 'Today', value: `$${todayEarnings}`, icon: DollarSign, color: '#2EFFAF' },
    { label: 'Jobs', value: `${completedCount}`, icon: Clock, color: '#007AFF' },
    { label: 'Rating', value: providerRating > 0 ? providerRating.toFixed(1) : '-', icon: TrendingUp, color: '#2EFFAF' },
  ];

  const defaultCenter = currentPos || { lat: 40.7128, lng: -74.006 };

  // Theme-aware colors
  const textColor = isDark ? '#FFFFFF' : '#1A1F2E';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.92)';
  const cardBorder = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)';
  const offlineBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.92)';
  const offlineBorder = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  const overlayGradient = isDark
    ? 'linear-gradient(to bottom, rgba(15,20,25,0.7) 0%, rgba(15,20,25,0.1) 35%, rgba(15,20,25,0.1) 50%, rgba(15,20,25,0.85) 75%, rgba(15,20,25,1) 100%)'
    : 'linear-gradient(to bottom, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.0) 35%, rgba(255,255,255,0.0) 50%, rgba(245,247,250,0.9) 75%, rgba(245,247,250,1) 100%)';

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ backgroundColor: isDark ? '#0F1419' : '#F5F7FA' }}>
      {/* Full-screen Google Map */}
      <div className="absolute inset-0 z-0">
        {isLoaded && currentPos ? (
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={defaultCenter}
            zoom={15}
            onLoad={onMapLoad}
            options={{
              styles: isDark ? darkMapStyle : lightMapStyle,
              disableDefaultUI: true,
              zoomControl: false,
              mapTypeControl: false,
              streetViewControl: false,
              fullscreenControl: false,
              gestureHandling: 'greedy',
            }}
          >
            {currentPos && (
              <Marker
                position={currentPos}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 10,
                  fillColor: '#2EFFAF',
                  fillOpacity: 1,
                  strokeColor: isDark ? '#FFFFFF' : '#1A1F2E',
                  strokeWeight: 3,
                }}
              />
            )}
          </GoogleMap>
        ) : (
          <div className="w-full h-full" style={{ backgroundColor: isDark ? '#1A1F2E' : '#E8ECF0' }}>
            <div className="absolute inset-0" style={{ opacity: isDark ? 0.15 : 0.3 }}>
              <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke={isDark ? 'rgba(46,255,175,0.4)' : 'rgba(0,122,255,0.15)'} strokeWidth="0.5"/>
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* Gradient overlay */}
      <div className="absolute inset-0 z-[1] pointer-events-none" style={{ background: overlayGradient }} />

      {/* Incoming Job Notification Banner */}
      <AnimatePresence>
        {incomingJob && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="fixed top-0 left-0 right-0 z-50 p-4 pt-12"
            style={{ background: 'linear-gradient(135deg, rgba(46,255,175,0.95) 0%, rgba(0,200,130,0.95) 100%)' }}
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-xl flex items-center justify-center">
                <Bell className="w-7 h-7 text-white animate-bounce" />
              </div>
              <div className="flex-1">
                <p className="text-white font-bold text-lg">New Service Request!</p>
                <p className="text-white/80 text-sm">
                  {incomingJob.pickup_address || 'Nearby location'}
                </p>
                {incomingJob.total_amount && (
                  <p className="text-white font-semibold mt-0.5">${incomingJob.total_amount}</p>
                )}
              </div>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => {
                  setIncomingJob(null);
                  navigate(`/request/${incomingJob.id}`, { state: { broadcastJob: incomingJob } });
                }}
                className="px-5 py-2.5 rounded-xl font-bold text-sm"
                style={{ backgroundColor: 'rgba(255,255,255,0.25)', color: '#FFFFFF', backdropFilter: 'blur(10px)' }}
              >
                View
              </motion.button>
            </div>
            {/* Auto-dismiss progress bar */}
            <motion.div
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: 3, ease: 'linear' }}
              className="h-1 rounded-full bg-white/40 mt-3 origin-left"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content overlay */}
      <div className="relative z-10 flex flex-col min-h-screen pb-24">
        {/* Header */}
        <div className="p-6 flex items-center justify-between">
          <div>
            <p className="text-sm" style={{ color: subColor }}>Provider Dashboard</p>
            <h1 className="text-3xl font-bold" style={{ color: textColor }}>TORC Provider</h1>
          </div>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate('/profile')}
            className="w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-xl"
            style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)', border: `1px solid ${cardBorder}` }}
          >
            <Settings className="w-5 h-5" style={{ color: textColor }} />
          </motion.button>
        </div>

        {/* Spacer to push content down over map */}
        <div className="flex-1 min-h-[200px]" />

        {/* Bottom content panel */}
        <div className="px-4 space-y-4">
          {/* Online status toggle */}
          <motion.div
            whileTap={{ scale: 0.98 }}
            onClick={toggleOnline}
            className="rounded-[28px] p-5 cursor-pointer transition-all backdrop-blur-xl"
            style={{
              background: isOnline
                ? 'linear-gradient(135deg, #2EFFAF, #007AFF)'
                : offlineBg,
              border: isOnline ? 'none' : `1px solid ${offlineBorder}`,
              boxShadow: isOnline
                ? '0 8px 32px rgba(46,255,175,0.35)'
                : (isDark ? 'none' : '0 2px 12px rgba(0,0,0,0.06)'),
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{ backgroundColor: isOnline ? 'rgba(255,255,255,0.2)' : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)') }}>
                  <Power className="w-7 h-7" style={{ color: isOnline ? '#0F1419' : (isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF') }} />
                </div>
                <div>
                  <h2 className="text-xl font-bold" style={{ color: isOnline ? '#0F1419' : textColor }}>
                    {isOnline ? "You're Online" : "You're Offline"}
                  </h2>
                  <p className="text-sm" style={{ color: isOnline ? 'rgba(15,20,25,0.7)' : subColor }}>
                    {isOnline ? 'Ready to accept requests' : 'Tap to go online'}
                  </p>
                </div>
              </div>
              <div className="w-12 h-7 rounded-full relative transition-all"
                style={{ backgroundColor: isOnline ? 'rgba(15,20,25,0.25)' : (isDark ? 'rgba(255,255,255,0.1)' : '#D1D5DB') }}>
                <div className="absolute w-5 h-5 rounded-full top-1 transition-all shadow-lg"
                  style={{
                    backgroundColor: isOnline ? '#0F1419' : (isDark ? 'rgba(255,255,255,0.5)' : '#FFFFFF'),
                    right: isOnline ? '4px' : 'auto',
                    left: isOnline ? 'auto' : '4px',
                  }} />
              </div>
            </div>
          </motion.div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            {stats.map((stat, index) => {
              const Icon = stat.icon;
              return (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="rounded-2xl p-3.5 text-center backdrop-blur-xl"
                  style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}`, boxShadow: isDark ? 'none' : '0 2px 8px rgba(0,0,0,0.04)' }}
                >
                  <Icon className="w-5 h-5 mx-auto mb-1.5" style={{ color: stat.color }} />
                  <p className="font-bold text-lg leading-tight" style={{ color: textColor }}>{stat.value}</p>
                  <p className="text-[11px]" style={{ color: subColor }}>{stat.label}</p>
                </motion.div>
              );
            })}
          </div>

          {/* Active requests */}
          <div className="rounded-[28px] p-5 backdrop-blur-xl"
            style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}`, boxShadow: isDark ? 'none' : '0 2px 12px rgba(0,0,0,0.04)' }}>
            <h3 className="font-semibold text-base mb-3" style={{ color: textColor }}>Active Requests</h3>

            {isOnline ? (
              pendingRequests.length > 0 ? (
                <div className="space-y-2.5">
                  <p className="text-xs font-medium" style={{ color: '#2EFFAF' }}>{pendingRequests.length} pending request{pendingRequests.length !== 1 ? 's' : ''}</p>
                  {pendingRequests.slice(0, 3).map((req) => (
                    <motion.button
                      key={req.id}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => navigate(`/request/${req.id}`)}
                      className="w-full rounded-2xl p-3.5 flex items-center gap-3 text-left"
                      style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F9FAFB', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB'}` }}
                    >
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: 'rgba(46,255,175,0.15)' }}>
                        <MapPin className="w-5 h-5" style={{ color: '#2EFFAF' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate" style={{ color: textColor }}>{req.pickup_address || 'Service Request'}</p>
                        <p className="text-xs" style={{ color: subColor }}>{req.total_amount ? `$${req.total_amount}` : 'View details'}</p>
                      </div>
                      <div className="text-xs font-semibold" style={{ color: '#2EFFAF' }}>View</div>
                    </motion.button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3"
                    style={{ backgroundColor: 'rgba(46,255,175,0.15)' }}
                  >
                    <Navigation className="w-8 h-8" style={{ color: '#2EFFAF' }} />
                  </motion.div>
                  <p className="text-sm mb-1" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#374151' }}>Waiting for requests...</p>
                  <p className="text-xs" style={{ color: subColor }}>We'll notify you when someone needs help</p>
                </div>
              )
            ) : (
              <div className="text-center py-8">
                <p className="text-sm" style={{ color: subColor }}>Go online to start receiving requests</p>
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-3 gap-3 pb-4">
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate('/earnings')}
              className="rounded-2xl p-4 text-left backdrop-blur-xl"
              style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}`, boxShadow: isDark ? 'none' : '0 2px 8px rgba(0,0,0,0.04)' }}
            >
              <DollarSign className="w-7 h-7 mb-1.5" style={{ color: '#2EFFAF' }} />
              <p className="font-semibold text-sm" style={{ color: textColor }}>Earnings</p>
              <p className="text-xs" style={{ color: subColor }}>View payouts</p>
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate('/provider/messages')}
              className="rounded-2xl p-4 text-left backdrop-blur-xl"
              style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}`, boxShadow: isDark ? 'none' : '0 2px 8px rgba(0,0,0,0.04)' }}
            >
              <MessageCircle className="w-7 h-7 mb-1.5" style={{ color: '#2EFFAF' }} />
              <p className="font-semibold text-sm" style={{ color: textColor }}>Messages</p>
              <p className="text-xs" style={{ color: subColor }}>Chat with users</p>
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate('/profile')}
              className="rounded-2xl p-4 text-left backdrop-blur-xl"
              style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}`, boxShadow: isDark ? 'none' : '0 2px 8px rgba(0,0,0,0.04)' }}
            >
              <Settings className="w-7 h-7 mb-1.5" style={{ color: '#007AFF' }} />
              <p className="font-semibold text-sm" style={{ color: textColor }}>Settings</p>
              <p className="text-xs" style={{ color: subColor }}>Manage profile</p>
            </motion.button>
          </div>
        </div>
      </div>

    </div>
  );
}
