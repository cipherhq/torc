import { useNavigate, useParams, useLocation } from 'react-router';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { Phone, MessageCircle, Share2, Shield, Star, Clock, MapPin, Loader2, ArrowLeft, X, AlertTriangle, PhoneCall, Flag, MapPinned, DollarSign, Navigation2 as Recenter } from 'lucide-react';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { GoogleMap, MarkerF, DirectionsRenderer } from '@react-google-maps/api';
import { useGoogleMaps } from '../../context/GoogleMapsContext';
import { useLocation as useLocationCtx } from '../../context/LocationContext';
import { useRealtimeLocation, useWatchPosition } from '../../hooks/useRealtimeLocation';
import { useJob } from '../../context/JobContext';
import { ChatModal } from '../../components/ChatModal';
import { CallModal } from '../../components/CallModal';
import { callPhone, shareContent, shareJobDetails } from '../../utils/communication';
import { supabase } from '../../lib/supabase';
import { showToast } from '../../components/NotificationToast';
import { initAudio, playMessageSound } from '../../utils/audio';
import { decryptMessage } from '../../lib/chatEncryption';

const mapContainerStyle = { width: '100%', height: '100%' };

type JobStatus = 'pending' | 'matching' | 'accepted' | 'enroute' | 'arrived' | 'enroute_destination' | 'inprogress' | 'completed' | 'cancelled';

