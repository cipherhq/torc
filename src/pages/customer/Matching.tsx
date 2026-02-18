import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { Loader, MapPin } from 'lucide-react';
import { getRequestContext } from '../../data/requestContext';
import { services } from '../../data/services';
import { useEffect } from 'react';

export function Matching() {
  const navigate = useNavigate();
  const context = getRequestContext();
  const service = services.find(s => s.id === context.serviceId);

  useEffect(() => {
    // Simulate finding a provider
    const timer = setTimeout(() => {
      navigate('/tracking/job-123');
    }, 4000);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[#0A0F1E] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0">
        <motion.div
          className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#2EFFAF] opacity-20 blur-[120px] rounded-full"
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.2, 0.3, 0.2],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#007AFF] opacity-20 blur-[120px] rounded-full"
          animate={{
            scale: [1.3, 1, 1.3],
            opacity: [0.3, 0.2, 0.3],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>

      <div className="relative z-10 text-center max-w-md">
        {/* Animated loader */}
        <motion.div
          className="mb-8"
          animate={{
            rotate: 360,
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "linear",
          }}
        >
          <div 
            className="w-32 h-32 rounded-full bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center mx-auto"
            style={{
              boxShadow: '0 25px 50px -12px rgba(46, 255, 175, 0.5)',
            }}
          >
            <motion.div
              animate={{
                rotate: -360,
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "linear",
              }}
            >
              <Loader className="w-16 h-16 text-[#0A0F1E]" />
            </motion.div>
          </div>
        </motion.div>

        {/* Text */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h1 className="text-3xl font-bold text-white mb-3">
            Finding the Best Provider
          </h1>
          <p className="text-white/60 text-lg mb-8">
            Matching you with a qualified professional near your location
          </p>
        </motion.div>

        {/* Request summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="glass rounded-[32px] p-6 text-left"
        >
          <div className="flex items-center gap-3 mb-4">
            <div 
              className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#2EFFAF]/20 to-[#007AFF]/20 flex items-center justify-center"
            >
              <MapPin className="w-6 h-6 text-[#2EFFAF]" />
            </div>
            <div className="flex-1">
              <h3 className="text-white font-semibold">{service?.name}</h3>
              <p className="text-white/60 text-sm">{context.location?.address}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
            <div>
              <p className="text-white/60 text-xs">Timing</p>
              <p className="text-white font-semibold text-sm mt-1">
                {context.scheduledFor ? 'Scheduled' : 'Right Now'}
              </p>
            </div>
            <div>
              <p className="text-white/60 text-xs">Estimated Cost</p>
              <p className="text-[#2EFFAF] font-bold text-sm mt-1">
                ${context.estimatedPrice.toFixed(2)}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Loading steps */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-8 space-y-3"
        >
          {[
            { text: 'Analyzing your location', delay: 0 },
            { text: 'Finding nearby providers', delay: 1 },
            { text: 'Verifying availability', delay: 2 },
          ].map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1 + step.delay }}
              className="flex items-center gap-3 text-left"
            >
              <motion.div
                className="w-2 h-2 rounded-full bg-[#2EFFAF]"
                animate={{
                  scale: [1, 1.5, 1],
                  opacity: [0.5, 1, 0.5],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  delay: step.delay,
                }}
              />
              <p className="text-white/60 text-sm">{step.text}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Cancel button */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate('/home')}
          className="mt-12 text-white/60 hover:text-white transition-colors"
        >
          Cancel Request
        </motion.button>
      </div>
    </div>
  );
}
