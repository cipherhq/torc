import { motion } from 'motion/react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, MapPin, Calendar, Star, Download, RotateCw } from 'lucide-react';
import { useJob } from '../../context/JobContext';
import { useTheme } from '../../context/ThemeContext';
import { useEffect, useState } from 'react';

export function JobDetail() {
  const navigate = useNavigate();
  const { jobId } = useParams();
  const { currentJob, fetchJob } = useJob();
  const { isDark } = useTheme();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const textColor = isDark ? '#FFFFFF' : '#1A1F2E';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E8E4DE';

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
      <div className="min-h-screen flex items-center justify-center" style={{ background: isDark ? '#0F1419' : '#FAF8F5' }}>
        <div className="w-10 h-10 border-2 border-[#008CE5] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!currentJob) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: isDark ? '#0F1419' : '#FAF8F5' }}>
        <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: cardBg, border: '1px solid ' + cardBorder }}>
          <p className="mb-3" style={{ color: subColor }}>{loadError || 'Job details are unavailable.'}</p>
          <button onClick={() => navigate('/customer/history')} className="px-4 py-2 rounded-xl bg-[#008CE5] text-[#0A0F1E] font-semibold">
            Back to History
          </button>
        </div>
      </div>
    );
  }

  const job = currentJob;

  const serviceTotal = job.total_amount || ((job.base_price || 0) + (job.service_fee || 0) + (job.tax || 0));

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: isDark ? '#0F1419' : '#FAF8F5' }}>
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-[#008CE5] opacity-10 blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <div className="relative z-10 p-6 flex items-center gap-4" style={{ paddingTop: 'var(--safe-top)' }}>
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate('/activity')}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}
        >
          <ArrowLeft className="w-6 h-6" style={{ color: textColor }} />
        </motion.button>
        <h1 className="text-2xl font-bold" style={{ color: textColor }}>Job Details</h1>
      </div>

      <div className="relative z-10 px-6 pb-6">
        {/* Status */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-6 mb-6"
          style={{ backgroundColor: cardBg, border: '1px solid ' + cardBorder }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-2xl" style={{ color: textColor }}>{job.service?.name || 'Service'}</h2>
            <div className={`px-4 py-2 rounded-full ${
              job.status === 'completed'
                ? 'bg-[#008CE5]/20 text-[#008CE5]'
                : 'bg-[#0070B8]/20 text-[#0070B8]'
            } font-semibold text-sm`}>
              {job.status === 'completed' ? 'COMPLETED' : 'SCHEDULED'}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-[#008CE5]" />
              <div>
                <p className="text-sm" style={{ color: subColor }}>Date & Time</p>
                <p className="font-semibold" style={{ color: textColor }}>
                  {job.status === 'completed' && job.completed_at
                    ? new Date(job.completed_at).toLocaleString()
                    : job.scheduled_for
                    ? new Date(job.scheduled_for).toLocaleString()
                    : 'N/A'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <MapPin className="w-5 h-5 text-[#008CE5]" />
              <div>
                <p className="text-sm" style={{ color: subColor }}>Location</p>
                <p className="font-semibold" style={{ color: textColor }}>{job.pickup_address || 'N/A'}</p>
              </div>
            </div>

            {job.destination_address && (
              <div className="flex items-center gap-3">
                <MapPin className="w-5 h-5 text-[#0070B8]" />
                <div>
                  <p className="text-sm" style={{ color: subColor }}>Destination</p>
                  <p className="font-semibold" style={{ color: textColor }}>{job.destination_address}</p>
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
            className="rounded-2xl p-6 mb-6"
            style={{ backgroundColor: cardBg, border: '1px solid ' + cardBorder }}
          >
            <h3 className="font-semibold text-lg mb-4" style={{ color: textColor }}>Provider</h3>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#008CE5] to-[#0070B8] flex items-center justify-center text-xl font-bold text-[#0A0F1E]">
                {job.provider.name ? job.provider.name.split(' ').map((n: string) => n[0]).join('') : 'P'}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-lg" style={{ color: textColor }}>{job.provider.name || 'Provider'}</p>
                {job.provider.rating && (
                  <div className="flex items-center gap-1 mt-1">
                    <Star className="w-4 h-4 text-[#008CE5] fill-[#008CE5]" />
                    <span className="text-[#008CE5] font-semibold">{job.provider.rating}</span>
                    <span className="text-sm ml-1" style={{ color: subColor }}>Professional</span>
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
          className="rounded-2xl p-6 mb-6"
          style={{ backgroundColor: cardBg, border: '1px solid ' + cardBorder }}
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-lg" style={{ color: textColor }}>Payment Summary</h3>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}
            >
              <Download className="w-5 h-5 text-[#008CE5]" />
            </motion.button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span style={{ color: subColor }}>Service</span>
              <span className="font-semibold" style={{ color: textColor }}>${serviceTotal}</span>
            </div>
            {job.tip && job.tip > 0 && (
              <div className="flex items-center justify-between">
                <span style={{ color: subColor }}>Tip</span>
                <span className="font-semibold" style={{ color: textColor }}>${job.tip}</span>
              </div>
            )}
            <div className="pt-3" style={{ borderTop: '1px solid ' + cardBorder }}>
              <div className="flex items-center justify-between">
                <span className="font-bold" style={{ color: textColor }}>Total</span>
                <span className="text-[#008CE5] font-bold text-xl">
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
            className="rounded-2xl p-6 mb-6"
            style={{ backgroundColor: cardBg, border: '1px solid ' + cardBorder }}
          >
            <h3 className="font-semibold text-lg mb-4" style={{ color: textColor }}>Your Rating</h3>
            <div className="flex items-center gap-2">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={`w-8 h-8 ${
                    i < job.rating
                      ? 'text-[#008CE5] fill-[#008CE5]'
                      : isDark ? 'text-white/20' : 'text-gray-300'
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
            className="w-full bg-gradient-to-r from-[#008CE5] to-[#0070B8] rounded-2xl py-5 font-bold text-[#0A0F1E] text-lg flex items-center justify-center gap-3"
            style={{ boxShadow: '0 8px 24px rgba(78,205,196,0.4)' }}
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
              className="w-full rounded-2xl py-5 font-semibold text-lg"
              style={{ backgroundColor: cardBg, border: '1px solid ' + cardBorder, color: textColor }}
            >
              Download Receipt
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
}