const JOB_STATUS_ORDER: Record<JobStatus, number> = {
  pending: 0,
  matching: 1,
  accepted: 2,
  enroute: 3,
  arrived: 4,
  enroute_destination: 5,
  inprogress: 6,
  completed: 7,
  cancelled: 7, // cancelled can happen at any time
};

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
    case 'enroute_destination':
      return 'enroute_destination';
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
  const location = useLocation();
  const { isLoaded } = useGoogleMaps();
  const { currentLocation } = useLocationCtx();
  const { currentJob, fetchJob, updateJobStatus, cancelJob, platformSettings } = useJob();
  const myPosition = useWatchPosition(true);

  // Read accepted payload from Matching page navigation state
  const acceptedPayload = (location.state as any)?.acceptedPayload;
  const initialProviderPos = acceptedPayload?.provider_lat && acceptedPayload?.provider_lng
    ? { lat: acceptedPayload.provider_lat, lng: acceptedPayload.provider_lng }
    : null;

  const [status, setStatusRaw] = useState<JobStatus>(acceptedPayload ? 'accepted' : 'pending');
  // Forward-only status setter — status never goes backward (except cancelled which can happen anytime)
  const setStatus = useCallback((next: JobStatus) => {
    setStatusRaw((prev) => {
      if (next === 'cancelled') return 'cancelled'; // cancellation always allowed
      if (JOB_STATUS_ORDER[next] >= JOB_STATUS_ORDER[prev]) return next;
      return prev; // ignore backward transitions
    });
  }, []);
  const [eta, setEta] = useState<number | null>(acceptedPayload?.eta_minutes ?? null);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [hasUnreadChat, setHasUnreadChat] = useState(false);
  const [isCallOpen, setIsCallOpen] = useState(false);
  const [isCallOutgoing, setIsCallOutgoing] = useState(true);
  const [shareToast, setShareToast] = useState(false);
  const [directionsError, setDirectionsError] = useState(false);
  const [jobError, setJobError] = useState(false);
  const [showSafety, setShowSafety] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showCancelReason, setShowCancelReason] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelCustomReason, setCancelCustomReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [showProviderCancelled, setShowProviderCancelled] = useState(false);
  const [providerCancelReason, setProviderCancelReason] = useState('');
  const directionsServiceRef = useRef<boolean>(false);
  const lastDirectionsRequestAtRef = useRef(0);
  const directionsRetryCountRef = useRef(0);
  const directionsRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasInitialFit = useRef(false);

  const hasProvider = !!currentJob?.provider;
  const provider = hasProvider ? currentJob?.provider : null;
  const providerInfo = provider ? {
    name: `${provider.first_name || ''} ${provider.last_name || ''}`.trim() || 'Provider',
    initials: `${(provider.first_name || 'P')[0]}${(provider.last_name || '')[0] || ''}`.toUpperCase(),
    phone: provider.phone || '',
    rating: provider.rating || 0,
    rescues: provider.total_jobs || 0,
    vehicle: provider.vehicle_make ? `${provider.vehicle_make} ${provider.vehicle_model || ''}`.trim() : '',
    license: provider.license_number || '',
    plate: provider.vehicle_plate || '',
    isVerified: provider.is_verified || false,
  } : null;

  // Use the job's pickup location (correct for 3rd party requests) with GPS fallback
  const pickupPos = (() => {
    const lat = Number(currentJob?.pickup_latitude);
    const lng = Number(currentJob?.pickup_longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) return { lat, lng };
    return null;
  })();
  const customerPos = pickupPos || myPosition || (currentLocation
    ? { lat: currentLocation.latitude, lng: currentLocation.longitude }
    : { lat: 37.7749, lng: -122.4194 });

  // Destination position (for towing drop-off)
  const destinationPos = (() => {
    const lat = Number(currentJob?.destination_latitude);
    const lng = Number(currentJob?.destination_longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) return { lat, lng };
    return null;
  })();
  const directionsTarget = (status === 'enroute_destination' && destinationPos) ? destinationPos : customerPos;

  // Static initial center — only used when map first mounts so
  // camera doesn't jump around on every GPS update.
  const initialCenter = useRef(customerPos);

  const { peerLocation: providerLocation, isConnected, broadcastLocation } = useRealtimeLocation({
    jobId,
    role: 'customer',
    enabled: true,
  });

  // Keep screen awake during live tracking
  useEffect(() => {
    KeepAwake.keepAwake().catch(() => {});
    return () => { KeepAwake.allowSleep().catch(() => {}); };
  }, []);

  // Broadcast customer location
  useEffect(() => {
    if (myPosition) broadcastLocation(myPosition);
  }, [myPosition, broadcastLocation]);

  // Re-broadcast fresh position immediately when app returns from background
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'visible' && myPosition) {
        broadcastLocation(myPosition);
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
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

        // Show modal when provider cancels (DB change fallback)
        if (normalizedStatus === 'cancelled' && !showProviderCancelled) {
          setProviderCancelReason(payload.new?.cancellation_reason || '');
          setShowProviderCancelled(true);
        }

        if (
          payload.new?.provider_id && !currentJob?.provider ||
          normalizedStatus === 'arrived' ||
          normalizedStatus === 'enroute_destination' ||
          normalizedStatus === 'inprogress' ||
          normalizedStatus === 'completed' ||
          normalizedStatus === 'cancelled'
        ) {
          fetchJob(jobId).catch(console.warn);
        }
      })
      .subscribe();

    // Listen for broadcast status updates from provider
    const bc = supabase
      .channel(`job-accepted-${jobId}`)
      .on('broadcast', { event: 'job_cancelled' }, (payload) => {
        if (payload.payload?.job_id === jobId) {
          setStatus('cancelled');
          const cancelledBy = payload.payload?.cancelled_by;
          if (cancelledBy === 'provider') {
            setProviderCancelReason(payload.payload?.reason || '');
            setShowProviderCancelled(true);
          } else {
            showToast('error', 'Request Cancelled', 'Your service request has been cancelled.');
          }
        }
      })
      .on('broadcast', { event: 'status_update' }, (payload) => {
        if (payload.payload?.job_id === jobId) {
          const newStatus = normalizeJobStatus(payload.payload.status);
          setStatus(newStatus);
          fetchJob(jobId).catch(console.warn);
          if (newStatus === 'enroute') showToast('info', 'Provider En Route', 'Your provider is on the way!');
          if (newStatus === 'arrived') showToast('success', 'Provider Arrived', 'Your provider has arrived at your location.');
          if (newStatus === 'enroute_destination') showToast('info', 'Heading to Destination', 'Your provider is driving to the destination.');
          if (newStatus === 'inprogress') showToast('info', 'Service Started', 'Your provider has begun the service.');
          if (newStatus === 'completed') showToast('success', 'Service Completed', 'Your service has been completed successfully!');
          if (newStatus === 'cancelled') {
            setProviderCancelReason(payload.payload?.reason || '');
            setShowProviderCancelled(true);
          }
        }
      })
      .on('broadcast', { event: 'job_accepted' }, (payload) => {
        if (payload.payload?.job_id === jobId) {
          setStatus('accepted');
          fetchJob(jobId).catch(console.warn);
          showToast('success', 'Provider Found!', 'A provider has accepted your request.');
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(bc);
    };
  }, [jobId]);

  // Listen for incoming chat messages — show toast when chat is closed
  const isChatOpenRef = useRef(isChatOpen);
  useEffect(() => { isChatOpenRef.current = isChatOpen; }, [isChatOpen]);

  useEffect(() => {
    if (!jobId) return;
    const channel = supabase.channel(`chat-notify-customer-${jobId}`, {
      config: { broadcast: { self: false } },
    });
    channel
      .on('broadcast', { event: 'new_message' }, async (payload) => {
        const msg = payload.payload;
        if (!msg || msg.sender_role === 'customer') return;
        setHasUnreadChat(true);
        if (!isChatOpenRef.current) {
          initAudio();
          playMessageSound();
          const senderName = msg.sender_name || 'Provider';
          const plainText = msg.text ? await decryptMessage(jobId!, msg.text) : '';
          showToast('message', senderName, plainText?.slice(0, 80) || 'Sent you a message', 5000, () => {
            setHasUnreadChat(false);
            setIsChatOpen(true);
          });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [jobId]);

  // Real provider position from real-time channel (no simulation)
  const activeProviderPos = providerLocation
    ? { lat: providerLocation.lat, lng: providerLocation.lng }
    : initialProviderPos;

  const requestDrivingDirections = useCallback((force = false) => {
    if (!isLoaded || !activeProviderPos || !directionsTarget) return;
    if (status === 'arrived' || status === 'inprogress' || status === 'completed' || status === 'cancelled') return;
    if (directionsServiceRef.current) return;

    const minIntervalMs = 10000;
    const now = Date.now();
    if (!force && now - lastDirectionsRequestAtRef.current < minIntervalMs) return;
    lastDirectionsRequestAtRef.current = now;
    directionsServiceRef.current = true;

    try {
      const service = new google.maps.DirectionsService();
      service.route({
        origin: activeProviderPos,
        destination: directionsTarget,
        travelMode: google.maps.TravelMode.DRIVING,
      }, (result, routeStatus) => {
        directionsServiceRef.current = false;
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

        console.warn('[Directions API] Failed:', routeStatusText, 'origin:', activeProviderPos, 'dest:', directionsTarget);

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
        if (activeProviderPos && directionsTarget) {
          const R = 6371;
          const dLat = (directionsTarget.lat - activeProviderPos.lat) * Math.PI / 180;
          const dLng = (directionsTarget.lng - activeProviderPos.lng) * Math.PI / 180;
          const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(activeProviderPos.lat * Math.PI / 180) * Math.cos(directionsTarget.lat * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2;
          const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          setEta(Math.max(1, Math.ceil((dist / 30) * 60)));
        }
      });
    } catch {
      directionsServiceRef.current = false;
      setDirectionsError(true);
    }
  }, [isLoaded, activeProviderPos?.lat, activeProviderPos?.lng, directionsTarget?.lat, directionsTarget?.lng, status]);

  // Refresh route periodically but keep request rate below quota limits.
  useEffect(() => {
    requestDrivingDirections(false);
  }, [requestDrivingDirections]);

  useEffect(() => {
    if (status !== 'accepted' && status !== 'enroute' && status !== 'enroute_destination') return;
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

  // Fit both points into view ONCE when provider position first appears.
  // After that the user controls the map; markers update without camera jumps.
  useEffect(() => {
    if (!map || hasInitialFit.current) return;
    if (!activeProviderPos) {
      // No provider yet — just show customer location, once
      map.panTo(customerPos);
      map.setZoom(15);
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    bounds.extend(customerPos);
    bounds.extend(activeProviderPos);
    map.fitBounds(bounds, { top: 120, bottom: 380, left: 40, right: 40 });
    hasInitialFit.current = true;
  }, [map, activeProviderPos?.lat, activeProviderPos?.lng]);

  const recenterMap = useCallback(() => {
    if (!map) return;
    if (activeProviderPos) {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(customerPos);
      bounds.extend(activeProviderPos);
      map.fitBounds(bounds, { top: 120, bottom: 380, left: 40, right: 40 });
    } else {
      map.panTo(customerPos);
      map.setZoom(15);
    }
  }, [map, activeProviderPos, customerPos]);

  const onLoad = useCallback((map: google.maps.Map) => setMap(map), []);

  const handleConfirmArrival = async () => {
    if (status !== 'arrived') return;
    setStatus('inprogress');
    if (jobId) {
      try {
        await updateJobStatus(jobId, 'inprogress');
        // Broadcast to provider for instant UI update
        const bc = supabase.channel(`job-accepted-${jobId}`);
        bc.subscribe((s) => {
          if (s === 'SUBSCRIBED') {
            bc.send({ type: 'broadcast', event: 'status_update', payload: { job_id: jobId, status: 'inprogress' } }).catch(() => {});
            setTimeout(() => supabase.removeChannel(bc), 2000);
          }
        });
      } catch (e) {
        console.warn('Confirm arrival failed:', e);
        // Don't regress — the DB might have already updated
      }
    }
  };

  const handleComplete = async () => {
    if (jobId) {
      try {
        // Set customer_completed_at instead of changing status to 'completed'.
        // The provider must still complete their flow (photos) independently.
        await supabase
          .from('jobs')
          .update({ customer_completed_at: new Date().toISOString() })
          .eq('id', jobId);
      } catch (e) { console.warn(e); }
    }
    navigate(`/completion/${jobId}`);
  };

  const handleCall = () => {
    if (providerInfo?.phone) {
      callPhone(providerInfo.phone);
    }
  };
  const handleMessage = () => { setHasUnreadChat(false); setIsChatOpen(true); };

  // Listen for incoming VoIP calls from provider
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

  // Determine if cancellation fee applies (provider already accepted)
  const providerHasAccepted = hasProvider || status === 'accepted' || status === 'enroute' || status === 'arrived' || status === 'enroute_destination' || status === 'inprogress';
  const cancellationFeePct = platformSettings?.cancellation_fee_pct ?? 25;
  const totalAmount = currentJob?.total_amount ? Number(currentJob.total_amount) : (currentJob?.base_price ? Number(currentJob.base_price) : 0);
  const cancellationFee = providerHasAccepted ? Math.round(totalAmount * (cancellationFeePct / 100) * 100) / 100 : 0;

  const handleCancelRequest = () => {
    // Always show reason modal first
    setShowCancelReason(true);
  };

  const handleReasonSelected = () => {
    const finalReason = cancelReason === 'other' ? cancelCustomReason.trim() : cancelReason;
    if (!finalReason) return;
    setShowCancelReason(false);
    if (providerHasAccepted && cancellationFee > 0) {
      setShowCancelConfirm(true);
    } else {
      handleCancelDirect(finalReason);
    }
  };

  const handleCancelDirect = async (reason?: string) => {
    if (!jobId) return;
    const finalReason = reason || (cancelReason === 'other' ? cancelCustomReason.trim() : cancelReason) || 'user_cancelled';
    setCancelling(true);
    try {
      await cancelJob(jobId, finalReason);
    } catch (e) {
      console.warn('Cancel failed:', e);
    }
    setCancelling(false);
    navigate('/customer/home');
  };

  const handleCancelWithFee = async () => {
    if (!jobId) return;
    const finalReason = (cancelReason === 'other' ? cancelCustomReason.trim() : cancelReason) || 'user_cancelled_with_fee';
    setCancelling(true);
    try {
      // Store cancellation fee on the job
      await supabase
        .from('jobs')
        .update({
          cancellation_fee: cancellationFee,
          cancellation_fee_pct: cancellationFeePct,
        })
        .eq('id', jobId);

      await cancelJob(jobId, finalReason);
    } catch (e) {
      console.warn('Cancel failed:', e);
    }
    setCancelling(false);
    setShowCancelConfirm(false);
    navigate('/customer/home');
  };

  const statusConfig: Record<string, { label: string; detail: string; color: string }> = {
    pending: { label: 'Searching', detail: 'Looking for available providers...', color: '#F59E0B' },
    matching: { label: 'Matching', detail: 'Matching you with the best provider...', color: '#F59E0B' },
    accepted: { label: 'Accepted', detail: 'A provider has accepted your request!', color: '#008CE5' },
    enroute: { label: 'On the way', detail: 'Provider is heading to you', color: '#008CE5' },
    arrived: { label: 'Arrived', detail: 'Provider has arrived at your location!', color: '#0070B8' },
    enroute_destination: { label: 'Heading to Destination', detail: 'Provider is driving to the destination', color: '#008CE5' },
    inprogress: { label: 'In Progress', detail: 'Working on your vehicle', color: '#008CE5' },
    completed: { label: 'Complete', detail: 'Service has been completed', color: '#008CE5' },
    cancelled: { label: 'Cancelled', detail: 'This job has been cancelled', color: '#EF4444' },
  };

  const currentStatus = statusConfig[status] || statusConfig.pending;
  const isWaiting = status === 'pending' || status === 'matching';
  const providerMarkerPos = activeProviderPos || ((status === 'arrived' || status === 'inprogress') ? customerPos : null);
  const showProviderOnMap = !isWaiting && !!providerMarkerPos;
  const showRouteOnMap = !isWaiting && !!directions;
  const customerHasRatedProvider = Number(currentJob?.rating || 0) > 0;
  const mustCompleteCustomerRating = status === 'completed' && !customerHasRatedProvider;

  useEffect(() => {
    if (!jobId || !mustCompleteCustomerRating) return;
    navigate(`/completion/${jobId}`, { replace: true });
  }, [jobId, mustCompleteCustomerRating, navigate]);

  // Auto-expire requests that aren't accepted within 2 hours
  // (Server-side push worker also handles this and notifies the customer)
  useEffect(() => {
    if (!jobId || !currentJob?.created_at) return;
    if (status !== 'pending' && status !== 'matching') return;

    const EXPIRE_MS = 2 * 60 * 60 * 1000; // 2 hours

    function checkExpiry() {
      const createdAt = new Date(currentJob!.created_at).getTime();
      const elapsed = Date.now() - createdAt;

      if (elapsed >= EXPIRE_MS) {
        cancelJob(jobId!, 'request_expired').catch(console.warn);
        showToast('error', 'Request Expired', 'No providers were available. Please try again.');
        navigate('/customer/home');
      }
    }

    checkExpiry();
    const interval = setInterval(checkExpiry, 30000);

    return () => clearInterval(interval);
  }, [jobId, status, currentJob?.created_at, cancelJob, navigate]);

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ backgroundColor: '#FFFFFF' }}>
      {/* Full-screen Google Map */}
      <div className="absolute inset-0">
        {isLoaded ? (
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={initialCenter.current}
            zoom={14}
            onLoad={onLoad}
            options={{
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
                fillColor: '#008CE5',
                fillOpacity: 1,
                strokeColor: '#FFFFFF',
                strokeWeight: 3,
              }}
              title="Your location"
            />

            {/* Provider marker (en route) — shows real-time location */}
            {showProviderOnMap && (
              <MarkerF
                position={providerMarkerPos}
                icon={{
                  path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z',
                  scale: 1.8,
                  fillColor: '#0070B8',
                  fillOpacity: 1,
                  strokeColor: '#FFFFFF',
                  strokeWeight: 1.5,
                  anchor: new google.maps.Point(12, 22),
                  rotation: providerLocation?.heading || 0,
                }}
                title="Provider"
              />
            )}

            {/* Destination marker (for towing drop-off) */}
            {destinationPos && status === 'enroute_destination' && (
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
                title="Destination"
              />
            )}

            {/* Directions route */}
            {showRouteOnMap && (
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
          <div className="h-full flex items-center justify-center" style={{ backgroundColor: '#F9FAFB' }}>
            <div className="w-10 h-10 border-4 border-[#008CE5] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Back button */}
      <div className="absolute z-30" style={{ top: 'calc(env(safe-area-inset-top, 16px) + 16px)', left: '16px' }}>
        <button
          onClick={() => {
            if (mustCompleteCustomerRating) {
              navigate(`/completion/${jobId}`);
              return;
            }
            navigate('/customer/home');
          }}
          className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg"
          style={{ backgroundColor: 'rgba(255,255,255,0.95)', touchAction: 'manipulation' }}
        >
          <ArrowLeft className="w-5 h-5" style={{ color: '#14263D' }} />
        </button>
      </div>

      {/* Recenter button — bottom right of map */}
      <div className="absolute z-30" style={{ bottom: 'calc(50% + 16px)', right: '16px' }}>
        <button
          onClick={recenterMap}
          className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg"
          style={{ backgroundColor: 'rgba(255,255,255,0.95)', touchAction: 'manipulation' }}
          title="Recenter map"
        >
          <Recenter className="w-5 h-5" style={{ color: '#008CE5' }} />
        </button>
      </div>

      {/* Distance overlay on map */}
      {directions && directions.routes[0]?.legs[0]?.distance && (
        <div className="absolute z-30" style={{ top: 'calc(env(safe-area-inset-top, 16px) + 16px)', left: '50%', transform: 'translateX(-50%)' }}>
          <div className="rounded-full px-5 py-2 shadow-lg" style={{ backgroundColor: 'rgba(20,38,61,0.9)', backdropFilter: 'blur(8px)' }}>
            <span className="text-white font-bold text-sm">{directions.routes[0].legs[0].distance.text}</span>
          </div>
        </div>
      )}

      {/* Bottom sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-30">
        <div className="rounded-t-3xl shadow-2xl overflow-hidden"
          style={{ backgroundColor: '#14263D', paddingBottom: 'calc(12px + var(--safe-bottom, 0px))' }}>

          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.3)' }} />
          </div>

          {/* ETA / Status header */}
          <div className="text-center px-5 pb-3">
            {(status === 'enroute' || status === 'accepted') && eta !== null && (
              <h2 className="font-bold text-xl" style={{ color: '#FFFFFF' }}>Arrives in {eta} min</h2>
            )}
            {(status === 'enroute' || status === 'accepted') && eta === null && (
              <h2 className="font-bold text-xl" style={{ color: '#FFFFFF' }}>Calculating ETA...</h2>
            )}
            {status === 'enroute_destination' && eta !== null && (
              <h2 className="font-bold text-xl" style={{ color: '#FFFFFF' }}>Service delivery in {eta} min</h2>
            )}
            {status === 'enroute_destination' && eta === null && (
              <h2 className="font-bold text-xl" style={{ color: '#FFFFFF' }}>Heading to your location...</h2>
            )}
            {status === 'arrived' && (
              <h2 className="font-bold text-xl" style={{ color: '#FFFFFF' }}>Provider has arrived</h2>
            )}
            {status === 'inprogress' && (
              <div className="flex items-center justify-center gap-2">
                <Clock className="w-5 h-5" style={{ color: '#FFFFFF' }} />
                <h2 className="font-bold text-xl" style={{ color: '#FFFFFF' }}>Working on your vehicle</h2>
              </div>
            )}
            {isWaiting && (
              <>
                <h2 className="font-bold text-xl" style={{ color: '#FFFFFF' }}>Finding your provider</h2>
                <div className="flex items-center justify-center gap-1 mt-2">
                  <div className="w-2 h-2 rounded-full bg-[#008CE5] animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-[#008CE5] animate-bounce" style={{ animationDelay: '200ms' }} />
                  <div className="w-2 h-2 rounded-full bg-[#008CE5] animate-bounce" style={{ animationDelay: '400ms' }} />
                </div>
              </>
            )}
            {status === 'completed' && (
              <h2 className="font-bold text-xl" style={{ color: '#FFFFFF' }}>Service completed</h2>
            )}
            {status === 'cancelled' && (
              <h2 className="font-bold text-xl" style={{ color: '#EF4444' }}>Request cancelled</h2>
            )}
          </div>

          {/* Service details card */}
          {currentJob?.service?.name && (
            <div className="mx-4 mb-3 rounded-xl p-3" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
              <p className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>Service details</p>
              <p className="font-bold mt-0.5" style={{ color: '#FFFFFF' }}>{currentJob.service.name}</p>
              {currentJob.pickup_address && (
                <div className="flex items-start gap-2 mt-1.5">
                  <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.5)' }} />
                  <p className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>{currentJob.pickup_address}</p>
                </div>
              )}
              {destinationPos && currentJob?.destination_address && (
                <div className="flex items-start gap-2 mt-1.5">
                  <Flag className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: '#10B981' }} />
                  <p className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>{currentJob.destination_address}</p>
                </div>
              )}
            </div>
          )}

          {/* Provider card — Uber style */}
          {providerInfo ? (
            <div className="mx-4 mb-3 rounded-xl p-4" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
              <div className="flex items-center gap-3">
                {/* Provider avatar */}
                <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #008CE5, #0070B8)', color: '#FFFFFF' }}>
                  {providerInfo.initials}
                </div>

                {/* Provider details */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-lg truncate" style={{ color: '#FFFFFF' }}>{providerInfo.name}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    {providerInfo.rating > 0 && (
                      <>
                        <Star className="w-4 h-4 fill-[#F59E0B]" style={{ color: '#F59E0B' }} />
                        <span className="font-semibold" style={{ color: '#FFFFFF' }}>{providerInfo.rating.toFixed(1)}</span>
                        <span style={{ color: 'rgba(255,255,255,0.3)' }}>·</span>
                      </>
                    )}
                    <span style={{ color: 'rgba(255,255,255,0.6)' }}>{providerInfo.rescues} jobs</span>
                    {providerInfo.isVerified && (
                      <>
                        <span style={{ color: 'rgba(255,255,255,0.3)' }}>·</span>
                        <Shield className="w-3.5 h-3.5" style={{ color: '#008CE5' }} />
                      </>
                    )}
                  </div>
                </div>

                {/* Vehicle plate badge */}
                {providerInfo.plate && (
                  <div className="flex-shrink-0 text-right">
                    <p className="font-bold text-sm tracking-wide" style={{ color: '#FFFFFF' }}>{providerInfo.plate}</p>
                    {providerInfo.vehicle && (
                      <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>{providerInfo.vehicle}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Communication row */}
              <div className="grid grid-cols-3 gap-2 mt-3">
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
              </div>
            </div>
          ) : (
            /* Waiting for provider */
            !['completed', 'cancelled'].includes(status) && (
              <div className="mx-4 mb-3 rounded-xl p-4 text-center" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" style={{ color: '#008CE5' }} />
                <p className="font-semibold" style={{ color: '#FFFFFF' }}>Matching you with the best provider</p>
                <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>This usually takes less than a minute</p>
              </div>
            )
          )}

          {/* Action buttons */}
          <div className="px-4">
            {status === 'arrived' && (
              <button
                onClick={handleConfirmArrival}
                className="w-full rounded-xl py-4 font-bold text-lg mb-2 active:scale-[0.98] transition-transform"
                style={{ backgroundColor: '#008CE5', color: '#FFFFFF', touchAction: 'manipulation' }}
              >
                Confirm Provider Arrived
              </button>
            )}
            {status === 'inprogress' && (
              <button
                onClick={handleComplete}
                className="w-full rounded-xl py-4 font-bold text-lg mb-2 active:scale-[0.98] transition-transform"
                style={{ backgroundColor: '#008CE5', color: '#FFFFFF', touchAction: 'manipulation' }}
              >
                Service Complete
              </button>
            )}
            {status === 'completed' && !customerHasRatedProvider && (
              <button
                onClick={() => navigate(`/completion/${jobId}`)}
                className="w-full rounded-xl py-4 font-bold text-lg mb-2 active:scale-[0.98] transition-transform"
                style={{ backgroundColor: '#008CE5', color: '#FFFFFF', touchAction: 'manipulation' }}
              >
                Rate Provider & Service
              </button>
            )}
            {(status === 'cancelled' || (status === 'completed' && customerHasRatedProvider)) && (
              <button
                onClick={() => navigate('/customer/home')}
                className="w-full rounded-xl py-4 font-bold text-sm mb-2 active:scale-[0.98] transition-transform"
                style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#FFFFFF', touchAction: 'manipulation' }}
              >
                Back to Home
              </button>
            )}

            {/* Safety button (when provider assigned) */}
            {hasProvider && status !== 'completed' && status !== 'cancelled' && (
              <button
                onClick={() => setShowSafety(true)}
                className="w-full rounded-xl py-3 flex items-center justify-center gap-2 mb-2 active:scale-[0.98] transition-transform"
                style={{ backgroundColor: 'rgba(0,140,229,0.15)', touchAction: 'manipulation' }}
              >
                <Shield className="w-4 h-4" style={{ color: '#008CE5' }} />
                <span className="text-sm font-semibold" style={{ color: '#008CE5' }}>Safety & Support</span>
              </button>
            )}

            {/* Waiting state buttons */}
            {!hasProvider && status !== 'completed' && status !== 'cancelled' && (
              <div className="grid grid-cols-2 gap-2 mb-2">
                <button
                  onClick={handleShare}
                  className="rounded-xl py-3 flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
                  style={{ backgroundColor: 'rgba(255,255,255,0.1)', touchAction: 'manipulation' }}
                >
                  <Share2 className="w-4 h-4" style={{ color: '#FFFFFF' }} />
                  <span className="text-sm font-semibold text-white">Share</span>
                </button>
                <button
                  onClick={() => setShowSafety(true)}
                  className="rounded-xl py-3 flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
                  style={{ backgroundColor: 'rgba(0,140,229,0.15)', touchAction: 'manipulation' }}
                >
                  <Shield className="w-4 h-4" style={{ color: '#008CE5' }} />
                  <span className="text-sm font-semibold" style={{ color: '#008CE5' }}>Safety</span>
                </button>
              </div>
            )}

            {/* Cancel button */}
            {(status === 'pending' || status === 'matching' || status === 'accepted' || status === 'enroute') && (
              <button
                onClick={handleCancelRequest}
                disabled={cancelling}
                className="w-full rounded-xl py-3 font-semibold text-sm active:scale-[0.98] transition-transform"
                style={{
                  backgroundColor: 'rgba(239,68,68,0.15)',
                  color: '#EF4444',
                  touchAction: 'manipulation',
                  opacity: cancelling ? 0.6 : 1,
                }}
              >
                {cancelling ? 'Cancelling...' : 'Cancel Request'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Share toast */}
      {shareToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 rounded-full px-6 py-3 shadow-lg"
          style={{ backgroundColor: 'rgba(255,255,255,0.95)', border: '1px solid #E5E7EB' }}>
          <p className="text-sm font-semibold" style={{ color: '#008CE5' }}>Trip details shared!</p>
        </div>
      )}

      {/* Chat modal */}
      <ChatModal
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        jobId={jobId || ''}
        peerName={providerInfo?.name || 'Provider'}
        peerInitials={providerInfo?.initials || '?'}
        role="customer"
        jobStatus={status}
      />

      {/* VoIP Call modal */}
      <CallModal
        isOpen={isCallOpen}
        onClose={() => setIsCallOpen(false)}
        jobId={jobId || ''}
        peerName={providerInfo?.name || 'Provider'}
        peerInitials={providerInfo?.initials || '?'}
        isOutgoing={isCallOutgoing}
      />

      {/* Cancellation fee confirmation modal — portaled to body so it renders above everything */}
      {showCancelConfirm && createPortal(
        <div
          className="fixed inset-0 flex items-end justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2147483647 }}
          onClick={() => setShowCancelConfirm(false)}
        >
          <div
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            className="w-full max-w-lg rounded-t-[28px] p-6"
            style={{
              backgroundColor: '#FFFFFF',
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" style={{ color: '#EF4444' }} />
                <h2 className="font-bold text-lg" style={{ color: '#14263D' }}>Cancel Request?</h2>
              </div>
              <button
                onClick={() => setShowCancelConfirm(false)}
                style={{ touchAction: 'manipulation', background: 'none', border: 'none', padding: 4 }}
              >
                <X className="w-5 h-5" style={{ color: '#6B7280' }} />
              </button>
            </div>

            <p className="text-sm mb-3" style={{ color: '#374151' }}>
              A provider has already accepted your request. Cancelling now will incur a cancellation fee.
            </p>

            {/* Fee breakdown */}
            <div className="rounded-2xl p-4 mb-4" style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}>
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-5 h-5" style={{ color: '#EF4444' }} />
                <span className="font-bold text-base" style={{ color: '#DC2626' }}>Cancellation Fee</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: '#6B7280' }}>{cancellationFeePct}% of service total</span>
                <span className="font-bold text-xl" style={{ color: '#DC2626' }}>${cancellationFee.toFixed(2)}</span>
              </div>
            </div>

            <p className="text-xs mb-4" style={{ color: '#9CA3AF' }}>
              This fee compensates the provider for their time and travel.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="w-full h-12 rounded-xl font-semibold text-sm active:scale-[0.98] transition-transform"
                style={{
                  backgroundColor: '#FFFFFF',
                  color: '#374151',
                  border: '1.5px solid #D1D5DB',
                  touchAction: 'manipulation',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                }}
              >
                Keep Request
              </button>
              <button
                onClick={handleCancelWithFee}
                disabled={cancelling}
                className="w-full h-12 rounded-xl font-semibold text-sm active:scale-[0.98] transition-transform"
                style={{
                  background: cancelling
                    ? 'linear-gradient(135deg, #FCA5A5, #F87171)'
                    : 'linear-gradient(135deg, #EF4444, #DC2626)',
                  color: '#FFFFFF',
                  touchAction: 'manipulation',
                  opacity: 1,
                  boxShadow: cancelling
                    ? 'none'
                    : '0 8px 18px rgba(239,68,68,0.28)',
                }}
              >
                {cancelling ? 'Cancelling...' : `Cancel ($${cancellationFee.toFixed(2)})`}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Cancel reason modal */}
      {showCancelReason && createPortal(
        <div
          className="fixed inset-0 flex items-end justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2147483647 }}
          onClick={() => { if (!cancelling) { setShowCancelReason(false); setCancelReason(''); setCancelCustomReason(''); } }}
        >
          <div
            className="w-full max-w-lg rounded-t-[28px] p-6"
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #D3E0F2',
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
            }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <h3 className="font-bold text-lg mb-1" style={{ color: '#14263D' }}>Cancel Request</h3>
            <p className="text-sm mb-5" style={{ color: '#6B7280' }}>Please select a reason for cancellation</p>

            <div className="space-y-2 mb-5">
              {[
                'Changed my mind',
                'Wait time too long',
                'Found another service',
                'Issue resolved on my own',
                'Accidentally created request',
              ].map((reason) => (
                <button
                  key={reason}
                  onClick={() => { setCancelReason(reason); setCancelCustomReason(''); }}
                  className="w-full text-left rounded-xl px-4 py-3 text-sm font-medium transition-all"
                  style={cancelReason === reason
                    ? { background: 'linear-gradient(135deg, rgba(0,140,229,0.15), rgba(0,140,229,0.08))', border: '1px solid #008CE5', color: '#14263D' }
                    : { backgroundColor: '#F5F9FF', border: '1px solid #E5E7EB', color: '#14263D' }
                  }
                >
                  {reason}
                </button>
              ))}
              <button
                onClick={() => { setCancelReason('other'); }}
                className="w-full text-left rounded-xl px-4 py-3 text-sm font-medium transition-all"
                style={cancelReason === 'other'
                  ? { background: 'linear-gradient(135deg, rgba(0,140,229,0.15), rgba(0,140,229,0.08))', border: '1px solid #008CE5', color: '#14263D' }
                  : { backgroundColor: '#F5F9FF', border: '1px solid #E5E7EB', color: '#14263D' }
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
                  backgroundColor: '#F5F9FF',
                  border: '1px solid #D3E0F2',
                  color: '#14263D',
                }}
              />
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => { setShowCancelReason(false); setCancelReason(''); setCancelCustomReason(''); }}
                className="rounded-2xl py-3 font-semibold text-sm"
                style={{ backgroundColor: '#E8F0FB', color: '#14263D' }}
              >
                Go Back
              </button>
              <button
                onClick={handleReasonSelected}
                disabled={!cancelReason || (cancelReason === 'other' && !cancelCustomReason.trim())}
                className="rounded-2xl py-3 font-bold text-sm text-white"
                style={{
                  background: 'linear-gradient(135deg, #EF4444, #DC2626)',
                  opacity: (!cancelReason || (cancelReason === 'other' && !cancelCustomReason.trim())) ? 0.5 : 1,
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Safety & Support Modal */}
      {showSafety && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowSafety(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="rounded-t-3xl md:rounded-3xl p-6 w-full md:max-w-md"
            style={{ backgroundColor: '#FFFFFF' }}
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-red-400" />
                <h2 className="font-bold text-lg" style={{ color: '#14263D' }}>Safety & Support</h2>
              </div>
              <button onClick={() => setShowSafety(false)} style={{ touchAction: 'manipulation' }}>
                <X className="w-5 h-5" style={{ color: '#6B7280' }} />
              </button>
            </div>

            <div className="space-y-3">
              {/* Emergency Call */}
              <button
                onClick={() => { window.location.href = 'tel:911'; }}
                className="w-full rounded-xl p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
                style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', touchAction: 'manipulation' }}
              >
                <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
                  <PhoneCall className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-bold text-red-500">Call 911</p>
                  <p className="text-xs" style={{ color: '#6B7280' }}>For life-threatening emergencies</p>
                </div>
              </button>

              {/* Roadside Assistance */}
              <button
                onClick={() => { window.location.href = 'tel:18002221222'; }}
                className="w-full rounded-xl p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
                style={{ backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB', touchAction: 'manipulation' }}
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(42,157,143,0.15)' }}>
                  <Phone className="w-5 h-5" style={{ color: '#0070B8' }} />
                </div>
                <div>
                  <p className="font-semibold" style={{ color: '#14263D' }}>Torc Support Line</p>
                  <p className="text-xs" style={{ color: '#6B7280' }}>Talk to our support team</p>
                </div>
              </button>

              {/* Share Live Location */}
              <button
                onClick={async () => {
                  const link = `https://maps.google.com/?q=${customerPos.lat},${customerPos.lng}`;
                  const shared = await shareContent({
                    title: 'My Live Location',
                    text: `I'm using Torc roadside assistance. Track my location: ${link}`,
                    url: link,
                  });
                  if (shared) {
                    setShareToast(true);
                    setTimeout(() => setShareToast(false), 2500);
                  }
                  setShowSafety(false);
                }}
                className="w-full rounded-xl p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
                style={{ backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB', touchAction: 'manipulation' }}
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(78,205,196,0.15)' }}>
                  <MapPinned className="w-5 h-5" style={{ color: '#008CE5' }} />
                </div>
                <div>
                  <p className="font-semibold" style={{ color: '#14263D' }}>Share My Location</p>
                  <p className="text-xs" style={{ color: '#6B7280' }}>Send your live location to someone</p>
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
                className="w-full rounded-xl p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
                style={{ backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB', touchAction: 'manipulation' }}
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(245,158,11,0.15)' }}>
                  <Flag className="w-5 h-5" style={{ color: '#F59E0B' }} />
                </div>
                <div>
                  <p className="font-semibold" style={{ color: '#14263D' }}>Report an Issue</p>
                  <p className="text-xs" style={{ color: '#6B7280' }}>Report a safety concern or problem</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Provider cancelled notification modal */}
      {showProviderCancelled && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 2147483647 }}
        >
          <div
            className="mx-6 rounded-3xl p-6 w-full max-w-sm"
            style={{ backgroundColor: '#FFFFFF' }}
          >
            <div className="flex flex-col items-center text-center mb-5">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: 'rgba(239,68,68,0.12)' }}>
                <AlertTriangle className="w-8 h-8" style={{ color: '#EF4444' }} />
              </div>
              <h2 className="font-bold text-xl mb-2" style={{ color: '#14263D' }}>Provider Cancelled</h2>
              <p className="text-sm" style={{ color: '#6B7280' }}>
                The provider has cancelled this service request. We apologize for the inconvenience.
              </p>
            </div>

            {providerCancelReason && (
              <div className="rounded-xl p-3 mb-5" style={{ backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                <p className="text-xs font-medium mb-1" style={{ color: '#6B7280' }}>Reason</p>
                <p className="text-sm" style={{ color: '#14263D' }}>{providerCancelReason}</p>
              </div>
            )}

            <p className="text-xs text-center mb-5" style={{ color: '#9CA3AF' }}>
              You will not be charged for this request. You can submit a new request to find another provider.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setShowProviderCancelled(false);
                  navigate('/customer/home');
                }}
                className="w-full h-12 rounded-xl font-semibold text-sm active:scale-[0.98] transition-transform"
                style={{
                  backgroundColor: '#F3F4F6',
                  color: '#374151',
                  touchAction: 'manipulation',
                }}
              >
                Back to Home
              </button>
              <button
                onClick={() => {
                  setShowProviderCancelled(false);
                  navigate('/confirm-location');
                }}
                className="w-full h-12 rounded-xl font-bold text-sm text-white active:scale-[0.98] transition-transform"
                style={{
                  background: 'linear-gradient(135deg, #008CE5, #0070B8)',
                  boxShadow: '0 8px 18px rgba(0,140,229,0.28)',
                  touchAction: 'manipulation',
                }}
              >
                New Request
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
