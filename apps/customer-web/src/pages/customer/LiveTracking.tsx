import { useNavigate, useParams } from 'react-router';
import { Phone, MessageCircle, Share2, Shield, Star, Clock, MapPin, Loader2, ArrowLeft, X, AlertTriangle, PhoneCall, Flag, MapPinned, DollarSign, Navigation2 as Recenter } from 'lucide-react';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { GoogleMap, MarkerF, DirectionsRenderer } from '@react-google-maps/api';
import { useGoogleMaps } from '../../context/GoogleMapsContext';
import { useLocation as useLocationCtx } from '../../context/LocationContext';
import { useRealtimeLocation, useWatchPosition } from '../../hooks/useRealtimeLocation';
import { useJob } from '../../context/JobContext';
import { ChatModal } from '../../components/ChatModal';
import { CallModal } from '../../components/CallModal';
import { callPhone, shareJobDetails } from '../../utils/communication';
import { supabase } from '../../lib/supabase';
import { showToast } from '../../components/NotificationToast';
import { initAudio, playMessageSound } from '../../utils/audio';

const mapContainerStyle = { width: '100%', height: '100%' };

type JobStatus = 'pending' | 'matching' | 'accepted' | 'enroute' | 'arrived' | 'inprogress' | 'completed' | 'cancelled';

