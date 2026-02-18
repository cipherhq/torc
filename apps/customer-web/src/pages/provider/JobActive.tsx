import { motion } from 'motion/react';
import { useNavigate, useParams } from 'react-router';
import { MapBackground } from '../../components/MapBackground';
import { PulsePin } from '../../components/PulsePin';
import { Navigation, Phone, MessageCircle, Share2, Camera, CheckCircle, AlertCircle, Clock, MapPin } from 'lucide-react';
import { useState, useEffect } from 'react';
import { ChatModal } from '../../components/ChatModal';
import { callPhone, shareJobDetails } from '../../utils/communication';
import { useJob } from '../../context/JobContext';

export function JobActive() {
  const navigate = useNavigate();
  const { jobId } = useParams();
  const { currentJob, fetchJob, updateJobStatus } = useJob();
  const [status, setStatus] = useState<'enroute' | 'arrived' | 'working' | 'photos'>('enroute');
  const [photos, setPhotos] = useState<string[]>([]);
  const [providerPosition, setProviderPosition] = useState({ x: 30, y: 70 });
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [shareToast, setShareToast] = useState(false);

  useEffect(() => {
    if (jobId) fetchJob(jobId).catch(console.warn);
  }, [jobId]);

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
    distance: '-',
    payout: currentJob?.total_amount ? `$${currentJob.total_amount}` : (currentJob?.base_price ? `$${currentJob.base_price}` : '-'),
    notes: currentJob?.customer_notes || '',
  };

  const handleCall = () => callPhone(job.customerPhone);
  const handleMessage = () => setIsChatOpen(true);
  const handleShare = async () => {
    const shared = await shareJobDetails({
      jobId: jobId || '',
      service: job.service,
      status,
    });
    if (shared) {
      setShareToast(true);
      setTimeout(() => setShareToast(false), 2500);
    }
  };

  // Simulate provider moving toward customer
  useEffect(() => {
    if (status === 'enroute') {
      const interval = setInterval(() => {
        setProviderPosition(prev => ({
          x: Math.min(prev.x + 2, 48), // Move toward center (50%)
          y: Math.max(prev.y - 2, 52), // Move toward center (50%)
        }));
      }, 1000);

      return () => clearInterval(interval);
    } else {
      // Snap to customer location when arrived or working
      setProviderPosition({ x: 50, y: 50 });
    }
  }, [status]);

  const checklist = [
    { id: 1, text: 'Inspect vehicle battery', completed: status !== 'enroute' },
    { id: 2, text: 'Connect jumper cables properly', completed: status === 'working' || status === 'photos' },
    { id: 3, text: 'Start vehicle and verify', completed: status === 'photos' },
    { id: 4, text: 'Take completion photos', completed: photos.length > 0 },
  ];

  return (
    <div className="min-h-screen relative overflow-hidden pb-32">
      <MapBackground />

      {/* Header */}
      <div className="relative z-10 p-6">
        <div className="glass rounded-[32px] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-white font-bold text-xl">{job.service}</h2>
              <p className="text-[#2EFFAF] font-semibold">{job.payout}</p>
            </div>
            <div className={`px-4 py-2 rounded-full ${
              status === 'enroute' ? 'bg-[#007AFF]/20 text-[#007AFF]' :
              status === 'arrived' ? 'bg-[#2EFFAF]/20 text-[#2EFFAF]' :
              'bg-[#2EFFAF]/20 text-[#2EFFAF]'
            } text-sm font-semibold`}>
              {status === 'enroute' ? 'En Route' :
               status === 'arrived' ? 'Arrived' :
               status === 'working' ? 'In Progress' :
               'Completing'}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Navigation className="w-4 h-4 text-white/60" />
              <p className="text-white/80 text-sm">{job.location}</p>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-white/60" />
              <p className="text-white/80 text-sm">{job.distance} away</p>
            </div>
          </div>
        </div>
      </div>

      {/* Map with customer and provider locations */}
      {status === 'enroute' && (
        <div className="relative z-10 h-[30vh] flex items-center justify-center mb-6">
          {/* Customer location (destination) */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <PulsePin />
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
              <div className="glass rounded-full px-3 py-1">
                <span className="text-white text-xs font-semibold">📍 Customer</span>
              </div>
            </div>
          </div>

          {/* Provider location (moving toward customer) */}
          <motion.div
            animate={{
              left: `${providerPosition.x}%`,
              top: `${providerPosition.y}%`,
            }}
            transition={{ duration: 1, ease: "easeInOut" }}
            className="absolute -translate-x-1/2 -translate-y-1/2"
          >
            <motion.div
              animate={{
                rotate: [0, 360],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "linear",
              }}
              className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center shadow-lg shadow-[#2EFFAF]/50"
            >
              <Navigation className="w-8 h-8 text-[#0F1419]" />
            </motion.div>
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
              <div className="glass rounded-full px-3 py-1">
                <span className="text-[#2EFFAF] text-xs font-semibold">🚗 You</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Customer info */}
      <div className="relative z-10 px-6 mb-6">
        <div className="glass rounded-[24px] p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center">
              <span className="text-[#0F1419] font-bold">{job.customerInitials}</span>
            </div>
            <div className="flex-1">
              <h3 className="text-white font-semibold">{job.customer}</h3>
              <p className="text-white/60 text-sm">Customer</p>
            </div>
          </div>

          {/* Communication buttons */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleCall}
              className="rounded-xl bg-[#2EFFAF]/10 py-3 flex flex-col items-center gap-1"
            >
              <Phone className="w-5 h-5 text-[#2EFFAF]" />
              <span className="text-white text-xs font-semibold">Call</span>
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleMessage}
              className="rounded-xl bg-[#007AFF]/10 py-3 flex flex-col items-center gap-1"
            >
              <MessageCircle className="w-5 h-5 text-[#007AFF]" />
              <span className="text-white text-xs font-semibold">Message</span>
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleShare}
              className="rounded-xl bg-white/5 py-3 flex flex-col items-center gap-1"
            >
              <Share2 className="w-5 h-5 text-white/60" />
              <span className="text-white text-xs font-semibold">Share</span>
            </motion.button>
          </div>

          {job.notes && (
            <div className="pt-4 border-t border-white/10">
              <p className="text-white/60 text-sm">📝 {job.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Service checklist */}
      <div className="relative z-10 px-6 mb-6">
        <div className="glass rounded-[24px] p-5">
          <h3 className="text-white font-semibold mb-4">Service Checklist</h3>
          <div className="space-y-3">
            {checklist.map((item) => (
              <div key={item.id} className="flex items-center gap-3">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                  item.completed ? 'bg-[#2EFFAF]' : 'bg-white/10'
                }`}>
                  {item.completed && <CheckCircle className="w-4 h-4 text-[#0F1419]" />}
                </div>
                <p className={`${item.completed ? 'text-white' : 'text-white/60'} text-sm`}>
                  {item.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Photo upload */}
      {(status === 'working' || status === 'photos') && (
        <div className="relative z-10 px-6">
          <div className="glass rounded-[24px] p-5">
            <h3 className="text-white font-semibold mb-4">Completion Photos</h3>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setPhotos([...photos, 'photo-' + Date.now()])}
              className="w-full border-2 border-dashed border-white/20 rounded-2xl py-8 flex flex-col items-center gap-2"
            >
              <Camera className="w-8 h-8 text-[#2EFFAF]" />
              <p className="text-white/60 text-sm">
                {photos.length > 0 ? `${photos.length} photo(s) added` : 'Take completion photos'}
              </p>
            </motion.button>
          </div>
        </div>
      )}

      {/* Fixed bottom actions */}
      <div className="fixed bottom-0 left-0 right-0 z-20 p-6 glass border-t border-white/10">
        {status === 'enroute' && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setStatus('arrived')}
            className="w-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-[32px] py-5 font-bold text-[#0F1419] text-lg"
          >
            I've Arrived
          </motion.button>
        )}

        {status === 'arrived' && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setStatus('working')}
            className="w-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-[32px] py-5 font-bold text-[#0F1419] text-lg"
          >
            Start Service
          </motion.button>
        )}

        {status === 'working' && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setStatus('photos')}
            className="w-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-[32px] py-5 font-bold text-[#0F1419] text-lg"
          >
            Take Completion Photos
          </motion.button>
        )}

        {status === 'photos' && photos.length > 0 && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate(`/provider/complete/${jobId}`)}
            className="w-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-[32px] py-5 font-bold text-[#0F1419] text-lg"
          >
            Complete Job
          </motion.button>
        )}
      </div>

      {/* Share toast */}
      {shareToast && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-20 left-1/2 -translate-x-1/2 z-50 glass rounded-full px-6 py-3"
        >
          <p className="text-[#2EFFAF] text-sm font-semibold">Job details shared!</p>
        </motion.div>
      )}

      {/* Chat modal */}
      <ChatModal
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        jobId={jobId || ''}
        peerName={job.customer}
        peerInitials={job.customerInitials}
        role="provider"
      />
    </div>
  );
}