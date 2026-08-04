import { motion } from 'motion/react';
import { useNavigate, useParams, useLocation } from 'react-router';
import { MapBackground } from '../../components/MapBackground';
import { X, MapPin, DollarSign, User, AlertCircle, Calendar, AlertTriangle } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { useJob } from '../../context/JobContext';
import { useAuth } from '../../context/AuthContext';
import { initAudio, playRequestRingtone, stopRequestRingtone } from '../../utils/audio';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { KeepAwake } from '@capacitor-community/keep-awake';

const vibrateDevice = () => {
  // Capacitor Haptics for iOS, navigator.vibrate fallback for Android
  Haptics.vibrate({ duration: 500 }).catch(() => {});
  navigator.vibrate?.([300, 120, 300, 120, 300]);
};

const stopVibration = () => {
  navigator.vibrate?.(0);
};

const REQUEST_WINDOW_SECONDS = 90;
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
  const [showCustomerCancelled, setShowCustomerCancelled] = useState(false);
  const [customerCancelReason, setCustomerCancelReason] = useState('');
  const vibrateIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    // Ensure request alerts are audible/haptic on the dedicated request screen.
    initAudio();
    playRequestRingtone();
    KeepAwake.keepAwake().catch(() => {});
    // Start repeating vibration (Haptics for iOS + navigator.vibrate for Android)
    vibrateDevice();
    vibrateIntervalRef.current = window.setInterval(() => {
      vibrateDevice();
    }, 2000);

    return () => {
      stopRequestRingtone();
      stopVibration();
      KeepAwake.allowSleep().catch(() => {});
      if (vibrateIntervalRef.current) {
        window.clearInterval(vibrateIntervalRef.current);
        vibrateIntervalRef.current = null;
      }
    };
  }, []);

  // Get provider's current location — uses Capacitor native API (never re-prompts)
  useEffect(() => {
    import('../../utils/safeLocation').then(({ getSafePosition }) => {
      getSafePosition().then((pos) => setProviderPos(pos));
    });
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
        scheduled_for: broadcastJob.scheduled_for,
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

    const showCancellation = (reason?: string) => {
      stopRequestRingtone();
      stopVibration();
      setCustomerCancelReason(reason || '');
      setShowCustomerCancelled(true);
      if (requestId && user) {
        supabase.from('provider_job_dismissals').upsert(
          { provider_id: user.id, job_id: requestId },
          { onConflict: 'provider_id,job_id' }
        ).then(() => {});
      }
    };

    const bc = supabase
      .channel(`job-accepted-${requestId}`)
      .on('broadcast', { event: 'job_cancelled' }, (payload) => {
        const cancelledId = payload.payload?.job_id;
        if (cancelledId === requestId) {
          showCancellation(payload.payload?.reason);
        }
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
        if (payload.new?.status === 'cancelled') {
          showCancellation(payload.new?.cancellation_reason);
        }
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
          stopVibration();
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

  const isScheduled = (() => {
    if (!jobData?.scheduled_for) return false;
    const scheduled = new Date(jobData.scheduled_for);
    const now = new Date();
    // If scheduled more than 10 minutes from now, it's a scheduled request
    return (scheduled.getTime() - now.getTime()) > 10 * 60 * 1000;
  })();

  const scheduledTimeStr = isScheduled && jobData?.scheduled_for
    ? new Date(jobData.scheduled_for).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '';

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
        stopVibration();

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
        stopVibration();
        navigate('/home');
      }
    } else {
      stopRequestRingtone();
      navigator.vibrate?.(0);
      navigate('/home');
    }
  };

  return (
    <div className="min-h-screen relative overflow-x-hidden overflow-y-auto bg-gradient-to-b from-[#F4F8FF] via-[#EEF5FF] to-[#FFFFFF]" style={{ paddingBottom: 'calc(24px + var(--safe-bottom, 0px))' }}>
      <MapBackground />

      {/* Urgency border glow — only shown in urgent/critical states */}
      {isUrgent && (
        <motion.div
          className="pointer-events-none absolute inset-0 z-40"
          animate={{
            opacity: [0.3, 0.7, 0.3],
          }}
          transition={{ duration: isCritical ? 0.8 : 1.5, repeat: Infinity, ease: 'easeInOut' }}
          style={{ boxShadow: `inset 0 0 40px 10px ${isCritical ? 'rgba(239,68,68,0.25)' : 'rgba(239,68,68,0.15)'}` }}
        />
      )}

      {/* Single ring pulse — reduced from 3 for performance */}
      <motion.div
        className="pointer-events-none absolute rounded-full"
        style={{
          top: '50%', left: '50%',
          width: 200, height: 200,
          marginTop: -100, marginLeft: -100,
          border: `2px solid ${isCritical ? 'rgba(239,68,68,0.4)' : 'rgba(0,140,229,0.25)'}`,
        }}
        animate={{ scale: [1, 3.5], opacity: [0.5, 0] }}
        transition={{ duration: isCritical ? 1.5 : 2.5, repeat: Infinity, ease: 'easeOut' }}
      />

      {/* Static gradient orbs — no animation to avoid GPU flickering */}
      <div
        className="pointer-events-none absolute -top-24 -left-20 h-64 w-64 rounded-full opacity-20"
        style={{ backgroundColor: isCritical ? '#EF4444' : '#008CE5', filter: 'blur(80px)' }}
      />
      <div
        className="pointer-events-none absolute bottom-10 right-0 h-72 w-72 rounded-full opacity-15"
        style={{ backgroundColor: isCritical ? '#EF4444' : '#0070B8', filter: 'blur(80px)' }}
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
            <p className="text-[#0070B8] text-xs font-semibold uppercase tracking-wider">{isScheduled ? 'Scheduled Service Request' : 'Incoming Service Request'}</p>
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
            stopVibration();
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
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-[32px] p-6 mb-6 bg-white/90 shadow-2xl shadow-[#0070B8]/10"
          style={{ border: `2px solid ${isCritical ? 'rgba(239,68,68,0.4)' : isUrgent ? 'rgba(239,68,68,0.25)' : 'rgba(0,112,184,0.15)'}` }}
        >
          <div className="relative z-10">
            <div
              className="rounded-2xl px-4 py-3 mb-5 flex items-center gap-2"
              style={{ backgroundColor: isUrgent ? 'rgba(239,68,68,0.1)' : 'rgba(0,140,229,0.08)', border: `1px solid ${isUrgent ? 'rgba(239,68,68,0.26)' : 'rgba(0,140,229,0.2)'}` }}
            >
              <AlertCircle className="w-4 h-4" style={{ color: isUrgent ? '#EF4444' : '#0070B8' }} />
              <p className="text-sm font-semibold" style={{ color: isUrgent ? '#EF4444' : '#0070B8' }}>
                {isScheduled ? 'Scheduled service request. Claim it before another provider does.' : 'New request just came in. Claim it before another provider does.'}
              </p>
            </div>

          {/* Scheduled indicator */}
          {isScheduled && (
            <div className="rounded-2xl px-4 py-3 mb-5 flex items-center gap-3" style={{ backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}>
              <Calendar className="w-5 h-5 text-amber-500 shrink-0" />
              <div>
                <p className="text-sm font-bold text-amber-600">Scheduled Request</p>
                <p className="text-xs text-amber-500 mt-0.5">{scheduledTimeStr}</p>
              </div>
            </div>
          )}

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
              stopVibration();
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

      {/* Customer cancelled modal */}
      {showCustomerCancelled && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 2147483647 }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="mx-6 rounded-3xl p-6 w-full max-w-sm bg-white"
          >
            <div className="flex flex-col items-center text-center mb-5">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: 'rgba(239,68,68,0.12)' }}>
                <AlertTriangle className="w-8 h-8" style={{ color: '#EF4444' }} />
              </div>
              <h2 className="font-bold text-xl mb-2" style={{ color: '#14263D' }}>Customer Cancelled</h2>
              <p className="text-sm" style={{ color: '#6B7280' }}>
                The customer has cancelled this service request.
              </p>
            </div>

            {customerCancelReason && (
              <div className="rounded-xl p-3 mb-5" style={{ backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                <p className="text-xs font-medium mb-1" style={{ color: '#6B7280' }}>Reason</p>
                <p className="text-sm" style={{ color: '#14263D' }}>{customerCancelReason}</p>
              </div>
            )}

            <button
              onClick={() => {
                setShowCustomerCancelled(false);
                navigate('/home', { state: { cancelledJobId: requestId } });
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
