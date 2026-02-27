import { motion } from 'motion/react';
import { useNavigate, useParams } from 'react-router';
import { CheckCircle, DollarSign, Star, ThumbsUp, ThumbsDown, Clock } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useJob } from '../../context/JobContext';
import { useTheme } from '../../context/ThemeContext';

export function JobComplete() {
  const navigate = useNavigate();
  const { jobId } = useParams();
  const { isDark } = useTheme();
  const { currentJob, fetchJob, updateJobStatus, rateJob } = useJob();
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadAndComplete() {
      if (!jobId) return;
      try {
        const job = await fetchJob(jobId);
        if (cancelled) return;
        const status = job?.status;
        if (status === 'inprogress' || status === 'in_progress') {
          await updateJobStatus(jobId, 'completed');
        }
      } catch (e) {
        console.warn('Failed to complete job:', e);
      }
    }
    loadAndComplete();
    return () => { cancelled = true; };
  }, [jobId]);

  const customerName = currentJob?.customer
    ? `${currentJob.customer.first_name || ''} ${currentJob.customer.last_name || ''}`.trim()
    : 'Customer';

  const job = {
    id: jobId,
    customer: customerName,
    service: currentJob?.service?.name || 'Service',
    duration: currentJob?.started_at && currentJob?.completed_at
      ? `${Math.round((new Date(currentJob.completed_at).getTime() - new Date(currentJob.started_at).getTime()) / 60000)} min`
      : '-',
    payout: currentJob?.total_amount ? `$${currentJob.total_amount}` : (currentJob?.base_price ? `$${currentJob.base_price}` : '-'),
    tip: currentJob?.tip ? `$${currentJob.tip}` : '$0',
  };

  const positiveTagsList = ['Professional', 'On Time', 'Friendly', 'Clean Vehicle'];
  const negativeTagsList = ['Late', 'Unprofessional', 'Needs Equipment'];
  const STAR_COLORS = ['#EF4444', '#F59E0B', '#FACC15', '#22C55E', '#008CE5'];

  const toggleTag = (tag: string) => {
    setTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = async () => {
    if (!jobId) {
      navigate('/home');
      return;
    }
    setSubmitError('');
    setSubmitting(true);
    try {
      if (rating > 0) {
        await rateJob(jobId, rating, tags.join(', '));
      }
      navigate('/home');
    } catch (e) {
      console.warn('Failed to save provider rating tags:', e);
      setSubmitError(e instanceof Error ? e.message : 'Could not save rating. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const textColor = isDark ? '#FFFFFF' : '#14263D';
  const subColor = isDark ? 'rgba(255,255,255,0.6)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2';

  return (
    <div className="min-h-screen relative overflow-hidden"
      style={{ background: isDark ? 'linear-gradient(180deg, #0A1626 0%, #081427 100%)' : 'linear-gradient(180deg, #F8FBFF 0%, #EAF2FF 100%)' }}>
      {/* Animated background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-[#008CE5] blur-[120px] rounded-full animate-pulse" style={{ opacity: isDark ? 0.1 : 0.05 }} />
        <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-[#0070B8] blur-[120px] rounded-full animate-pulse" style={{ opacity: isDark ? 0.1 : 0.05, animationDelay: '1s' }} />
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-6">
        {/* Success icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', duration: 0.6 }}
          className="w-32 h-32 rounded-full bg-gradient-to-br from-[#008CE5] to-[#0070B8] flex items-center justify-center mb-8"
          style={{ boxShadow: '0 20px 60px rgba(0,140,229,0.4)' }}
        >
          <CheckCircle className="w-16 h-16 text-white" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-4xl font-bold mb-3 text-center"
          style={{ color: textColor }}
        >
          Job Completed!
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center mb-8"
          style={{ color: subColor }}
        >
          Great work! Here's your summary
        </motion.p>

        {/* Earnings card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="w-full rounded-[32px] p-6 mb-6"
          style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm mb-1" style={{ color: subColor }}>Service</p>
              <h3 className="font-bold text-xl" style={{ color: textColor }}>{job.service}</h3>
            </div>
            <div className="flex items-center gap-2 text-sm" style={{ color: subColor }}>
              <Clock className="w-4 h-4" />
              {job.duration}
            </div>
          </div>

          <div className="pt-4 space-y-3" style={{ borderTop: `1px solid ${cardBorder}` }}>
            <div className="flex items-center justify-between">
              <span style={{ color: subColor }}>Base payout</span>
              <span className="font-semibold" style={{ color: textColor }}>{job.payout}</span>
            </div>
            <div className="flex items-center justify-between">
              <span style={{ color: subColor }}>Tip</span>
              <span className="text-[#008CE5] font-semibold">+{job.tip}</span>
            </div>
            <div className="pt-3 flex items-center justify-between" style={{ borderTop: `1px solid ${cardBorder}` }}>
              <span className="font-bold text-lg" style={{ color: textColor }}>Total Earned</span>
              <span className="font-bold text-2xl" style={{ color: textColor }}>
                ${(parseFloat(job.payout.slice(1)) || 0) + (parseFloat(job.tip.slice(1)) || 0)}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Rating */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="w-full rounded-[32px] p-6 mb-6"
          style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
        >
          <h3 className="font-semibold mb-4 text-center" style={{ color: textColor }}>Rate {job.customer}</h3>
          <div className="flex justify-center gap-3 mb-6">
            {[1, 2, 3, 4, 5].map((star) => (
              <motion.button
                key={star}
                whileHover={{ scale: 1.2 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setRating(star)}
                className="w-12 h-12"
              >
                <Star
                  className={`w-12 h-12 ${
                    star <= rating
                      ? 'fill-current'
                      : ''
                  }`}
                  style={star <= rating ? { color: STAR_COLORS[star - 1], filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.18))' } : { color: isDark ? 'rgba(255,255,255,0.2)' : '#D1D5DB' }}
                />
              </motion.button>
            ))}
          </div>

          {/* Tags */}
          {rating > 0 && (
            <div className="space-y-3">
              <p className="text-sm text-center" style={{ color: subColor }}>
                {rating >= 4 ? 'What went well?' : 'What needs improvement?'}
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {(rating >= 4 ? positiveTagsList : negativeTagsList).map((tag) => (
                  <motion.button
                    key={tag}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => toggleTag(tag)}
                    className="px-4 py-2 rounded-full text-sm font-semibold transition-all"
                    style={tags.includes(tag)
                      ? { background: 'linear-gradient(135deg, #008CE5, #0070B8)', color: '#FFFFFF' }
                      : { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#E8F0FB', color: subColor }
                    }
                  >
                    {tag}
                  </motion.button>
                ))}
              </div>
            </div>
          )}
        </motion.div>

        {/* Submit button */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full bg-gradient-to-r from-[#008CE5] to-[#0070B8] rounded-[32px] py-5 font-bold text-white text-lg shadow-lg shadow-[#008CE5]/30"
        >
          {submitting ? 'Saving...' : rating > 0 ? 'Submit & Continue' : 'Skip Rating'}
        </motion.button>
        {submitError && (
          <p className="text-sm text-red-300 mt-3 text-center">{submitError}</p>
        )}
      </div>
    </div>
  );
}
