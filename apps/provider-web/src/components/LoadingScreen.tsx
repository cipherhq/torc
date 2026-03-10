import { motion } from 'motion/react';

export function LoadingScreen() {
  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #14263D 0%, #0A1626 100%)' }}
    >
      {/* Soft ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/3 left-1/3 w-64 h-64 rounded-full"
          style={{ backgroundColor: '#008CE5', filter: 'blur(120px)', opacity: 0.1 }}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-6">
        <motion.img
          src="/logo-white.svg"
          alt="Torc"
          className="w-32 h-auto"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: '#008CE5' }}
              animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
