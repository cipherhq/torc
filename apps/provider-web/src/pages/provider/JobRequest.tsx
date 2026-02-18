import { motion } from 'motion/react';
import { useNavigate, useParams, useLocation } from 'react-router';
import { MapBackground } from '../../components/MapBackground';
import { X, MapPin, Clock, DollarSign, User, AlertCircle, Navigation } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useJob } from '../../context/JobContext';
import { useAuth } from '../../context/AuthContext';

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
  const [timeLeft, setTimeLeft] = useState(30);
  const [jobData, setJobData] = useState<any>(null);
  const [accepting, setAccepting] = useState(false);
  const [providerPos, setProviderPos] = useState<{ lat: number; lng: number } | null>(null);
  const [distanceText, setDistanceText] = useState('-');

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

    const bc = supabase
      .channel(`job-accepted-${requestId}`)
      .on('broadcast', { event: 'job_cancelled' }, (payload) => {
        const cancelledId = payload.payload?.job_id;
        if (cancelledId === requestId) {
          // Dismiss the incoming request UI
          navigate('/home');
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
          navigate('/home');
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
          navigate('/home');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate]);

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
        navigate('/home');
      }
    } else {
      navigate('/home');
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <MapBackground />

      {/* Timer bar */}
      <div className="absolute top-0 left-0 right-0 h-2 bg-white/10 z-50">
        <motion.div
          initial={{ width: '100%' }}
          animate={{ width: '0%' }}
          transition={{ duration: 30, ease: 'linear' }}
          className="h-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF]"
        />
      </div>

      {/* Header */}
      <div className="relative z-10 p-6 flex items-center justify-between">
        <div>
          <p className="text-white/60 text-sm">New Request</p>
          <h1 className="text-2xl font-bold text-white">Accept in {timeLeft}s</h1>
        </div>
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate('/home')}
          className="glass rounded-full p-3"
        >
          <X className="w-6 h-6 text-white" />
        </motion.button>
      </div>

      {/* Request card */}
      <div className="relative z-10 px-6">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-[32px] p-6 mb-6"
        >
          {/* Customer info */}
          <div className="flex items-center gap-4 mb-6 pb-6 border-b border-white/10">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center">
              <User className="w-8 h-8 text-[#0F1419]" />
            </div>
            <div className="flex-1">
              <h3 className="text-white font-semibold text-lg">{requestData.customer}</h3>
              {requestData.isThirdParty && (
                <div className="flex items-center gap-1 mt-1">
                  <AlertCircle className="w-4 h-4 text-[#007AFF]" />
                  <span className="text-[#007AFF] text-sm">Requesting for someone else</span>
                </div>
              )}
            </div>
          </div>

          {/* Service details */}
          <div className="space-y-4 mb-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#2EFFAF]/20 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-5 h-5 text-[#2EFFAF]" />
              </div>
              <div className="flex-1">
                <p className="text-white/60 text-sm">Service</p>
                <p className="text-white font-semibold">{requestData.service}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#007AFF]/20 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-5 h-5 text-[#007AFF]" />
              </div>
              <div className="flex-1">
                <p className="text-white/60 text-sm">Location</p>
                <p className="text-white font-semibold">{requestData.location}</p>
                <p className="text-[#2EFFAF] text-sm mt-1">{requestData.distance} away</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#2EFFAF]/20 flex items-center justify-center flex-shrink-0">
                <DollarSign className="w-5 h-5 text-[#2EFFAF]" />
              </div>
              <div className="flex-1">
                <p className="text-white/60 text-sm">Estimated Payout</p>
                <p className="text-white font-bold text-xl">{requestData.estimatedPayout}</p>
              </div>
            </div>
          </div>

          {/* Notes */}
          {requestData.notes && (
            <div className="bg-white/5 rounded-2xl p-4">
              <p className="text-white/60 text-sm mb-2">Customer Notes</p>
              <p className="text-white">{requestData.notes}</p>
            </div>
          )}
        </motion.div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-4">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/home')}
            className="glass rounded-[24px] py-5 font-bold text-white text-lg"
          >
            Decline
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleAccept}
            disabled={accepting}
            className="bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-[24px] py-5 font-bold text-[#0F1419] text-lg shadow-lg shadow-[#2EFFAF]/30 disabled:opacity-70"
          >
            {accepting ? 'Accepting...' : 'Accept'}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
