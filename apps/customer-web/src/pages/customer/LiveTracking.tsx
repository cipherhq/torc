import { motion } from 'motion/react';
import { useNavigate, useParams } from 'react-router';
import { Phone, MessageCircle, Share2, Shield, Star, Clock, MapPin, Loader2, ArrowLeft, X, AlertTriangle, PhoneCall, Flag, MapPinned } from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleMap, MarkerF, DirectionsRenderer, PolylineF } from '@react-google-maps/api';
import { useGoogleMaps } from '../../context/GoogleMapsContext';
import { useLocation as useLocationCtx } from '../../context/LocationContext';
import { useRealtimeLocation, useWatchPosition } from '../../hooks/useRealtimeLocation';
import { useTheme } from '../../context/ThemeContext';
import { useJob } from '../../context/JobContext';
import { ChatModal } from '../../components/ChatModal';
import { callPhone, shareJobDetails } from '../../utils/communication';
import { supabase } from '../../lib/supabase';

const mapContainerStyle = { width: '100%', height: '100%' };

const darkMapStyles = [
  { elementType: 'geometry', stylers: [{ color: '#1A1F2E' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1A1F2E' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6B7280' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2A3441' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1A1F2E' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#323B4C' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#252B3D' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#252B3D' }] },
];

const lightMapStyles = [
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
];

type JobStatus = 'pending' | 'matching' | 'accepted' | 'enroute' | 'arrived' | 'inprogress' | 'completed' | 'cancelled';

function normalizeJobStatus(status?: string): JobStatus {
  switch (status) {
    case 'requested':
      return 'pending';
    case 'matched':
      return 'matching';
    case 'en_route':
      return 'enroute';
    case 'in_progress':
      return 'inprogress';
    case 'pending':
    case 'matching':
    case 'accepted':
    case 'enroute':
    case 'arrived':
    case 'inprogress':
    case 'completed':
    case 'cancelled':
      return status;
    default:
      return 'pending';
  }
}

export function LiveTracking() {
  const navigate = useNavigate();
  const { jobId } = useParams();
  const { isDark } = useTheme();
  const { isLoaded } = useGoogleMaps();
  const { currentLocation } = useLocationCtx();
  const { currentJob, fetchJob, updateJobStatus } = useJob();
  const myPosition = useWatchPosition(true);

  const [status, setStatus] = useState<JobStatus>('pending');
  const [eta, setEta] = useState<number | null>(null);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [shareToast, setShareToast] = useState(false);
  const [directionsError, setDirectionsError] = useState(false);
  const [jobError, setJobError] = useState(false);
  const [showSafety, setShowSafety] = useState(false);
  const directionsServiceRef = useRef<boolean>(false);

  const textColor = isDark ? '#FFFFFF' : '#1A1F2E';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const cardBg = isDark ? 'rgba(26,31,46,0.95)' : 'rgba(255,255,255,0.95)';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB';

  const hasProvider = !!currentJob?.provider;
  const providerInfo = hasProvider ? {
    name: `${currentJob.provider.first_name || ''} ${currentJob.provider.last_name || ''}`.trim() || 'Provider',
    initials: `${(currentJob.provider.first_name || 'P')[0]}${(currentJob.provider.last_name || '')[0] || ''}`.toUpperCase(),
    phone: currentJob.provider.phone || '',
    rating: currentJob.provider.rating || 0,
    rescues: currentJob.provider.total_jobs || 0,
    vehicle: currentJob.provider.vehicle_make ? `${currentJob.provider.vehicle_make} ${currentJob.provider.vehicle_model || ''}`.trim() : '',
    license: currentJob.provider.license_number || '',
    plate: currentJob.provider.vehicle_plate || '',
    isVerified: currentJob.provider.is_verified || false,
  } : null;

  const customerPos = myPosition || (currentLocation
    ? { lat: currentLocation.latitude, lng: currentLocation.longitude }
    : { lat: 37.7749, lng: -122.4194 });

  const { peerLocation: providerLocation, isConnected, broadcastLocation } = useRealtimeLocation({
    jobId,
    role: 'customer',
    enabled: true,
  });

  // Broadcast customer location
  useEffect(() => {
    if (myPosition) broadcastLocation(myPosition);
  }, [myPosition, broadcastLocation]);

  // Fetch job details and sync status
  useEffect(() => {
    if (!jobId) return;
    fetchJob(jobId)
      .then((job: any) => {
        if (job?.status) setStatus(normalizeJobStatus(job.status));
      })
      .catch((e: any) => {
        console.warn('Failed to fetch job:', e);
        setJobError(true);
      });
  }, [jobId]);

  // Subscribe to real-time job status changes
  useEffect(() => {
    if (!jobId) return;
    const channel = supabase
      .channel(`job-status-${jobId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'jobs',
        filter: `id=eq.${jobId}`,
      }, (payload) => {
        const normalizedStatus = normalizeJobStatus(payload.new?.status);
        setStatus(normalizedStatus);
        if (
          payload.new?.provider_id && !currentJob?.provider ||
          normalizedStatus === 'arrived' ||
          normalizedStatus === 'inprogress' ||
          normalizedStatus === 'completed'
        ) {
          fetchJob(jobId).catch(console.warn);
        }
      })
      .subscribe();

    // Also listen for broadcast cancellations (used when RLS prevents DB reads)
    const bc = supabase
      .channel(`job-accepted-${jobId}`)
      .on('broadcast', { event: 'job_cancelled' }, (payload) => {
        if (payload.payload?.job_id === jobId) {
          setStatus('cancelled');
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [jobId]);

  // Simulated provider approach when no real provider connected
  const [simulatedProvider, setSimulatedProvider] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (providerLocation) return;
    if (status !== 'enroute' && status !== 'accepted') return;

    const startLat = customerPos.lat + 0.008;
    const startLng = customerPos.lng - 0.006;
    setSimulatedProvider({ lat: startLat, lng: startLng });

    const interval = setInterval(() => {
      setSimulatedProvider((prev) => {
        if (!prev) return { lat: startLat, lng: startLng };
        const dLat = (customerPos.lat - prev.lat) * 0.08;
        const dLng = (customerPos.lng - prev.lng) * 0.08;
        const newLat = prev.lat + dLat;
        const newLng = prev.lng + dLng;
        const dist = Math.sqrt((newLat - customerPos.lat) ** 2 + (newLng - customerPos.lng) ** 2);
        if (dist < 0.0003) {
          setStatus('arrived');
          return { lat: customerPos.lat, lng: customerPos.lng };
        }
        return { lat: newLat, lng: newLng };
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [providerLocation, status, customerPos.lat, customerPos.lng]);

  const activeProviderPos = providerLocation
    ? { lat: providerLocation.lat, lng: providerLocation.lng }
    : simulatedProvider;

  // Calculate directions & ETA
  useEffect(() => {
    if (!isLoaded || !activeProviderPos || !customerPos) return;
    if (status === 'arrived' || status === 'inprogress' || status === 'completed') return;
    if (directionsServiceRef.current || directionsError) return;

    directionsServiceRef.current = true;
    try {
      const service = new google.maps.DirectionsService();
      service.route({
        origin: activeProviderPos,
        destination: customerPos,
        travelMode: google.maps.TravelMode.DRIVING,
      }, (result, directionsStatus) => {
        directionsServiceRef.current = false;
        if (directionsStatus === google.maps.DirectionsStatus.OK && result) {
          setDirections(result);
          const leg = result.routes[0]?.legs[0];
          if (leg?.duration) setEta(Math.ceil(leg.duration.value / 60));
        } else {
          setDirectionsError(true);
          if (activeProviderPos && customerPos) {
            const R = 6371;
            const dLat = (customerPos.lat - activeProviderPos.lat) * Math.PI / 180;
            const dLng = (customerPos.lng - activeProviderPos.lng) * Math.PI / 180;
            const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(activeProviderPos.lat * Math.PI / 180) * Math.cos(customerPos.lat * Math.PI / 180) *
              Math.sin(dLng / 2) ** 2;
            const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            setEta(Math.max(1, Math.ceil((dist / 30) * 60)));
          }
        }
      });
    } catch {
      directionsServiceRef.current = false;
      setDirectionsError(true);
    }
  }, [isLoaded, activeProviderPos?.lat, activeProviderPos?.lng, status, directionsError]);

  // Re-fetch directions periodically
  useEffect(() => {
    if (status !== 'enroute') return;
    const interval = setInterval(() => { directionsServiceRef.current = false; }, 15000);
    return () => clearInterval(interval);
  }, [status]);

  // Fit map bounds
  useEffect(() => {
    if (!map || !activeProviderPos) return;
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(customerPos);
    bounds.extend(activeProviderPos);
    map.fitBounds(bounds, { top: 120, bottom: 380, left: 40, right: 40 });
  }, [map, activeProviderPos?.lat, activeProviderPos?.lng]);

  const onLoad = useCallback((map: google.maps.Map) => setMap(map), []);

  const handleConfirmArrival = async () => {
    setStatus('inprogress');
    if (jobId) {
      try { await updateJobStatus(jobId, 'inprogress'); } catch (e) { console.warn(e); }
    }
  };

  const handleComplete = async () => {
    if (jobId) {
      try { await updateJobStatus(jobId, 'completed'); } catch (e) { console.warn(e); }
    }
    navigate(`/completion/${jobId}`);
  };

  const handleCall = () => {
    if (providerInfo?.phone) callPhone(providerInfo.phone);
  };
  const handleMessage = () => setIsChatOpen(true);
  const handleShare = async () => {
    const shared = await shareJobDetails({
      jobId: jobId || '',
      service: currentJob?.service?.name || 'Roadside Assistance',
      providerName: providerInfo?.name || 'Provider',
      eta,
      status,
    });
    if (shared) {
      setShareToast(true);
      setTimeout(() => setShareToast(false), 2500);
    }
  };

  const statusConfig: Record<string, { label: string; detail: string; color: string }> = {
    pending: { label: 'Searching', detail: 'Looking for available providers...', color: '#F59E0B' },
    matching: { label: 'Matching', detail: 'Matching you with the best provider...', color: '#F59E0B' },
    accepted: { label: 'Accepted', detail: 'A provider has accepted your request!', color: '#2EFFAF' },
    enroute: { label: 'On the way', detail: 'Provider is heading to you', color: '#2EFFAF' },
    arrived: { label: 'Arrived', detail: 'Provider has arrived at your location!', color: '#007AFF' },
    inprogress: { label: 'In Progress', detail: 'Working on your vehicle', color: '#2EFFAF' },
    completed: { label: 'Complete', detail: 'Service has been completed', color: '#2EFFAF' },
    cancelled: { label: 'Cancelled', detail: 'This job has been cancelled', color: '#EF4444' },
  };

  const currentStatus = statusConfig[status] || statusConfig.pending;
  const isWaiting = status === 'pending' || status === 'matching';
  const showProviderOnMap = !isWaiting && activeProviderPos && status !== 'arrived' && status !== 'inprogress';

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: isDark ? '#0F1419' : '#E8EAED' }}>
      {/* Full-screen Google Map */}
      <div className="absolute inset-0">
        {isLoaded ? (
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={customerPos}
            zoom={14}
            onLoad={onLoad}
            options={{
              styles: isDark ? darkMapStyles : lightMapStyles,
              disableDefaultUI: true,
              zoomControl: false,
              gestureHandling: 'greedy',
            }}
          >
            {/* Customer marker */}
            <MarkerF
              position={customerPos}
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                scale: 10,
                fillColor: '#059669',
                fillOpacity: 1,
                strokeColor: '#FFFFFF',
                strokeWeight: 3,
              }}
              title="Your location"
            />

            {/* Provider marker (en route) */}
            {showProviderOnMap && (
              <MarkerF
                position={activeProviderPos}
                icon={{
                  path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                  scale: 7,
                  fillColor: '#2EFFAF',
                  fillOpacity: 1,
                  strokeColor: '#007AFF',
                  strokeWeight: 2,
                  rotation: providerLocation?.heading || 0,
                }}
                title="Provider"
              />
            )}

            {/* Provider at customer location */}
            {(status === 'arrived' || status === 'inprogress') && (
              <MarkerF
                position={customerPos}
                icon={{
                  path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                  scale: 7,
                  fillColor: '#2EFFAF',
                  fillOpacity: 1,
                  strokeColor: '#007AFF',
                  strokeWeight: 2,
                }}
                title="Provider"
              />
            )}

            {/* Directions route */}
            {directions && status === 'enroute' && !directionsError && (
              <DirectionsRenderer
                directions={directions}
                options={{
                  suppressMarkers: true,
                  polylineOptions: { strokeColor: '#007AFF', strokeWeight: 5, strokeOpacity: 0.8 },
                }}
              />
            )}

            {/* Fallback straight-line route */}
            {directionsError && activeProviderPos && status === 'enroute' && (
              <PolylineF
                path={[activeProviderPos, customerPos]}
                options={{
                  strokeColor: '#007AFF',
                  strokeWeight: 4,
                  strokeOpacity: 0.6,
                  icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '15px' }],
                }}
              />
            )}
          </GoogleMap>
        ) : (
          <div className="h-full flex items-center justify-center" style={{ background: isDark ? '#0F1419' : '#E8EAED' }}>
            <div className="w-10 h-10 border-4 border-[#2EFFAF] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Back button */}
      <div className="absolute top-6 left-4 z-30">
        <button onClick={() => navigate('/customer/home')} className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg" style={{ backgroundColor: cardBg }} title="Back to home">
          <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
        </button>
      </div>

      {/* Top status bar */}
      <div className="relative z-20 p-4 pt-6">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl px-5 py-4 text-center shadow-lg backdrop-blur-md"
          style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
        >
          <div className="flex items-center justify-center gap-2 mb-1">
            {isConnected && <div className="w-2 h-2 bg-[#2EFFAF] rounded-full animate-pulse" />}
            {isWaiting && <Loader2 className="w-4 h-4 animate-spin" style={{ color: currentStatus.color }} />}
            <p className="text-sm font-medium" style={{ color: subColor }}>{currentStatus.detail}</p>
          </div>

          {(status === 'enroute' || status === 'accepted') && eta !== null && (
            <p className="font-bold text-2xl" style={{ color: '#2EFFAF' }}>{eta} min</p>
          )}
          {(status === 'enroute' || status === 'accepted') && eta === null && (
            <p className="font-bold text-lg" style={{ color: '#2EFFAF' }}>Calculating ETA...</p>
          )}
          {status === 'arrived' && (
            <p className="font-bold text-lg" style={{ color: '#007AFF' }}>Provider is here!</p>
          )}
          {status === 'inprogress' && (
            <div className="flex items-center justify-center gap-2">
              <Clock className="w-5 h-5" style={{ color: '#2EFFAF' }} />
              <p className="font-bold text-lg" style={{ color: '#2EFFAF' }}>Working on your vehicle</p>
            </div>
          )}
          {isWaiting && (
            <div className="flex items-center justify-center gap-1 mt-1">
              <div className="w-2 h-2 rounded-full bg-[#F59E0B] animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 rounded-full bg-[#F59E0B] animate-bounce" style={{ animationDelay: '200ms' }} />
              <div className="w-2 h-2 rounded-full bg-[#F59E0B] animate-bounce" style={{ animationDelay: '400ms' }} />
            </div>
          )}
        </motion.div>
      </div>

      {/* Bottom sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-30">
        <motion.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          className="rounded-t-3xl p-5 shadow-2xl backdrop-blur-md"
          style={{ backgroundColor: cardBg, borderTop: `1px solid ${cardBorder}` }}
        >
          {/* Provider card */}
          {providerInfo ? (
            <div className="mb-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center text-xl font-bold text-[#0F1419]">
                  {providerInfo.initials}
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-lg" style={{ color: textColor }}>{providerInfo.name}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    {providerInfo.rating > 0 && (
                      <>
                        <Star className="w-3.5 h-3.5 fill-[#2EFFAF]" style={{ color: '#2EFFAF' }} />
                        <span className="text-sm font-semibold" style={{ color: '#2EFFAF' }}>{providerInfo.rating.toFixed(1)}</span>
                        <span style={{ color: subColor }}>·</span>
                      </>
                    )}
                    <span className="text-sm" style={{ color: subColor }}>{providerInfo.rescues} jobs</span>
                  </div>
                  {providerInfo.isVerified && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold" style={{ backgroundColor: 'rgba(46,255,175,0.15)', color: '#2EFFAF' }}>VERIFIED</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Vehicle info (only show if provider has vehicle data) */}
              {(providerInfo.vehicle || providerInfo.license || providerInfo.plate) && (
                <div className="grid grid-cols-3 gap-2">
                  {providerInfo.vehicle && (
                    <div className="rounded-xl p-2 text-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6' }}>
                      <p className="text-[10px] mb-0.5" style={{ color: subColor }}>Vehicle</p>
                      <p className="text-xs font-semibold" style={{ color: textColor }}>{providerInfo.vehicle}</p>
                    </div>
                  )}
                  {providerInfo.license && (
                    <div className="rounded-xl p-2 text-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6' }}>
                      <p className="text-[10px] mb-0.5" style={{ color: subColor }}>License</p>
                      <p className="text-xs font-semibold" style={{ color: textColor }}>{providerInfo.license}</p>
                    </div>
                  )}
                  {providerInfo.plate && (
                    <div className="rounded-xl p-2 text-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6' }}>
                      <p className="text-[10px] mb-0.5" style={{ color: subColor }}>Plate</p>
                      <p className="text-xs font-semibold" style={{ color: textColor }}>{providerInfo.plate}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Waiting for provider */
            <div className="mb-4 text-center py-4">
              <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6' }}>
                <Loader2 className="w-7 h-7 animate-spin" style={{ color: '#2EFFAF' }} />
              </div>
              <h3 className="font-bold" style={{ color: textColor }}>Finding Provider...</h3>
              <p className="text-sm mt-1" style={{ color: subColor }}>
                We're matching you with the best available provider nearby
              </p>
            </div>
          )}

          {/* Action buttons based on status */}
          {status === 'arrived' && (
            <motion.button
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleConfirmArrival}
              className="w-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-2xl py-4 font-bold text-[#0F1419] text-lg shadow-lg shadow-[#2EFFAF]/30 mb-3"
            >
              Confirm Provider Arrived
            </motion.button>
          )}
          {status === 'inprogress' && (
            <motion.button
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleComplete}
              className="w-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-2xl py-4 font-bold text-[#0F1419] text-lg shadow-lg shadow-[#2EFFAF]/30 mb-3"
            >
              Service Complete
            </motion.button>
          )}
          {(status === 'cancelled' || status === 'completed') && (
            <>
              {status === 'completed' && !currentJob?.rating && (
                <button
                  onClick={() => navigate(`/completion/${jobId}`)}
                  className="w-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-2xl py-4 font-bold text-[#0F1419] text-lg shadow-lg shadow-[#2EFFAF]/30 mb-3"
                >
                  Rate Provider
                </button>
              )}
              <button
                onClick={() => navigate('/customer/home')}
                className="w-full rounded-2xl py-4 font-bold text-sm mb-3"
                style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6', color: textColor }}
              >
                Back to Home
              </button>
            </>
          )}

          {/* Communication buttons (only when provider is assigned) */}
          {hasProvider && (
            <div className="grid grid-cols-3 gap-2">
              <button onClick={handleCall} className="rounded-xl py-2.5 flex flex-col items-center gap-1" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6' }}>
                <Phone className="w-4 h-4" style={{ color: '#2EFFAF' }} />
                <span className="text-[11px] font-semibold" style={{ color: textColor }}>Call</span>
              </button>
              <button onClick={handleMessage} className="rounded-xl py-2.5 flex flex-col items-center gap-1" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6' }}>
                <MessageCircle className="w-4 h-4" style={{ color: '#2EFFAF' }} />
                <span className="text-[11px] font-semibold" style={{ color: textColor }}>Message</span>
              </button>
              <button onClick={handleShare} className="rounded-xl py-2.5 flex flex-col items-center gap-1" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6' }}>
                <Share2 className="w-4 h-4" style={{ color: '#2EFFAF' }} />
                <span className="text-[11px] font-semibold" style={{ color: textColor }}>Share</span>
              </button>
            </div>
          )}

          {/* Communication buttons (waiting state - only share) */}
          {!hasProvider && (
            <div className="grid grid-cols-1 gap-2">
              <button onClick={handleShare} className="rounded-xl py-2.5 flex items-center justify-center gap-2" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6' }}>
                <Share2 className="w-4 h-4" style={{ color: '#2EFFAF' }} />
                <span className="text-[11px] font-semibold" style={{ color: textColor }}>Share Trip Details</span>
              </button>
            </div>
          )}

          {/* Safety */}
          <button onClick={() => setShowSafety(true)} className="w-full mt-2 rounded-xl py-2.5 flex items-center justify-center gap-2" style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <Shield className="w-4 h-4 text-red-400" />
            <span className="text-red-400 font-semibold text-sm">Safety & Support</span>
          </button>
        </motion.div>
      </div>

      {/* Share toast */}
      {shareToast && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-20 left-1/2 -translate-x-1/2 z-50 rounded-full px-6 py-3 shadow-lg"
          style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
        >
          <p className="text-sm font-semibold" style={{ color: '#2EFFAF' }}>Trip details shared!</p>
        </motion.div>
      )}

      {/* Chat modal */}
      <ChatModal
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        jobId={jobId || ''}
        peerName={providerInfo?.name || 'Provider'}
        peerInitials={providerInfo?.initials || '?'}
        role="customer"
      />

      {/* Safety & Support Modal */}
      {showSafety && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowSafety(false)}>
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="rounded-t-3xl md:rounded-3xl p-6 w-full md:max-w-md"
            style={{ backgroundColor: isDark ? '#1A1F2E' : '#FFFFFF' }}
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-red-400" />
                <h2 className="font-bold text-lg" style={{ color: textColor }}>Safety & Support</h2>
              </div>
              <button onClick={() => setShowSafety(false)} title="Close">
                <X className="w-5 h-5" style={{ color: subColor }} />
              </button>
            </div>

            <div className="space-y-3">
              {/* Emergency Call */}
              <button
                onClick={() => { window.location.href = 'tel:911'; }}
                className="w-full rounded-xl p-4 flex items-center gap-3 text-left"
                style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}
              >
                <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
                  <PhoneCall className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-bold text-red-500">Call 911</p>
                  <p className="text-xs" style={{ color: subColor }}>For life-threatening emergencies</p>
                </div>
              </button>

              {/* Roadside Assistance */}
              <button
                onClick={() => { window.location.href = 'tel:18002221222'; }}
                className="w-full rounded-xl p-4 flex items-center gap-3 text-left"
                style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F9FAFB', border: `1px solid ${cardBorder}` }}
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(0,122,255,0.15)' }}>
                  <Phone className="w-5 h-5" style={{ color: '#007AFF' }} />
                </div>
                <div>
                  <p className="font-semibold" style={{ color: textColor }}>Torc Support Line</p>
                  <p className="text-xs" style={{ color: subColor }}>Talk to our support team</p>
                </div>
              </button>

              {/* Share Live Location */}
              <button
                onClick={async () => {
                  try {
                    await navigator.share({
                      title: 'My Live Location',
                      text: `I'm using Torc roadside assistance. Track my location: https://maps.google.com/?q=${customerPos.lat},${customerPos.lng}`,
                      url: `https://maps.google.com/?q=${customerPos.lat},${customerPos.lng}`,
                    });
                  } catch {
                    const link = `https://maps.google.com/?q=${customerPos.lat},${customerPos.lng}`;
                    navigator.clipboard?.writeText(link);
                    setShareToast(true);
                    setTimeout(() => setShareToast(false), 2500);
                  }
                  setShowSafety(false);
                }}
                className="w-full rounded-xl p-4 flex items-center gap-3 text-left"
                style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F9FAFB', border: `1px solid ${cardBorder}` }}
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(46,255,175,0.15)' }}>
                  <MapPinned className="w-5 h-5" style={{ color: '#2EFFAF' }} />
                </div>
                <div>
                  <p className="font-semibold" style={{ color: textColor }}>Share My Location</p>
                  <p className="text-xs" style={{ color: subColor }}>Send your live location to someone</p>
                </div>
              </button>

              {/* Report Issue */}
              <button
                onClick={() => {
                  const subject = encodeURIComponent(`Safety Report - Job ${jobId || 'N/A'}`);
                  const body = encodeURIComponent(`Job ID: ${jobId || 'N/A'}\nStatus: ${status}\nProvider: ${providerInfo?.name || 'Not assigned'}\n\nDescribe the issue:\n`);
                  window.location.href = `mailto:support@torcapp.com?subject=${subject}&body=${body}`;
                  setShowSafety(false);
                }}
                className="w-full rounded-xl p-4 flex items-center gap-3 text-left"
                style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F9FAFB', border: `1px solid ${cardBorder}` }}
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(245,158,11,0.15)' }}>
                  <Flag className="w-5 h-5" style={{ color: '#F59E0B' }} />
                </div>
                <div>
                  <p className="font-semibold" style={{ color: textColor }}>Report an Issue</p>
                  <p className="text-xs" style={{ color: subColor }}>Report a safety concern or problem</p>
                </div>
              </button>

              {/* Cancel Job */}
              <button
                onClick={async () => {
                  if (jobId && (status === 'pending' || status === 'matching' || status === 'accepted' || status === 'enroute')) {
                    try {
                      await supabase.from('jobs').update({
                        status: 'cancelled',
                        cancellation_reason: 'Cancelled by customer',
                        cancelled_at: new Date().toISOString(),
                      }).eq('id', jobId);
                      setStatus('cancelled' as JobStatus);
                    } catch (e) { console.warn(e); }
                  }
                  setShowSafety(false);
                  navigate('/customer/home');
                }}
                className="w-full rounded-xl p-4 flex items-center gap-3 text-left"
                style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F9FAFB', border: `1px solid ${cardBorder}` }}
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(239,68,68,0.1)' }}>
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <p className="font-semibold text-red-400">Cancel Service</p>
                  <p className="text-xs" style={{ color: subColor }}>Cancel and return home</p>
                </div>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
