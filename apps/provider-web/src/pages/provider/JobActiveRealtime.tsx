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
import { decryptMessage } from '../../lib/chatEncryption';

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
  const [lastHeading, setLastHeading] = useState(0);
  const [showCustomerCancelled, setShowCustomerCancelled] = useState(false);
  const [cancelledReason, setCancelledReason] = useState('');
  const [isJobTerminal, setIsJobTerminal] = useState(false);

  // Forward-only status setter — status can NEVER go backward
  const setStatus = useCallback((next: UiStatus | ((prev: UiStatus) => UiStatus)) => {
    setStatusRaw((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      // Only advance forward, never backward
      if (STATUS_ORDER[resolved] >= STATUS_ORDER[prev]) return resolved;
      return prev;
    });
  }, []);

  // Keep screen awake during active service
  useEffect(() => {
    KeepAwake.keepAwake().catch(() => {});
    return () => { KeepAwake.allowSleep().catch(() => {}); };
  }, []);

  // Provider device location (source of truth for real-time movement)
  // Tracking stops when the job reaches a terminal state
  const isTrackingActive = !!jobId && !isJobTerminal;
  const myPosition = useWatchPosition(isTrackingActive);
  const { broadcastLocation } = useRealtimeLocation({ jobId, role: 'provider', enabled: isTrackingActive });

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
        const jobStatus = job?.status;
        setStatus(mapJobStatusToUi(jobStatus));
        if (jobStatus === 'completed' || jobStatus === 'cancelled' || jobStatus === 'expired') {
          setIsJobTerminal(true);
        }
        if (jobStatus === 'cancelled') {
          setCancelledReason(job?.cancellation_reason || 'Job was cancelled');
          setShowCustomerCancelled(true);
        }
        if (job?.customer_completed_at) setCustomerConfirmed(true);
        // Show scheduled screen only for genuine scheduled requests (not instant)
        if (job?.scheduled_for && jobStatus === 'accepted') {
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
          setIsJobTerminal(true);
          return;
        }

        if (dbStatus === 'completed') {
          setIsJobTerminal(true);
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
          setIsJobTerminal(true);
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
          setIsJobTerminal(true);
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
  const providerPos = myPosition;

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
    if (!isLoaded || !providerPos || !customerPos) return;
    if (status !== 'accepted' && status !== 'enroute') return;
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

        console.warn('[Directions API] Failed:', routeStatusText, 'origin:', providerPos, 'dest:', customerPos);

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
    if (status !== 'accepted' && status !== 'enroute') return;
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

  // Initial camera setup — follow mode when enroute, overview otherwise
  useEffect(() => {
    if (!map || !providerPos || hasInitialFit.current) return;
    hasInitialFit.current = true;

    if (status === 'enroute') {
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

  // Auto-follow camera when in follow mode and enroute
  useEffect(() => {
    if (!map || !providerPos || mapMode !== 'follow' || status !== 'enroute') return;

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

  // Exit follow mode when status transitions away from enroute
  const prevStatusRef = useRef(status);
  useEffect(() => {
    if (prevStatusRef.current === 'enroute' && status !== 'enroute') {
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

    if (status === 'enroute') {
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
        if (providerPos && customerPos) {
          const bounds = new google.maps.LatLngBounds();
          bounds.extend(providerPos);
          bounds.extend(customerPos);
          map.fitBounds(bounds, { top: 120, bottom: 320, left: 40, right: 40 });
        }
      }
    } else {
      // Non-enroute: just fit both markers
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
  }, [map, providerPos, customerPos, status, mapMode, lastHeading]);

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
              const { data: urlData } = supabase.storage.from('job-photos').getPublicUrl(path);
              if (urlData?.publicUrl) urls.push(urlData.publicUrl);
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
    if (!customerPos) return;
    const dest = `${customerPos.lat},${customerPos.lng}`;
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
                  rotation: lastHeading || 0,
                }}
                title="You"
              />
            )}

            {directions && (status === 'accepted' || status === 'enroute') && (
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
          <div className="h-full flex items-center justify-center" style={{ background: isDark ? '#0A1626' : '#E8EAED' }}>
            <div className="w-10 h-10 border-4 border-[#008CE5] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      <div className="absolute top-6 left-4 z-30 flex gap-2">
        <button onClick={() => navigate('/home')} className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg" style={{ backgroundColor: cardBg }} title="Back to home">
          <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
        </button>
        <button onClick={recenterMap} className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg" style={{ backgroundColor: mapMode === 'follow' && status === 'enroute' ? '#008CE5' : cardBg }} title={mapMode === 'follow' ? 'Show overview' : 'Follow me'}>
          <RecenterIcon className="w-5 h-5" style={{ color: mapMode === 'follow' && status === 'enroute' ? '#FFFFFF' : '#008CE5' }} />
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

        {customerConfirmed && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl px-4 py-3 mt-3 text-center shadow-md backdrop-blur-md"
            style={{
              backgroundColor: isDark ? 'rgba(0,140,229,0.15)' : 'rgba(0,140,229,0.1)',
              border: '1px solid rgba(0,140,229,0.3)',
            }}
          >
            <p className="text-sm font-medium" style={{ color: '#008CE5' }}>
              Customer has confirmed service completion
            </p>
          </motion.div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
        <motion.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          className="rounded-t-3xl p-5 shadow-2xl backdrop-blur-md"
          style={{ backgroundColor: cardBg, borderTop: `1px solid ${cardBorder}`, paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#008CE5] to-[#0070B8] flex items-center justify-center text-lg font-bold text-white">
              {job.customerInitials}
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-base" style={{ color: textColor }}>{job.customer}</h3>
              <p className="text-xs" style={{ color: subColor }}>{job.location}</p>
            </div>
            {/* Direct phone fallback */}
            {job.customerPhone && (
              <a href={`tel:${job.customerPhone.replace(/\s/g, '')}`}
                className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform"
                style={{ backgroundColor: isDark ? 'rgba(0,140,229,0.15)' : 'rgba(0,140,229,0.1)' }}
              >
                <Phone className="w-5 h-5" style={{ color: '#008CE5' }} />
              </a>
            )}
          </div>

          {job.notes && (
            <div className="rounded-xl p-3 mb-3" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#E8F0FB' }}>
              <p className="text-xs" style={{ color: subColor }}>{job.notes}</p>
            </div>
          )}

          <div className="grid grid-cols-4 gap-3 mb-3">
            {[
              { label: 'Call', icon: Phone, onClick: handleCall },
              { label: 'Message', icon: MessageCircle, onClick: handleMessage },
              { label: 'Share', icon: Share2, onClick: handleShare },
              { label: 'Navigate', icon: MapPinned, onClick: () => setShowNavPicker(true) },
            ].map((btn) => {
              const BtnIcon = btn.icon;
              return (
                <button
                  key={btn.label}
                  onClick={btn.onClick}
                  className="flex flex-col items-center gap-1.5 py-2 active:scale-95 transition-transform"
                >
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center relative"
                    style={{ backgroundColor: isDark ? 'rgba(0,140,229,0.15)' : '#EAF4FD' }}
                  >
                    <BtnIcon className="w-5 h-5" style={{ color: '#008CE5' }} />
                    {btn.label === 'Message' && hasUnreadChat && !isChatOpen && (
                      <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-red-500" style={{ boxShadow: '0 0 6px rgba(239,68,68,0.6)' }} />
                    )}
                  </div>
                  <span className="text-xs font-medium" style={{ color: subColor }}>{btn.label}</span>
                </button>
              );
            })}
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
              onClick={() => {
                // Check proximity before confirming arrival
                if (providerPos && customerPos) {
                  const dist = distanceMiles(providerPos, customerPos);
                  if (dist > ARRIVAL_PROXIMITY_MILES) {
                    setProximityDistance(dist);
                    setShowProximityWarning(true);
                    return;
                  }
                }
                // Within proximity or no location data — proceed
                confirmArrival();
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
            <>
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={uploadPhotosAndComplete}
                disabled={uploadingPhotos}
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
                <Flag className="w-5 h-5" />
                <span>Complete Job</span>
              </motion.button>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => takePhoto(CameraSource.Camera)}
                  className="flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-sm"
                  style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E8F0FB', color: textColor }}
                >
                  <Camera className="w-4 h-4" />
                  <span>Take Picture</span>
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => takePhoto(CameraSource.Photos)}
                  className="flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-sm"
                  style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E8F0FB', color: textColor }}
                >
                  <ImagePlus className="w-4 h-4" />
                  <span>Upload Image</span>
                </motion.button>
              </div>
            </>
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
                style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E8F0FB', color: textColor }}
              >
                {photos.length > 0 ? <ImagePlus className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
                {photos.length > 0 ? `Add another photo (${photos.length} added)` : 'Take a photo'}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={uploadPhotosAndComplete}
                disabled={uploadingPhotos}
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
                  cursor: uploadingPhotos ? 'not-allowed' : 'pointer',
                  opacity: uploadingPhotos ? 0.7 : 1,
                }}
              >
                {uploadingPhotos ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Uploading Photos...</span>
                  </>
                ) : (
                  <>
                    <Flag className="w-5 h-5" />
                    <span>{photos.length > 0 ? 'Upload & Complete Job' : 'Complete Job'}</span>
                  </>
                )}
              </motion.button>
            </>
          )}

          {(status === 'enroute' || status === 'arrived' || status === 'working') && (
            <button
              onClick={() => setShowCancelModal(true)}
              className="w-full rounded-2xl py-3 font-semibold text-sm"
              style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E8F0FB', color: textColor }}
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
                <h3 className="font-bold text-lg" style={{ color: textColor }}>Not Near Customer</h3>
                <p className="text-sm" style={{ color: subColor }}>
                  You appear to be {proximityDistance !== null ? `${proximityDistance.toFixed(1)} miles` : 'far'} from the pickup location
                </p>
              </div>
            </div>

            <div className="rounded-xl p-4 mb-5" style={{ backgroundColor: isDark ? 'rgba(245,158,11,0.08)' : 'rgba(245,158,11,0.06)', border: `1px solid ${isDark ? 'rgba(245,158,11,0.2)' : 'rgba(245,158,11,0.15)'}` }}>
              <p className="text-sm" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#374151' }}>
                Please make sure you are at the customer&apos;s location before confirming arrival. If you&apos;re already there, your GPS may be inaccurate.
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
                onClick={() => confirmArrival()}
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
