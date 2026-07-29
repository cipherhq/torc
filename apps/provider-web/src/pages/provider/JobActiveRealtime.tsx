import { motion } from 'motion/react';
import { useNavigate, useParams } from 'react-router';
import { KeepAwake } from '@capacitor-community/keep-awake';
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
  AlertTriangle,
  CalendarCheck,
  Play,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { GoogleMap, MarkerF, CircleF, DirectionsRenderer } from '@react-google-maps/api';
import { ChatModal } from '../../components/ChatModal';
import { CallModal } from '../../components/CallModal';
import { callPhone, shareJobDetails } from '../../utils/communication';
import { useJob } from '../../context/JobContext';
import { useRealtimeLocation, useWatchPosition } from '../../hooks/useRealtimeLocation';
import { useGoogleMaps } from '../../context/GoogleMapsContext';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../lib/supabase';
import { initAudio, playMessageSound, showSystemNotification } from '../../utils/audio';
import { decryptMessage } from '../../lib/chatEncryption';

type UiStatus = 'enroute' | 'arrived' | 'dropoff' | 'working' | 'photos';

const STATUS_ORDER: Record<UiStatus, number> = {
  enroute: 0,
  arrived: 1,
  dropoff: 2,
  working: 3,
  photos: 4,
};

function mapJobStatusToUi(status?: string): UiStatus {
  if (status === 'arrived') return 'arrived';
  if (status === 'enroute_destination') return 'dropoff';
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

function getDestinationPosition(job: any): { lat: number; lng: number } | null {
  const lat = Number(job?.destination_latitude);
  const lng = Number(job?.destination_longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}

/** Haversine distance in miles between two lat/lng points */
function distanceMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const ARRIVAL_PROXIMITY_MILES = 0.5; // ~0.5 miles threshold

const mapContainerStyle = { width: '100%', height: '100%' };

const darkMapStyles = [
  { elementType: 'geometry', stylers: [{ color: '#14263D' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#14263D' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6B7280' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2A3441' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#14263D' }] },
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
  const [showScheduledScreen, setShowScheduledScreen] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [customerConfirmed, setCustomerConfirmed] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [hasUnreadChat, setHasUnreadChat] = useState(false);
  const [isCallOpen, setIsCallOpen] = useState(false);
  const [isCallOutgoing, setIsCallOutgoing] = useState(true);
  const [shareToast, setShareToast] = useState(false);
  const [showNavPicker, setShowNavPicker] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelCustomReason, setCancelCustomReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [showProximityWarning, setShowProximityWarning] = useState(false);
  const [proximityDistance, setProximityDistance] = useState<number | null>(null);
  const [proximityAction, setProximityAction] = useState<'arrival' | 'dropoff'>('arrival');
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [directionsError, setDirectionsError] = useState(false);
  const [eta, setEta] = useState<number | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const directionsRunningRef = useRef(false);
  const lastDirectionsRequestAtRef = useRef(0);
  const directionsRetryCountRef = useRef(0);
  const directionsRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasInitialFit = useRef(false);
  const [mapMode, setMapMode] = useState<'follow' | 'overview'>('follow');
  const [animatedProviderPos, setAnimatedProviderPos] = useState<{ lat: number; lng: number } | null>(null);
  const animationRef = useRef<number | null>(null);
  const prevProviderPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const [sheetExpanded, setSheetExpanded] = useState(true);
  const [lastHeading, setLastHeading] = useState(0);
  const [showCustomerCancelled, setShowCustomerCancelled] = useState(false);
  const [cancelledReason, setCancelledReason] = useState('');

  // Forward-only status setter — status can NEVER go backward
  const setStatus = useCallback((next: UiStatus | ((prev: UiStatus) => UiStatus)) => {
    setStatusRaw((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      // Only advance forward, never backward
      if (STATUS_ORDER[resolved] >= STATUS_ORDER[prev]) return resolved;
      return prev;
    });
  }, []);

  // Keep screen awake and start foreground location service during active service
  useEffect(() => {
    KeepAwake.keepAwake().catch(() => {});
    import('../../utils/locationService').then(({ startLocationService }) => startLocationService());
    return () => {
      KeepAwake.allowSleep().catch(() => {});
      import('../../utils/locationService').then(({ stopLocationService }) => stopLocationService());
    };
  }, []);

  // Provider device location (source of truth for real-time movement)
  const myPosition = useWatchPosition(true);
  const { broadcastLocation } = useRealtimeLocation({ jobId, role: 'provider', enabled: !!jobId });

  useEffect(() => {
    if (myPosition) {
      broadcastLocation(myPosition);
      if (myPosition.heading !== null && myPosition.heading !== undefined) {
        setLastHeading(myPosition.heading);
      }
    }
  }, [myPosition, broadcastLocation]);

  // Re-broadcast fresh position immediately when app returns from background
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'visible' && myPosition) {
        // Force immediate re-broadcast so customer gets fresh provider position
        broadcastLocation(myPosition);
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [myPosition, broadcastLocation]);

  // Initial fetch — set status from DB
  useEffect(() => {
    if (!jobId) return;
    fetchJob(jobId)
      .then((job: any) => {
        setStatus(mapJobStatusToUi(job?.status));
        if (job?.customer_completed_at) setCustomerConfirmed(true);
        // Show scheduled screen only for genuine scheduled requests (not instant)
        // A real scheduled request has scheduled_for well after created_at AND in the future
        if (job?.scheduled_for && job?.status === 'accepted') {
          const scheduledTime = new Date(job.scheduled_for).getTime();
          const createdTime = new Date(job.created_at).getTime();
          const now = Date.now();
          const isGenuinelyScheduled = (scheduledTime - createdTime > 30 * 60 * 1000) && (scheduledTime - now > 10 * 60 * 1000);
          if (isGenuinelyScheduled) {
            setShowScheduledScreen(true);
          }
        }
      })
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
        const dbStatus = payload.new?.status;

        // Detect customer cancellation from DB
        if (dbStatus === 'cancelled') {
          setCancelledReason(payload.new?.cancellation_reason || 'Customer cancelled the request');
          setShowCustomerCancelled(true);
          return;
        }

        if (dbStatus) {
          const uiStatus = mapJobStatusToUi(dbStatus);
          setStatus(uiStatus);
        }
        fetchJob(jobId).catch(console.warn);

        if (payload.new?.customer_completed_at && !payload.old?.customer_completed_at) {
          setCustomerConfirmed(true);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [jobId, fetchJob, setStatus, navigate]);

  // Listen for instant cancellation broadcast from customer
  useEffect(() => {
    if (!jobId) return;

    const bc = supabase
      .channel(`job-cancel-listen-${jobId}`)
      .on('broadcast', { event: 'job_cancelled' }, (payload) => {
        const data = payload.payload;
        if (data?.job_id === jobId && data?.cancelled_by === 'customer') {
          setCancelledReason(data.reason || 'Customer cancelled the request');
          setShowCustomerCancelled(true);
        }
      });

    // Also listen on the job-accepted channel (same channel customer broadcasts on)
    const acceptedChannel = supabase
      .channel(`job-accepted-${jobId}`)
      .on('broadcast', { event: 'job_cancelled' }, (payload) => {
        const data = payload.payload;
        if (data?.job_id === jobId && data?.cancelled_by === 'customer') {
          setCancelledReason(data.reason || 'Customer cancelled the request');
          setShowCustomerCancelled(true);
        }
      });

    bc.subscribe();
    acceptedChannel.subscribe();

    return () => {
      supabase.removeChannel(bc);
      supabase.removeChannel(acceptedChannel);
    };
  }, [jobId]);

  const customerPos = useMemo(() => getPickupPosition(currentJob), [currentJob]);
  const destinationPos = useMemo(() => getDestinationPosition(currentJob), [currentJob]);
  const hasDestination = !!destinationPos;
  const navigationTarget = (status === 'dropoff' && destinationPos) ? destinationPos : customerPos;
  const providerPos = myPosition;

  // Smooth marker interpolation — animate between GPS updates like Uber
  useEffect(() => {
    if (!providerPos) return;
    const prev = prevProviderPosRef.current;
    if (!prev) {
      setAnimatedProviderPos(providerPos);
      prevProviderPosRef.current = { lat: providerPos.lat, lng: providerPos.lng };
      return;
    }
    // Cancel any running animation
    if (animationRef.current) cancelAnimationFrame(animationRef.current);

    const startLat = prev.lat;
    const startLng = prev.lng;
    const endLat = providerPos.lat;
    const endLng = providerPos.lng;
    const duration = 1000; // 1 second smooth transition
    const startTime = performance.now();

    function animate(now: number) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      // Ease out cubic for natural deceleration
      const ease = 1 - Math.pow(1 - t, 3);
      const lat = startLat + (endLat - startLat) * ease;
      const lng = startLng + (endLng - startLng) * ease;
      setAnimatedProviderPos({ lat, lng });
      if (t < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        prevProviderPosRef.current = { lat: endLat, lng: endLng };
      }
    }
    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [providerPos?.lat, providerPos?.lng]);

  const confirmArrival = useCallback(async () => {
    setShowProximityWarning(false);
    setStatus('arrived');
    if (jobId) {
      await updateJobStatus(jobId, 'arrived').catch(console.warn);
      const bc = supabase.channel(`job-accepted-${jobId}`);
      bc.subscribe((s) => {
        if (s === 'SUBSCRIBED') {
          bc.send({ type: 'broadcast', event: 'status_update', payload: { job_id: jobId, status: 'arrived' } }).catch(() => {});
          setTimeout(() => supabase.removeChannel(bc), 2000);
        }
      });
    }
  }, [jobId, setStatus, updateJobStatus]);

  const confirmDropoffArrival = useCallback(async () => {
    setShowProximityWarning(false);
    setStatusRaw('working');
    if (jobId) {
      await updateJobStatus(jobId, 'inprogress').catch(console.warn);
      const bc = supabase.channel(`job-accepted-${jobId}`);
      bc.subscribe((s) => {
        if (s === 'SUBSCRIBED') {
          bc.send({ type: 'broadcast', event: 'status_update', payload: { job_id: jobId, status: 'inprogress' } }).catch(() => {});
          setTimeout(() => supabase.removeChannel(bc), 2000);
        }
      });
    }
  }, [jobId, updateJobStatus]);

  // Begin service for scheduled jobs — transitions to enroute state
  const beginScheduledService = useCallback(async () => {
    setShowScheduledScreen(false);
    if (jobId) {
      // Broadcast to customer that provider is heading their way
      const bc = supabase.channel(`job-accepted-${jobId}`);
      bc.subscribe((s) => {
        if (s === 'SUBSCRIBED') {
          bc.send({ type: 'broadcast', event: 'status_update', payload: { job_id: jobId, status: 'enroute' } }).catch(() => {});
          setTimeout(() => supabase.removeChannel(bc), 2000);
        }
      });
      // Update DB status
      await updateJobStatus(jobId, 'enroute').catch(console.warn);
    }
  }, [jobId, updateJobStatus]);

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
    if (!isLoaded || !providerPos || !navigationTarget) return;
    if (status !== 'accepted' && status !== 'enroute' && status !== 'dropoff') return;
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
        destination: navigationTarget,
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

        console.warn('[Directions API] Failed:', routeStatusText, 'origin:', providerPos, 'dest:', navigationTarget);

        const isRetryable = routeStatusText === 'OVER_QUERY_LIMIT' || routeStatusText === 'UNKNOWN_ERROR';
        if (isRetryable && directionsRetryCountRef.current < 3) {
          directionsRetryCountRef.current += 1;
          const backoffMs = 1000 * directionsRetryCountRef.current;
          console.warn('[Directions API] Retrying in', backoffMs, 'ms (attempt', directionsRetryCountRef.current, ')');
          if (directionsRetryTimeoutRef.current) clearTimeout(directionsRetryTimeoutRef.current);
          directionsRetryTimeoutRef.current = setTimeout(() => requestDrivingDirections(true), backoffMs);
          return;
        }

        console.warn('[Directions API] Giving up after status:', routeStatusText, '- falling back to Haversine ETA');
        setDirectionsError(true);
        const R = 6371;
        const dLat = (navigationTarget.lat - providerPos.lat) * Math.PI / 180;
        const dLng = (navigationTarget.lng - providerPos.lng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
          Math.cos(providerPos.lat * Math.PI / 180) * Math.cos(navigationTarget.lat * Math.PI / 180) *
          Math.sin(dLng / 2) ** 2;
        const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        setEta(Math.max(1, Math.ceil((dist / 30) * 60)));
      }
    );
  }, [isLoaded, providerPos?.lat, providerPos?.lng, navigationTarget?.lat, navigationTarget?.lng, status]);

  useEffect(() => {
    requestDrivingDirections(false);
  }, [requestDrivingDirections]);

  // Re-fetch directions periodically, but keep request rate below quota limits.
  useEffect(() => {
    if (status !== 'accepted' && status !== 'enroute' && status !== 'dropoff') return;
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

  // Initial camera setup — follow mode when enroute/dropoff, overview otherwise
  useEffect(() => {
    if (!map || !providerPos || hasInitialFit.current) return;
    hasInitialFit.current = true;

    if (status === 'enroute' || status === 'dropoff') {
      setMapMode('follow');
      map.panTo(providerPos);
      map.setZoom(16);
      if (lastHeading) {
        map.setHeading(lastHeading);
        map.setTilt(45);
      }
    } else if (customerPos) {
      setMapMode('overview');
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(providerPos);
      bounds.extend(customerPos);
      map.fitBounds(bounds, { top: 120, bottom: 320, left: 40, right: 40 });
    }
  }, [map, providerPos?.lat, providerPos?.lng, customerPos?.lat, customerPos?.lng]);

  // Auto-follow camera when in follow mode and enroute/dropoff
  useEffect(() => {
    if (!map || !providerPos || mapMode !== 'follow' || (status !== 'enroute' && status !== 'dropoff')) return;

    map.panTo(providerPos);
    const currentZoom = map.getZoom();
    if (currentZoom === undefined || currentZoom < 15 || currentZoom > 18) {
      map.setZoom(16);
    }
    if (lastHeading) {
      map.setHeading(lastHeading);
      map.setTilt(45);
    }
  }, [map, providerPos?.lat, providerPos?.lng, mapMode, status, lastHeading]);

  // Exit follow mode when status transitions away from enroute/dropoff
  const prevStatusRef = useRef(status);
  useEffect(() => {
    const wasFollowing = prevStatusRef.current === 'enroute' || prevStatusRef.current === 'dropoff';
    const isFollowing = status === 'enroute' || status === 'dropoff';
    if (wasFollowing && !isFollowing) {
      setMapMode('overview');
      if (map) {
        map.setHeading(0);
        map.setTilt(0);
        if (providerPos && customerPos) {
          const bounds = new google.maps.LatLngBounds();
          bounds.extend(providerPos);
          bounds.extend(customerPos);
          map.fitBounds(bounds, { top: 120, bottom: 320, left: 40, right: 40 });
        }
      }
    }
    prevStatusRef.current = status;
  }, [status, map]);

  const recenterMap = useCallback(() => {
    if (!map) return;

    if (status === 'enroute' || status === 'dropoff') {
      if (mapMode === 'overview') {
        // Switch to follow mode
        setMapMode('follow');
        if (providerPos) {
          map.panTo(providerPos);
          map.setZoom(16);
          if (lastHeading) {
            map.setHeading(lastHeading);
            map.setTilt(45);
          }
        }
      } else {
        // Switch to overview mode
        setMapMode('overview');
        map.setHeading(0);
        map.setTilt(0);
        const target = navigationTarget || customerPos;
        if (providerPos && target) {
          const bounds = new google.maps.LatLngBounds();
          bounds.extend(providerPos);
          bounds.extend(target);
          map.fitBounds(bounds, { top: 120, bottom: 320, left: 40, right: 40 });
        }
      }
    } else {
      // Non-driving: just fit both markers
      if (providerPos && customerPos) {
        const bounds = new google.maps.LatLngBounds();
        bounds.extend(providerPos);
        bounds.extend(customerPos);
        map.fitBounds(bounds, { top: 120, bottom: 320, left: 40, right: 40 });
      } else if (providerPos) {
        map.panTo(providerPos);
        map.setZoom(15);
      }
    }
  }, [map, providerPos, customerPos, navigationTarget, status, mapMode, lastHeading]);

  // Listen for incoming chat messages — play sound + system notification when chat is closed
  const isChatOpenRef = useRef(isChatOpen);
  useEffect(() => { isChatOpenRef.current = isChatOpen; }, [isChatOpen]);

  useEffect(() => {
    if (!jobId) return;
    const channel = supabase.channel(`chat-notify-provider-${jobId}`, {
      config: { broadcast: { self: false } },
    });
    channel
      .on('broadcast', { event: 'new_message' }, async (payload) => {
        const msg = payload.payload;
        if (!msg || msg.sender_role === 'provider') return;
        setHasUnreadChat(true);
        if (!isChatOpenRef.current) {
          initAudio();
          playMessageSound();
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
          const senderName = msg.sender_name || 'Customer';
          const plainText = msg.text ? await decryptMessage(jobId!, msg.text) : '';
          showSystemNotification(
            `Message from ${senderName}`,
            plainText?.slice(0, 80) || 'Sent you a message',
            `chat-${jobId}`,
          );
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [jobId]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const takePhoto = async (source: CameraSource = CameraSource.Prompt) => {
    try {
      const image = await CapCamera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source,
        promptLabelHeader: 'Add Photo',
        promptLabelPhoto: 'Choose from Gallery',
        promptLabelPicture: 'Take Photo',
      });
      if (image.dataUrl) {
        setPhotos((prev) => [...prev, image.dataUrl!]);
        if (status === 'working') setStatus('photos');
      }
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg.includes('cancelled') || msg.includes('canceled') || msg.includes('User cancelled')) return;
      console.warn('Camera error:', e);
      // Fallback to native file input
      fileInputRef.current?.click();
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

  const uploadPhotosAndComplete = async () => {
    if (!jobId) return;
    setUploadingPhotos(true);
    try {
      if (photos.length > 0) {
        const urls: string[] = [];
        for (const dataUrl of photos) {
          try {
            const res = await fetch(dataUrl);
            const blob = await res.blob();
            const ext = blob.type === 'image/png' ? 'png' : 'jpg';
            const path = `jobs/${jobId}/provider_${Date.now()}_${urls.length}.${ext}`;
            const { error } = await supabase.storage.from('job-photos').upload(path, blob, { contentType: blob.type, upsert: true });
            if (!error) {
              const { data: urlData } = await supabase.storage.from('job-photos').createSignedUrl(path, 3600);
              if (urlData?.signedUrl) urls.push(urlData.signedUrl);
            }
          } catch { /* skip failed individual photo */ }
        }
        // Save photo URLs to the job
        if (urls.length > 0) {
          await supabase.from('jobs').update({ provider_photo_urls: urls }).eq('id', jobId);
        }
      }
      navigate(`/complete/${jobId}`);
    } catch (e) {
      console.warn('Photo upload failed:', e);
      // Navigate anyway so provider isn't stuck
      navigate(`/complete/${jobId}`);
    } finally {
      setUploadingPhotos(false);
    }
  };

  const handleCall = () => {
    if (job.customerPhone) {
      callPhone(job.customerPhone);
    }
  };
  const handleMessage = () => { setHasUnreadChat(false); setIsChatOpen(true); };

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

  function openNavApp(app: 'apple' | 'google' | 'waze') {
    const target = navigationTarget || customerPos;
    if (!target) return;
    const dest = `${target.lat},${target.lng}`;
    const origin = providerPos ? `${providerPos.lat},${providerPos.lng}` : '';
    let url = '';
    switch (app) {
      case 'apple':
        url = `https://maps.apple.com/?daddr=${dest}&dirflg=d`;
        break;
      case 'google':
        url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=driving`;
        break;
      case 'waze':
        url = `https://waze.com/ul?ll=${dest}&navigate=yes`;
        break;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    setShowNavPicker(false);
  }

  const textColor = isDark ? '#FFFFFF' : '#14263D';
  const subColor = isDark ? 'rgba(255,255,255,0.55)' : '#6B7280';
  const cardBg = isDark ? 'rgba(26,31,46,0.95)' : 'rgba(255,255,255,0.95)';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2';

  // Scheduled job pre-screen — show before the real-time active job page
  if (showScheduledScreen) {
    const scheduledDate = currentJob?.scheduled_for
      ? new Date(currentJob.scheduled_for).toLocaleString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric',
          hour: 'numeric', minute: '2-digit', hour12: true,
        })
      : '';

    return (
      <div className="min-h-screen flex flex-col" style={{ background: isDark ? 'linear-gradient(180deg, #0A1626 0%, #081427 100%)' : 'linear-gradient(180deg, #F8FBFF 0%, #EAF2FF 100%)', paddingTop: 'var(--safe-top)' }}>
        {/* Header */}
        <div className="flex items-center px-4 py-3">
          <button onClick={() => navigate('/home')} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}>
            <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
          </button>
          <h1 className="flex-1 text-center font-bold text-lg" style={{ color: textColor }}>Scheduled Job</h1>
          <div className="w-10" />
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-12">
          {/* Success icon */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 15 }}
            className="mb-6"
          >
            <div className="w-28 h-28 rounded-full bg-gradient-to-br from-[#008CE5] to-[#0070B8] flex items-center justify-center mx-auto" style={{ boxShadow: '0 25px 60px -12px rgba(0,140,229,0.5)' }}>
              <CalendarCheck className="w-14 h-14" style={{ color: isDark ? '#081427' : '#14263D' }} />
            </div>
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-2xl font-bold mb-2 text-center" style={{ color: textColor }}>
            Job Accepted
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="text-base mb-8 text-center" style={{ color: subColor }}>
            This is a scheduled service request
          </motion.p>

          {/* Job details card */}
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="w-full max-w-md rounded-2xl p-6 text-left" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
            {/* Customer */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#008CE5] to-[#0070B8] flex items-center justify-center text-lg font-bold text-white">
                {job.customerInitials}
              </div>
              <div className="flex-1">
                <h3 className="font-bold" style={{ color: textColor }}>{job.customer}</h3>
                <p className="text-sm" style={{ color: subColor }}>{job.service}</p>
              </div>
            </div>

            {/* Location */}
            <div className="flex items-center gap-3 py-3" style={{ borderTop: `1px solid ${cardBorder}` }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(0,140,229,0.08)' }}>
                <MapPin className="w-5 h-5 text-[#008CE5]" />
              </div>
              <div className="flex-1">
                <p className="text-xs" style={{ color: subColor }}>Pickup Location</p>
                <p className="text-sm font-medium" style={{ color: textColor }}>{job.location}</p>
              </div>
            </div>

            {/* Scheduled time */}
            <div className="flex items-center gap-3 py-3" style={{ borderTop: `1px solid ${cardBorder}` }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(0,140,229,0.08)' }}>
                <Clock className="w-5 h-5 text-[#008CE5]" />
              </div>
              <div className="flex-1">
                <p className="text-xs" style={{ color: subColor }}>Scheduled For</p>
                <p className="text-[#008CE5] font-bold">{scheduledDate}</p>
              </div>
            </div>

            {/* Payout */}
            <div className="flex items-center gap-3 py-3" style={{ borderTop: `1px solid ${cardBorder}` }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(0,140,229,0.08)' }}>
                <Flag className="w-5 h-5 text-[#008CE5]" />
              </div>
              <div className="flex-1">
                <p className="text-xs" style={{ color: subColor }}>Payout</p>
                <p className="font-bold" style={{ color: textColor }}>{job.payout}</p>
              </div>
            </div>

            {job.notes && (
              <div className="rounded-xl p-3 mt-3" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#E8F0FB' }}>
                <p className="text-xs" style={{ color: subColor }}>Customer Notes: {job.notes}</p>
              </div>
            )}
          </motion.div>

          {/* Action buttons */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="w-full max-w-md mt-8 space-y-3">
            <button
              onClick={beginScheduledService}
              className="w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #008CE5, #0070B8)', boxShadow: '0 10px 24px rgba(0,140,229,0.34)' }}
            >
              <Play className="w-5 h-5" />
              Start Heading to Customer
            </button>
            <button
              onClick={() => navigate('/home')}
              className="w-full py-4 rounded-2xl font-semibold"
              style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E8F0FB', color: textColor }}
            >
              Go Home
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden pb-28" style={{ background: isDark ? '#0A1626' : '#E8EAED' }}>
      <div className="absolute inset-0">
        {isLoaded ? (
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={providerPos || customerPos || { lat: 37.7749, lng: -122.4194 }}
            zoom={14}
            onLoad={(nextMap) => setMap(nextMap)}
            onDragStart={() => {
              if (mapMode === 'follow') {
                setMapMode('overview');
                if (map) {
                  map.setHeading(0);
                  map.setTilt(0);
                }
              }
            }}
            options={{
              styles: isDark ? darkMapStyles : lightMapStyles,
              disableDefaultUI: true,
              zoomControl: false,
              gestureHandling: 'greedy',
            }}
          >
            {/* Customer pulsing ring */}
            {customerPos && (
              <CircleF
                center={customerPos}
                radius={45}
                options={{
                  fillColor: '#EF4444',
                  fillOpacity: 0.08,
                  strokeColor: '#EF4444',
                  strokeOpacity: 0.2,
                  strokeWeight: 2,
                }}
              />
            )}
            {/* Customer marker */}
            {customerPos && (
              <MarkerF
                position={customerPos}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 12,
                  fillColor: '#EF4444',
                  fillOpacity: 1,
                  strokeColor: '#FFFFFF',
                  strokeWeight: 4,
                }}
                title="Customer"
              />
            )}

            {/* Provider accuracy/pulse ring */}
            {animatedProviderPos && (
              <CircleF
                center={animatedProviderPos}
                radius={30}
                options={{
                  fillColor: '#008CE5',
                  fillOpacity: 0.1,
                  strokeColor: '#008CE5',
                  strokeOpacity: 0.25,
                  strokeWeight: 2,
                }}
              />
            )}
            {/* Provider outer glow ring */}
            {animatedProviderPos && (
              <CircleF
                center={animatedProviderPos}
                radius={60}
                options={{
                  fillColor: '#008CE5',
                  fillOpacity: 0.04,
                  strokeColor: '#008CE5',
                  strokeOpacity: 0.1,
                  strokeWeight: 1,
                }}
              />
            )}
            {/* Provider marker — large arrow with white border */}
            {animatedProviderPos && (
              <MarkerF
                position={animatedProviderPos}
                icon={{
                  path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                  scale: 10,
                  fillColor: '#008CE5',
                  fillOpacity: 1,
                  strokeColor: '#FFFFFF',
                  strokeWeight: 3,
                  rotation: lastHeading || 0,
                  anchor: new google.maps.Point(0, 2.5),
                }}
                title="You"
              />
            )}

            {/* Destination marker (for towing drop-off) */}
            {destinationPos && (status === 'arrived' || status === 'dropoff') && (
              <MarkerF
                position={destinationPos}
                icon={{
                  path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
                  scale: 8,
                  fillColor: '#10B981',
                  fillOpacity: 1,
                  strokeColor: '#FFFFFF',
                  strokeWeight: 2,
                }}
                title="Drop-off"
              />
            )}

            {directions && (status === 'accepted' || status === 'enroute' || status === 'dropoff') && (
              <DirectionsRenderer
                directions={directions}
                options={{
                  suppressMarkers: true,
                  polylineOptions: { strokeColor: '#008CE5', strokeWeight: 6, strokeOpacity: 0.9 },
                }}
              />
            )}


          </GoogleMap>
        ) : (
          <div className="h-full flex items-center justify-center" style={{ background: isDark ? '#0A1626' : '#E8EAED' }}>
            <div className="w-10 h-10 border-4 border-[#008CE5] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      <div className="absolute top-6 left-4 z-30 flex gap-2">
        <button onClick={() => navigate('/home')} className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg" style={{ backgroundColor: cardBg }} title="Back to home">
          <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
        </button>
        <button onClick={recenterMap} className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg" style={{ backgroundColor: mapMode === 'follow' && (status === 'enroute' || status === 'dropoff') ? '#008CE5' : cardBg }} title={mapMode === 'follow' ? 'Show overview' : 'Follow me'}>
          <RecenterIcon className="w-5 h-5" style={{ color: mapMode === 'follow' && (status === 'enroute' || status === 'dropoff') ? '#FFFFFF' : '#008CE5' }} />
        </button>
      </div>

      {/* Live location sharing indicator */}
      {myPosition && (
        <div className="absolute z-30 flex flex-col items-center gap-1" style={{ top: '14px', left: '50%', transform: 'translateX(-50%)' }}>
          <div className="rounded-full px-4 py-1.5 shadow-lg flex items-center gap-2" style={{ backgroundColor: 'rgba(0,140,229,0.95)', backdropFilter: 'blur(8px)' }}>
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
            </span>
            <span className="text-white font-semibold text-xs">Live location sharing</span>
            {myPosition.speed != null && myPosition.speed > 0.5 && (
              <span className="text-white/70 text-xs ml-1">{Math.round(myPosition.speed * 3.6)} km/h</span>
            )}
          </div>
          <div className="rounded-full px-3 py-0.5 shadow-sm" style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
            <span className="text-white/80 font-mono text-[10px]">{myPosition.lat.toFixed(5)}, {myPosition.lng.toFixed(5)}</span>
          </div>
        </div>
      )}

      {/* ETA + Distance overlay — Uber-style */}
      {directions && directions.routes[0]?.legs[0] && (status === 'enroute' || status === 'dropoff') && (
        <div className="absolute z-30" style={{ top: myPosition ? '62px' : '60px', left: '50%', transform: 'translateX(-50%)' }}>
          <div className="rounded-2xl px-5 py-2.5 shadow-xl flex items-center gap-3" style={{ backgroundColor: 'rgba(10,22,38,0.92)', backdropFilter: 'blur(12px)' }}>
            {eta != null && (
              <>
                <div className="text-center">
                  <span className="text-white font-bold text-lg">{eta}</span>
                  <span className="text-white/60 text-xs ml-1">min</span>
                </div>
                <div className="w-px h-6 bg-white/20" />
              </>
            )}
            <span className="text-white/80 font-semibold text-sm">{directions.routes[0].legs[0].distance?.text}</span>
          </div>
        </div>
      )}

      {customerConfirmed && (
        <div className="absolute z-30" style={{ bottom: sheetExpanded ? '55%' : '180px', left: '50%', transform: 'translateX(-50%)' }}>
          <div className="rounded-full px-4 py-2 shadow-lg" style={{ backgroundColor: 'rgba(0,140,229,0.95)', backdropFilter: 'blur(8px)' }}>
            <p className="text-white text-xs font-semibold">Customer confirmed completion</p>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-30">
        <motion.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          className="rounded-t-3xl shadow-2xl overflow-hidden"
          style={{ backgroundColor: '#14263D', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
        >
          {/* Drag handle — tap to expand/collapse */}
          <button className="w-full flex justify-center pt-3 pb-2" onClick={() => setSheetExpanded(!sheetExpanded)}>
            <div className="w-10 h-1 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.3)' }} />
          </button>

          {/* Collapsed header — always visible */}
          <div className="mx-4 mb-2 flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#008CE5] to-[#0070B8] flex items-center justify-center text-sm font-bold flex-shrink-0 text-white">
                {job.customerInitials}
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-sm truncate text-white">{job.customer}</h3>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {status === 'enroute' ? (eta !== null ? `${eta} min away` : 'Calculating...') :
                   status === 'dropoff' ? (eta !== null ? `${eta} min to drop-off` : 'Calculating...') :
                   status === 'arrived' ? 'Arrived' :
                   status === 'working' ? 'Service in progress' :
                   status === 'photos' ? 'Add photos' : job.service}
                </p>
              </div>
            </div>
            <div className="text-right flex-shrink-0 ml-3">
              <p className="font-bold text-white">{job.payout}</p>
              <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{job.service}</p>
            </div>
          </div>

          {/* Communication row — always visible */}
          <div className="mx-4 mb-2">
            <div className="grid grid-cols-4 gap-2">
              <button
                onClick={handleMessage}
                className="relative flex flex-col items-center justify-center gap-1 py-3 rounded-xl active:scale-[0.97] transition-transform"
                style={{ backgroundColor: 'rgba(255,255,255,0.1)', touchAction: 'manipulation' }}
              >
                <MessageCircle className="w-5 h-5" style={{ color: '#FFFFFF' }} />
                <span className="text-xs font-medium" style={{ color: '#FFFFFF' }}>Message</span>
                {hasUnreadChat && !isChatOpen && (
                  <div className="absolute top-2 right-3 w-2.5 h-2.5 rounded-full bg-red-500" />
                )}
              </button>
              <button
                onClick={handleCall}
                className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl active:scale-[0.97] transition-transform"
                style={{ backgroundColor: 'rgba(255,255,255,0.1)', touchAction: 'manipulation' }}
              >
                <Phone className="w-5 h-5" style={{ color: '#FFFFFF' }} />
                <span className="text-xs font-medium" style={{ color: '#FFFFFF' }}>Call</span>
              </button>
              <button
                onClick={handleShare}
                className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl active:scale-[0.97] transition-transform"
                style={{ backgroundColor: 'rgba(255,255,255,0.1)', touchAction: 'manipulation' }}
              >
                <Share2 className="w-5 h-5" style={{ color: '#FFFFFF' }} />
                <span className="text-xs font-medium" style={{ color: '#FFFFFF' }}>Share</span>
              </button>
              <button
                onClick={() => setShowNavPicker(true)}
                className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl active:scale-[0.97] transition-transform"
                style={{ backgroundColor: 'rgba(255,255,255,0.1)', touchAction: 'manipulation' }}
              >
                <Navigation className="w-5 h-5" style={{ color: '#FFFFFF' }} />
                <span className="text-xs font-medium" style={{ color: '#FFFFFF' }}>Navigate</span>
              </button>
            </div>
          </div>

          {/* Expandable section */}
          <motion.div
            initial={false}
            animate={{ height: sheetExpanded ? 'auto' : 0, opacity: sheetExpanded ? 1 : 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >

          {/* Location details */}
          <div className="mx-4 mb-3 rounded-xl p-3" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
            <div className="flex items-start gap-2 mb-2">
              <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: '#EF4444' }} />
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>{job.location}</p>
            </div>
            {hasDestination && currentJob?.destination_address && (
              <div className="flex items-start gap-2">
                <Flag className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: '#10B981' }} />
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>{currentJob.destination_address}</p>
              </div>
            )}
            {job.notes && (
              <div className="rounded-lg p-2 mt-2" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>{job.notes}</p>
              </div>
            )}
          </div>

          {/* Step Progress */}
          <div className="mx-4 mb-3">
            {(() => {
              // Map each step to the UiStatus that activates it
              const steps = hasDestination
                ? [
                    { label: 'Arrive', Icon: MapPin, activateAt: 'arrived' as UiStatus },
                    { label: 'Drop-off', Icon: Flag, activateAt: 'dropoff' as UiStatus },
                    { label: 'Service', Icon: Wrench, activateAt: 'working' as UiStatus },
                    { label: 'Photos', Icon: Camera, activateAt: 'photos' as UiStatus },
                  ]
                : [
                    { label: 'Arrive', Icon: MapPin, activateAt: 'arrived' as UiStatus },
                    { label: 'Service', Icon: Wrench, activateAt: 'working' as UiStatus },
                    { label: 'Photos', Icon: Camera, activateAt: 'photos' as UiStatus },
                    { label: 'Complete', Icon: Flag, activateAt: 'photos' as UiStatus },
                  ];
              const currentOrder = STATUS_ORDER[status];
              const maxOrder = hasDestination ? STATUS_ORDER.photos : STATUS_ORDER.working;
              const progressFraction = Math.min(1, currentOrder / STATUS_ORDER.photos);
              return (
                <>
                  <div className="h-1 rounded-full mb-2 overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${progressFraction * 100}%`, background: 'linear-gradient(90deg, #008CE5, #0070B8)' }}
                    />
                  </div>
                  <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
                    {steps.map((step) => {
                      const stepOrder = STATUS_ORDER[step.activateAt];
                      const isDone = currentOrder > stepOrder;
                      const isCurrent = currentOrder === stepOrder;
                      const active = isDone || isCurrent;
                      const StepIcon = step.Icon;
                      return (
                        <div key={step.label} className="flex flex-col items-center gap-1">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center"
                            style={{
                              background: active ? 'linear-gradient(135deg, #008CE5, #0070B8)' : 'rgba(255,255,255,0.1)',
                            }}
                          >
                            {isDone ? <Check className="w-4 h-4" style={{ color: '#FFFFFF' }} /> : <StepIcon className="w-4 h-4" style={{ color: active ? '#FFFFFF' : 'rgba(255,255,255,0.4)' }} />}
                          </div>
                          <span className="text-[10px] font-semibold" style={{ color: active ? '#008CE5' : 'rgba(255,255,255,0.4)' }}>{step.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>

          </motion.div>

          {/* Action buttons — always visible */}
          <div className="px-4">
            {status === 'enroute' && (
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  if (providerPos && customerPos) {
                    const dist = distanceMiles(providerPos, customerPos);
                    if (dist > ARRIVAL_PROXIMITY_MILES) {
                      setProximityDistance(dist);
                      setProximityAction('arrival');
                      setShowProximityWarning(true);
                      return;
                    }
                  }
                  confirmArrival();
                }}
                className="w-full flex items-center justify-center gap-2 rounded-xl py-4 mb-2"
                style={{ backgroundColor: '#008CE5', color: '#FFFFFF', fontWeight: 700, fontSize: '16px' }}
              >
                <MapPin className="w-5 h-5" />
                <span>I&apos;ve Arrived</span>
              </motion.button>
            )}

            {status === 'arrived' && (
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={async () => {
                  if (hasDestination) {
                    // Towing: transition to dropoff (drive to destination)
                    setStatusRaw('dropoff');
                    setMapMode('follow');
                    if (jobId) {
                      await updateJobStatus(jobId, 'enroute_destination').catch(console.warn);
                      const bc = supabase.channel(`job-accepted-${jobId}`);
                      bc.subscribe((s) => {
                        if (s === 'SUBSCRIBED') {
                          bc.send({ type: 'broadcast', event: 'status_update', payload: { job_id: jobId, status: 'enroute_destination' } }).catch(() => {});
                          setTimeout(() => supabase.removeChannel(bc), 2000);
                        }
                      });
                    }
                  } else {
                    // Non-towing: go straight to working
                    setStatus('working');
                    if (jobId) {
                      await updateJobStatus(jobId, 'inprogress').catch(console.warn);
                      const bc = supabase.channel(`job-accepted-${jobId}`);
                      bc.subscribe((s) => {
                        if (s === 'SUBSCRIBED') {
                          bc.send({ type: 'broadcast', event: 'status_update', payload: { job_id: jobId, status: 'inprogress' } }).catch(() => {});
                          setTimeout(() => supabase.removeChannel(bc), 2000);
                        }
                      });
                    }
                  }
                }}
                className="w-full flex items-center justify-center gap-2 rounded-xl py-4 mb-2"
                style={{ backgroundColor: '#008CE5', color: '#FFFFFF', fontWeight: 700, fontSize: '16px' }}
              >
                <Wrench className="w-5 h-5" />
                <span>Start Service</span>
              </motion.button>
            )}

            {status === 'dropoff' && (
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={async () => {
                  // Proximity check against destination
                  if (providerPos && destinationPos) {
                    const dist = distanceMiles(providerPos, destinationPos);
                    if (dist > ARRIVAL_PROXIMITY_MILES) {
                      setProximityDistance(dist);
                      setProximityAction('dropoff');
                      setShowProximityWarning(true);
                      return;
                    }
                  }
                  setStatusRaw('working');
                  if (jobId) {
                    await updateJobStatus(jobId, 'inprogress').catch(console.warn);
                    const bc = supabase.channel(`job-accepted-${jobId}`);
                    bc.subscribe((s) => {
                      if (s === 'SUBSCRIBED') {
                        bc.send({ type: 'broadcast', event: 'status_update', payload: { job_id: jobId, status: 'inprogress' } }).catch(() => {});
                        setTimeout(() => supabase.removeChannel(bc), 2000);
                      }
                    });
                  }
                }}
                className="w-full flex items-center justify-center gap-2 rounded-xl py-4 mb-2"
                style={{ backgroundColor: '#008CE5', color: '#FFFFFF', fontWeight: 700, fontSize: '16px' }}
              >
                <Flag className="w-5 h-5" />
                <span>Arrived at Drop-off</span>
              </motion.button>
            )}

            {status === 'working' && (
              <>
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={uploadPhotosAndComplete}
                  disabled={uploadingPhotos}
                  className="w-full flex items-center justify-center gap-2 rounded-xl py-4 mb-2"
                  style={{ backgroundColor: '#008CE5', color: '#FFFFFF', fontWeight: 700, fontSize: '16px' }}
                >
                  <Flag className="w-5 h-5" />
                  <span>Complete Job</span>
                </motion.button>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => takePhoto(CameraSource.Camera)}
                    className="flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm"
                    style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#FFFFFF' }}
                  >
                    <Camera className="w-4 h-4" />
                    <span>Take Picture</span>
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => takePhoto(CameraSource.Photos)}
                    className="flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm"
                    style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#FFFFFF' }}
                  >
                    <ImagePlus className="w-4 h-4" />
                    <span>Upload Image</span>
                  </motion.button>
                </div>
              </>
            )}

            {status === 'photos' && (
              <>
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
                {photos.length > 0 && (
                  <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
                    {photos.map((photo, idx) => (
                      <div key={idx} className="relative flex-shrink-0">
                        <img src={photo} alt={`Photo ${idx + 1}`} className="w-16 h-16 rounded-xl object-cover border-2" style={{ borderColor: '#008CE5' }} />
                        <button onClick={() => setPhotos((prev) => prev.filter((_, i) => i !== idx))} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">×</button>
                      </div>
                    ))}
                  </div>
                )}
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={takePhoto}
                  className="w-full rounded-xl py-3 font-semibold text-sm mb-2 flex items-center justify-center gap-2"
                  style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#FFFFFF' }}
                >
                  {photos.length > 0 ? <ImagePlus className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
                  {photos.length > 0 ? `Add another photo (${photos.length} added)` : 'Take a photo'}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={uploadPhotosAndComplete}
                  disabled={uploadingPhotos}
                  className="w-full flex items-center justify-center gap-2 rounded-xl py-4 mb-2"
                  style={{ backgroundColor: '#008CE5', color: '#FFFFFF', fontWeight: 700, fontSize: '16px', opacity: uploadingPhotos ? 0.7 : 1 }}
                >
                  {uploadingPhotos ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /><span>Uploading Photos...</span></>
                  ) : (
                    <><Flag className="w-5 h-5" /><span>{photos.length > 0 ? 'Upload & Complete Job' : 'Complete Job'}</span></>
                  )}
                </motion.button>
              </>
            )}

            {(status === 'enroute' || status === 'arrived' || status === 'dropoff' || status === 'working') && (
              <button
                onClick={() => setShowCancelModal(true)}
                className="w-full rounded-xl py-3 font-semibold text-sm"
                style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#EF4444' }}
              >
                Cancel Job
              </button>
            )}
          </div>
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
        jobStatus={status}
      />

      <CallModal
        isOpen={isCallOpen}
        onClose={() => setIsCallOpen(false)}
        jobId={jobId || ''}
        peerName={job.customer}
        peerInitials={job.customerInitials}
        isOutgoing={isCallOutgoing}
      />

      {/* Proximity warning modal */}
      {showProximityWarning && createPortal(
        <div
          className="fixed inset-0 flex items-end justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2147483647 }}
          onClick={() => setShowProximityWarning(false)}
        >
          <motion.div
            initial={{ y: 300, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="w-full max-w-lg rounded-t-[28px] p-6"
            style={{
              backgroundColor: isDark ? '#14263D' : '#FFFFFF',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#D3E0F2'}`,
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
            }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'rgba(245,158,11,0.15)' }}>
                <AlertTriangle className="w-6 h-6" style={{ color: '#F59E0B' }} />
              </div>
              <div>
                <h3 className="font-bold text-lg" style={{ color: textColor }}>{proximityAction === 'dropoff' ? 'Not Near Drop-off' : 'Not Near Customer'}</h3>
                <p className="text-sm" style={{ color: subColor }}>
                  You appear to be {proximityDistance !== null ? `${proximityDistance.toFixed(1)} miles` : 'far'} from the {proximityAction === 'dropoff' ? 'drop-off' : 'pickup'} location
                </p>
              </div>
            </div>

            <div className="rounded-xl p-4 mb-5" style={{ backgroundColor: isDark ? 'rgba(245,158,11,0.08)' : 'rgba(245,158,11,0.06)', border: `1px solid ${isDark ? 'rgba(245,158,11,0.2)' : 'rgba(245,158,11,0.15)'}` }}>
              <p className="text-sm" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#374151' }}>
                {proximityAction === 'dropoff'
                  ? 'Please make sure you are at the drop-off location before confirming. If you\'re already there, your GPS may be inaccurate.'
                  : 'Please make sure you are at the customer\'s location before confirming arrival. If you\'re already there, your GPS may be inaccurate.'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowProximityWarning(false)}
                className="h-12 rounded-2xl font-semibold text-sm active:scale-[0.98] transition-transform"
                style={{
                  backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E8F0FB',
                  color: textColor,
                  border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : '#D3E0F2'}`,
                }}
              >
                Go Back
              </button>
              <button
                onClick={() => proximityAction === 'dropoff' ? confirmDropoffArrival() : confirmArrival()}
                className="h-12 rounded-2xl font-bold text-sm text-white active:scale-[0.98] transition-transform"
                style={{
                  background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                  boxShadow: '0 6px 16px rgba(245,158,11,0.35)',
                }}
              >
                Confirm Anyway
              </button>
            </div>
          </motion.div>
        </div>,
        document.body,
      )}

      {/* Navigation app picker */}
      {showNavPicker && createPortal(
        <div
          className="fixed inset-0 flex items-end justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2147483647 }}
          onClick={() => setShowNavPicker(false)}
        >
          <motion.div
            initial={{ y: 300, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="w-full max-w-lg rounded-t-[28px] p-6"
            style={{
              backgroundColor: isDark ? '#14263D' : '#FFFFFF',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#D3E0F2'}`,
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
            }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <h3 className="font-bold text-lg mb-1" style={{ color: textColor }}>Navigate with</h3>
            <p className="text-sm mb-5" style={{ color: subColor }}>Choose your preferred navigation app</p>

            <div className="space-y-2 mb-4">
              <button
                onClick={() => openNavApp('apple')}
                className="w-full rounded-xl px-4 py-4 flex items-center gap-4 transition-all active:scale-[0.98]"
                style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F5F9FF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#D3E0F2'}` }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #34C759, #28A745)' }}>
                  <Navigation className="w-5 h-5 text-white" />
                </div>
                <span className="font-semibold text-sm" style={{ color: textColor }}>Apple Maps</span>
              </button>
              <button
                onClick={() => openNavApp('google')}
                className="w-full rounded-xl px-4 py-4 flex items-center gap-4 transition-all active:scale-[0.98]"
                style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F5F9FF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#D3E0F2'}` }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #4285F4, #1A73E8)' }}>
                  <MapPinned className="w-5 h-5 text-white" />
                </div>
                <span className="font-semibold text-sm" style={{ color: textColor }}>Google Maps</span>
              </button>
              <button
                onClick={() => openNavApp('waze')}
                className="w-full rounded-xl px-4 py-4 flex items-center gap-4 transition-all active:scale-[0.98]"
                style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F5F9FF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#D3E0F2'}` }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #33CCFF, #05C8F0)' }}>
                  <Navigation className="w-5 h-5 text-white" />
                </div>
                <span className="font-semibold text-sm" style={{ color: textColor }}>Waze</span>
              </button>
            </div>

            <button
              onClick={() => setShowNavPicker(false)}
              className="w-full rounded-2xl py-3 font-semibold text-sm"
              style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E8F0FB', color: textColor }}
            >
              Cancel
            </button>
          </motion.div>
        </div>,
        document.body
      )}

      {/* Cancel reason modal */}
      {showCancelModal && createPortal(
        <div
          className="fixed inset-0 flex items-end justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2147483647 }}
          onClick={() => { if (!cancelling) setShowCancelModal(false); }}
        >
          <motion.div
            initial={{ y: 300, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="w-full max-w-lg rounded-t-[28px] p-6 pb-10"
            style={{
              backgroundColor: isDark ? '#14263D' : '#FFFFFF',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#D3E0F2'}`,
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
            }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <h3 className="font-bold text-lg mb-1" style={{ color: textColor }}>Cancel Job</h3>
            <p className="text-sm mb-5" style={{ color: subColor }}>Please select a reason for cancellation</p>

            <div className="space-y-2 mb-5">
              {[
                'Vehicle issue / breakdown',
                'Customer unreachable',
                'Unsafe location',
                'Wrong service type',
                'Personal emergency',
              ].map((reason) => (
                <button
                  key={reason}
                  onClick={() => { setCancelReason(reason); setCancelCustomReason(''); }}
                  className="w-full text-left rounded-xl px-4 py-3 text-sm font-medium transition-all"
                  style={cancelReason === reason
                    ? { background: 'linear-gradient(135deg, rgba(0,140,229,0.15), rgba(0,140,229,0.08))', border: '1px solid #008CE5', color: textColor }
                    : { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F5F9FF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB'}`, color: textColor }
                  }
                >
                  {reason}
                </button>
              ))}
              <button
                onClick={() => { setCancelReason('other'); }}
                className="w-full text-left rounded-xl px-4 py-3 text-sm font-medium transition-all"
                style={cancelReason === 'other'
                  ? { background: 'linear-gradient(135deg, rgba(0,140,229,0.15), rgba(0,140,229,0.08))', border: '1px solid #008CE5', color: textColor }
                  : { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F5F9FF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB'}`, color: textColor }
                }
              >
                Other
              </button>
            </div>

            {cancelReason === 'other' && (
              <textarea
                placeholder="Please describe the reason..."
                value={cancelCustomReason}
                onChange={(e) => setCancelCustomReason(e.target.value)}
                rows={3}
                className="w-full rounded-xl px-4 py-3 mb-5 text-sm focus:outline-none resize-none"
                style={{
                  backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F5F9FF',
                  border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#D3E0F2'}`,
                  color: textColor,
                }}
              />
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => { setShowCancelModal(false); setCancelReason(''); setCancelCustomReason(''); }}
                disabled={cancelling}
                className="rounded-2xl py-3 font-semibold text-sm"
                style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E8F0FB', color: textColor }}
              >
                Go Back
              </button>
              <button
                onClick={async () => {
                  const finalReason = cancelReason === 'other' ? cancelCustomReason.trim() : cancelReason;
                  if (!finalReason || !jobId) return;
                  setCancelling(true);
                  try {
                    await cancelJob(jobId, finalReason);
                    setShowCancelModal(false);
                    navigate('/home');
                  } catch (e: any) {
                    console.warn('Provider cancel failed:', e);
                    window.alert(e?.message || 'Failed to cancel job. Please try again.');
                  } finally {
                    setCancelling(false);
                  }
                }}
                disabled={cancelling || (!cancelReason || (cancelReason === 'other' && !cancelCustomReason.trim()))}
                className="rounded-2xl py-3 font-bold text-sm text-white"
                style={{
                  background: 'linear-gradient(135deg, #EF4444, #DC2626)',
                  opacity: (!cancelReason || (cancelReason === 'other' && !cancelCustomReason.trim()) || cancelling) ? 0.5 : 1,
                }}
              >
                {cancelling ? 'Cancelling...' : 'Confirm Cancel'}
              </button>
            </div>
          </motion.div>
        </div>,
        document.body,
      )}

      {/* Customer cancelled notification modal */}
      {showCustomerCancelled && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 2147483647 }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="mx-6 rounded-3xl p-6 w-full max-w-sm"
            style={{ backgroundColor: isDark ? '#14263D' : '#FFFFFF' }}
          >
            <div className="flex flex-col items-center text-center mb-5">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: 'rgba(239,68,68,0.12)' }}>
                <AlertTriangle className="w-8 h-8" style={{ color: '#EF4444' }} />
              </div>
              <h2 className="font-bold text-xl mb-2" style={{ color: textColor }}>Request Cancelled</h2>
              <p className="text-sm" style={{ color: subColor }}>
                The customer has cancelled this service request.
              </p>
            </div>

            {cancelledReason && cancelledReason !== 'Customer cancelled the request' && (
              <div className="rounded-xl p-3 mb-5" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F9FAFB', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB'}` }}>
                <p className="text-xs font-medium mb-1" style={{ color: subColor }}>Reason</p>
                <p className="text-sm" style={{ color: textColor }}>{cancelledReason}</p>
              </div>
            )}

            <p className="text-xs text-center mb-5" style={{ color: subColor }}>
              If a cancellation fee applies, it will be reflected in your earnings.
            </p>

            <button
              onClick={() => {
                setShowCustomerCancelled(false);
                navigate('/home');
              }}
              className="w-full h-12 rounded-2xl font-bold text-base text-white active:scale-[0.98] transition-transform"
              style={{
                background: 'linear-gradient(135deg, #008CE5, #0070B8)',
                boxShadow: '0 8px 18px rgba(0,140,229,0.28)',
              }}
            >
              Back to Home
            </button>
          </motion.div>
        </div>,
        document.body,
      )}
    </div>
  );
}
