import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { useEffect } from 'react';
import { Shield, Zap } from 'lucide-react';

export function Splash() {
  const navigate = useNavigate();

  useEffect(() => {
    // Auto-navigate after animation
    const timer = setTimeout(() => {
      navigate('/apps');
    }, 3000);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[#1A1F2E] flex items-center justify-center relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute inset-0">
        <motion.div
          className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#2EFFAF] opacity-20 blur-[120px] rounded-full"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.2, 0.3, 0.2],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#007AFF] opacity-20 blur-[120px] rounded-full"
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.3, 0.2, 0.3],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>

      <div className="relative z-10 text-center px-6">
        {/* Animated logo */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: "backOut" }}
          className="mb-8"
        >
          <div className="relative inline-block">
            <motion.div
              className="w-32 h-32 rounded-[32px] bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center"
              animate={{
                rotate: [0, 5, -5, 0],
              }}
              transition={{
                duration: 6,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              style={{
                boxShadow: '0 25px 50px -12px rgba(46, 255, 175, 0.5)',
              }}
            >
              <Shield className="w-16 h-16 text-[#0A0F1E]" />
            </motion.div>

            {/* Orbiting icon */}
            <motion.div
              className="absolute -top-2 -right-2 w-12 h-12 rounded-xl bg-[#007AFF] flex items-center justify-center"
              animate={{
                rotate: 360,
              }}
              transition={{
                duration: 8,
                repeat: Infinity,
                ease: "linear",
              }}
              style={{
                boxShadow: '0 8px 16px rgba(0, 122, 255, 0.5)',
              }}
            >
              <Zap className="w-6 h-6 text-white" />
            </motion.div>
          </div>
        </motion.div>

        {/* Brand name */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          <h1 className="text-5xl font-bold mb-3">
            <span className="bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] bg-clip-text text-transparent">
              TORC
            </span>
          </h1>
          <p className="text-white/60 text-lg">Roadside Rescue, Uber Fast</p>
        </motion.div>

        {/* Loading indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="mt-12"
        >
          <div className="flex items-center justify-center gap-2">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-2 h-2 rounded-full bg-[#2EFFAF]"
                animate={{
                  scale: [1, 1.5, 1],
                  opacity: [0.5, 1, 0.5],
                }}
                transition={{
                  duration: 1,
                  repeat: Infinity,
                  delay: i * 0.2,
                }}
              />
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
