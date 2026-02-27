import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router';
import { Loader, MapPin, CheckCircle, Star, Navigation, User, ArrowLeft } from 'lucide-react';
import { getRequestContext } from '../../data/requestContext';
import { useEffect, useState, useRef } from 'react';
import { useJob } from '../../context/JobContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../context/ThemeContext';

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
  const { createJob, updateJobDetails, cancelJob, subscribeToJobUpdates } = useJob();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const jobCreated = useRef(false);
  const [error, setError] = useState<string | null>(null);

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

  // Step 1: Create the job and broadcast to providers
  useEffect(() => {
    if (jobCreated.current) return;
    jobCreated.current = true;

    async function startMatching() {
      try {
        setError(null);
        if (user) {
          // Build job details from request context and pass directly to createJob
          // (avoids React state race condition with updateJobDetails)
          const jobDetailsFromContext = {
            serviceId: context.serviceId || null,
            pickupLocation: context.location
              ? { latitude: context.location.lat, longitude: context.location.lng }
              : null,
            pickupAddress: context.location?.address || '',
            destinationLocation: context.destination
              ? { latitude: context.destination.lat, longitude: context.destination.lng }
              : null,
            destinationAddress: context.destination?.address || '',
            isHazardLocation: !!context.isHazardous,
            requesterType: context.whoNeedsHelp === 'new' ? 'other' : 'self',
            requesterName: context.personName || '',
            requesterPhone: context.personPhone || '',
            scheduledFor: context.scheduledFor || null,
            customerNotes: context.notes || '',
            paymentIntentId: context.paymentIntentId || null,
            paymentStatus: context.paymentStatus || 'unpaid',
            paymentCurrency: context.paymentCurrency || 'USD',
          };

          // Also update JobContext state for other consumers
          updateJobDetails(jobDetailsFromContext);

          const job = await createJob(context.paymentMethodId || null, jobDetailsFromContext);
          if (job?.id) {
            setCreatedJobId(job.id);
            if (job.pickup_latitude && job.pickup_longitude) {
              setPickupCoords({ lat: job.pickup_latitude, lng: job.pickup_longitude });
            }

            // Broadcast to online providers via Supabase Realtime Broadcast
            const broadcastChannel = supabase.channel('new-job-broadcast');
            await broadcastChannel.subscribe();
            await broadcastChannel.send({
              type: 'broadcast',
              event: 'new_job',
              payload: {
                id: job.id,
                pickup_address: job.pickup_address,
                pickup_lat: job.pickup_latitude,
                pickup_lng: job.pickup_longitude,
                total_amount: job.total_amount,
                service_id: job.service_id,
                created_at: job.created_at,
              },
            });
            setTimeout(() => supabase.removeChannel(broadcastChannel), 2000);
            return;
          }
        }
      } catch (err: any) {
        console.warn('Job creation failed:', err?.message || err);
        setError('Could not create your request right now. Please try again.');
        jobCreated.current = false;
      }
    }

    startMatching();
  }, []);

  // Subscribe to real-time job updates via JobContext
  useEffect(() => {
    if (!createdJobId) return;

    const unsubscribe = subscribeToJobUpdates(createdJobId, () => {
      // Job updated - currentJob state will be refreshed automatically
      console.log('Job updated via subscribeToJobUpdates');
    });

    return () => unsubscribe();
  }, [createdJobId, subscribeToJobUpdates]);

  // Step 2: Listen for provider acceptance via broadcast + postgres_changes
  useEffect(() => {
    if (!createdJobId) return;

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
      }

      setProviderFound({
        name: provName,
        distance: distStr,
        rating: provRating,
        photo: provPhoto,
      });

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
      {/* Back / Cancel button */}
      <button
        onClick={async () => {
          try {
            if (createdJobId) await cancelJob(createdJobId, 'user_cancelled');
          } catch (e) {
            console.warn('Cancel failed:', e);
          }
          navigate('/home');
        }}
        className="absolute top-0 left-0 z-20 m-6 w-10 h-10 rounded-full flex items-center justify-center"
        style={{ marginTop: 'calc(var(--safe-top) + 8px)', backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}
      >
        <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
      </button>

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

              {providerFound.distance && (
                <div className="flex items-center gap-3 rounded-2xl p-4" style={{ backgroundColor: 'rgba(0,140,229,0.08)', border: '1px solid rgba(0,140,229,0.15)' }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(0,140,229,0.15)' }}>
                    <Navigation className="w-5 h-5 text-[#008CE5]" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-xs" style={{ color: subColor }}>Distance</p>
                    <p className="text-[#008CE5] font-bold text-base">{providerFound.distance}</p>
                  </div>
                </div>
              )}

              <p className="text-sm mt-4" style={{ color: subColor }}>Redirecting to live tracking...</p>
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
                    jobCreated.current = false;
                    window.location.reload();
                  }}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-[#081427] bg-gradient-to-r from-[#008CE5] to-[#0070B8]"
                >
                  Retry
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
              onClick={async () => {
                try {
                  if (createdJobId) await cancelJob(createdJobId, 'user_cancelled');
                } catch (e) {
                  console.warn('Cancel failed:', e);
                }
                navigate('/home');
              }}
              className="torc-btn-secondary mt-12"
              style={{ color: subColor }}
            >
              Cancel Request
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
