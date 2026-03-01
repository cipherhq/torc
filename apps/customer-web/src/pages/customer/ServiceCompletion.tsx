import { motion } from 'motion/react';
import { useNavigate, useParams } from 'react-router';
import { CheckCircle, Star, DollarSign, Flag, Camera, Download } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useJob } from '../../context/JobContext';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../lib/supabase';

export function ServiceCompletion() {
  const navigate = useNavigate();
  const { jobId } = useParams();
  const { currentJob, fetchJob, rateJob } = useJob();
  const { isDark } = useTheme();
  const [rating, setRating] = useState(0);
  const [tip, setTip] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const textColor = isDark ? '#FFFFFF' : '#14263D';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2';

  useEffect(() => {
    if (jobId && !currentJob) {
      fetchJob(jobId).catch(console.warn);
    }
  }, [jobId]);

  const tipOptions = [0, 5, 10, 15, 20];
  const basePrice = currentJob?.base_price || currentJob?.service?.base_price || 0;
  const serviceFee = currentJob?.service_fee || Math.round(basePrice * 0.1 * 100) / 100;
  const tax = currentJob?.tax || Math.round(basePrice * 0.05 * 100) / 100;
  const totalAmount = currentJob?.total_amount || (basePrice + serviceFee + tax);
  const serviceName = currentJob?.service?.name || 'Service';
  const BRAND_PRIMARY = '#008CE5';
  const BRAND_SECONDARY = '#0070B8';

  const handleSubmit = async () => {
    setSubmitError('');
    setSubmitting(true);
    try {
      // Save tip to the job (independent of rating)
      if (jobId && tip > 0) {
        await supabase
          .from('jobs')
          .update({ tip })
          .eq('id', jobId);

        // Notify the provider they received a tip
        const providerId = currentJob?.provider_id;
        if (providerId) {
          const channel = supabase.channel(`provider-job-${providerId}`);
          await channel.subscribe();
          await channel.send({
            type: 'broadcast',
            event: 'tip_received',
            payload: { job_id: jobId, tip_amount: tip, service: serviceName },
          });
          setTimeout(() => supabase.removeChannel(channel), 1500);
        }
      }

      // Save rating if provided
      if (jobId && rating > 0) {
        await rateJob(jobId, rating, feedback);
      }
      navigate('/home');
    } catch (err) {
      console.warn('Failed to submit:', err);
      setSubmitError('Could not submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden" style={{ background: isDark ? 'linear-gradient(180deg, #0A1626 0%, #081427 100%)' : 'linear-gradient(180deg, #F8FBFF 0%, #EAF2FF 100%)' }}>
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 bg-[#008CE5] blur-[120px] rounded-full" style={{ opacity: isDark ? 0.1 : 0.06 }} />
      </div>

      <div className="relative z-10 flex-1 px-6 pb-32 overflow-y-auto" style={{ paddingTop: 'var(--safe-top)' }}>
        {/* Success header */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center py-12"
        >
          <div
            className="w-32 h-32 rounded-full bg-gradient-to-br from-[#008CE5] to-[#0070B8] flex items-center justify-center mx-auto mb-6"
            style={{
              boxShadow: '0 25px 50px -12px rgba(46, 255, 175, 0.5)',
            }}
          >
            <CheckCircle className="w-16 h-16" style={{ color: isDark ? '#081427' : '#14263D' }} />
          </div>
          <h1 className="text-3xl font-bold mb-3" style={{ color: textColor }}>Service Complete!</h1>
          <p className="text-lg" style={{ color: subColor }}>Your vehicle is ready to go</p>
        </motion.div>

        {/* Proof photos */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <Camera className="w-5 h-5 text-[#008CE5]" />
            <p className="font-semibold" style={{ color: textColor }}>Service Photos</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {['Before', 'After'].map((label, i) => (
              <div key={i} className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: '1px solid ' + cardBorder }}>
                <div className="aspect-square flex items-center justify-center" style={{ background: isDark ? 'linear-gradient(to bottom right, rgba(255,255,255,0.05), rgba(255,255,255,0.1))' : 'linear-gradient(to bottom right, rgba(0,0,0,0.03), rgba(0,0,0,0.06))' }}>
                  <Camera className="w-12 h-12" style={{ color: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)' }} />
                </div>
                <div className="p-3">
                  <p className="text-sm" style={{ color: subColor }}>{label}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Receipt */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-2xl p-6 mb-6"
          style={{ backgroundColor: cardBg, border: '1px solid ' + cardBorder }}
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-lg" style={{ color: textColor }}>Receipt</h3>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}
            >
              <Download className="w-5 h-5 text-[#008CE5]" />
            </motion.button>
          </div>

          <div className="space-y-3 mb-4">
            <div className="flex items-center justify-between">
              <span style={{ color: subColor }}>{serviceName}</span>
              <span style={{ color: textColor }}>${Number(basePrice).toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span style={{ color: subColor }}>Service Fee</span>
              <span style={{ color: textColor }}>${Number(serviceFee).toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span style={{ color: subColor }}>Tax</span>
              <span style={{ color: textColor }}>${Number(tax).toFixed(2)}</span>
            </div>
          </div>

          <div className="pt-4 mb-4" style={{ borderTop: '1px solid ' + cardBorder }}>
            <div className="flex items-center justify-between">
              <span className="font-bold" style={{ color: textColor }}>Subtotal</span>
              <span className="font-bold" style={{ color: textColor }}>${totalAmount.toFixed(2)}</span>
            </div>
          </div>

          <div className="rounded-2xl p-4" style={{
            background: isDark
              ? 'linear-gradient(180deg, rgba(0,140,229,0.12), rgba(255,255,255,0.04))'
              : 'linear-gradient(180deg, rgba(0,140,229,0.06), rgba(255,255,255,0.8))',
            border: `1px solid ${isDark ? 'rgba(0,140,229,0.25)' : 'rgba(0,140,229,0.18)'}`,
          }}>
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-[#008CE5]" />
              <p className="font-semibold text-sm" style={{ color: textColor }}>Tip Your Provider</p>
            </div>
            <p className="text-xs mb-3" style={{ color: subColor }}>100% of tips go directly to your provider</p>
            <div className="flex gap-2">
              {tipOptions.map((amount) => (
                <motion.button
                  key={amount}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setTip(amount)}
                  className={`flex-1 py-2.5 rounded-xl font-semibold transition-all ${
                    tip === amount
                      ? 'bg-gradient-to-r from-[#008CE5] to-[#0070B8]'
                      : ''
                  }`}
                  style={tip === amount
                    ? { color: '#FFFFFF' }
                    : { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', color: subColor }
                  }
                >
                  ${amount}
                </motion.button>
              ))}
            </div>
          </div>

          {tip > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="pt-4 mt-4"
              style={{ borderTop: '1px solid ' + cardBorder }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[#008CE5] font-bold text-lg">Total with Tip</span>
                <span className="text-[#008CE5] font-bold text-2xl">
                  ${(totalAmount + tip).toFixed(2)}
                </span>
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* Rating */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="rounded-2xl p-6 mb-6"
          style={{
            background: isDark
              ? 'linear-gradient(180deg, rgba(0,140,229,0.14), rgba(255,255,255,0.05))'
              : 'linear-gradient(180deg, rgba(0,140,229,0.08), #FFFFFF)',
            border: `1px solid ${isDark ? 'rgba(0,140,229,0.35)' : 'rgba(0,140,229,0.25)'}`,
            boxShadow: isDark ? '0 16px 40px rgba(0,140,229,0.12)' : '0 12px 30px rgba(0,112,184,0.08)',
          }}
        >
          <div className="flex items-center gap-3 mb-6">
            <Star className="w-6 h-6" style={{ color: BRAND_PRIMARY }} />
            <h3 className="font-semibold text-lg" style={{ color: textColor }}>Rate Your Experience</h3>
          </div>
          <p className="text-sm mb-5" style={{ color: subColor }}>Tap a star to leave your review</p>

          {/* Stars */}
          <div className="flex items-center justify-center gap-4 mb-6">
            {[1, 2, 3, 4, 5].map((star) => (
              <motion.button
                key={star}
                whileHover={{ scale: 1.2 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setRating(star)}
                className="rounded-full p-1.5 border"
                style={star <= rating
                  ? {
                      background: `linear-gradient(135deg, ${BRAND_PRIMARY}, ${BRAND_SECONDARY})`,
                      borderColor: 'transparent',
                      boxShadow: '0 0 14px rgba(0,140,229,0.4)',
                    }
                  : {
                      backgroundColor: isDark ? 'rgba(0,140,229,0.14)' : 'rgba(0,140,229,0.1)',
                      borderColor: isDark ? 'rgba(0,140,229,0.32)' : 'rgba(0,140,229,0.24)',
                    }
                }
              >
                <Star
                  className={`w-12 h-12 ${
                    star <= rating
                      ? 'fill-current'
                      : ''
                  }`}
                  style={star <= rating
                    ? { color: '#FFFFFF', filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.3))' }
                    : { color: isDark ? 'rgba(0,140,229,0.82)' : 'rgba(0,140,229,0.72)' }}
                />
              </motion.button>
            ))}
          </div>

          {/* Feedback */}
          <textarea
            placeholder="Share your experience (optional)"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={3}
            className="w-full rounded-2xl px-4 py-3 focus:outline-none focus:border-[#008CE5] transition-colors resize-none"
            style={{
              backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
              border: '1px solid ' + cardBorder,
              color: textColor,
              ...(isDark ? {} : { '--tw-placeholder-opacity': 1 } as any),
            }}
          />
        </motion.div>

        {/* Report issue */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="w-full rounded-2xl py-4 flex items-center justify-center gap-3 mb-6 border"
          style={{ backgroundColor: isDark ? 'rgba(0,140,229,0.12)' : 'rgba(0,140,229,0.08)', borderColor: 'rgba(0,140,229,0.35)' }}
        >
          <Flag className="w-5 h-5 text-[#008CE5]" />
          <span className="text-[#008CE5] font-semibold">Report an Issue</span>
        </motion.button>
      </div>

      {/* Fixed bottom button */}
      <div className="fixed bottom-0 left-0 right-0 z-20 p-6" style={{ backgroundColor: isDark ? '#0A1626' : '#FFFFFF', borderTop: '1px solid ' + cardBorder, paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))' }}>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.96 }}
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full rounded-[32px] py-5 font-bold text-lg"
          style={{
            background: `linear-gradient(to right, ${BRAND_PRIMARY}, ${BRAND_SECONDARY})`,
            color: '#FFFFFF',
            boxShadow: '0 10px 28px rgba(0,140,229,0.35)',
            opacity: submitting ? 0.78 : 1,
          }}
        >
          {submitting ? 'Submitting...' : rating === 0 ? 'Skip Rating' : 'Submit & Return Home'}
        </motion.button>
        {submitError && (
          <p className="text-center mt-3 text-sm text-red-400">{submitError}</p>
        )}
      </div>
    </div>
  );
}
