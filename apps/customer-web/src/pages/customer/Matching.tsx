import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router';
import { Loader, MapPin, CheckCircle, Star, Clock, Navigation, User, ArrowLeft, CalendarCheck, AlertTriangle } from 'lucide-react';
import { getRequestContext } from '../../data/bookingDraftStore';
import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useJob } from '../../context/JobContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../context/ThemeContext';
import { useGoogleMaps } from '../../context/GoogleMapsContext';

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function Matching() {
  const navigate = useNavigate();
  const context = getRequestContext();
  const { cancelJob, subscribeToJobUpdates } = useJob();
  const { user, profile } = useAuth() as any;
  const { isDark } = useTheme();
  const { isLoaded: mapsLoaded } = useGoogleMaps();
  const isScheduled = !!context.scheduledFor;
  const jobPollingStarted = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const etaMinutesRef = useRef<number | null>(null);
  const [webhookTimeout, setWebhookTimeout] = useState(false);

  const textColor = isDark ? '#FFFFFF' : '#14263D';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2';

  const [createdJobId, setCreatedJobId] = useState<string | null>(null);
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [providerFound, setProviderFound] = useState<{
    name: string;
    distance: string;
    rating: number;
    photo: string | null;
  } | null>(null);
  const providerFoundRef = useRef(false);
  const dispatchCleanupRef = useRef<(() => void) | null>(null);
  const [showCancelReason, setShowCancelReason] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelCustomReason, setCancelCustomReason] = useState('');

  // Step 1: Poll for a job linked to the checkout (created by webhook)
  // The webhook's process_stripe_webhook RPC creates the job from booking_snapshot
  // when payment_intent.succeeded fires. We poll until it appears.
  useEffect(() => {
    if (jobPollingStarted.current) return;
    jobPollingStarted.current = true;

    const checkoutId = context.checkoutId;
    if (!checkoutId) {
      setError('No checkout found. Please try booking again.');
      return;
    }

    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    function handleJobFound(job: any) {
      if (cancelled) return;

      setCreatedJobId(job.id);
      if (job.pickup_latitude && job.pickup_longitude) {
        setPickupCoords({ lat: job.pickup_latitude, lng: job.pickup_longitude });
      }

      // BLOCKER FIX: Only dispatch to providers when the job is
      // server-finalized with payment_status='paid' and dispatchable.
      // If still processing, keep polling — do NOT broadcast to providers.
      if (job.payment_status !== 'paid') {
        // Job exists but payment not yet confirmed by webhook.
        // Keep polling — the webhook will update payment_status.
        return;
      }

      cancelled = true; // prevent double-handling after dispatch
      dispatchToProviders(job);
    }

    async function pollForJob() {
      if (cancelled) return;
      try {
        const { data: job } = await supabase
          .from('jobs')
          .select('*')
          .eq('checkout_id', checkoutId)
          .maybeSingle();

        if (job) {
          handleJobFound(job);
        }
      } catch (err) {
        console.warn('Job poll error:', err);
      }
    }

    // Poll every 2 seconds
    pollForJob(); // immediate first check
    pollTimer = setInterval(pollForJob, 2000);

    // Subscribe to real-time changes on jobs filtered by checkout_id.
    // Listen for both INSERT (webhook creates job) and UPDATE (webhook
    // marks existing job as paid after client-created unpaid job).
    realtimeChannel = supabase
      .channel(`checkout-job-${checkoutId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'jobs',
        filter: `checkout_id=eq.${checkoutId}`,
      }, (payload) => {
        if (payload.new) {
          handleJobFound(payload.new);
        }
      })
      .subscribe();

    // After 30 seconds with no job, show recovery message
    timeoutTimer = setTimeout(() => {
      if (!cancelled) {
        setWebhookTimeout(true);
      }
    }, 30000);

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (realtimeChannel) supabase.removeChannel(realtimeChannel);
      if (dispatchCleanupRef.current) dispatchCleanupRef.current();
    };
  }, []);

  // Dispatch job to providers in tiered waves
  function dispatchToProviders(job: any) {
    const customerFirst = profile?.first_name || '';
    const customerLast = profile?.last_name || '';
    const jobPayload = {
      id: job.id,
      pickup_address: job.pickup_address,
      pickup_lat: job.pickup_latitude,
      pickup_lng: job.pickup_longitude,
      pickup_latitude: job.pickup_latitude,
      pickup_longitude: job.pickup_longitude,
      total_amount: job.total_amount,
      base_price: job.base_price,
      service_id: job.service_id,
      created_at: job.created_at,
      scheduled_for: job.scheduled_for,
      customer_notes: job.customer_notes,
      customer_first_name: customerFirst,
      customer_last_name: customerLast ? customerLast.charAt(0) + '.' : '',
    };

    const notifiedProviders = new Set<string>();

    async function notifyProviders(providerIds: string[]) {
      const newProviders = providerIds.filter(id => !notifiedProviders.has(id));
      for (const pid of newProviders) {
        notifiedProviders.add(pid);
        const ch = supabase.channel(`provider-job-${pid}`);
        await ch.subscribe();
        await ch.send({ type: 'broadcast', event: 'new_job', payload: jobPayload });
        setTimeout(() => supabase.removeChannel(ch), 2000);
      }
    }

    async function isStillPending() {
      if (providerFoundRef.current) return false;
      const { data: check } = await supabase
        .from('jobs').select('status').eq('id', job.id).single();
      return check?.status === 'pending';
    }

    // Wave 1: providers within 5 miles (immediate)
    if (job.pickup_latitude && job.pickup_longitude) {
      (async () => {
        try {
          const { data: wave1 } = await supabase.rpc('get_nearby_providers', {
            p_pickup_lat: job.pickup_latitude,
            p_pickup_lng: job.pickup_longitude,
            p_radius_miles: 5,
            p_service_id: job.service_id,
          });
          if (wave1?.length) {
            await notifyProviders(wave1.map((p: any) => p.provider_id));
          }
        } catch (e) {
          console.warn('Wave 1 dispatch error:', e);
        }
      })();
    }

    // Wave 2: expand to 15 miles after 15 seconds
    const wave2Timer = setTimeout(async () => {
      if (!(await isStillPending())) return;
      if (job.pickup_latitude && job.pickup_longitude) {
        try {
          const { data: wave2 } = await supabase.rpc('get_nearby_providers', {
            p_pickup_lat: job.pickup_latitude,
            p_pickup_lng: job.pickup_longitude,
            p_radius_miles: 15,
            p_service_id: job.service_id,
          });
          if (wave2?.length) {
            await notifyProviders(wave2.map((p: any) => p.provider_id));
          }
        } catch (e) {
          console.warn('Wave 2 dispatch error:', e);
        }
      }
    }, 15000);

    // Wave 3: global broadcast after 30 seconds
    const wave3Timer = setTimeout(async () => {
      if (!(await isStillPending())) return;
      const globalCh = supabase.channel('new-job-broadcast');
      await globalCh.subscribe();
      await globalCh.send({ type: 'broadcast', event: 'new_job', payload: jobPayload });
      setTimeout(() => supabase.removeChannel(globalCh), 2000);
    }, 30000);

    dispatchCleanupRef.current = () => {
      clearTimeout(wave2Timer);
      clearTimeout(wave3Timer);
    };
  }

  // Subscribe to real-time job updates via JobContext
  useEffect(() => {
    if (!createdJobId) return;

    const unsubscribe = subscribeToJobUpdates(createdJobId, () => {
      console.log('Job updated via subscribeToJobUpdates');
    });

    return () => unsubscribe();
  }, [createdJobId, subscribeToJobUpdates]);

  // Step 2a: For scheduled jobs, listen for provider acceptance + enroute status
  const [scheduledAccepted, setScheduledAccepted] = useState(false);
  const [scheduledProviderName, setScheduledProviderName] = useState('');
  useEffect(() => {
    if (!createdJobId || !isScheduled) return;
    // Listen on same channel provider broadcasts on
    const ch = supabase
      .channel(`scheduled-listen-${createdJobId}`)
      .on('broadcast', { event: 'job_accepted' }, (payload) => {
        if (payload.payload?.job_id === createdJobId) {
          setScheduledAccepted(true);
          setScheduledProviderName(payload.payload?.provider_name || 'A provider');
        }
      })
      .on('broadcast', { event: 'status_update' }, (payload) => {
        if (payload.payload?.job_id === createdJobId && (payload.payload?.status === 'enroute' || payload.payload?.status === 'en_route')) {
          navigate(`/tracking/${createdJobId}`);
        }
      })
      .subscribe();

    // Also listen on the provider's broadcast channel for acceptance
    const acceptCh = supabase
      .channel(`job-accepted-${createdJobId}`)
      .on('broadcast', { event: 'job_accepted' }, (payload) => {
        if (payload.payload?.job_id === createdJobId) {
          setScheduledAccepted(true);
          setScheduledProviderName(payload.payload?.provider_name || 'A provider');
        }
      })
      .on('broadcast', { event: 'status_update' }, (payload) => {
        if (payload.payload?.job_id === createdJobId && (payload.payload?.status === 'enroute' || payload.payload?.status === 'en_route')) {
          navigate(`/tracking/${createdJobId}`);
        }
      })
      .subscribe();

    // DB fallback: listen for status changes via postgres_changes
    const dbCh = supabase
      .channel(`scheduled-db-${createdJobId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'jobs',
        filter: `id=eq.${createdJobId}`,
      }, (payload) => {
        const updated = payload.new as any;
        if (updated.status === 'accepted' && !scheduledAccepted) {
          setScheduledAccepted(true);
        }
        if (updated.status === 'enroute' || updated.status === 'en_route') {
          navigate(`/tracking/${createdJobId}`);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
      supabase.removeChannel(acceptCh);
      supabase.removeChannel(dbCh);
    };
  }, [createdJobId, isScheduled, navigate]);

  // Step 2b: Listen for provider acceptance via broadcast + postgres_changes (immediate requests)
  useEffect(() => {
    if (!createdJobId) return;
    if (isScheduled) return; // Scheduled jobs use step 2a above

    function handleProviderAccepted(data: any) {
      if (providerFoundRef.current) return;
      providerFoundRef.current = true;

      const provName = data?.provider_name || 'Your Provider';
      const provLat = data?.provider_lat;
      const provLng = data?.provider_lng;
      const provRating = data?.provider_rating || 0;
      const provPhoto = data?.provider_photo || null;

      let distStr = '';
      if (provLat && provLng && pickupCoords) {
        const d = haversineDistance(pickupCoords.lat, pickupCoords.lng, provLat, provLng);
        distStr = d < 0.1 ? 'Less than 0.1 mi away' : `${d.toFixed(1)} mi away`;

        // Calculate actual driving ETA
        const fallbackEta = Math.max(1, Math.ceil((d / 30) * 60));
        if (mapsLoaded) {
          try {
            const service = new google.maps.DirectionsService();
            service.route({
              origin: { lat: provLat, lng: provLng },
              destination: pickupCoords,
              travelMode: google.maps.TravelMode.DRIVING,
            }, (result, routeStatus) => {
              if (String(routeStatus) === 'OK' && result) {
                const leg = result.routes[0]?.legs[0];
                if (leg?.duration) {
                  const mins = Math.ceil(leg.duration.value / 60);
                  setEtaMinutes(mins);
                  etaMinutesRef.current = mins;
                  return;
                }
              }
              setEtaMinutes(fallbackEta);
              etaMinutesRef.current = fallbackEta;
            });
          } catch {
            setEtaMinutes(fallbackEta);
            etaMinutesRef.current = fallbackEta;
          }
        } else {
          setEtaMinutes(fallbackEta);
          etaMinutesRef.current = fallbackEta;
        }
      }

      setProviderFound({
        name: provName,
        distance: distStr,
        rating: provRating,
        photo: provPhoto,
      });

      // Notify 3rd party via SMS using the authorized template contract.
      // The recipient phone is derived from the job's requester_phone field
      // (stored securely during booking), not from client-supplied data.
      if (context.whoNeedsHelp === 'new' && createdJobId && data?.provider_id) {
        (async () => {
          try {
            const customerName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Someone';

            const { error: smsError } = await supabase.functions.invoke('send-sms', {
              body: {
                messageTemplate: 'third_party_enroute',
                templateData: {
                  customerName,
                  providerName: provName,
                  address: context.location?.address || 'your location',
                },
                jobId: createdJobId,
                recipientType: 'requester', // sends to job.requester_phone, not arbitrary to
              },
            });

            if (smsError) {
              console.warn('3rd party SMS notification failed:', smsError.message);
            }
          } catch (err) {
            console.warn('3rd party SMS failed (non-blocking):', err);
          }
        })();
      }

      // Show provider info for 3.5 seconds, then navigate to tracking
      setTimeout(() => {
        navigate(`/tracking/${createdJobId}`, {
          state: {
            acceptedPayload: {
              job_id: createdJobId,
              provider_id: data?.provider_id,
              provider_name: provName,
              provider_lat: provLat,
              provider_lng: provLng,
              provider_rating: provRating,
              provider_photo: provPhoto,
              eta_minutes: etaMinutesRef.current,
            },
          },
        });
      }, 3500);
    }

    // Listen via broadcast (works immediately, no RLS needed)
    const broadcastChannel = supabase
      .channel(`job-accepted-${createdJobId}`)
      .on('broadcast', { event: 'job_accepted' }, (payload) => {
        if (payload.payload?.job_id === createdJobId) {
          handleProviderAccepted(payload.payload);
        }
      })
      .on('broadcast', { event: 'job_cancelled' }, (payload) => {
        const cancelledJobId = payload.payload?.job_id;
        if (cancelledJobId === createdJobId) {
          // Provider or customer cancelled before matching completed
          navigate('/home');
        }
      })
      .subscribe();

    // Also listen via postgres_changes (works after RLS fix is applied)
    const dbChannel = supabase
      .channel(`matching-job-${createdJobId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'jobs',
        filter: `id=eq.${createdJobId}`,
      }, async (payload) => {
        const updated = payload.new;
        if (updated.status === 'accepted' && !providerFoundRef.current) {
          // Fetch provider info from DB
          let provName = 'Your Provider';
          let provRating = 0;
          let provPhoto = null;
          if (updated.provider_id) {
            try {
              const { data: pp } = await supabase
                .from('provider_profiles')
                .select('rating, avatar_url')
                .eq('id', updated.provider_id)
                .maybeSingle();
              const { data: prof } = await supabase
                .from('profiles')
                .select('first_name, last_name')
                .eq('id', updated.provider_id)
                .maybeSingle();
              if (prof) provName = `${prof.first_name || ''} ${prof.last_name || ''}`.trim() || provName;
              if (pp) { provRating = pp.rating || 0; provPhoto = pp.avatar_url || null; }
            } catch {}
          }
          handleProviderAccepted({ provider_name: provName, provider_rating: provRating, provider_photo: provPhoto });
        }
        if (updated.status === 'cancelled') {
          // Job was cancelled in DB
          navigate('/home');
        }
      })
      .subscribe();

    // Polling fallback: check job status every 5 seconds in case broadcast/postgres_changes miss it
    const pollInterval = setInterval(async () => {
      if (providerFoundRef.current) return;
      try {
        const { data: job } = await supabase
          .from('jobs')
          .select('status, provider_id')
          .eq('id', createdJobId)
          .single();

        if (job && (job.status === 'accepted' || job.status === 'enroute' || job.status === 'en_route') && !providerFoundRef.current) {
          // Fetch provider info
          let provName = 'Your Provider';
          let provRating = 0;
          let provPhoto = null;
          if (job.provider_id) {
            try {
              const { data: prof } = await supabase
                .from('profiles')
                .select('first_name, last_name')
                .eq('id', job.provider_id)
                .maybeSingle();
              const { data: pp } = await supabase
                .from('provider_profiles')
                .select('rating, avatar_url')
                .eq('id', job.provider_id)
                .maybeSingle();
              if (prof) provName = `${prof.first_name || ''} ${prof.last_name || ''}`.trim() || provName;
              if (pp) { provRating = pp.rating || 0; provPhoto = pp.avatar_url || null; }
            } catch {}
          }
          handleProviderAccepted({ provider_id: job.provider_id, provider_name: provName, provider_rating: provRating, provider_photo: provPhoto });
        }
      } catch {}
    }, 5000);

    // Fallback timeout: if no provider accepts within 60s, go to tracking anyway
    const fallbackTimer = setTimeout(() => {
      if (!providerFoundRef.current) navigate(`/tracking/${createdJobId}`);
    }, 60000);

    return () => {
      supabase.removeChannel(broadcastChannel);
      supabase.removeChannel(dbChannel);
      clearInterval(pollInterval);
      clearTimeout(fallbackTimer);
    };
  }, [createdJobId, navigate, pickupCoords]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden" style={{ background: isDark ? 'linear-gradient(180deg, #0A1626 0%, #081427 100%)' : 'linear-gradient(180deg, #F8FBFF 0%, #EAF2FF 100%)', paddingTop: 'var(--safe-top)' }}>
      {/* Back / Cancel button — hide when showing scheduled confirmation */}
      {!(isScheduled && createdJobId && !providerFound) && (
        <button
          onClick={() => setShowCancelReason(true)}
          className="absolute top-0 left-0 z-20 m-6 w-10 h-10 rounded-full flex items-center justify-center"
          style={{ marginTop: 'calc(var(--safe-top) + 8px)', backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}
        >
          <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
        </button>
      )}

      {/* Background effects */}
      <div className="absolute inset-0">
        <motion.div
          className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#008CE5] blur-[120px] rounded-full"
          style={{ opacity: isDark ? 0.2 : 0.1 }}
          animate={{
            scale: [1, 1.3, 1],
            opacity: isDark ? [0.2, 0.3, 0.2] : [0.1, 0.15, 0.1],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#0070B8] blur-[120px] rounded-full"
          style={{ opacity: isDark ? 0.2 : 0.1 }}
          animate={{
            scale: [1.3, 1, 1.3],
            opacity: isDark ? [0.3, 0.2, 0.3] : [0.15, 0.1, 0.15],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>

      <AnimatePresence mode="wait">
        {providerFound ? (
          /* Provider Found State */
          <motion.div
            key="found"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className="relative z-10 text-center max-w-md"
          >
            {/* Success checkmark */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.1 }}
              className="mb-6"
            >
              <div
                className="w-28 h-28 rounded-full bg-gradient-to-br from-[#008CE5] to-[#00C98D] flex items-center justify-center mx-auto"
                style={{ boxShadow: '0 25px 60px -12px rgba(46, 255, 175, 0.6)' }}
              >
                <CheckCircle className="w-14 h-14" style={{ color: isDark ? '#081427' : '#14263D' }} />
              </div>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-3xl font-bold mb-2"
              style={{ color: textColor }}
            >
              Provider Found!
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-base mb-8"
              style={{ color: subColor }}
            >
              Your request has been accepted
            </motion.p>

            {/* Provider card */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="rounded-2xl p-6"
              style={{ backgroundColor: cardBg, border: '1px solid ' + cardBorder }}
            >
              <div className="flex items-center gap-4 mb-5">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#008CE5] to-[#0070B8] flex items-center justify-center overflow-hidden flex-shrink-0">
                  {providerFound.photo ? (
                    <img src={providerFound.photo} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-8 h-8" style={{ color: isDark ? '#081427' : '#14263D' }} />
                  )}
                </div>
                <div className="flex-1 text-left">
                  <h3 className="font-bold text-xl" style={{ color: textColor }}>{providerFound.name}</h3>
                  {providerFound.rating > 0 && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                      <span className="text-sm font-medium" style={{ color: subColor }}>{providerFound.rating.toFixed(1)}</span>
                    </div>
                  )}
                </div>
              </div>

              {(etaMinutes !== null || providerFound.distance) && (
                <div className="flex items-center gap-3 rounded-2xl p-4" style={{ backgroundColor: 'rgba(0,140,229,0.08)', border: '1px solid rgba(0,140,229,0.15)' }}>
                  {etaMinutes !== null ? (
                    <>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(0,140,229,0.15)' }}>
                        <Clock className="w-5 h-5 text-[#008CE5]" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-xs" style={{ color: subColor }}>Estimated arrival</p>
                        <p className="text-[#008CE5] font-bold text-lg">{etaMinutes} min</p>
                      </div>
                      {providerFound.distance && (
                        <div className="text-right">
                          <p className="text-xs" style={{ color: subColor }}>Distance</p>
                          <p className="text-sm font-semibold" style={{ color: textColor }}>{providerFound.distance}</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(0,140,229,0.15)' }}>
                        <Navigation className="w-5 h-5 text-[#008CE5]" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-xs" style={{ color: subColor }}>Distance</p>
                        <p className="text-[#008CE5] font-bold text-base">{providerFound.distance}</p>
                      </div>
                    </>
                  )}
                </div>
              )}

              <p className="text-sm mt-4" style={{ color: subColor }}>Redirecting to live tracking...</p>
            </motion.div>
          </motion.div>
        ) : isScheduled && createdJobId ? (
          /* Scheduled Confirmation State */
          <motion.div
            key="scheduled"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className="relative z-10 text-center max-w-md"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.1 }}
              className="mb-6"
            >
              <div
                className="w-28 h-28 rounded-full bg-gradient-to-br from-[#008CE5] to-[#0070B8] flex items-center justify-center mx-auto"
                style={{ boxShadow: '0 25px 60px -12px rgba(0,140,229,0.5)' }}
              >
                {scheduledAccepted
                  ? <CheckCircle className="w-14 h-14" style={{ color: isDark ? '#081427' : '#14263D' }} />
                  : <CalendarCheck className="w-14 h-14" style={{ color: isDark ? '#081427' : '#14263D' }} />
                }
              </div>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-3xl font-bold mb-2"
              style={{ color: textColor }}
            >
              {scheduledAccepted ? 'Provider Accepted!' : 'Providers Notified'}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-base mb-8"
              style={{ color: subColor }}
            >
              {scheduledAccepted
                ? `${scheduledProviderName} will head to you at the scheduled time`
                : 'Your scheduled request has been sent to nearby providers'}
            </motion.p>

            {/* Job summary card */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="rounded-2xl p-6 text-left"
              style={{ backgroundColor: cardBg, border: '1px solid ' + cardBorder }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(to bottom right, rgba(0,140,229,0.2), rgba(0,112,184,0.2))' }}>
                  <MapPin className="w-6 h-6 text-[#008CE5]" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold" style={{ color: textColor }}>{context.serviceName || 'Roadside Service'}</h3>
                  <p className="text-sm" style={{ color: subColor }}>{context.location?.address}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-4 mb-4" style={{ borderTop: '1px solid ' + cardBorder }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(0,140,229,0.08)' }}>
                  <Clock className="w-5 h-5 text-[#008CE5]" />
                </div>
                <div className="flex-1">
                  <p className="text-xs" style={{ color: subColor }}>Scheduled For</p>
                  <p className="text-[#008CE5] font-bold text-base">
                    {context.scheduledFor
                      ? new Date(context.scheduledFor).toLocaleString('en-US', {
                          weekday: 'short', month: 'short', day: 'numeric',
                          hour: 'numeric', minute: '2-digit', hour12: true,
                        })
                      : ''}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4" style={{ borderTop: '1px solid ' + cardBorder }}>
                <div>
                  <p className="text-xs" style={{ color: subColor }}>Estimated Cost</p>
                  <p className="text-[#008CE5] font-bold text-sm mt-1">${context.estimatedPrice.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: subColor }}>Status</p>
                  <p className="font-semibold text-sm mt-1" style={{ color: scheduledAccepted ? '#008CE5' : '#F59E0B' }}>
                    {scheduledAccepted ? 'Provider Accepted' : 'Awaiting Provider'}
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Info note */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="mt-6 rounded-2xl p-4"
              style={{ background: 'linear-gradient(135deg, rgba(0,140,229,0.08), rgba(0,112,184,0.08))', border: '1px solid rgba(0,140,229,0.15)' }}
            >
              <p className="text-sm" style={{ color: scheduledAccepted ? '#008CE5' : subColor }}>
                {scheduledAccepted
                  ? `${scheduledProviderName} has accepted your request! You'll be notified when they start heading your way.`
                  : "You'll receive a notification when a provider accepts your request."}
              </p>
            </motion.div>

            {/* Action buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="mt-8 space-y-3"
            >
              <button
                onClick={() => navigate('/activity')}
                className="w-full py-4 rounded-2xl font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #008CE5, #0070B8)' }}
              >
                View Activity
              </button>
              <button
                onClick={() => navigate('/home')}
                className="w-full py-4 rounded-2xl font-semibold"
                style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E8F0FB', color: textColor }}
              >
                Go Home
              </button>
            </motion.div>
          </motion.div>
        ) : (
          /* Searching State */
          <motion.div
            key="searching"
            exit={{ opacity: 0, scale: 0.8 }}
            className="relative z-10 text-center max-w-md"
          >
            {/* Animated loader */}
            <motion.div
              className="mb-8"
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            >
              <div
                className="w-32 h-32 rounded-full bg-gradient-to-br from-[#008CE5] to-[#0070B8] flex items-center justify-center mx-auto"
                style={{ boxShadow: '0 25px 50px -12px rgba(46, 255, 175, 0.5)' }}
              >
                <motion.div
                  animate={{ rotate: -360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                >
                  <Loader className="w-16 h-16" style={{ color: isDark ? '#081427' : '#14263D' }} />
                </motion.div>
              </div>
            </motion.div>

            {/* Text */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <h1 className="text-3xl font-bold mb-3" style={{ color: textColor }}>
                Finding the Best Provider
              </h1>
              <p className="text-lg mb-8" style={{ color: subColor }}>
                Matching you with a qualified professional near your location
              </p>
            </motion.div>

            {/* Request summary */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="rounded-2xl p-6 text-left"
              style={{ backgroundColor: cardBg, border: '1px solid ' + cardBorder }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(to bottom right, rgba(78,205,196,0.2), rgba(42,157,143,0.2))' }}>
                  <MapPin className="w-6 h-6 text-[#008CE5]" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold" style={{ color: textColor }}>{context.serviceName || 'Roadside Service'}</h3>
                  <p className="text-sm" style={{ color: subColor }}>{context.location?.address}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4" style={{ borderTop: '1px solid ' + cardBorder }}>
                <div>
                  <p className="text-xs" style={{ color: subColor }}>Timing</p>
                  <p className="font-semibold text-sm mt-1" style={{ color: textColor }}>
                    {context.scheduledFor ? 'Scheduled' : 'Right Now'}
                  </p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: subColor }}>Estimated Cost</p>
                  <p className="text-[#008CE5] font-bold text-sm mt-1">
                    ${context.estimatedPrice.toFixed(2)}
                  </p>
                </div>
              </div>
            </motion.div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 rounded-2xl p-4 border border-red-500/30"
                style={{ backgroundColor: 'rgba(239,68,68,0.08)' }}
              >
                <p className="text-red-300 text-sm mb-3">{error}</p>
                <button
                  onClick={() => {
                    setError(null);
                    jobPollingStarted.current = false;
                    window.location.reload();
                  }}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-[#081427] bg-gradient-to-r from-[#008CE5] to-[#0070B8]"
                >
                  Retry
                </button>
              </motion.div>
            )}

            {webhookTimeout && !createdJobId && !error && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 rounded-2xl p-4 border border-yellow-500/30"
                style={{ backgroundColor: 'rgba(245,158,11,0.08)' }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-400" />
                  <p className="text-yellow-300 text-sm font-semibold">Taking longer than expected</p>
                </div>
                <p className="text-sm mb-3" style={{ color: subColor }}>
                  Your payment was processed but the job is still being created. Please wait a moment or check your activity page.
                </p>
                <button
                  onClick={() => navigate('/activity')}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-[#081427] bg-gradient-to-r from-[#008CE5] to-[#0070B8]"
                >
                  View Activity
                </button>
              </motion.div>
            )}

            {/* Loading steps */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="mt-8 space-y-3"
            >
              {[
                { text: 'Analyzing your location', delay: 0 },
                { text: 'Finding nearby providers', delay: 1 },
                { text: 'Verifying availability', delay: 2 },
              ].map((step, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 1 + step.delay }}
                  className="flex items-center gap-3 text-left"
                >
                  <motion.div
                    className="w-2 h-2 rounded-full bg-[#008CE5]"
                    animate={{
                      scale: [1, 1.5, 1],
                      opacity: [0.5, 1, 0.5],
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      delay: step.delay,
                    }}
                  />
                  <p className="text-sm" style={{ color: subColor }}>{step.text}</p>
                </motion.div>
              ))}
            </motion.div>

            {/* Cancel button */}
            <button
              onClick={() => setShowCancelReason(true)}
              className="torc-btn-secondary mt-12"
              style={{ color: subColor }}
            >
              Cancel Request
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cancel reason modal */}
      {showCancelReason && createPortal(
        <div
          className="fixed inset-0 flex items-end justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2147483647 }}
          onClick={() => { setShowCancelReason(false); setCancelReason(''); setCancelCustomReason(''); }}
        >
          <div
            className="w-full max-w-lg rounded-t-[28px] p-6"
            style={{
              backgroundColor: isDark ? '#14263D' : '#FFFFFF',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#D3E0F2'}`,
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
            }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <h3 className="font-bold text-lg mb-1" style={{ color: textColor }}>Cancel Request</h3>
            <p className="text-sm mb-5" style={{ color: subColor }}>Please select a reason for cancellation</p>

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
                onClick={() => { setShowCancelReason(false); setCancelReason(''); setCancelCustomReason(''); }}
                className="rounded-2xl py-3 font-semibold text-sm"
                style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E8F0FB', color: textColor }}
              >
                Go Back
              </button>
              <button
                onClick={async () => {
                  const finalReason = cancelReason === 'other' ? cancelCustomReason.trim() : cancelReason;
                  if (!finalReason) return;
                  try {
                    if (createdJobId) await cancelJob(createdJobId, finalReason);
                  } catch (e) {
                    console.warn('Cancel failed:', e);
                  }
                  navigate('/home');
                }}
                disabled={!cancelReason || (cancelReason === 'other' && !cancelCustomReason.trim())}
                className="rounded-2xl py-3 font-bold text-sm text-white"
                style={{
                  background: 'linear-gradient(135deg, #EF4444, #DC2626)',
                  opacity: (!cancelReason || (cancelReason === 'other' && !cancelCustomReason.trim())) ? 0.5 : 1,
                }}
              >
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
