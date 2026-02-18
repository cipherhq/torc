import { motion } from 'motion/react';
import { useNavigate, useParams } from 'react-router';
import { CheckCircle, DollarSign, Star, ThumbsUp, ThumbsDown, Clock } from 'lucide-react';
import { useState } from 'react';

export function JobComplete() {
  const navigate = useNavigate();
  const { jobId } = useParams();
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);

  const job = {
    id: jobId,
    customer: 'Sarah Johnson',
    service: 'Jump Start',
    duration: '18 min',
    payout: '$45',
    tip: '$10',
  };

  const positiveTagsList = ['Professional', 'On Time', 'Friendly', 'Clean Vehicle'];
  const negativeTagsList = ['Late', 'Unprofessional', 'Needs Equipment'];

  const toggleTag = (tag: string) => {
    setTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = () => {
    navigate('/provider/home');
  };

  return (
    <div className="min-h-screen bg-[#252B3D] relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-[#2EFFAF] opacity-10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-[#007AFF] opacity-10 blur-[120px] rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-6">
        {/* Success icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', duration: 0.6 }}
          className="w-32 h-32 rounded-full bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center mb-8"
          style={{
            boxShadow: '0 20px 60px rgba(46, 255, 175, 0.4)',
          }}
        >
          <CheckCircle className="w-16 h-16 text-[#0F1419]" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-4xl font-bold text-white mb-3 text-center"
        >
          Job Completed!
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-white/60 text-center mb-8"
        >
          Great work! Here's your summary
        </motion.p>

        {/* Earnings card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="w-full glass rounded-[32px] p-6 mb-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-white/60 text-sm mb-1">Service</p>
              <h3 className="text-white font-bold text-xl">{job.service}</h3>
            </div>
            <div className="flex items-center gap-2 text-white/60 text-sm">
              <Clock className="w-4 h-4" />
              {job.duration}
            </div>
          </div>

          <div className="border-t border-white/10 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-white/60">Base payout</span>
              <span className="text-white font-semibold">{job.payout}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/60">Tip</span>
              <span className="text-[#2EFFAF] font-semibold">+{job.tip}</span>
            </div>
            <div className="border-t border-white/10 pt-3 flex items-center justify-between">
              <span className="text-white font-bold text-lg">Total Earned</span>
              <span className="text-white font-bold text-2xl">
                ${parseInt(job.payout.slice(1)) + parseInt(job.tip.slice(1))}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Rating */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="w-full glass rounded-[32px] p-6 mb-6"
        >
          <h3 className="text-white font-semibold mb-4 text-center">Rate {job.customer}</h3>
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
                      ? 'text-[#2EFFAF] fill-[#2EFFAF]'
                      : 'text-white/20'
                  }`}
                />
              </motion.button>
            ))}
          </div>

          {/* Tags */}
          {rating > 0 && (
            <div className="space-y-3">
              <p className="text-white/60 text-sm text-center">
                {rating >= 4 ? 'What went well?' : 'What needs improvement?'}
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {(rating >= 4 ? positiveTagsList : negativeTagsList).map((tag) => (
                  <motion.button
                    key={tag}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => toggleTag(tag)}
                    className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                      tags.includes(tag)
                        ? 'bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0F1419]'
                        : 'bg-white/5 text-white/60'
                    }`}
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
          className="w-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-[32px] py-5 font-bold text-[#0F1419] text-lg shadow-lg shadow-[#2EFFAF]/30"
        >
          {rating > 0 ? 'Submit & Continue' : 'Skip Rating'}
        </motion.button>
      </div>
    </div>
  );
}