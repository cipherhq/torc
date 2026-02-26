import { motion } from 'motion/react';
import { useNavigate, useParams, useLocation } from 'react-router';
import { MapBackground } from '../../components/MapBackground';
import { X, MapPin, DollarSign, User, AlertCircle } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useJob } from '../../context/JobContext';
import { useAuth } from '../../context/AuthContext';
import { initAudio, playRequestRingtone, stopRequestRingtone } from '../../utils/audio';

const REQUEST_WINDOW_SECONDS = 60;
const URGENT_THRESHOLD_SECONDS = 15;
const CRITICAL_THRESHOLD_SECONDS = 7;

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function JobRequest() {
  const navigate = useNavigate();
  const location = useLocation();
  const { requestId } = useParams();
  const { fetchJob, currentJob, updateJobStatus } = useJob();
  const { user } = useAuth();
  const [timeLeft, setTimeLeft] = useState(REQUEST_WINDOW_SECONDS);
  const [jobData, setJobData] = useState<any>(null);
  const [accepting, setAccepting] = useState(false);
  const [providerPos, setProviderPos] = useState<{ lat: number; lng: number } | null>(null);
  const [distanceText, setDistanceText] = useState('-');
  const vibrateIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    // Ensure request alerts are audible/haptic on the dedicated request screen.
    initAudio();
    playRequestRingtone();
    if (navigator.vibrate) {
      navigator.vibrate([300, 120, 300, 120, 300]);
      vibrateIntervalRef.current = window.setInterval(() => {
        navigator.vibrate?.([300, 120, 300, 120, 300]);
      }, 2000);
    }

    return () => {
      stopRequestRingtone();
      navigator.vibrate?.(0);
      if (vibrateIntervalRef.current) {
        window.clearInterval(vibrateIntervalRef.current);
        vibrateIntervalRef.current = null;
      }
    };
  }, []);

  // Get provider's current location
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setProviderPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  // Try to fetch job from DB; fallback to broadcast data
  useEffect(() => {
    if (!requestId) return;

    // If we have broadcast data from navigation state, use it immediately
    const broadcastJob = (location.state as any)?.broadcastJob;
    if (broadcastJob) {
      setJobData({
        id: broadcastJob.id,
        pickup_address: broadcastJob.pickup_address,
        pickup_lat: broadcastJob.pickup_lat,
        pickup_lng: broadcastJob.pickup_lng,
        total_amount: broadcastJob.total_amount,
        service_id: broadcastJob.service_id,
        base_price: broadcastJob.base_price,
        customer_notes: broadcastJob.customer_notes,
      });
    }

    // Also try to fetch full data from DB (works after RLS fix is applied)
    fetchJob(requestId)
      .then((job) => { if (job) setJobData(job); })
      .catch(() => {
        // RLS blocks access - use broadcast data only
        console.info('Using broadcast data for job request (RLS pending)');
      });
  }, [requestId]);

  // Listen for cancellation broadcasts or DB updates for this job
  useEffect(() => {
    if (!requestId) return;

    const recordDismissalAndNavigate = () => {
      if (requestId && user) {
        supabase.from('provider_job_dismissals').upsert(
          { provider_id: user.id, job_id: requestId },
          { onConflict: 'provider_id,job_id' }
        ).then(() => {});
      }
      navigate('/home', { state: { cancelledJobId: requestId } });
    };

    const bc = supabase
      .channel(`job-accepted-${requestId}`)
      .on('broadcast', { event: 'job_cancelled' }, (payload) => {
        const cancelledId = payload.payload?.job_id;
        if (cancelledId === requestId) recordDismissalAndNavigate();
      })
      .subscribe();

    const dbChan = supabase
      .channel(`job-cancel-${requestId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'jobs',
        filter: `id=eq.${requestId}`,
      }, (payload) => {
        if (payload.new?.status === 'cancelled') recordDismissalAndNavigate();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(bc);
      supabase.removeChannel(dbChan);
    };
  }, [requestId, navigate]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // Timer expired — do NOT record dismissal so the job stays in the
          // active request queue and can be re-shown based on proximity.
          stopRequestRingtone();
          navigator.vibrate?.(0);
          navigate('/home', { state: { timedOutJobId: requestId } });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate, requestId, user]);

  // Calculate distance from provider to job's pickup location
  useEffect(() => {
    if (!providerPos || !jobData) return;
    const pickupLat = jobData.pickup_lat;
    const pickupLng = jobData.pickup_lng;
    if (pickupLat && pickupLng) {
      const d = haversineDistance(providerPos.lat, providerPos.lng, pickupLat, pickupLng);
      setDistanceText(d < 0.1 ? 'Less than 0.1 mi' : `${d.toFixed(1)} mi`);
    }
  }, [providerPos, jobData]);

  const customerName = jobData?.customer
    ? `${jobData.customer.first_name || ''} ${jobData.customer.last_name || ''}`.trim()
    : 'Customer';

  const requestData = {
    customer: customerName,
    isThirdParty: jobData?.requester_type !== 'self',
    service: jobData?.service?.name || 'Service Request',
    location: jobData?.pickup_address || 'Fetching location...',
    distance: distanceText,
    estimatedPayout: jobData?.total_amount ? `$${jobData.total_amount}` : (jobData?.base_price ? `$${jobData.base_price}` : '-'),
    notes: jobData?.customer_notes || '',
  };
  const isUrgent = timeLeft <= URGENT_THRESHOLD_SECONDS;
  const isCritical = timeLeft <= CRITICAL_THRESHOLD_SECONDS;

  const handleAccept = async () => {
    if (accepting) return;
    setAccepting(true);

    if (requestId && user) {
      try {
        // ✅ USE ATOMIC RPC - Race-safe job acceptance
        const { data, error } = await supabase.rpc('accept_job', {
          p_job_id: requestId,
          p_provider_id: user.id
        });

        if (error) {
          console.error('RPC error:', error);
          navigate('/home');
          return;
        }

        // Check if acceptance was successful
        if (!data || !data.success) {
          console.warn('Job already taken:', data?.error, data?.message);
          navigate('/home');
          return;
        }

        // Success! Job atomically claimed
        // Push worker will automatically notify customer via pg_notify
        console.log('Job accepted successfully:', data);
        stopRequestRingtone();
        navigator.vibrate?.(0);

        // Fetch provider profile for additional broadcast data
        let providerRating = 0;
        let providerPhoto = null;
        try {
          const { data: pp } = await supabase
            .from('provider_profiles')
            .select('rating, avatar_url')
            .eq('id', user.id)
            .maybeSingle();
          if (pp) {
            providerRating = pp.rating || 0;
            providerPhoto = pp.avatar_url || null;
          }
        } catch {}

        // Broadcast acceptance to the customer's matching page (for immediate UI update)
        const channel = supabase.channel(`job-accepted-${requestId}`);
        await channel.subscribe();
        await channel.send({
          type: 'broadcast',
          event: 'job_accepted',
          payload: {
            job_id: requestId,
            provider_id: user.id,
            provider_name: user.user_metadata?.first_name || 'Provider',
            provider_lat: providerPos?.lat || null,
            provider_lng: providerPos?.lng || null,
            provider_rating: providerRating,
            provider_photo: providerPhoto,
          },
        });
        setTimeout(() => supabase.removeChannel(channel), 2000);

        // Navigate to job details
        navigate(`/job/${requestId}`);
      } catch (e) {
        console.error('Accept error:', e);
        stopRequestRingtone();
        navigator.vibrate?.(0);
        navigate('/home');
      }
    } else {
      stopRequestRingtone();
      navigator.vibrate?.(0);
      navigate('/home');
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-b from-[#F4F8FF] via-[#EEF5FF] to-[#FFFFFF]">
      <MapBackground />

      {/* Pulsating urgency border glow */}
      <motion.div
        className="pointer-events-none absolute inset-0 z-40"
        animate={{
          boxShadow: isCritical
            ? [
                'inset 0 0 60px 10px rgba(239,68,68,0.0)',
                'inset 0 0 80px 25px rgba(239,68,68,0.35)',
                'inset 0 0 60px 10px rgba(239,68,68,0.0)',
              ]
            : isUrgent
              ? [
                  'inset 0 0 50px 8px rgba(239,68,68,0.0)',
                  'inset 0 0 60px 18px rgba(239,68,68,0.2)',
                  'inset 0 0 50px 8px rgba(239,68,68,0.0)',
                ]
              : [
                  'inset 0 0 40px 5px rgba(0,140,229,0.0)',
                  'inset 0 0 50px 12px rgba(0,140,229,0.12)',
                  'inset 0 0 40px 5px rgba(0,140,229,0.0)',
                ],
        }}
        transition={{ duration: isCritical ? 0.6 : isUrgent ? 1.0 : 2.0, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Expanding ring pulses */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={`ring-${i}`}
          className="pointer-events-none absolute rounded-full"
          style={{
            top: '50%', left: '50%',
            width: 200, height: 200,
            marginTop: -100, marginLeft: -100,
            border: `2px solid ${isCritical ? 'rgba(239,68,68,0.4)' : 'rgba(0,140,229,0.25)'}`,
          }}
          animate={{ scale: [1, 4.5], opacity: [0.6, 0] }}
          transition={{
            duration: isCritical ? 1.5 : 2.5,
            repeat: Infinity,
            delay: i * (isCritical ? 0.5 : 0.8),
            ease: 'easeOut',
          }}
        />
      ))}

      <motion.div
        className="pointer-events-none absolute -top-24 -left-20 h-64 w-64 rounded-full blur-[120px]"
        style={{ backgroundColor: isCritical ? 'rgba(239,68,68,0.3)' : 'rgba(0,140,229,0.25)' }}
        animate={{ x: [0, 22, 0], y: [0, -18, 0], scale: [1, 1.25, 1] }}
        transition={{ duration: isCritical ? 2 : 7, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="pointer-events-none absolute bottom-10 right-0 h-72 w-72 rounded-full blur-[120px]"
        style={{ backgroundColor: isCritical ? 'rgba(239,68,68,0.25)' : 'rgba(0,112,184,0.2)' }}
        animate={{ x: [0, -26, 0], y: [0, 14, 0], scale: [1, 1.3, 1] }}
        transition={{ duration: isCritical ? 2.5 : 8.5, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Timer bar */}
      <div className="absolute top-0 left-0 right-0 h-2 bg-white/10 z-50">
        <motion.div
          initial={{ width: '100%' }}
          animate={{ width: '0%' }}
          transition={{ duration: REQUEST_WINDOW_SECONDS, ease: 'linear' }}
          className="h-full"
          style={{ background: isCritical ? 'linear-gradient(to right, #EF4444, #F97316)' : 'linear-gradient(to right, #008CE5, #0070B8)' }}
        />
      </div>

      {/* Header */}
      <div className="relative z-10 p-6 flex items-center justify-between" style={{ paddingTop: 'var(--safe-top)' }}>
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#008CE5]/25 bg-[#008CE5]/10 px-3 py-1 mb-2">
            <motion.span
              animate={{ scale: [1, 1.45, 1], opacity: [1, 0.35, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: isUrgent ? '#EF4444' : '#008CE5' }}
            />
            <p className="text-[#0070B8] text-xs font-semibold uppercase tracking-wider">Incoming Service Request</p>
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold text-[#0F172A]">Respond in {timeLeft}s</h1>
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
              style={{ backgroundColor: isUrgent ? 'rgba(239,68,68,0.14)' : 'rgba(0,140,229,0.14)', color: isUrgent ? '#EF4444' : '#0070B8' }}
            >
              LIVE
            </span>
          </div>
          <p className="text-sm mt-1" style={{ color: isUrgent ? '#EF4444' : '#64748B' }}>
            {isCritical ? 'Critical: final seconds to claim this request.' : isUrgent ? 'Urgent: this request may expire any second.' : 'Another provider can accept this at any time.'}
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => {
            stopRequestRingtone();
            navigator.vibrate?.(0);
            if (requestId && user) {
              supabase.from('provider_job_dismissals').upsert(
                { provider_id: user.id, job_id: requestId },
                { onConflict: 'provider_id,job_id' }
              ).then(() => {});
            }
            navigate('/home', { state: { declinedJobId: requestId } });
          }}
          className="rounded-full p-3 bg-white/90 border shadow-lg shadow-[#008CE5]/15"
          style={{ borderColor: isUrgent ? 'rgba(239,68,68,0.35)' : 'rgba(0,140,229,0.2)' }}
        >
          <X className="w-6 h-6" style={{ color: isUrgent ? '#EF4444' : '#0070B8' }} />
        </motion.button>
      </div>

      {/* Request card */}
      <div className="relative z-10 px-6">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={isCritical ? { opacity: 1, y: [0, -1.2, 0, 1.2, 0] } : { opacity: 1, y: 0 }}
          transition={isCritical ? { duration: 0.28, repeat: Infinity } : undefined}
          className="relative overflow-hidden rounded-[32px] p-6 mb-6 border border-[#0070B8]/15 bg-white/90 backdrop-blur-xl shadow-2xl shadow-[#0070B8]/10"
        >
          <motion.div
            className="pointer-events-none absolute inset-0 rounded-[32px] border-2"
            style={{ borderColor: isUrgent ? 'rgba(239,68,68,0.35)' : 'rgba(0,140,229,0.25)' }}
            animate={{ opacity: [0.35, 0.9, 0.35] }}
            transition={{ duration: 1.4, repeat: Infinity }}
          />
          <div className="relative z-10">
            <div
              className="rounded-2xl px-4 py-3 mb-5 flex items-center gap-2"
              style={{ backgroundColor: isUrgent ? 'rgba(239,68,68,0.1)' : 'rgba(0,140,229,0.08)', border: `1px solid ${isUrgent ? 'rgba(239,68,68,0.26)' : 'rgba(0,140,229,0.2)'}` }}
            >
              <AlertCircle className="w-4 h-4" style={{ color: isUrgent ? '#EF4444' : '#0070B8' }} />
              <p className="text-sm font-semibold" style={{ color: isUrgent ? '#EF4444' : '#0070B8' }}>
                New request just came in. Claim it before another provider does.
              </p>
            </div>

          {/* Customer info */}
          <div className="flex items-center gap-4 mb-6 pb-6 border-b border-[#0070B8]/10">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#0A84FF] to-[#0057D8] flex items-center justify-center shadow-lg shadow-[#0070B8]/30">
              <User className="w-8 h-8 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-[#0F172A] font-semibold text-xl">{requestData.customer}</h3>
              {requestData.isThirdParty && (
                <div className="inline-flex items-center gap-1 mt-2 rounded-full border border-[#0070B8]/20 bg-[#008CE5]/10 px-2.5 py-1">
                  <AlertCircle className="w-4 h-4 text-[#0070B8]" />
                  <span className="text-[#0070B8] text-xs font-medium">Requesting for someone else</span>
                </div>
              )}
            </div>
          </div>

          {/* Service details */}
          <div className="space-y-4 mb-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#008CE5]/20 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-5 h-5 text-[#008CE5]" />
              </div>
              <div className="flex-1">
                <p className="text-[#64748B] text-sm">Service</p>
                <p className="text-[#0F172A] font-semibold">{requestData.service}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#0070B8]/20 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-5 h-5 text-[#0070B8]" />
              </div>
              <div className="flex-1">
                <p className="text-[#64748B] text-sm">Location</p>
                <p className="text-[#0F172A] font-semibold">{requestData.location}</p>
                <p className="text-[#0070B8] text-sm mt-1">{requestData.distance} away</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#008CE5]/20 flex items-center justify-center flex-shrink-0">
                <DollarSign className="w-5 h-5 text-[#008CE5]" />
              </div>
              <div className="flex-1">
                <p className="text-[#64748B] text-sm">Estimated Payout</p>
                <p className="text-[#0F172A] font-bold text-2xl">{requestData.estimatedPayout}</p>
              </div>
            </div>
          </div>

          {/* Notes */}
          {requestData.notes && (
            <div className="bg-[#008CE5]/5 border border-[#0070B8]/15 rounded-2xl p-4">
              <p className="text-[#64748B] text-sm mb-2">Customer Notes</p>
              <p className="text-[#0F172A]">{requestData.notes}</p>
            </div>
          )}
          </div>
        </motion.div>

        {/* Action buttons */}
        <div
          className="rounded-2xl px-4 py-3 mb-4"
          style={{ backgroundColor: isUrgent ? 'rgba(239,68,68,0.1)' : 'rgba(0,140,229,0.08)', border: `1px solid ${isUrgent ? 'rgba(239,68,68,0.24)' : 'rgba(0,140,229,0.18)'}` }}
        >
          <p className="text-sm font-semibold" style={{ color: isUrgent ? '#EF4444' : '#0070B8' }}>
            {isUrgent ? 'Time is almost up. Tap Accept now.' : 'Tap Accept to start navigation and notify the customer.'}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={async () => {
              stopRequestRingtone();
              navigator.vibrate?.(0);
              if (requestId && user) {
                try {
                  await Promise.all([
                    supabase.from('job_declines').insert({ job_id: requestId, provider_id: user.id }),
                    supabase.from('provider_job_dismissals').upsert({ provider_id: user.id, job_id: requestId }, { onConflict: 'provider_id,job_id' }),
                  ]);
                } catch {}
              }
              navigate('/home', { state: { declinedJobId: requestId } });
            }}
            className="rounded-[24px] py-5 font-bold text-white text-lg bg-[#0070B8] shadow-lg shadow-[#0070B8]/25"
          >
            Decline
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            animate={accepting ? { scale: 1 } : {
              scale: isCritical ? [1, 1.045, 1] : [1, 1.02, 1],
              boxShadow: isCritical
                ? [
                    '0 12px 30px rgba(239,68,68,0.36)',
                    '0 18px 36px rgba(239,68,68,0.58)',
                    '0 12px 30px rgba(239,68,68,0.36)',
                  ]
                : [
                    '0 10px 28px rgba(0,112,184,0.35)',
                    '0 14px 34px rgba(0,112,184,0.48)',
                    '0 10px 28px rgba(0,112,184,0.35)',
                  ],
            }}
            transition={accepting ? undefined : { duration: isCritical ? 0.82 : 1.25, repeat: Infinity }}
            onClick={handleAccept}
            disabled={accepting}
            className="bg-gradient-to-r from-[#0A84FF] to-[#0057D8] rounded-[24px] py-5 font-bold text-white text-lg disabled:opacity-70"
            style={isCritical ? { background: 'linear-gradient(to right, #EF4444, #F97316)' } : undefined}
          >
            {accepting ? 'Accepting...' : 'Accept Request'}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
