import { motion } from 'motion/react';
import { useNavigate, useParams } from 'react-router';
import {
  Navigation,
  Navigation2 as RecenterIcon,
  Phone,
  MessageCircle,
  Share2,
  Camera,
  Clock,
  MapPin,
  Loader2,
  ArrowLeft,
  MapPinned,
  ImagePlus,
  Check,
  Wrench,
  Flag,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { GoogleMap, MarkerF, DirectionsRenderer } from '@react-google-maps/api';
import { ChatModal } from '../../components/ChatModal';
import { CallModal } from '../../components/CallModal';
import { callPhone, shareJobDetails } from '../../utils/communication';
import { useJob } from '../../context/JobContext';
import { useRealtimeLocation, useWatchPosition } from '../../hooks/useRealtimeLocation';
import { useGoogleMaps } from '../../context/GoogleMapsContext';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../lib/supabase';
import { initAudio, playMessageSound, showSystemNotification } from '../../utils/audio';

type UiStatus = 'enroute' | 'arrived' | 'working' | 'photos';

const STATUS_ORDER: Record<UiStatus, number> = {
  enroute: 0,
  arrived: 1,
  working: 2,
  photos: 3,
};

function mapJobStatusToUi(status?: string): UiStatus {
  if (status === 'arrived') return 'arrived';
  if (status === 'inprogress' || status === 'in_progress') return 'working';
  if (status === 'completed') return 'photos'; // Don't regress if completed
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

  const [status, setStatusRaw] = useState<UiStatus>('enroute');
  const [photos, setPhotos] = useState<string[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isCallOpen, setIsCallOpen] = useState(false);
  const [isCallOutgoing, setIsCallOutgoing] = useState(true);
  const [shareToast, setShareToast] = useState(false);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [directionsError, setDirectionsError] = useState(false);
  const [eta, setEta] = useState<number | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const directionsRunningRef = useRef(false);
  const lastDirectionsRequestAtRef = useRef(0);
  const directionsRetryCountRef = useRef(0);
  const directionsRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasInitialFit = useRef(false);

  // Forward-only status setter — status can NEVER go backward
  const setStatus = useCallback((next: UiStatus | ((prev: UiStatus) => UiStatus)) => {
    setStatusRaw((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      // Only advance forward, never backward
      if (STATUS_ORDER[resolved] >= STATUS_ORDER[prev]) return resolved;
      return prev;
    });
  }, []);

  // Provider device location (source of truth for real-time movement)
  const myPosition = useWatchPosition(true);
  const { broadcastLocation } = useRealtimeLocation({ jobId, role: 'provider', enabled: !!jobId });

  useEffect(() => {
    if (myPosition) {
      broadcastLocation(myPosition);
    }
  }, [myPosition, broadcastLocation]);

  // Initial fetch — set status from DB
  useEffect(() => {
    if (!jobId) return;
    fetchJob(jobId)
      .then((job: any) => setStatus(mapJobStatusToUi(job?.status)))
      .catch(console.warn);
  }, [jobId, fetchJob, setStatus]);

  // Subscribe to real-time DB changes — read status FRESH from fetchJob (avoids stale closure)
  useEffect(() => {
    if (!jobId) return;

    const channel = supabase
      .channel(`provider-job-updates-${jobId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'jobs',
        filter: `id=eq.${jobId}`,
      }, async (payload) => {
        // Read status directly from the DB payload — no stale closure
        const dbStatus = payload.new?.status;
        if (dbStatus) {
          const uiStatus = mapJobStatusToUi(dbStatus);
          setStatus(uiStatus); // forward-only — will only advance
        }
        // Also refresh job data for customer name, payout, etc.
        fetchJob(jobId).catch(console.warn);

        // If job is completed by customer, navigate to completion
        if (dbStatus === 'completed') {
          navigate(`/complete/${jobId}`);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [jobId, fetchJob, setStatus, navigate]);

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

  const requestDrivingDirections = useCallback((force = false) => {
    if (!isLoaded || !providerPos || !customerPos) return;
    if (status !== 'enroute') return;
    if (directionsRunningRef.current) return;

    const minIntervalMs = 10000;
    const now = Date.now();
    if (!force && now - lastDirectionsRequestAtRef.current < minIntervalMs) return;
    lastDirectionsRequestAtRef.current = now;
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
        const routeStatusText = String(routeStatus || '');
        if (routeStatusText === 'OK' && result) {
          setDirections(result);
          setDirectionsError(false);
          directionsRetryCountRef.current = 0;
          if (directionsRetryTimeoutRef.current) {
            clearTimeout(directionsRetryTimeoutRef.current);
            directionsRetryTimeoutRef.current = null;
          }
          const leg = result.routes[0]?.legs[0];
          if (leg?.duration) setEta(Math.ceil(leg.duration.value / 60));
          return;
        }

        const isRetryable = routeStatusText === 'OVER_QUERY_LIMIT' || routeStatusText === 'UNKNOWN_ERROR';
        if (isRetryable && directionsRetryCountRef.current < 3) {
          directionsRetryCountRef.current += 1;
          const backoffMs = 1000 * directionsRetryCountRef.current;
          if (directionsRetryTimeoutRef.current) clearTimeout(directionsRetryTimeoutRef.current);
          directionsRetryTimeoutRef.current = setTimeout(() => requestDrivingDirections(true), backoffMs);
          return;
        }

        setDirectionsError(true);
        const R = 6371;
        const dLat = (customerPos.lat - providerPos.lat) * Math.PI / 180;
        const dLng = (customerPos.lng - providerPos.lng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
          Math.cos(providerPos.lat * Math.PI / 180) * Math.cos(customerPos.lat * Math.PI / 180) *
          Math.sin(dLng / 2) ** 2;
        const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        setEta(Math.max(1, Math.ceil((dist / 30) * 60)));
      }
    );
  }, [isLoaded, providerPos?.lat, providerPos?.lng, customerPos?.lat, customerPos?.lng, status]);

  useEffect(() => {
    requestDrivingDirections(false);
  }, [requestDrivingDirections]);

  // Re-fetch directions periodically, but keep request rate below quota limits.
  useEffect(() => {
    if (status !== 'enroute') return;
    const interval = setInterval(() => requestDrivingDirections(true), 15000);
    return () => clearInterval(interval);
  }, [status, requestDrivingDirections]);

  useEffect(() => {
    return () => {
      if (directionsRetryTimeoutRef.current) {
        clearTimeout(directionsRetryTimeoutRef.current);
      }
    };
  }, []);

  // Fit both points into view ONCE on initial load, then let the provider
  // control the map freely. Markers and route update in real-time but
  // the camera stays put so the view doesn't jump around.
  useEffect(() => {
    if (!map || !providerPos || !customerPos || hasInitialFit.current) return;
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(providerPos);
    bounds.extend(customerPos);
    map.fitBounds(bounds, { top: 120, bottom: 320, left: 40, right: 40 });
    hasInitialFit.current = true;
  }, [map, providerPos?.lat, providerPos?.lng, customerPos?.lat, customerPos?.lng]);

  const recenterMap = useCallback(() => {
    if (!map) return;
    if (providerPos && customerPos) {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(providerPos);
      bounds.extend(customerPos);
      map.fitBounds(bounds, { top: 120, bottom: 320, left: 40, right: 40 });
    } else if (providerPos) {
      map.panTo(providerPos);
      map.setZoom(15);
    }
  }, [map, providerPos, customerPos]);

  // Listen for incoming chat messages — play sound + system notification when chat is closed
  const isChatOpenRef = useRef(isChatOpen);
  useEffect(() => { isChatOpenRef.current = isChatOpen; }, [isChatOpen]);

  useEffect(() => {
    if (!jobId) return;
    const channel = supabase.channel(`chat-notify-provider-${jobId}`, {
      config: { broadcast: { self: false } },
    });
    channel
      .on('broadcast', { event: 'new_message' }, (payload) => {
        const msg = payload.payload;
        if (!msg || msg.sender_role === 'provider') return;
        if (!isChatOpenRef.current) {
          initAudio();
          playMessageSound();
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
          const senderName = msg.sender_name || 'Customer';
          showSystemNotification(
            `Message from ${senderName}`,
            msg.text?.slice(0, 80) || 'Sent you a message',
            `chat-${jobId}`,
          );
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [jobId]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const takePhoto = async () => {
    try {
      const image = await CapCamera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt, // let user choose camera or gallery
      });
      if (image.dataUrl) {
        setPhotos((prev) => [...prev, image.dataUrl!]);
      }
    } catch (e: any) {
      // Fallback to native file input if Capacitor Camera fails (e.g. web browser)
      if (e?.message?.includes?.('not implemented') || e?.message?.includes?.('not available')) {
        fileInputRef.current?.click();
      } else {
        console.warn('Camera error:', e);
        // Still try file input as fallback
        fileInputRef.current?.click();
      }
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result) {
        setPhotos((prev) => [...prev, reader.result as string]);
      }
    };
    reader.readAsDataURL(file);
    // Reset input so the same file can be selected again
    e.target.value = '';
  };

  const handleCall = () => {
    setIsCallOutgoing(true);
    setIsCallOpen(true);
  };
  const handleMessage = () => setIsChatOpen(true);

  // Listen for incoming VoIP calls from customer
  useEffect(() => {
    if (!jobId) return;
    const callChannel = supabase.channel(`call-signal-${jobId}`, {
      config: { broadcast: { self: false } },
    });
    callChannel.on('broadcast', { event: 'call_signal' }, (payload) => {
      const signal = payload.payload;
      if (signal?.type === 'call_incoming' && !isCallOpen) {
        setIsCallOutgoing(false);
        setIsCallOpen(true);
      }
    }).subscribe();
    return () => { supabase.removeChannel(callChannel); };
  }, [jobId, isCallOpen]);
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
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E8E4DE';

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
                  fillColor: '#0070B8',
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
                  fillColor: '#008CE5',
                  fillOpacity: 1,
                  strokeColor: '#0070B8',
                  strokeWeight: 2,
                }}
                title="You"
              />
            )}

            {directions && status === 'enroute' && (
              <DirectionsRenderer
                directions={directions}
                options={{
                  suppressMarkers: true,
                  polylineOptions: { strokeColor: '#0070B8', strokeWeight: 5, strokeOpacity: 0.8 },
                }}
              />
            )}
          </GoogleMap>
        ) : (
          <div className="h-full flex items-center justify-center" style={{ background: isDark ? '#0F1419' : '#E8EAED' }}>
            <div className="w-10 h-10 border-4 border-[#008CE5] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      <div className="absolute top-6 left-4 z-30 flex gap-2">
        <button onClick={() => navigate('/home')} className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg" style={{ backgroundColor: cardBg }} title="Back to home">
          <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
        </button>
        <button onClick={recenterMap} className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg" style={{ backgroundColor: cardBg }} title="Recenter map">
          <RecenterIcon className="w-5 h-5" style={{ color: '#008CE5' }} />
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
            <p className="text-sm mt-1" style={{ color: '#008CE5' }}>
              {eta !== null ? `${eta} min away` : 'Calculating ETA...'}
            </p>
          )}
          {status === 'arrived' && <p className="text-sm mt-1" style={{ color: '#0070B8' }}>Arrived at customer location</p>}
          {status === 'working' && <p className="text-sm mt-1" style={{ color: '#008CE5' }}>Service in progress</p>}
          {status === 'photos' && <p className="text-sm mt-1" style={{ color: '#008CE5' }}>Add completion photos</p>}
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
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#008CE5] to-[#0070B8] flex items-center justify-center text-lg font-bold text-white">
              {job.customerInitials}
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-base" style={{ color: textColor }}>{job.customer}</h3>
              <p className="text-xs" style={{ color: subColor }}>{job.location}</p>
            </div>
          </div>

          {job.notes && (
            <div className="rounded-xl p-3 mb-3" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F5F2ED' }}>
              <p className="text-xs" style={{ color: subColor }}>{job.notes}</p>
            </div>
          )}

          <div className="grid grid-cols-4 gap-2.5 mb-3">
            <button
              onClick={handleCall}
              className="rounded-2xl py-3 flex flex-col items-center gap-1.5 border transition-all active:scale-95"
              style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F7F4EF', borderColor: cardBorder }}
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(0,140,229,0.15)' }}>
                <Phone className="w-4 h-4" style={{ color: '#008CE5' }} />
              </div>
              <span className="text-[11px] font-semibold" style={{ color: textColor }}>Call</span>
            </button>
            <button
              onClick={handleMessage}
              className="rounded-2xl py-3 flex flex-col items-center gap-1.5 border transition-all active:scale-95"
              style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F7F4EF', borderColor: cardBorder }}
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(0,140,229,0.15)' }}>
                <MessageCircle className="w-4 h-4" style={{ color: '#008CE5' }} />
              </div>
              <span className="text-[11px] font-semibold" style={{ color: textColor }}>Message</span>
            </button>
            <button
              onClick={handleShare}
              className="rounded-2xl py-3 flex flex-col items-center gap-1.5 border transition-all active:scale-95"
              style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F7F4EF', borderColor: cardBorder }}
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(0,140,229,0.15)' }}>
                <Share2 className="w-4 h-4" style={{ color: '#008CE5' }} />
              </div>
              <span className="text-[11px] font-semibold" style={{ color: textColor }}>Share</span>
            </button>
            <button
              onClick={openExternalNavigation}
              className="rounded-2xl py-3 flex flex-col items-center gap-1.5 border transition-all active:scale-95"
              style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F7F4EF', borderColor: cardBorder }}
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(0,112,184,0.16)' }}>
                <MapPinned className="w-4 h-4" style={{ color: '#0070B8' }} />
              </div>
              <span className="text-[11px] font-semibold" style={{ color: textColor }}>Navigate</span>
            </button>
          </div>

          {/* Step Progress Buttons */}
          <div className="mb-3">
            <div
              className="h-1.5 rounded-full mb-2.5 overflow-hidden"
              style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB' }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(STATUS_ORDER[status] / 3) * 100}%`,
                  background: 'linear-gradient(90deg, #008CE5, #0070B8)',
                }}
              />
            </div>

            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Arrive', Icon: MapPin },
                { label: 'Service', Icon: Wrench },
                { label: 'Photos', Icon: Camera },
                { label: 'Complete', Icon: Flag },
              ].map((step, idx) => {
                const currentIdx = STATUS_ORDER[status];
                const isDone = idx < currentIdx;
                const isCurrent = idx === currentIdx;
                const StepIcon = step.Icon;

                const cardStyle = isDone
                  ? {
                      backgroundColor: 'rgba(0,140,229,0.1)',
                      border: '1px solid rgba(0,140,229,0.3)',
                    }
                  : isCurrent
                    ? {
                        background: 'linear-gradient(135deg, rgba(0,140,229,0.18), rgba(0,112,184,0.18))',
                        border: '1px solid rgba(0,140,229,0.42)',
                        boxShadow: '0 8px 18px rgba(0,140,229,0.15)',
                      }
                    : {
                        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F3F4F6',
                        border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB'}`,
                      };

                return (
                  <div
                    key={step.label}
                    className="rounded-2xl py-2.5 px-1 flex flex-col items-center justify-center gap-1.5 transition-all duration-300"
                    style={cardStyle}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center"
                      style={{
                        background: isDone || isCurrent
                          ? 'linear-gradient(135deg, #008CE5, #0070B8)'
                          : 'rgba(156,163,175,0.22)',
                      }}
                    >
                      {isDone ? (
                        <Check className="w-4 h-4 text-white" />
                      ) : (
                        <StepIcon className="w-4 h-4" style={{ color: isCurrent ? '#FFFFFF' : '#6B7280' }} />
                      )}
                    </div>
                    <span
                      className="text-[11px] font-semibold leading-none"
                      style={{
                        color: isDone || isCurrent ? '#0070B8' : isDark ? 'rgba(255,255,255,0.45)' : '#9CA3AF',
                      }}
                    >
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {status === 'enroute' && (
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={async () => {
                setStatus('arrived');
                if (jobId) {
                  await updateJobStatus(jobId, 'arrived').catch(console.warn);
                  // Broadcast to customer for instant UI update
                  const bc = supabase.channel(`job-accepted-${jobId}`);
                  bc.subscribe((s) => {
                    if (s === 'SUBSCRIBED') {
                      bc.send({ type: 'broadcast', event: 'status_update', payload: { job_id: jobId, status: 'arrived' } }).catch(() => {});
                      setTimeout(() => supabase.removeChannel(bc), 2000);
                    }
                  });
                }
              }}
              className="w-full flex items-center justify-center gap-2"
              style={{
                background: 'linear-gradient(135deg, #008CE5, #0070B8)',
                boxShadow: '0 10px 24px rgba(0,140,229,0.34)',
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: '16px',
                padding: '16px 0',
                borderRadius: '16px',
                marginBottom: '8px',
              }}
            >
              <MapPin className="w-5 h-5" />
              <span>I&apos;ve Arrived</span>
            </motion.button>
          )}

          {status === 'arrived' && (
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={async () => {
                setStatus('working');
                if (jobId) {
                  await updateJobStatus(jobId, 'inprogress').catch(console.warn);
                  // Broadcast to customer for instant UI update
                  const bc = supabase.channel(`job-accepted-${jobId}`);
                  bc.subscribe((s) => {
                    if (s === 'SUBSCRIBED') {
                      bc.send({ type: 'broadcast', event: 'status_update', payload: { job_id: jobId, status: 'inprogress' } }).catch(() => {});
                      setTimeout(() => supabase.removeChannel(bc), 2000);
                    }
                  });
                }
              }}
              className="w-full flex items-center justify-center gap-2"
              style={{
                background: 'linear-gradient(135deg, #008CE5, #0070B8)',
                boxShadow: '0 10px 24px rgba(0,140,229,0.34)',
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: '16px',
                padding: '16px 0',
                borderRadius: '16px',
                marginBottom: '8px',
              }}
            >
              <Wrench className="w-5 h-5" />
              <span>Start Service</span>
            </motion.button>
          )}

          {status === 'working' && (
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setStatus('photos')}
              className="w-full flex items-center justify-center gap-2"
              style={{
                background: 'linear-gradient(135deg, #008CE5, #0070B8)',
                boxShadow: '0 10px 24px rgba(0,140,229,0.34)',
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: '16px',
                padding: '16px 0',
                borderRadius: '16px',
                marginBottom: '8px',
              }}
            >
              <Camera className="w-5 h-5" />
              <span>Take Completion Photos</span>
            </motion.button>
          )}

          {status === 'photos' && (
            <>
              {/* Hidden file input fallback */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                aria-label="Upload completion photo"
                title="Upload completion photo"
                className="hidden"
                onChange={handleFileInput}
              />

              {/* Photo thumbnails */}
              {photos.length > 0 && (
                <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
                  {photos.map((photo, idx) => (
                    <div key={idx} className="relative flex-shrink-0">
                      <img
                        src={photo}
                        alt={`Completion photo ${idx + 1}`}
                        className="w-16 h-16 rounded-xl object-cover border-2"
                        style={{ borderColor: '#008CE5' }}
                      />
                      <button
                        onClick={() => setPhotos((prev) => prev.filter((_, i) => i !== idx))}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={takePhoto}
                className="w-full rounded-2xl py-4 font-semibold text-sm mb-2 flex items-center justify-center gap-2"
                style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F5F2ED', color: textColor }}
              >
                {photos.length > 0 ? <ImagePlus className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
                {photos.length > 0 ? `Add another photo (${photos.length} added)` : 'Take a photo'}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate(`/complete/${jobId}`)}
                disabled={photos.length === 0}
                className="w-full flex items-center justify-center gap-2"
                style={{
                  background: photos.length > 0
                    ? 'linear-gradient(135deg, #008CE5, #0070B8)'
                    : (isDark ? 'rgba(255,255,255,0.12)' : '#D1D5DB'),
                  boxShadow: photos.length > 0 ? '0 10px 24px rgba(0,140,229,0.34)' : 'none',
                  color: photos.length > 0 ? '#FFFFFF' : '#6B7280',
                  fontWeight: 700,
                  fontSize: '16px',
                  padding: '16px 0',
                  borderRadius: '16px',
                  marginBottom: '8px',
                  cursor: photos.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                <Flag className="w-5 h-5" />
                <span>Complete Job</span>
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
              style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F5F2ED', color: textColor }}
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
          <p className="text-sm font-semibold" style={{ color: '#008CE5' }}>Job details shared!</p>
        </motion.div>
      )}

      {!customerPos && (
        <div className="fixed inset-0 z-40 pointer-events-none flex items-center justify-center">
          <div className="rounded-2xl px-5 py-3 backdrop-blur-md" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#008CE5' }} />
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

      <CallModal
        isOpen={isCallOpen}
        onClose={() => setIsCallOpen(false)}
        jobId={jobId || ''}
        peerName={job.customer}
        peerInitials={job.customerInitials}
        isOutgoing={isCallOutgoing}
      />
    </div>
  );
}
