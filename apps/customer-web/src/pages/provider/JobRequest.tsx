import { motion } from 'motion/react';
import { useNavigate, useParams } from 'react-router';
import { MapBackground } from '../../components/MapBackground';
import { X, MapPin, Clock, DollarSign, User, AlertCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useJob } from '../../context/JobContext';

export function JobRequest() {
  const navigate = useNavigate();
  const { requestId } = useParams();
  const { fetchJob, currentJob, updateJobStatus } = useJob();
  const [timeLeft, setTimeLeft] = useState(30);
  const [jobData, setJobData] = useState<any>(null);

  useEffect(() => {
    if (requestId) {
      fetchJob(requestId).then((job) => { if (job) setJobData(job); }).catch(console.warn);
    }
  }, [requestId]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate('/provider/home');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate]);

  const customerName = jobData?.customer
    ? `${jobData.customer.first_name || ''} ${jobData.customer.last_name || ''}`.trim()
    : 'Customer';

  const requestData = {
    customer: customerName,
    isThirdParty: jobData?.requester_type !== 'self',
    service: jobData?.service?.name || 'Service Request',
    location: jobData?.pickup_address || 'Fetching location...',
    distance: '-',
    estimatedPayout: jobData?.total_amount ? `$${jobData.total_amount}` : (jobData?.base_price ? `$${jobData.base_price}` : '-'),
    notes: jobData?.customer_notes || '',
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
          onClick={() => navigate('/provider/home')}
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
            onClick={() => navigate('/provider/home')}
            className="glass rounded-[24px] py-5 font-bold text-white text-lg"
          >
            Decline
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={async () => {
              if (!requestId) {
                navigate('/provider/home');
                return;
              }
              try { await updateJobStatus(requestId, 'accepted'); } catch {}
              navigate(`/provider/job/${requestId}`);
            }}
            className="bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-[24px] py-5 font-bold text-[#0F1419] text-lg shadow-lg shadow-[#2EFFAF]/30"
          >
            Accept
          </motion.button>
        </div>
      </div>
    </div>
  );
}
