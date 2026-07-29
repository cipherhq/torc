import { motion } from 'motion/react';
import { useNavigate, useParams } from 'react-router';
import { CheckCircle, Star, DollarSign, Flag, Camera, Download, X, ImagePlus } from 'lucide-react';
import { downloadJobReceipt } from '../../utils/downloadReceipt';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { useState, useEffect, useRef } from 'react';
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
  const [afterPhoto, setAfterPhoto] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const capturePhoto = async () => {
    try {
      const image = await CapCamera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt,
        width: 1600,
        height: 1600,
        promptLabelHeader: 'Add Service Photo',
        promptLabelPhoto: 'Choose from Gallery',
        promptLabelPicture: 'Take Photo',
      });
      if (image.dataUrl) {
        setAfterPhoto(image.dataUrl);
      }
    } catch (err: any) {
      if (err?.message?.includes('User cancelled') || err?.message?.includes('canceled')) return;
      console.warn('Camera error:', err);
      // Fallback to native file input
      fileInputRef.current?.click();
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result) {
        setAfterPhoto(reader.result as string);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

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

  const uploadPhoto = async (dataUrl: string, jId: string): Promise<string | null> => {
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const ext = blob.type === 'image/png' ? 'png' : 'jpg';
      const path = `jobs/${jId}/completion_${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('job-photos').upload(path, blob, { contentType: blob.type, upsert: true });
      if (error) { console.warn('Photo upload error:', error); return null; }
      const { data: urlData } = await supabase.storage.from('job-photos').createSignedUrl(path, 3600);
      return urlData?.signedUrl || null;
    } catch (e) { console.warn('Photo upload failed:', e); return null; }
  };

  const handleSubmit = async () => {
    setSubmitError('');
    setSubmitting(true);
    try {
      // Upload photo if taken
      let photoUrl: string | null = null;
      if (afterPhoto && jobId) {
        photoUrl = await uploadPhoto(afterPhoto, jobId);
      }

      // Save tip, photo, and ensure job is marked completed
      if (jobId) {
        const updateData: any = {
          status: 'completed',
          customer_completed_at: new Date().toISOString(),
        };
        if (tip > 0) updateData.tip = tip;
        if (photoUrl) updateData.completion_photo_url = photoUrl;
        await supabase.from('jobs').update(updateData).eq('id', jobId);

        // Notify the provider they received a tip
        if (tip > 0) {
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

        {/* After photo */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-6"
        >
          {/* Hidden file input fallback for camera */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            aria-label="Upload service photo"
            title="Upload service photo"
            className="hidden"
            onChange={handleFileInput}
          />
          <div className="flex items-center gap-3 mb-4">
            <Camera className="w-5 h-5 text-[#008CE5]" />
            <p className="font-semibold" style={{ color: textColor }}>After Service Photo</p>
          </div>
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: '1px solid ' + cardBorder }}>
            {afterPhoto ? (
              <div className="relative">
                <img src={afterPhoto} alt="After service" className="w-full aspect-[4/3] object-cover" />
                <button
                  onClick={() => setAfterPhoto(null)}
                  aria-label="Remove photo"
                  className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            ) : (
              <button
                onClick={capturePhoto}
                className="w-full py-10 flex flex-col items-center justify-center gap-3 active:scale-[0.98] transition-transform"
                style={{ background: isDark ? 'linear-gradient(to bottom right, rgba(255,255,255,0.05), rgba(255,255,255,0.1))' : 'linear-gradient(to bottom right, rgba(0,0,0,0.03), rgba(0,0,0,0.06))' }}
              >
                <ImagePlus className="w-12 h-12" style={{ color: '#008CE5' }} />
                <span className="text-sm font-medium" style={{ color: subColor }}>Take a photo or choose from gallery</span>
              </button>
            )}
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
              onClick={() => currentJob && downloadJobReceipt({ ...currentJob, tip })}
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
              <span style={{ color: subColor }}>Torc Fee</span>
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
                  whileTap={{ scale: 0.9 }}
                  animate={tip === amount ? { scale: 1.05 } : { scale: 1 }}
                  onClick={() => setTip(amount)}
                  className="flex-1 py-2.5 rounded-xl font-bold transition-all"
                  style={tip === amount
                    ? {
                        background: 'linear-gradient(135deg, #008CE5, #0070B8)',
                        color: '#FFFFFF',
                        boxShadow: '0 4px 16px rgba(0,140,229,0.45)',
                        border: '2px solid #008CE5',
                      }
                    : {
                        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                        color: subColor,
                        border: `2px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                      }
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
                aria-label={`Rate ${star} star${star !== 1 ? 's' : ''}`}
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
            aria-label="Share your experience"
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
          onClick={() => navigate('/customer/help-center')}
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
