import { motion } from 'motion/react';
import { useNavigate, useParams } from 'react-router';
import {
  Navigation,
  Phone,
  MessageCircle,
  Share2,
  Camera,
  Clock,
  MapPin,
  Loader2,
  ArrowLeft,
  MapPinned,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { GoogleMap, MarkerF, DirectionsRenderer, PolylineF } from '@react-google-maps/api';
import { ChatModal } from '../../components/ChatModal';
import { callPhone, shareJobDetails } from '../../utils/communication';
import { useJob } from '../../context/JobContext';
import { useRealtimeLocation, useWatchPosition } from '../../hooks/useRealtimeLocation';
import { useGoogleMaps } from '../../context/GoogleMapsContext';
import { useTheme } from '../../context/ThemeContext';

type UiStatus = 'enroute' | 'arrived' | 'working' | 'photos';

function mapJobStatusToUi(status?: string): UiStatus {
  if (status === 'arrived') return 'arrived';
  if (status === 'inprogress' || status === 'in_progress') return 'working';
  return 'enroute';
}

function getPickupPosition(job: any): { lat: number; lng: number } | null {
  const lat = Number(job?.pickup_latitude ?? job?.pickup_lat);
  const lng = Number(job?.pickup_longitude ?? job?.pickup_lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

const mapContainerStyle = { width: '100%', height: '100%' };

const darkMapStyles = [
  { elementType: 'geometry', stylers: [{ color: '#1A1F2E' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1A1F2E' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6B7280' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2A3441' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1A1F2E' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
];

const lightMapStyles = [
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
];

export function JobActiveRealtime() {
  const navigate = useNavigate();
  const { jobId } = useParams();
  const { isLoaded } = useGoogleMaps();
  const { isDark } = useTheme();
  const { currentJob, fetchJob, updateJobStatus, cancelJob, subscribeToJobUpdates } = useJob();

  const [status, setStatus] = useState<UiStatus>('enroute');
  const [photos, setPhotos] = useState<string[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [shareToast, setShareToast] = useState(false);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [directionsError, setDirectionsError] = useState(false);
  const [eta, setEta] = useState<number | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const directionsRunningRef = useRef(false);

  // Provider device location (source of truth for real-time movement)
  const myPosition = useWatchPosition(true);
  const { broadcastLocation } = useRealtimeLocation({ jobId, role: 'provider', enabled: !!jobId });

  useEffect(() => {
    if (myPosition) {
      broadcastLocation(myPosition);
    }
  }, [myPosition, broadcastLocation]);

  useEffect(() => {
    if (!jobId) return;
    fetchJob(jobId)
      .then((job: any) => setStatus(mapJobStatusToUi(job?.status)))
      .catch(console.warn);
  }, [jobId, fetchJob]);

  useEffect(() => {
    if (!jobId) return;
    const unsubscribe = subscribeToJobUpdates(jobId, () => {
      const next = mapJobStatusToUi((currentJob as any)?.status);
      setStatus(next);
    });
    return () => unsubscribe();
  }, [jobId, subscribeToJobUpdates, currentJob?.status]);

  const customerPos = useMemo(() => getPickupPosition(currentJob), [currentJob]);
  const providerPos = myPosition;

  const customerName = currentJob?.customer
    ? `${currentJob.customer.first_name || ''} ${currentJob.customer.last_name || ''}`.trim()
    : 'Customer';
  const customerInitials = customerName !== 'Customer'
    ? `${(customerName.split(' ')[0] || 'C')[0]}${(customerName.split(' ')[1] || '')[0] || ''}`.toUpperCase()
    : 'C';

  const job = {
    id: jobId,
    customer: customerName,
    customerPhone: currentJob?.customer?.phone || currentJob?.requester_phone || '',
    customerInitials,
    service: currentJob?.service?.name || 'Service',
    location: currentJob?.pickup_address || 'Fetching location...',
    payout: currentJob?.total_amount ? `$${currentJob.total_amount}` : (currentJob?.base_price ? `$${currentJob.base_price}` : '-'),
    notes: currentJob?.customer_notes || '',
  };

  useEffect(() => {
    if (!isLoaded || !providerPos || !customerPos) return;
    if (status !== 'enroute') return;
    if (directionsRunningRef.current || directionsError) return;

    directionsRunningRef.current = true;
    const service = new google.maps.DirectionsService();
    service.route(
      {
        origin: providerPos,
        destination: customerPos,
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, routeStatus) => {
        directionsRunningRef.current = false;
        if (routeStatus === google.maps.DirectionsStatus.OK && result) {
          setDirections(result);
          const leg = result.routes[0]?.legs[0];
          if (leg?.duration) setEta(Math.ceil(leg.duration.value / 60));
        } else {
          setDirectionsError(true);
        }
      }
    );
  }, [isLoaded, providerPos?.lat, providerPos?.lng, customerPos?.lat, customerPos?.lng, status, directionsError]);

  useEffect(() => {
    if (status !== 'enroute') return;
    const interval = setInterval(() => {
      directionsRunningRef.current = false;
    }, 15000);
    return () => clearInterval(interval);
  }, [status]);

  useEffect(() => {
    if (!map || !providerPos || !customerPos) return;
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(providerPos);
    bounds.extend(customerPos);
    map.fitBounds(bounds, { top: 120, bottom: 320, left: 40, right: 40 });
  }, [map, providerPos?.lat, providerPos?.lng, customerPos?.lat, customerPos?.lng]);

  const handleCall = () => callPhone(job.customerPhone);
  const handleMessage = () => setIsChatOpen(true);
  const handleShare = async () => {
    const shared = await shareJobDetails({
      jobId: jobId || '',
      service: job.service,
      status,
      eta,
    });
    if (shared) {
      setShareToast(true);
      setTimeout(() => setShareToast(false), 2500);
    }
  };

  function openExternalNavigation() {
    if (!customerPos) return;
    const destination = `${customerPos.lat},${customerPos.lng}`;
    const origin = providerPos ? `${providerPos.lat},${providerPos.lng}` : '';
    const isAppleDevice = /iPad|iPhone|iPod|Macintosh/i.test(navigator.userAgent);

    const url = isAppleDevice
      ? `https://maps.apple.com/?daddr=${destination}&dirflg=d`
      : `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;

    window.open(url, '_blank', 'noopener,noreferrer');
  }

  const textColor = isDark ? '#FFFFFF' : '#1A1F2E';
  const subColor = isDark ? 'rgba(255,255,255,0.55)' : '#6B7280';
  const cardBg = isDark ? 'rgba(26,31,46,0.95)' : 'rgba(255,255,255,0.95)';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB';

  return (
    <div className="min-h-screen relative overflow-hidden pb-28" style={{ background: isDark ? '#0F1419' : '#E8EAED' }}>
      <div className="absolute inset-0">
        {isLoaded ? (
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={providerPos || customerPos || { lat: 37.7749, lng: -122.4194 }}
            zoom={14}
            onLoad={(nextMap) => setMap(nextMap)}
            options={{
              styles: isDark ? darkMapStyles : lightMapStyles,
              disableDefaultUI: true,
              zoomControl: false,
              gestureHandling: 'greedy',
            }}
          >
            {customerPos && (
              <MarkerF
                position={customerPos}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 10,
                  fillColor: '#007AFF',
                  fillOpacity: 1,
                  strokeColor: '#FFFFFF',
                  strokeWeight: 3,
                }}
                title="Customer"
              />
            )}

            {providerPos && (
              <MarkerF
                position={providerPos}
                icon={{
                  path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                  scale: 7,
                  fillColor: '#2EFFAF',
                  fillOpacity: 1,
                  strokeColor: '#007AFF',
                  strokeWeight: 2,
                }}
                title="You"
              />
            )}

            {directions && status === 'enroute' && !directionsError && (
              <DirectionsRenderer
                directions={directions}
                options={{
                  suppressMarkers: true,
                  polylineOptions: { strokeColor: '#007AFF', strokeWeight: 5, strokeOpacity: 0.8 },
                }}
              />
            )}

            {directionsError && providerPos && customerPos && status === 'enroute' && (
              <PolylineF
                path={[providerPos, customerPos]}
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

      <div className="absolute top-6 left-4 z-30">
        <button onClick={() => navigate('/home')} className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg" style={{ backgroundColor: cardBg }} title="Back to home">
          <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
        </button>
      </div>

      <div className="relative z-20 p-4 pt-6">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl px-5 py-4 text-center shadow-lg backdrop-blur-md"
          style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
        >
          <p className="text-sm font-medium" style={{ color: subColor }}>{job.service}</p>
          <p className="font-bold text-xl" style={{ color: textColor }}>{job.payout}</p>
          {status === 'enroute' && (
            <p className="text-sm mt-1" style={{ color: '#2EFFAF' }}>
              {eta !== null ? `${eta} min away` : 'Calculating ETA...'}
            </p>
          )}
          {status === 'arrived' && <p className="text-sm mt-1" style={{ color: '#007AFF' }}>Arrived at customer location</p>}
          {status === 'working' && <p className="text-sm mt-1" style={{ color: '#2EFFAF' }}>Service in progress</p>}
          {status === 'photos' && <p className="text-sm mt-1" style={{ color: '#2EFFAF' }}>Add completion photos</p>}
        </motion.div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30">
        <motion.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          className="rounded-t-3xl p-5 shadow-2xl backdrop-blur-md"
          style={{ backgroundColor: cardBg, borderTop: `1px solid ${cardBorder}` }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center text-lg font-bold text-[#0F1419]">
              {job.customerInitials}
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-base" style={{ color: textColor }}>{job.customer}</h3>
              <p className="text-xs" style={{ color: subColor }}>{job.location}</p>
            </div>
          </div>

          {job.notes && (
            <div className="rounded-xl p-3 mb-3" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6' }}>
              <p className="text-xs" style={{ color: subColor }}>{job.notes}</p>
            </div>
          )}

          <div className="grid grid-cols-4 gap-2 mb-3">
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
            <button onClick={openExternalNavigation} className="rounded-xl py-2.5 flex flex-col items-center gap-1" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6' }}>
              <MapPinned className="w-4 h-4" style={{ color: '#007AFF' }} />
              <span className="text-[11px] font-semibold" style={{ color: textColor }}>Navigate</span>
            </button>
          </div>

          {status === 'enroute' && (
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                setStatus('arrived');
                if (jobId) updateJobStatus(jobId, 'arrived').catch(console.warn);
              }}
              className="w-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-2xl py-4 font-bold text-[#0F1419] text-base mb-2"
            >
              I&apos;ve Arrived
            </motion.button>
          )}

          {status === 'arrived' && (
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                setStatus('working');
                if (jobId) updateJobStatus(jobId, 'inprogress').catch(console.warn);
              }}
              className="w-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-2xl py-4 font-bold text-[#0F1419] text-base mb-2"
            >
              Start Service
            </motion.button>
          )}

          {status === 'working' && (
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setStatus('photos')}
              className="w-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-2xl py-4 font-bold text-[#0F1419] text-base mb-2"
            >
              Take Completion Photos
            </motion.button>
          )}

          {status === 'photos' && (
            <>
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setPhotos((prev) => [...prev, `photo-${Date.now()}`])}
                className="w-full rounded-2xl py-4 font-semibold text-sm mb-2 flex items-center justify-center gap-2"
                style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6', color: textColor }}
              >
                <Camera className="w-4 h-4" />
                {photos.length > 0 ? `${photos.length} photo(s) added` : 'Add completion photos'}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate(`/complete/${jobId}`)}
                disabled={photos.length === 0}
                className="w-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-2xl py-4 font-bold text-[#0F1419] text-base disabled:opacity-50 mb-2"
              >
                Complete Job
              </motion.button>
            </>
          )}

          {(status === 'enroute' || status === 'arrived' || status === 'working') && (
            <button
              onClick={async () => {
                if (!jobId) return;
                try {
                  await cancelJob(jobId, 'provider_cancelled');
                } catch (e) {
                  console.warn('Provider cancel failed:', e);
                }
                navigate('/home');
              }}
              className="w-full rounded-2xl py-3 font-semibold text-sm"
              style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6', color: textColor }}
            >
              Cancel Job
            </button>
          )}
        </motion.div>
      </div>

      {shareToast && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-20 left-1/2 -translate-x-1/2 z-50 rounded-full px-6 py-3 shadow-lg"
          style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
        >
          <p className="text-sm font-semibold" style={{ color: '#2EFFAF' }}>Job details shared!</p>
        </motion.div>
      )}

      {!customerPos && (
        <div className="fixed inset-0 z-40 pointer-events-none flex items-center justify-center">
          <div className="rounded-2xl px-5 py-3 backdrop-blur-md" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#2EFFAF' }} />
              <p className="text-sm font-medium" style={{ color: textColor }}>Waiting for customer location...</p>
            </div>
          </div>
        </div>
      )}

      <ChatModal
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        jobId={jobId || ''}
        peerName={job.customer}
        peerInitials={job.customerInitials}
        role="provider"
      />
    </div>
  );
}

