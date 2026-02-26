import { motion } from 'motion/react';
import { useNavigate, useParams } from 'react-router';
import { X, MapPin, DollarSign, User, AlertCircle, Navigation, Clock } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useJob } from '../../context/JobContext';
import { useAuth } from '../../context/AuthContext';
import { useGoogleMaps } from '../../context/GoogleMapsContext';
import { useLocation as useLocationCtx } from '../../context/LocationContext';
import { useWatchPosition } from '../../hooks/useRealtimeLocation';
import { GoogleMap, MarkerF, DirectionsRenderer } from '@react-google-maps/api';

import { initAudio, playRequestRingtone, stopRequestRingtone } from '../../utils/audio';
import { showToast } from '../../components/NotificationToast';

const mapContainerStyle = { width: '100%', height: '100%' };
const REQUEST_WINDOW_SECONDS = 60;
const URGENT_THRESHOLD_SECONDS = 15;
const CRITICAL_THRESHOLD_SECONDS = 7;

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): string {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return d < 0.1 ? 'Less than 0.1 mi' : `${d.toFixed(1)} mi`;
}

export function JobRequest() {
  const navigate = useNavigate();
  const { requestId } = useParams();
  const { fetchJob, updateJobStatus } = useJob();
  const { user, profile } = useAuth();
  const { isLoaded } = useGoogleMaps();
  const { currentLocation } = useLocationCtx();
  const watchPos = useWatchPosition(true);
  const [timeLeft, setTimeLeft] = useState(REQUEST_WINDOW_SECONDS);
  const [jobData, setJobData] = useState<any>(null);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [accepting, setAccepting] = useState(false);
  const declined = useRef(false);

  // Play continuous ringtone when request page opens — stop on unmount
  useEffect(() => {
    initAudio();
    playRequestRingtone();
    return () => { stopRequestRingtone(); };
  }, []);

  // Fetch job data — redirect back if already taken
  useEffect(() => {
    if (!requestId) return;
    fetchJob(requestId).then((job) => {
      if (!job) return;
      // If job is already accepted/assigned, it's no longer available
      if (job.status !== 'pending' || (job.provider_id && job.provider_id !== user?.id)) {
        showToast('info', 'Job Unavailable', 'This request has already been accepted by another provider.');
        navigate('/provider/home', { replace: true });
        return;
      }
      setJobData(job);
    }).catch(console.warn);
  }, [requestId]);

  // Countdown timer — auto-decline when expired
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleDecline();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Use watchPosition (direct GPS) as primary, LocationContext as fallback
  const myLat = watchPos?.lat || currentLocation?.latitude;
  const myLng = watchPos?.lng || currentLocation?.longitude;

  // Calculate directions when we have both locations
  useEffect(() => {
    if (!isLoaded || !myLat || !myLng || !jobData?.pickup_latitude || !jobData?.pickup_longitude) return;

    const directionsService = new google.maps.DirectionsService();
    directionsService.route(
      {
        origin: { lat: myLat, lng: myLng },
        destination: { lat: jobData.pickup_latitude, lng: jobData.pickup_longitude },
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, dirStatus) => {
        if (dirStatus === google.maps.DirectionsStatus.OK && result) {
          setDirections(result);
        }
      }
    );
  }, [isLoaded, myLat, myLng, jobData]);

  const handleDecline = useCallback(async () => {
    if (declined.current) return;
    declined.current = true;
    stopRequestRingtone();

    // Re-broadcast the job so other online providers can see it
    if (requestId && jobData) {
      try {
        const channel = supabase.channel('new-job-rebroadcast');
        await channel.subscribe();
        await channel.send({
          type: 'broadcast',
          event: 'new_job',
          payload: {
            id: requestId,
            pickup_address: jobData.pickup_address,
            pickup_lat: jobData.pickup_latitude,
            pickup_lng: jobData.pickup_longitude,
            total_amount: jobData.total_amount,
            service_id: jobData.service_id,
            created_at: jobData.created_at,
            declined_by: user?.id,
          },
        });
        setTimeout(() => supabase.removeChannel(channel), 1500);
      } catch (e) {
        console.warn('Failed to re-broadcast job:', e);
      }
    }

    navigate('/provider/home', { state: { declinedJobId: requestId } });
  }, [requestId, jobData, user, navigate]);

  const handleAccept = async () => {
    if (!requestId || accepting) return;
    setAccepting(true);
    stopRequestRingtone();

    try {
      // Only accept if still pending and no provider assigned (prevents race condition)
      const { data: updated, error: updateErr } = await supabase
        .from('jobs')
        .update({
          status: 'accepted',
          provider_id: user?.id,
          accepted_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .eq('status', 'pending')
        .is('provider_id', null)
        .select()
        .single();

      if (updateErr || !updated) {
        showToast('info', 'Job Unavailable', 'This request has already been accepted by another provider.');
        navigate('/provider/home', { replace: true });
        return;
      }

      // Set status to enroute immediately
      await supabase
        .from('jobs')
        .update({ status: 'enroute' })
        .eq('id', requestId);

      // Broadcast acceptance to customer
      const providerName = profile
        ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
        : 'Provider';

      const channel = supabase.channel(`job-accepted-${requestId}`);
      await channel.subscribe();
      await channel.send({
        type: 'broadcast',
        event: 'job_accepted',
        payload: {
          job_id: requestId,
          provider_id: user?.id,
          provider_name: providerName,
          provider_lat: myLat,
          provider_lng: myLng,
          provider_rating: 0,
          provider_photo: null,
        },
      });
      setTimeout(() => supabase.removeChannel(channel), 1500);

      navigate(`/provider/job/${requestId}`);
    } catch (e) {
      console.warn('Failed to accept job:', e);
      setAccepting(false);
    }
  };

  const customerProfileName = jobData?.customer
    ? `${jobData.customer.first_name || ''} ${jobData.customer.last_name || ''}`.trim()
    : '';
  const customerName = customerProfileName
    || jobData?.requester_name?.trim()
    || 'Customer';

  const pickupLat = jobData?.pickup_latitude;
  const pickupLng = jobData?.pickup_longitude;
  const providerLat = myLat;
  const providerLng = myLng;

  // Prefer Google Directions distance/time, fallback to haversine
  const dirLeg = directions?.routes?.[0]?.legs?.[0];
  const drivingDistStr = dirLeg?.distance?.text || '';
  const drivingTimeStr = dirLeg?.duration?.text || '';

  const haversineStr = (pickupLat && pickupLng && providerLat && providerLng)
    ? haversineDistance(providerLat, providerLng, pickupLat, pickupLng)
    : '';

  const distanceStr = drivingDistStr || haversineStr || 'Calculating...';
  const etaStr = drivingTimeStr;

  const requestInfo = {
    customer: customerName,
    isThirdParty: jobData?.requester_type !== 'self',
    service: jobData?.service?.name || 'Service Request',
    location: jobData?.pickup_address || 'Fetching location...',
    distance: distanceStr,
    eta: etaStr,
    estimatedPayout: jobData?.total_amount
      ? `$${Number(jobData.total_amount).toFixed(2)}`
      : (jobData?.base_price ? `$${Number(jobData.base_price).toFixed(2)}` : '-'),
    notes: jobData?.customer_notes || '',
  };
  const isUrgent = timeLeft <= URGENT_THRESHOLD_SECONDS;
  const isCritical = timeLeft <= CRITICAL_THRESHOLD_SECONDS;

  const mapCenter = pickupLat && pickupLng
    ? { lat: pickupLat, lng: pickupLng }
    : myLat && myLng
      ? { lat: myLat, lng: myLng }
      : { lat: 33.749, lng: -84.388 };

  return (
    <motion.div
      className="min-h-screen relative overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #F6FBFF 0%, #EEF6FF 55%, #FFFFFF 100%)' }}
      animate={isCritical ? { x: [0, -1.1, 1.1, 0] } : undefined}
      transition={isCritical ? { duration: 0.28, repeat: Infinity } : undefined}
    >
      <motion.div
        className="pointer-events-none absolute -top-20 -left-10 w-56 h-56 rounded-full bg-[#008CE5]/20 blur-[95px]"
        animate={{ x: [0, 18, 0], y: [0, -12, 0], scale: [1, 1.1, 1] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="pointer-events-none absolute bottom-8 right-0 w-64 h-64 rounded-full bg-[#0070B8]/18 blur-[110px]"
        animate={{ x: [0, -20, 0], y: [0, 10, 0], scale: [1, 1.14, 1] }}
        transition={{ duration: 8.5, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Timer bar at top */}
      <div className="fixed top-0 left-0 right-0 h-1.5 z-50" style={{ backgroundColor: '#E5E7EB' }}>
        <div
          className="h-full transition-all duration-1000 ease-linear"
          style={{
            width: `${(timeLeft / REQUEST_WINDOW_SECONDS) * 100}%`,
            background: isUrgent ? 'linear-gradient(to right, #EF4444, #F97316)' : 'linear-gradient(to right, #008CE5, #0070B8)',
          }}
        />
      </div>

      {/* Header */}
      <div className="p-6 flex items-center justify-between" style={{ paddingTop: 'calc(env(safe-area-inset-top, 16px) + 20px)' }}>
        <div>
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-2" style={{ backgroundColor: 'rgba(0,140,229,0.12)' }}>
            <motion.span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: isUrgent ? '#EF4444' : '#008CE5' }}
              animate={{ scale: [1, 1.45, 1], opacity: [1, 0.35, 1] }}
              transition={{ duration: 1.1, repeat: Infinity }}
            />
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#0070B8' }}>Incoming Service Request</p>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: '#1A1F2E' }}>
            Respond in <span style={{ color: isUrgent ? '#EF4444' : '#008CE5' }}>{timeLeft}s</span>
          </h1>
          <p className="text-sm mt-1" style={{ color: isUrgent ? '#EF4444' : '#6B7280' }}>
            {isCritical ? 'Critical: final seconds to claim this request.' : isUrgent ? 'Urgent: claim this request now.' : 'Another provider can take this request at any time.'}
          </p>
        </div>
        <button
          onClick={handleDecline}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: '#F3F4F6', border: `1px solid ${isUrgent ? 'rgba(239,68,68,0.28)' : 'rgba(0,140,229,0.2)'}`, touchAction: 'manipulation' }}
        >
          <X className="w-5 h-5" style={{ color: isUrgent ? '#EF4444' : '#6B7280' }} />
        </button>
      </div>

      {/* Map showing route */}
      <div className="px-4 mb-4">
        <div
          className={`rounded-2xl overflow-hidden ${isCritical ? 'animate-pulse' : ''}`}
          style={{
            height: 200,
            border: `1px solid ${isUrgent ? 'rgba(239,68,68,0.35)' : '#E5E7EB'}`,
            boxShadow: isUrgent ? '0 12px 28px rgba(239,68,68,0.12)' : '0 10px 22px rgba(0,112,184,0.08)',
          }}
        >
          {isLoaded ? (
            <GoogleMap
              mapContainerStyle={mapContainerStyle}
              center={mapCenter}
              zoom={12}
              options={{ disableDefaultUI: true, gestureHandling: 'greedy' }}
            >
              {/* Provider marker (blue) */}
              {providerLat && providerLng && (
                <MarkerF
                  position={{ lat: providerLat, lng: providerLng }}
                  icon={{
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 8,
                    fillColor: '#008CE5',
                    fillOpacity: 1,
                    strokeColor: '#FFFFFF',
                    strokeWeight: 3,
                  }}
                />
              )}

              {/* Customer pickup marker (red pin) */}
              {pickupLat && pickupLng && (
                <MarkerF
                  position={{ lat: pickupLat, lng: pickupLng }}
                  icon={{
                    path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',
                    fillColor: '#EF4444',
                    fillOpacity: 1,
                    strokeColor: '#FFFFFF',
                    strokeWeight: 2,
                    scale: 1.8,
                    anchor: new google.maps.Point(12, 22),
                  }}
                />
              )}

              {/* Route line */}
              {directions && (
                <DirectionsRenderer
                  directions={directions}
                  options={{
                    suppressMarkers: true,
                    polylineOptions: {
                      strokeColor: '#008CE5',
                      strokeWeight: 4,
                      strokeOpacity: 0.8,
                    },
                  }}
                />
              )}
            </GoogleMap>
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#F9FAFB' }}>
              <div className="w-8 h-8 border-3 border-[#008CE5] border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Distance + ETA badge */}
        <div className="flex items-center justify-center gap-3 mt-2">
          <div className="flex items-center gap-1.5">
            <Navigation className="w-4 h-4" style={{ color: '#008CE5' }} />
            <span className="text-sm font-semibold" style={{ color: '#1A1F2E' }}>{distanceStr}</span>
          </div>
          {etaStr && (
            <>
              <span style={{ color: '#D1D5DB' }}>|</span>
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" style={{ color: '#0070B8' }} />
                <span className="text-sm font-semibold" style={{ color: '#1A1F2E' }}>{etaStr}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Request details card */}
      <div className="px-4 mb-4">
        <motion.div
          animate={isCritical ? { y: [0, -1.2, 0, 1.2, 0] } : undefined}
          transition={isCritical ? { duration: 0.28, repeat: Infinity } : undefined}
          className="rounded-2xl p-5"
          style={{
            backgroundColor: '#FFFFFF',
            border: `1px solid ${isUrgent ? 'rgba(239,68,68,0.32)' : '#E5E7EB'}`,
            boxShadow: isUrgent ? '0 16px 34px rgba(239,68,68,0.12)' : '0 12px 26px rgba(0,112,184,0.08)',
          }}
        >
          <div
            className="rounded-xl px-4 py-3 mb-4 flex items-center gap-2"
            style={{ backgroundColor: isUrgent ? 'rgba(239,68,68,0.1)' : 'rgba(0,140,229,0.08)', border: `1px solid ${isUrgent ? 'rgba(239,68,68,0.24)' : 'rgba(0,140,229,0.2)'}` }}
          >
            <AlertCircle className="w-4 h-4" style={{ color: isUrgent ? '#EF4444' : '#0070B8' }} />
            <p className="text-sm font-semibold" style={{ color: isUrgent ? '#EF4444' : '#0070B8' }}>
              New request received. Accept quickly before it is reassigned.
            </p>
          </div>

          {/* Customer info */}
          <div className="flex items-center gap-4 mb-5 pb-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
            <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #008CE5, #0070B8)' }}>
              <User className="w-7 h-7" style={{ color: '#FFFFFF' }} />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg" style={{ color: '#1A1F2E' }}>{requestInfo.customer}</h3>
              {requestInfo.isThirdParty && (
                <div className="flex items-center gap-1 mt-1">
                  <AlertCircle className="w-4 h-4" style={{ color: '#F59E0B' }} />
                  <span className="text-sm" style={{ color: '#F59E0B' }}>Requesting for someone else</span>
                </div>
              )}
            </div>
          </div>

          {/* Service details */}
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(78,205,196,0.1)' }}>
                <MapPin className="w-5 h-5" style={{ color: '#008CE5' }} />
              </div>
              <div className="flex-1">
                <p className="text-xs" style={{ color: '#9CA3AF' }}>Service</p>
                <p className="font-semibold" style={{ color: '#1A1F2E' }}>{requestInfo.service}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(42,157,143,0.1)' }}>
                <Navigation className="w-5 h-5" style={{ color: '#0070B8' }} />
              </div>
              <div className="flex-1">
                <p className="text-xs" style={{ color: '#9CA3AF' }}>Pickup Location</p>
                <p className="font-semibold" style={{ color: '#1A1F2E' }}>{requestInfo.location}</p>
                <p className="text-sm mt-0.5" style={{ color: '#008CE5' }}>{requestInfo.distance} away</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(78,205,196,0.1)' }}>
                <DollarSign className="w-5 h-5" style={{ color: '#008CE5' }} />
              </div>
              <div className="flex-1">
                <p className="text-xs" style={{ color: '#9CA3AF' }}>Estimated Payout</p>
                <p className="font-bold text-xl" style={{ color: '#22C55E' }}>{requestInfo.estimatedPayout}</p>
              </div>
            </div>
          </div>

          {/* Notes */}
          {requestInfo.notes && (
            <div className="mt-4 rounded-xl p-4" style={{ backgroundColor: '#F9FAFB' }}>
              <p className="text-xs mb-1" style={{ color: '#9CA3AF' }}>Customer Notes</p>
              <p className="text-sm" style={{ color: '#374151' }}>{requestInfo.notes}</p>
            </div>
          )}
        </motion.div>
      </div>

      {/* Action buttons - fixed at bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-20 p-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 16px)', backgroundColor: 'rgba(255,255,255,0.95)', borderTop: '1px solid #E5E7EB', backdropFilter: 'blur(12px)' }}>
        <div
          className="rounded-xl px-4 py-3 mb-3"
          style={{ backgroundColor: isUrgent ? 'rgba(239,68,68,0.1)' : 'rgba(0,140,229,0.08)', border: `1px solid ${isUrgent ? 'rgba(239,68,68,0.24)' : 'rgba(0,140,229,0.2)'}` }}
        >
          <p className="text-sm font-semibold" style={{ color: isUrgent ? '#EF4444' : '#0070B8' }}>
            {isUrgent ? 'Time is almost up. Tap Accept now.' : 'Tap Accept to notify the customer and start navigation.'}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleDecline}
            className="rounded-2xl py-4 font-bold text-lg"
            style={{ backgroundColor: '#F3F4F6', color: '#6B7280', touchAction: 'manipulation' }}
          >
            Decline
          </button>
          <button
            onClick={handleAccept}
            disabled={accepting}
            className={`rounded-2xl py-4 font-bold text-lg ${isCritical && !accepting ? 'animate-pulse' : ''}`}
            style={{
              background: isCritical ? 'linear-gradient(to right, #EF4444, #F97316)' : 'linear-gradient(to right, #008CE5, #0070B8)',
              color: '#FFFFFF',
              boxShadow: isCritical ? '0 14px 32px rgba(239,68,68,0.42)' : '0 10px 28px rgba(0,112,184,0.38)',
              touchAction: 'manipulation',
              opacity: accepting ? 0.6 : 1,
            }}
          >
            {accepting ? 'Accepting...' : 'Accept Request'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
