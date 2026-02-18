import { motion } from 'motion/react';
import { MapPin } from 'lucide-react';

export function PulsePin() {
  return (
    <div className="relative flex items-center justify-center">
      {/* Outer pulse rings */}
      {[...Array(3)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-24 h-24 rounded-full border-2 border-[#2EFFAF]"
          animate={{
            scale: [1, 2.5, 2.5],
            opacity: [0.8, 0.2, 0],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            delay: i * 1,
            ease: "easeOut",
          }}
        />
      ))}
      
      {/* Center pin */}
      <motion.div
        className="relative z-10 w-16 h-16 rounded-full bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center shadow-lg shadow-[#2EFFAF]/50"
        animate={{
          scale: [1, 1.1, 1],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <MapPin className="w-8 h-8 text-[#0A0F1E]" fill="#0A0F1E" />
      </motion.div>
    </div>
  );
}
