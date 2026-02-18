import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { CustomerBottomNav } from '../../components/CustomerBottomNav';
import { Menu, Bell, Navigation2 } from 'lucide-react';
import { useLocation as useLocationCtx } from '../../context/LocationContext';
import { useAuth } from '../../context/AuthContext';
import { useGoogleMaps } from '../../context/GoogleMapsContext';
import { GoogleMap, MarkerF, CircleF } from '@react-google-maps/api';
import { useCallback, useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';

const mapContainerStyle = {
  width: '100%',
  height: '100%',
  borderRadius: '24px',
};

const darkMapStyles = [
  { elementType: 'geometry', stylers: [{ color: '#1A1F2E' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1A1F2E' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6B7280' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2A3441' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1A1F2E' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#323B4C' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#252B3D' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1A2E20' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#252B3D' }] },
];

const lightMapStyles = [
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
];

const defaultCenter = { lat: 37.7749, lng: -122.4194 };

export function HomeMap() {
  const navigate = useNavigate();
  const { currentLocation, address, loading: locationLoading, getCurrentLocation } = useLocationCtx();
  const { user, profile } = useAuth();
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

  const displayName = profile?.first_name
    ? `${profile.first_name}`
    : user?.email?.split('@')[0] || 'there';

  const totalSaves = profile?.total_jobs ?? 0;
  const avgResponse = profile?.avg_response ?? '-';
  const rating = profile?.rating ?? '-';

  const textColor = isDark ? '#FFFFFF' : '#1A1F2E';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB';

  return (
    <div className="h-screen flex flex-col relative overflow-hidden" style={{ background: isDark ? '#0F1419' : '#F5F7FA' }}>
      {/* Location permission banner */}
      {permissionStatus !== 'granted' && !locationLoading && (
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="relative z-30 mx-4 mt-2 rounded-2xl p-4 flex items-center gap-3"
          style={{ backgroundColor: 'rgba(46,255,175,0.1)', border: '1px solid rgba(46,255,175,0.2)' }}
        >
          <Navigation2 className="w-5 h-5 flex-shrink-0" style={{ color: '#2EFFAF' }} />
          <div className="flex-1">
            <p className="text-sm font-medium" style={{ color: textColor }}>Enable location access</p>
            <p className="text-xs" style={{ color: subColor }}>We need your location to find nearby providers</p>
          </div>
          <button onClick={() => requestPermission()} className="px-4 py-2 rounded-xl text-sm font-bold text-[#0F1419] bg-[#2EFFAF]">
            Allow
          </button>
        </motion.div>
      )}

      {/* Top bar */}
      <div className="relative z-20 p-4 pt-6 flex items-center justify-between">
        <motion.button
          whileTap={{ scale: 0.9 }}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}
        >
          <Menu className="w-5 h-5" style={{ color: textColor }} />
        </motion.button>

        <img src="/logo.png" alt="TORC" className="h-8 object-contain" />

        <motion.button
          whileTap={{ scale: 0.9 }}
          className="w-10 h-10 rounded-full flex items-center justify-center relative"
          style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}
          onClick={() => navigate('/customer/notifications')}
        >
          <Bell className="w-5 h-5" style={{ color: textColor }} />
          <div className="absolute top-2 right-2 w-2 h-2 bg-[#2EFFAF] rounded-full" />
        </motion.button>
      </div>

      {/* Map area */}
      <div className="flex-1 relative z-10 mx-4 mb-3 rounded-[24px] overflow-hidden">
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
                    fillColor: '#059669',
                    fillOpacity: 0.08,
                    strokeColor: '#059669',
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
                    fillColor: '#059669',
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
            <div className="w-10 h-10 border-4 border-[#2EFFAF] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Recenter button */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={recenterMap}
          className="absolute bottom-4 right-4 z-20 glass rounded-full p-3 shadow-lg"
        >
          <Navigation2 className="w-5 h-5 text-[#2EFFAF]" />
        </motion.button>
      </div>

      {/* Current location card */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="relative z-10 px-4">
        <div className="rounded-2xl p-4 text-center" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
          <p className="text-sm mb-1" style={{ color: subColor }}>
            {locationLoading ? 'Finding your location...' : 'Current Location'}
          </p>
          {address ? (
            <>
              <p className="font-semibold" style={{ color: textColor }}>{address.split(',')[0]}</p>
              <p className="text-sm" style={{ color: subColor }}>{address.split(',').slice(1).join(',').trim()}</p>
            </>
          ) : (
            <p className="text-sm" style={{ color: subColor }}>
              {locationLoading ? 'Locating...' : 'Location unavailable'}
            </p>
          )}
        </div>
      </motion.div>

      {/* Quick stats */}
      <div className="relative z-10 px-4 mt-3 mb-3">
        <div className="rounded-2xl p-4 grid grid-cols-3 gap-4" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
          <div className="text-center">
            <p className="text-xl font-bold" style={{ color: '#2EFFAF' }}>{totalSaves}</p>
            <p className="text-xs mt-0.5" style={{ color: subColor }}>Total Saves</p>
          </div>
          <div className="text-center border-x" style={{ borderColor: cardBorder }}>
            <p className="text-xl font-bold" style={{ color: '#007AFF' }}>{avgResponse}</p>
            <p className="text-xs mt-0.5" style={{ color: subColor }}>Avg Response</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold" style={{ color: '#2EFFAF' }}>{rating}</p>
            <p className="text-xs mt-0.5" style={{ color: subColor }}>Your Rating</p>
          </div>
        </div>
      </div>

      {/* Request help button */}
      <div className="relative z-10 px-4 pb-24">
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/who-needs-help')}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0F1419] font-bold text-lg shadow-lg shadow-[#2EFFAF]/30"
        >
          Request Assistance
        </motion.button>
      </div>

      <CustomerBottomNav />
    </div>
  );
}