const JOB_STATUS_ORDER: Record<JobStatus, number> = {
  pending: 0,
  matching: 1,
  accepted: 2,
  enroute: 3,
  arrived: 4,
  inprogress: 5,
  completed: 6,
  cancelled: 6, // cancelled can happen at any time
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
  const { isLoaded } = useGoogleMaps();
  const { currentLocation } = useLocationCtx();
  const { currentJob, fetchJob, updateJobStatus, cancelJob, platformSettings } = useJob();
  const myPosition = useWatchPosition(true);

  const [status, setStatusRaw] = useState<JobStatus>('pending');
  // Forward-only status setter — status never goes backward (except cancelled which can happen anytime)
  const setStatus = useCallback((next: JobStatus) => {
    setStatusRaw((prev) => {
      if (next === 'cancelled') return 'cancelled'; // cancellation always allowed
      if (JOB_STATUS_ORDER[next] >= JOB_STATUS_ORDER[prev]) return next;
      return prev; // ignore backward transitions
    });
  }, []);
  const [eta, setEta] = useState<number | null>(null);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isCallOpen, setIsCallOpen] = useState(false);
  const [isCallOutgoing, setIsCallOutgoing] = useState(true);
  const [shareToast, setShareToast] = useState(false);
  const [directionsError, setDirectionsError] = useState(false);
  const [jobError, setJobError] = useState(false);
  const [showSafety, setShowSafety] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
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
            showToast('error', 'Provider Cancelled', 'The provider has cancelled this request. We\'ll help you find another provider.');
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
          if (newStatus === 'inprogress') showToast('info', 'Service Started', 'Your provider has begun the service.');
          if (newStatus === 'completed') showToast('success', 'Service Completed', 'Your service has been completed successfully!');
          if (newStatus === 'cancelled') showToast('error', 'Provider Cancelled', 'The provider has cancelled this request.');
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
      .on('broadcast', { event: 'new_message' }, (payload) => {
        const msg = payload.payload;
        if (!msg || msg.sender_role === 'customer') return;
        if (!isChatOpenRef.current) {
          initAudio();
          playMessageSound();
          const senderName = msg.sender_name || 'Provider';
          showToast('message', senderName, msg.text?.slice(0, 80) || 'Sent you a message', 5000, () => {
            setIsChatOpen(true);
          });
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

  const requestDrivingDirections = useCallback((force = false) => {
    if (!isLoaded || !activeProviderPos || !customerPos) return;
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
        destination: customerPos,
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

        const isRetryable = routeStatusText === 'OVER_QUERY_LIMIT' || routeStatusText === 'UNKNOWN_ERROR';
        if (isRetryable && directionsRetryCountRef.current < 3) {
          directionsRetryCountRef.current += 1;
          const backoffMs = 1000 * directionsRetryCountRef.current;
          if (directionsRetryTimeoutRef.current) clearTimeout(directionsRetryTimeoutRef.current);
          directionsRetryTimeoutRef.current = setTimeout(() => requestDrivingDirections(true), backoffMs);
          return;
        }

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
      });
    } catch {
      directionsServiceRef.current = false;
      setDirectionsError(true);
    }
  }, [isLoaded, activeProviderPos?.lat, activeProviderPos?.lng, customerPos?.lat, customerPos?.lng, status]);

  // Refresh route periodically but keep request rate below quota limits.
  useEffect(() => {
    requestDrivingDirections(false);
  }, [requestDrivingDirections]);

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

  // Fit both points into view ONCE on initial load, then let the user
  // control the map freely. Markers and route update in real-time but
  // the camera stays put so the view doesn't jump around.
  useEffect(() => {
    if (!map || hasInitialFit.current) return;
    if (!activeProviderPos) {
      map.panTo(customerPos);
      map.setZoom(15);
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    bounds.extend(customerPos);
    bounds.extend(activeProviderPos);
    map.fitBounds(bounds, { top: 120, bottom: 380, left: 40, right: 40 });
    hasInitialFit.current = true;
  }, [map, activeProviderPos?.lat, activeProviderPos?.lng, customerPos.lat, customerPos.lng, status]);

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
      try { await updateJobStatus(jobId, 'completed'); } catch (e) { console.warn(e); }
    }
    navigate(`/completion/${jobId}`);
  };

  const handleCall = () => {
    setIsCallOutgoing(true);
    setIsCallOpen(true);
  };
  const handleMessage = () => setIsChatOpen(true);

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
  const providerHasAccepted = hasProvider || status === 'accepted' || status === 'enroute' || status === 'arrived' || status === 'inprogress';
  const cancellationFeePct = platformSettings?.cancellation_fee_pct ?? 25;
  const totalAmount = currentJob?.total_amount ? Number(currentJob.total_amount) : (currentJob?.base_price ? Number(currentJob.base_price) : 0);
  const cancellationFee = providerHasAccepted ? Math.round(totalAmount * (cancellationFeePct / 100) * 100) / 100 : 0;

  const handleCancelRequest = () => {
    if (providerHasAccepted && cancellationFee > 0) {
      setShowCancelConfirm(true);
    } else {
      handleCancelDirect();
    }
  };

  const handleCancelDirect = async () => {
    if (!jobId) return;
    setCancelling(true);
    try {
      await cancelJob(jobId, 'user_cancelled');
    } catch (e) {
      console.warn('Cancel failed:', e);
    }
    setCancelling(false);
    navigate('/customer/home');
  };

  const handleCancelWithFee = async () => {
    if (!jobId) return;
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

      await cancelJob(jobId, 'user_cancelled_with_fee');
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

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ backgroundColor: '#FFFFFF' }}>
      {/* Full-screen Google Map */}
      <div className="absolute inset-0">
        {isLoaded ? (
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={customerPos}
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

            {/* Provider marker (en route) */}
            {showProviderOnMap && (
              <MarkerF
                position={providerMarkerPos}
                icon={{
                  path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                  scale: 7,
                  fillColor: '#008CE5',
                  fillOpacity: 1,
                  strokeColor: '#0070B8',
                  strokeWeight: 2,
                  rotation: providerLocation?.heading || 0,
                }}
                title="Provider"
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

      {/* Back button + Recenter */}
      <div className="absolute z-30 flex gap-2" style={{ top: 'calc(env(safe-area-inset-top, 16px) + 16px)', left: '16px' }}>
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
          <ArrowLeft className="w-5 h-5" style={{ color: '#1A1F2E' }} />
        </button>
        <button
          onClick={recenterMap}
          className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg"
          style={{ backgroundColor: 'rgba(255,255,255,0.95)', touchAction: 'manipulation' }}
          title="Recenter map"
        >
          <Recenter className="w-5 h-5" style={{ color: '#008CE5' }} />
        </button>
      </div>

      {/* Top status bar */}
      <div className="relative z-20 p-4" style={{ paddingTop: 'calc(env(safe-area-inset-top, 16px) + 16px)' }}>
        <div className="rounded-2xl px-5 py-4 text-center shadow-lg"
          style={{ backgroundColor: 'rgba(255,255,255,0.95)', border: '1px solid #E5E7EB', backdropFilter: 'blur(12px)' }}>
          <div className="flex items-center justify-center gap-2 mb-1">
            {isConnected && <div className="w-2 h-2 bg-[#008CE5] rounded-full animate-pulse" />}
            {isWaiting && <Loader2 className="w-4 h-4 animate-spin" style={{ color: currentStatus.color }} />}
            <p className="text-sm font-medium" style={{ color: '#6B7280' }}>{currentStatus.detail}</p>
          </div>

          {(status === 'enroute' || status === 'accepted') && eta !== null && (
            <p className="font-bold text-2xl" style={{ color: '#008CE5' }}>{eta} min</p>
          )}
          {(status === 'enroute' || status === 'accepted') && eta === null && (
            <p className="font-bold text-lg" style={{ color: '#008CE5' }}>Calculating ETA...</p>
          )}
          {status === 'arrived' && (
            <p className="font-bold text-lg" style={{ color: '#0070B8' }}>Provider is here!</p>
          )}
          {status === 'inprogress' && (
            <div className="flex items-center justify-center gap-2">
              <Clock className="w-5 h-5" style={{ color: '#008CE5' }} />
              <p className="font-bold text-lg" style={{ color: '#008CE5' }}>Working on your vehicle</p>
            </div>
          )}
          {isWaiting && (
            <div className="flex items-center justify-center gap-1 mt-1">
              <div className="w-2 h-2 rounded-full bg-[#F59E0B] animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 rounded-full bg-[#F59E0B] animate-bounce" style={{ animationDelay: '200ms' }} />
              <div className="w-2 h-2 rounded-full bg-[#F59E0B] animate-bounce" style={{ animationDelay: '400ms' }} />
            </div>
          )}
        </div>
      </div>

      {/* Bottom sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-30">
        <div className="rounded-t-3xl p-5 shadow-2xl"
          style={{ backgroundColor: 'rgba(255,255,255,0.97)', borderTop: '1px solid #E5E7EB', backdropFilter: 'blur(12px)' }}>
          {/* Provider card */}
          {providerInfo ? (
            <div className="mb-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold"
                  style={{ background: 'linear-gradient(135deg, #008CE5, #0070B8)', color: '#FFFFFF' }}>
                  {providerInfo.initials}
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-lg" style={{ color: '#1A1F2E' }}>{providerInfo.name}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    {providerInfo.rating > 0 && (
                      <>
                        <Star className="w-3.5 h-3.5 fill-[#008CE5]" style={{ color: '#008CE5' }} />
                        <span className="text-sm font-semibold" style={{ color: '#008CE5' }}>{providerInfo.rating.toFixed(1)}</span>
                        <span style={{ color: '#9CA3AF' }}>·</span>
                      </>
                    )}
                    <span className="text-sm" style={{ color: '#6B7280' }}>{providerInfo.rescues} jobs</span>
                  </div>
                  {providerInfo.isVerified && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold" style={{ backgroundColor: 'rgba(78,205,196,0.15)', color: '#008CE5' }}>VERIFIED</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Vehicle info */}
              {(providerInfo.vehicle || providerInfo.license || providerInfo.plate) && (
                <div className="grid grid-cols-3 gap-2">
                  {providerInfo.vehicle && (
                    <div className="rounded-xl p-2 text-center" style={{ backgroundColor: '#F3F4F6' }}>
                      <p className="text-[10px] mb-0.5" style={{ color: '#9CA3AF' }}>Vehicle</p>
                      <p className="text-xs font-semibold" style={{ color: '#1A1F2E' }}>{providerInfo.vehicle}</p>
                    </div>
                  )}
                  {providerInfo.license && (
                    <div className="rounded-xl p-2 text-center" style={{ backgroundColor: '#F3F4F6' }}>
                      <p className="text-[10px] mb-0.5" style={{ color: '#9CA3AF' }}>License</p>
                      <p className="text-xs font-semibold" style={{ color: '#1A1F2E' }}>{providerInfo.license}</p>
                    </div>
                  )}
                  {providerInfo.plate && (
                    <div className="rounded-xl p-2 text-center" style={{ backgroundColor: '#F3F4F6' }}>
                      <p className="text-[10px] mb-0.5" style={{ color: '#9CA3AF' }}>Plate</p>
                      <p className="text-xs font-semibold" style={{ color: '#1A1F2E' }}>{providerInfo.plate}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Waiting for provider */
            <div className="mb-4 text-center py-4">
              <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ backgroundColor: '#F3F4F6' }}>
                <Loader2 className="w-7 h-7 animate-spin" style={{ color: '#008CE5' }} />
              </div>
              <h3 className="font-bold" style={{ color: '#1A1F2E' }}>Finding Provider...</h3>
              <p className="text-sm mt-1" style={{ color: '#6B7280' }}>
                We're matching you with the best available provider nearby
              </p>
            </div>
          )}

          {/* Action buttons based on status */}
          {status === 'arrived' && (
            <button
              onClick={handleConfirmArrival}
              className="w-full rounded-2xl py-4 font-bold text-lg mb-3 active:scale-[0.98] transition-transform"
              style={{
                background: 'linear-gradient(to right, #008CE5, #0070B8)',
                color: '#FFFFFF',
                boxShadow: '0 8px 24px rgba(78,205,196,0.4)',
                touchAction: 'manipulation',
              }}
            >
              Confirm Provider Arrived
            </button>
          )}
          {status === 'inprogress' && (
            <button
              onClick={handleComplete}
              className="w-full rounded-2xl py-4 font-bold text-lg mb-3 active:scale-[0.98] transition-transform"
              style={{
                background: 'linear-gradient(to right, #008CE5, #0070B8)',
                color: '#FFFFFF',
                boxShadow: '0 8px 24px rgba(78,205,196,0.4)',
                touchAction: 'manipulation',
              }}
            >
              Service Complete
            </button>
          )}
          {(status === 'cancelled' || status === 'completed') && (
            <>
              {status === 'completed' && !customerHasRatedProvider && (
                <button
                  onClick={() => navigate(`/completion/${jobId}`)}
                  className="w-full rounded-2xl py-4 font-bold text-lg mb-3 active:scale-[0.98] transition-transform"
                  style={{
                    background: 'linear-gradient(to right, #008CE5, #0070B8)',
                    color: '#FFFFFF',
                    boxShadow: '0 8px 24px rgba(78,205,196,0.4)',
                    touchAction: 'manipulation',
                  }}
                >
                  Rate Provider & Service
                </button>
              )}
              {(status === 'cancelled' || (status === 'completed' && customerHasRatedProvider)) && (
                <button
                  onClick={() => navigate('/customer/home')}
                  className="w-full rounded-2xl py-4 font-bold text-sm mb-3 active:scale-[0.98] transition-transform"
                  style={{ backgroundColor: '#F3F4F6', color: '#1A1F2E', touchAction: 'manipulation' }}
                >
                  Back to Home
                </button>
              )}
            </>
          )}

          {/* Communication buttons (only when provider is assigned) */}
          {hasProvider && (
            <div className="grid grid-cols-3 gap-3 mb-3">
              <button
                onClick={handleCall}
                className="rounded-2xl py-3.5 flex flex-col items-center gap-1.5 active:scale-[0.97] transition-transform"
                style={{ backgroundColor: '#F3F4F6', border: '1px solid #E5E7EB', touchAction: 'manipulation' }}
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(78,205,196,0.12)' }}>
                  <Phone className="w-5 h-5" style={{ color: '#008CE5' }} />
                </div>
                <span className="text-xs font-semibold" style={{ color: '#1A1F2E' }}>Call</span>
              </button>
              <button
                onClick={handleMessage}
                className="rounded-2xl py-3.5 flex flex-col items-center gap-1.5 active:scale-[0.97] transition-transform"
                style={{ backgroundColor: '#F3F4F6', border: '1px solid #E5E7EB', touchAction: 'manipulation' }}
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(42,157,143,0.12)' }}>
                  <MessageCircle className="w-5 h-5" style={{ color: '#0070B8' }} />
                </div>
                <span className="text-xs font-semibold" style={{ color: '#1A1F2E' }}>Message</span>
              </button>
              <button
                onClick={handleShare}
                className="rounded-2xl py-3.5 flex flex-col items-center gap-1.5 active:scale-[0.97] transition-transform"
                style={{ backgroundColor: '#F3F4F6', border: '1px solid #E5E7EB', touchAction: 'manipulation' }}
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(107,114,128,0.1)' }}>
                  <Share2 className="w-5 h-5" style={{ color: '#6B7280' }} />
                </div>
                <span className="text-xs font-semibold" style={{ color: '#1A1F2E' }}>Share</span>
              </button>
            </div>
          )}

          {/* Communication buttons (waiting state) */}
          {!hasProvider && status !== 'completed' && status !== 'cancelled' && (
            <div className="grid grid-cols-2 gap-3 mb-3">
              <button
                onClick={handleShare}
                className="rounded-2xl py-3.5 flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
                style={{
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  touchAction: 'manipulation',
                }}
              >
                <Share2 className="w-5 h-5" style={{ color: '#008CE5' }} />
                <span className="text-sm font-semibold" style={{ color: '#0F172A' }}>Share</span>
              </button>
              <button
                onClick={() => setShowSafety(true)}
                className="rounded-2xl py-3.5 flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
                style={{
                  backgroundColor: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  boxShadow: '0 1px 4px rgba(0, 140, 229, 0.08)',
                  touchAction: 'manipulation',
                }}
              >
                <Shield className="w-5 h-5" style={{ color: '#0070B8' }} />
                <span className="text-sm font-semibold" style={{ color: '#0070B8' }}>Safety</span>
              </button>
            </div>
          )}

          {/* Safety & Support button (when provider is assigned) */}
          {hasProvider && status !== 'completed' && status !== 'cancelled' && (
            <button
              onClick={() => setShowSafety(true)}
              className="w-full rounded-2xl py-4 flex items-center justify-center gap-2.5 active:scale-[0.98] transition-transform mb-3"
              style={{
                backgroundColor: '#EFF6FF',
                border: '1px solid #BFDBFE',
                boxShadow: '0 2px 8px rgba(0, 140, 229, 0.1)',
                touchAction: 'manipulation',
              }}
            >
              <Shield className="w-5 h-5" style={{ color: '#0070B8' }} />
              <span className="text-sm font-semibold" style={{ color: '#0070B8' }}>Safety & Support</span>
            </button>
          )}

          {/* Cancel button (only before service starts) */}
          {(status === 'pending' || status === 'matching' || status === 'accepted' || status === 'enroute') && (
            <button
              onClick={handleCancelRequest}
              disabled={cancelling}
              className="w-full rounded-2xl py-4 font-semibold text-sm active:scale-[0.98] transition-transform"
              style={{
                backgroundColor: '#FFF5F5',
                border: '1px solid #FECACA',
                color: '#DC2626',
                touchAction: 'manipulation',
                boxShadow: '0 1px 3px rgba(220,38,38,0.08)',
                opacity: cancelling ? 0.6 : 1,
              }}
            >
              {cancelling ? 'Cancelling...' : 'Cancel Request'}
            </button>
          )}
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

      {/* Cancellation fee confirmation modal */}
      {showCancelConfirm && (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowCancelConfirm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="mx-6 rounded-3xl p-6 w-full max-w-sm"
            style={{ backgroundColor: '#FFFFFF' }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" style={{ color: '#EF4444' }} />
                <h2 className="font-bold text-lg" style={{ color: '#1A1F2E' }}>Cancel Request?</h2>
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

            <p className="text-xs mb-5" style={{ color: '#9CA3AF' }}>
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
        </div>
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
                <h2 className="font-bold text-lg" style={{ color: '#1A1F2E' }}>Safety & Support</h2>
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
                  <p className="font-semibold" style={{ color: '#1A1F2E' }}>Torc Support Line</p>
                  <p className="text-xs" style={{ color: '#6B7280' }}>Talk to our support team</p>
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
                className="w-full rounded-xl p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
                style={{ backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB', touchAction: 'manipulation' }}
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(78,205,196,0.15)' }}>
                  <MapPinned className="w-5 h-5" style={{ color: '#008CE5' }} />
                </div>
                <div>
                  <p className="font-semibold" style={{ color: '#1A1F2E' }}>Share My Location</p>
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
                  <p className="font-semibold" style={{ color: '#1A1F2E' }}>Report an Issue</p>
                  <p className="text-xs" style={{ color: '#6B7280' }}>Report a safety concern or problem</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
