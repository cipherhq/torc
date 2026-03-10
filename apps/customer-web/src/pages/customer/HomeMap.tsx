import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { CustomerBottomNav } from '../../components/CustomerBottomNav';
import { Bell, Navigation2 } from 'lucide-react';
import { useLocation as useLocationCtx } from '../../context/LocationContext';
import { useAuth } from '../../context/AuthContext';
import { useGoogleMaps } from '../../context/GoogleMapsContext';
import { GoogleMap, MarkerF, CircleF } from '@react-google-maps/api';
import { useCallback, useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../lib/supabase';

const mapContainerStyle = {
  width: '100%',
  height: '100%',
  borderRadius: '24px',
};

const darkMapStyles = [
  { elementType: 'geometry', stylers: [{ color: '#14263D' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#14263D' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6B7280' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2A3441' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#14263D' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#323B4C' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#1B2F4A' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1A2E20' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#1B2F4A' }] },
];

const lightMapStyles = [
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
];

const defaultCenter = { lat: 37.7749, lng: -122.4194 };

export function HomeMap() {
  const navigate = useNavigate();
  const { currentLocation, address, loading: locationLoading, getCurrentLocation } = useLocationCtx();
  const { user, profile, refreshProfile } = useAuth();
  const { isLoaded, loadError } = useGoogleMaps();
  const { isDark } = useTheme();
  const [map, setMap] = useState<google.maps.Map | null>(null);

  const center = currentLocation
    ? { lat: currentLocation.latitude, lng: currentLocation.longitude }
    : defaultCenter;

  const onLoad = useCallback((map: google.maps.Map) => {
    setMap(map);
  }, []);

  const onUnmount = useCallback(() => {
    setMap(null);
  }, []);

  const recenterMap = () => {
    if (map && currentLocation) {
      map.panTo({ lat: currentLocation.latitude, lng: currentLocation.longitude });
      map.setZoom(16);
    } else {
      getCurrentLocation();
    }
  };

  const { permissionStatus, requestPermission } = useLocationCtx();

  useEffect(() => {
    if (permissionStatus === 'prompt') {
      requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    Promise.resolve(refreshProfile?.()).catch(() => {});
  }, [user?.id]);

  const displayName = profile?.first_name
    ? `${profile.first_name}`
    : user?.email?.split('@')[0] || 'there';

  const [totalSaves, setTotalSaves] = useState(0);
  const [activeJob, setActiveJob] = useState<{ id: string; status: string; service_name?: string } | null>(null);
  const rating = profile?.rating ?? '-';

  // Count completed jobs for this customer
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', user.id)
      .eq('status', 'completed')
      .then(({ count }) => {
        if (count !== null) setTotalSaves(count);
      });
  }, [user?.id]);

  // Check for active in-progress jobs (crash recovery banner)
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const hasCleaned = { current: false };
    async function check() {
      const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

      // One-time cleanup of stale jobs older than 12 hours
      if (!hasCleaned.current) {
        hasCleaned.current = true;
        supabase
          .from('jobs')
          .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancellation_reason: 'auto_expired_stale' })
          .eq('customer_id', user!.id)
          .in('status', ['pending', 'matching', 'accepted', 'en_route', 'enroute', 'arrived', 'in_progress', 'inprogress'])
          .lt('created_at', twelveHoursAgo)
          .then(() => {});
      }

      const { data } = await supabase
        .from('jobs')
        .select('id, status, services(name)')
        .eq('customer_id', user!.id)
        .in('status', ['pending', 'matching', 'accepted', 'en_route', 'enroute', 'arrived', 'in_progress', 'inprogress'])
        .gte('created_at', twelveHoursAgo)
        .limit(1)
        .maybeSingle();
      if (!cancelled && data) {
        setActiveJob({ id: data.id, status: data.status, service_name: (data as any).services?.name });
      } else if (!cancelled) {
        setActiveJob(null);
      }
    }
    check();
    const interval = setInterval(check, 8000);
    const handleVis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', handleVis);
    return () => { cancelled = true; clearInterval(interval); document.removeEventListener('visibilitychange', handleVis); };
  }, [user?.id]);

  // Calculate "Member Since" from user's created_at or profile created_at
  const memberSince = (() => {
    const dateStr = profile?.created_at || user?.created_at;
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[d.getMonth()]} ${d.getFullYear()}`;
  })();

  const textColor = isDark ? '#FFFFFF' : '#14263D';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2';

  return (
    <div className="h-screen flex flex-col relative overflow-hidden" style={{ background: isDark ? 'linear-gradient(180deg, #0A1626 0%, #081427 100%)' : 'linear-gradient(180deg, #F8FBFF 0%, #EAF2FF 100%)', paddingTop: 'var(--safe-top)' }}>
      {/* Location permission banner */}
      {permissionStatus !== 'granted' && !locationLoading && (
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="relative z-30 mx-4 mt-2 rounded-2xl p-4 flex items-center gap-3"
          style={{ backgroundColor: 'rgba(0,140,229,0.1)', border: '1px solid rgba(0,140,229,0.2)' }}
        >
          <Navigation2 className="w-5 h-5 flex-shrink-0" style={{ color: '#008CE5' }} />
          <div className="flex-1">
            <p className="text-sm font-medium" style={{ color: textColor }}>Enable location access</p>
            <p className="text-xs" style={{ color: subColor }}>We need your location to find nearby providers</p>
          </div>
          <button onClick={() => requestPermission()} className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-[#008CE5]">
            Allow
          </button>
        </motion.div>
      )}

      {/* Top bar */}
      <div className="relative z-20 p-4 flex items-center justify-between">
        <div className="w-10 h-10" />

        <img src="/logo.svg" alt="TORC" className="h-8 object-contain" />

        <motion.button
          whileTap={{ scale: 0.9 }}
          className="w-10 h-10 rounded-full flex items-center justify-center relative"
          style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}
          onClick={() => navigate('/customer/notifications')}
        >
          <Bell className="w-5 h-5" style={{ color: textColor }} />
          <div className="absolute top-2 right-2 w-2 h-2 bg-[#008CE5] rounded-full" />
        </motion.button>
      </div>

      {/* Map area */}
      <div className="flex-1 min-h-0 relative z-10 mx-4 mb-3 rounded-[24px] overflow-hidden">
        {isLoaded && !loadError ? (
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={center}
            zoom={15}
            onLoad={onLoad}
            onUnmount={onUnmount}
            options={{
              styles: isDark ? darkMapStyles : lightMapStyles,
              disableDefaultUI: true,
              zoomControl: false,
              mapTypeControl: false,
              streetViewControl: false,
              fullscreenControl: false,
              gestureHandling: 'greedy',
            }}
          >
            {currentLocation && (
              <>
                {/* Accuracy circle */}
                <CircleF
                  center={{ lat: currentLocation.latitude, lng: currentLocation.longitude }}
                  radius={currentLocation.accuracy || 50}
                  options={{
                    fillColor: '#008CE5',
                    fillOpacity: 0.08,
                    strokeColor: '#008CE5',
                    strokeOpacity: 0.2,
                    strokeWeight: 1,
                  }}
                />
                {/* User location marker */}
                <MarkerF
                  position={{ lat: currentLocation.latitude, lng: currentLocation.longitude }}
                  icon={{
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 10,
                    fillColor: '#008CE5',
                    fillOpacity: 1,
                    strokeColor: '#FFFFFF',
                    strokeWeight: 3,
                  }}
                />
              </>
            )}
          </GoogleMap>
        ) : loadError ? (
          <div className="h-full bg-white/5 rounded-[24px] flex items-center justify-center">
            <p className="text-white/60 text-sm">Map failed to load</p>
          </div>
        ) : (
          <div className="h-full bg-white/5 rounded-[24px] flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-[#008CE5] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Recenter button */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={recenterMap}
          className="absolute bottom-16 right-4 z-20 glass rounded-full p-3 shadow-lg"
        >
          <Navigation2 className="w-5 h-5 text-[#008CE5]" />
        </motion.button>

        {/* Current location card — overlaid on map */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="absolute bottom-3 left-3 right-3 z-20">
          <div className="rounded-2xl p-3 text-center backdrop-blur-md" style={{ backgroundColor: isDark ? 'rgba(10,22,38,0.85)' : 'rgba(255,255,255,0.92)', border: `1px solid ${cardBorder}` }}>
            <p className="text-xs mb-0.5" style={{ color: subColor }}>
              {locationLoading ? 'Finding your location...' : 'Current Location'}
            </p>
            {address ? (
              <>
                <p className="font-semibold text-sm" style={{ color: textColor }}>{address.split(',')[0]}</p>
                <p className="text-xs" style={{ color: subColor }}>{address.split(',').slice(1).join(',').trim()}</p>
              </>
            ) : (
              <p className="text-xs" style={{ color: subColor }}>
                {locationLoading ? 'Locating...' : 'Location unavailable'}
              </p>
            )}
          </div>
        </motion.div>
      </div>

      {/* Request help button */}
      {!activeJob && (
        <div className="relative z-10 px-4 mb-2 flex-shrink-0" style={{ paddingBottom: 'calc(70px + var(--safe-bottom, 0px))' }}>
          <button
            onClick={() => navigate('/who-needs-help')}
            className="torc-btn-primary"
          >
            Request Assistance
          </button>
        </div>
      )}

      {/* Bottom spacer when active job is showing (button hidden) */}
      {activeJob && (
        <div style={{ height: 'calc(70px + var(--safe-bottom, 0px))' }} />
      )}

      {/* Active job banner — crash recovery */}
      {activeJob && (
        <div className="fixed left-0 right-0 z-40" style={{ bottom: 'calc(75px + env(safe-area-inset-bottom, 0px))' }}>
          <button
            onClick={() => navigate(`/tracking/${activeJob.id}`)}
            className="mx-4 rounded-2xl px-4 py-3 flex items-center gap-3 active:scale-[0.98] transition-transform shadow-xl"
            style={{ background: 'linear-gradient(135deg, #008CE5, #0070B8)', boxShadow: '0 8px 24px rgba(0,140,229,0.5)' }}
          >
            <div className="w-3 h-3 rounded-full bg-white animate-pulse flex-shrink-0" />
            <div className="flex-1 text-left">
              <p className="text-white font-bold text-sm">Active Service — Tap to Track</p>
              <p className="text-white/70 text-xs">{activeJob.service_name || 'Roadside Assistance'}</p>
            </div>
            <span className="text-white text-lg font-bold">&rarr;</span>
          </button>
        </div>
      )}

      <CustomerBottomNav />
    </div>
  );
}
