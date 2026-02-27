import { motion } from 'motion/react';
import { MapPin } from 'lucide-react';

export function PulsePin() {
  return (
    <div className="relative flex items-center justify-center">
      {/* Outer pulse rings */}
      {[...Array(3)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-24 h-24 rounded-full border-2 border-[#008CE5]"
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
        className="relative z-10 w-16 h-16 rounded-full bg-gradient-to-br from-[#008CE5] to-[#0070B8] flex items-center justify-center shadow-lg shadow-[#008CE5]/50"
        animate={{
          scale: [1, 1.1, 1],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <MapPin className="w-8 h-8 text-[#081427]" fill="#081427" />
      </motion.div>
    </div>
  );
}
