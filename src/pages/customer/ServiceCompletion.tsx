import { motion } from 'motion/react';
import { useNavigate, useParams } from 'react-router';
import { CheckCircle, Star, DollarSign, Flag, Camera, Download } from 'lucide-react';
import { useState } from 'react';

export function ServiceCompletion() {
  const navigate = useNavigate();
  const { jobId } = useParams();
  const [rating, setRating] = useState(0);
  const [tip, setTip] = useState(0);
  const [feedback, setFeedback] = useState('');

  const tipOptions = [0, 5, 10, 15, 20];
  const totalAmount = 89.50;
  const BRAND_START = '#2EFFAF';
  const BRAND_END = '#007AFF';

  const handleSubmit = () => {
    // Submit rating and tip
    navigate('/home');
  };

  return (
    <div className="min-h-screen bg-[#0A0F1E] flex flex-col relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 bg-[#2EFFAF] opacity-10 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 flex-1 px-6 pb-32 overflow-y-auto">
        {/* Success header */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center py-12"
        >
          <div 
            className="w-32 h-32 rounded-full bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center mx-auto mb-6"
            style={{
              boxShadow: '0 25px 50px -12px rgba(46, 255, 175, 0.5)',
            }}
          >
            <CheckCircle className="w-16 h-16 text-[#0A0F1E]" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">Service Complete!</h1>
          <p className="text-white/60 text-lg">Your vehicle is ready to go</p>
        </motion.div>

        {/* Proof photos */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <Camera className="w-5 h-5 text-[#2EFFAF]" />
            <p className="text-white font-semibold">Service Photos</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {['Before', 'After'].map((label, i) => (
              <div key={i} className="glass rounded-2xl overflow-hidden">
                <div className="aspect-square bg-gradient-to-br from-white/5 to-white/10 flex items-center justify-center">
                  <Camera className="w-12 h-12 text-white/20" />
                </div>
                <div className="p-3">
                  <p className="text-white/60 text-sm">{label}</p>
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
          className="glass rounded-[32px] p-6 mb-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-white font-semibold text-lg">Receipt</h3>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="glass rounded-full p-2"
            >
              <Download className="w-5 h-5 text-[#2EFFAF]" />
            </motion.button>
          </div>

          <div className="space-y-3 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-white/80">Jump Start Service</span>
              <span className="text-white">$49.00</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/80">Service Fee</span>
              <span className="text-white">$8.50</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/80">Tax</span>
              <span className="text-white">$4.00</span>
            </div>
          </div>

          <div className="border-t border-white/10 pt-4 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-white font-bold">Subtotal</span>
              <span className="text-white font-bold">${totalAmount.toFixed(2)}</span>
            </div>
          </div>

          <div className="glass rounded-2xl p-4">
            <p className="text-white/60 text-sm mb-3">Add a tip for great service</p>
            <div className="flex gap-2 mb-4">
              {tipOptions.map((amount) => (
                <motion.button
                  key={amount}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setTip(amount)}
                  className={`flex-1 py-2 rounded-xl font-semibold transition-all ${
                    tip === amount
                      ? 'bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0A0F1E]'
                      : 'bg-white/5 text-white/80'
                  }`}
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
              className="border-t border-white/10 pt-4 mt-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-[#2EFFAF] font-bold text-lg">Total with Tip</span>
                <span className="text-[#2EFFAF] font-bold text-2xl">
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
          className="glass rounded-[32px] p-6 mb-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <Star className="w-6 h-6 text-[#2EFFAF]" />
            <h3 className="text-white font-semibold text-lg">Rate Your Experience</h3>
          </div>

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
                      background: `linear-gradient(135deg, ${BRAND_START}, ${BRAND_END})`,
                      borderColor: 'transparent',
                      boxShadow: '0 0 14px rgba(46,255,175,0.35)',
                    }
                  : {
                      backgroundColor: 'rgba(46,255,175,0.08)',
                      borderColor: 'rgba(46,255,175,0.2)',
                    }
                }
              >
                <Star
                  className={`w-12 h-12 ${
                    star <= rating
                      ? 'text-white fill-white'
                      : 'text-[#2EFFAF]'
                  }`}
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
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-[#2EFFAF] transition-colors resize-none"
          />
        </motion.div>

        {/* Report issue */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="w-full glass rounded-[24px] py-4 flex items-center justify-center gap-3 mb-6 border border-red-500/30"
        >
          <Flag className="w-5 h-5 text-red-400" />
          <span className="text-red-400 font-semibold">Report an Issue</span>
        </motion.button>
      </div>

      {/* Fixed bottom button */}
      <div className="fixed bottom-0 left-0 right-0 z-20 p-6 glass border-t border-white/10">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleSubmit}
          disabled={rating === 0}
          className="w-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-[32px] py-5 font-bold text-[#0A0F1E] text-lg shadow-lg shadow-[#2EFFAF]/30 disabled:opacity-50"
        >
          {rating === 0 ? 'Please rate your experience' : 'Submit & Return Home'}
        </motion.button>
      </div>
    </div>
  );
}
