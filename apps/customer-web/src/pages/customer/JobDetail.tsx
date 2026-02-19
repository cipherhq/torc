import { motion } from 'motion/react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, MapPin, Calendar, Star, Download, RotateCw } from 'lucide-react';
import { useJob } from '../../context/JobContext';
import { useEffect, useState } from 'react';

export function JobDetail() {
  const navigate = useNavigate();
  const { jobId } = useParams();
  const { currentJob, fetchJob } = useJob();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    const withTimeout = Promise.race([
      fetchJob(jobId),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), 12000);
      }),
    ]);

    withTimeout
      .catch((error: any) => {
        if (cancelled) return;
        console.warn('Error fetching job:', error);
        setLoadError(error?.message || 'Could not load job details.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [jobId, fetchJob]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0F1E] flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-[#2EFFAF] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!currentJob) {
    return (
      <div className="min-h-screen bg-[#0A0F1E] flex items-center justify-center p-6">
        <div className="glass rounded-2xl p-6 text-center">
          <p className="text-white/80 mb-3">{loadError || 'Job details are unavailable.'}</p>
          <button onClick={() => navigate('/customer/history')} className="px-4 py-2 rounded-xl bg-[#2EFFAF] text-[#0A0F1E] font-semibold">
            Back to History
          </button>
        </div>
      </div>
    );
  }

  const job = currentJob;

  const serviceTotal = job.total_amount || ((job.base_price || 0) + (job.service_fee || 0) + (job.tax || 0));

  return (
    <div className="min-h-screen bg-[#0A0F1E] relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-[#2EFFAF] opacity-10 blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <div className="relative z-10 p-6 flex items-center gap-4">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate('/activity')}
          className="glass rounded-full p-3"
        >
          <ArrowLeft className="w-6 h-6 text-white" />
        </motion.button>
        <h1 className="text-2xl font-bold text-white">Job Details</h1>
      </div>

      <div className="relative z-10 px-6 pb-6">
        {/* Status */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-[32px] p-6 mb-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-bold text-2xl">{job.service?.name || 'Service'}</h2>
            <div className={`px-4 py-2 rounded-full ${
              job.status === 'completed'
                ? 'bg-[#2EFFAF]/20 text-[#2EFFAF]'
                : 'bg-[#007AFF]/20 text-[#007AFF]'
            } font-semibold text-sm`}>
              {job.status === 'completed' ? 'COMPLETED' : 'SCHEDULED'}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-[#2EFFAF]" />
              <div>
                <p className="text-white/60 text-sm">Date & Time</p>
                <p className="text-white font-semibold">
                  {job.status === 'completed' && job.completed_at
                    ? new Date(job.completed_at).toLocaleString()
                    : job.scheduled_for
                    ? new Date(job.scheduled_for).toLocaleString()
                    : 'N/A'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <MapPin className="w-5 h-5 text-[#2EFFAF]" />
              <div>
                <p className="text-white/60 text-sm">Location</p>
                <p className="text-white font-semibold">{job.pickup_address || 'N/A'}</p>
              </div>
            </div>

            {job.destination_address && (
              <div className="flex items-center gap-3">
                <MapPin className="w-5 h-5 text-[#007AFF]" />
                <div>
                  <p className="text-white/60 text-sm">Destination</p>
                  <p className="text-white font-semibold">{job.destination_address}</p>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* Provider info (for completed jobs) */}
        {job.status === 'completed' && job.provider && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass rounded-[32px] p-6 mb-6"
          >
            <h3 className="text-white font-semibold text-lg mb-4">Provider</h3>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center text-xl font-bold text-[#0A0F1E]">
                {job.provider.name ? job.provider.name.split(' ').map((n: string) => n[0]).join('') : 'P'}
              </div>
              <div className="flex-1">
                <p className="text-white font-semibold text-lg">{job.provider.name || 'Provider'}</p>
                {job.provider.rating && (
                  <div className="flex items-center gap-1 mt-1">
                    <Star className="w-4 h-4 text-[#2EFFAF] fill-[#2EFFAF]" />
                    <span className="text-[#2EFFAF] font-semibold">{job.provider.rating}</span>
                    <span className="text-white/60 text-sm ml-1">Professional</span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Receipt */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass rounded-[32px] p-6 mb-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-white font-semibold text-lg">Payment Summary</h3>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="glass rounded-full p-2"
            >
              <Download className="w-5 h-5 text-[#2EFFAF]" />
            </motion.button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-white/80">Service</span>
              <span className="text-white font-semibold">${serviceTotal}</span>
            </div>
            {job.tip && job.tip > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-white/80">Tip</span>
                <span className="text-white font-semibold">${job.tip}</span>
              </div>
            )}
            <div className="border-t border-white/10 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-white font-bold">Total</span>
                <span className="text-[#2EFFAF] font-bold text-xl">
                  ${(serviceTotal + (job.tip || 0)).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Your rating (for completed jobs) */}
        {job.status === 'completed' && job.rating && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass rounded-[32px] p-6 mb-6"
          >
            <h3 className="text-white font-semibold text-lg mb-4">Your Rating</h3>
            <div className="flex items-center gap-2">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={`w-8 h-8 ${
                    i < job.rating
                      ? 'text-[#2EFFAF] fill-[#2EFFAF]'
                      : 'text-white/20'
                  }`}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* Action buttons */}
        <div className="space-y-3">
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="w-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-[32px] py-5 font-bold text-[#0A0F1E] text-lg shadow-lg shadow-[#2EFFAF]/30 flex items-center justify-center gap-3"
          >
            <RotateCw className="w-5 h-5" />
            Book Same Service Again
          </motion.button>

          {job.status === 'completed' && (
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full glass rounded-[32px] py-5 font-semibold text-white text-lg"
            >
              Download Receipt
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
}
