import { motion } from 'motion/react';

export function MapBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Simulated 3D map with glowing roads - lighter version */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#14263D] via-[#1B2F4A] to-[#2F3548]">
        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-15">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(46, 255, 175, 0.4)" strokeWidth="0.5"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>
        
        {/* Glowing roads */}
        {[...Array(8)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute h-[2px] bg-gradient-to-r from-transparent via-[#008CE5] to-transparent opacity-40"
            style={{
              width: `${Math.random() * 60 + 40}%`,
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 50}%`,
              transform: `rotate(${Math.random() * 90 - 45}deg)`,
            }}
            animate={{
              opacity: [0.2, 0.6, 0.2],
            }}
            transition={{
              duration: 3 + Math.random() * 2,
              repeat: Infinity,
              delay: i * 0.5,
            }}
          />
        ))}
        
        {/* Ambient glow spots */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#008CE5] opacity-5 blur-[100px] rounded-full" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#0070B8] opacity-5 blur-[100px] rounded-full" />
      </div>
    </div>
  );
}