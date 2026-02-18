import { motion } from 'motion/react';
import { useEffect, useState } from 'react';

interface MapWithRouteProps {
  providerPosition: { x: number; y: number };
  customerPosition: { x: number; y: number };
  showRoute?: boolean;
}

export function MapWithRoute({ providerPosition, customerPosition, showRoute = true }: MapWithRouteProps) {
  const [pathLength, setPathLength] = useState(0);

  // Calculate path between provider and customer
  const routePath = `M ${providerPosition.x} ${providerPosition.y} Q ${
    (providerPosition.x + customerPosition.x) / 2
  } ${
    (providerPosition.y + customerPosition.y) / 2 - 20
  } ${customerPosition.x} ${customerPosition.y}`;

  useEffect(() => {
    // Calculate path length for animation
    const path = document.getElementById('route-path');
    if (path) {
      const length = (path as SVGPathElement).getTotalLength();
      setPathLength(length);
    }
  }, [routePath]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Map grid background */}
      <svg className="absolute inset-0 w-full h-full" style={{ filter: 'opacity(0.4)' }}>
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke="rgba(46, 255, 175, 0.1)"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Streets overlay */}
      <svg className="absolute inset-0 w-full h-full opacity-30">
        <line x1="0" y1="30%" x2="100%" y2="30%" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
        <line x1="0" y1="60%" x2="100%" y2="60%" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
        <line x1="30%" y1="0" x2="30%" y2="100%" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
        <line x1="70%" y1="0" x2="70%" y2="100%" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
      </svg>

      {/* Route path */}
      {showRoute && (
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="routeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#007AFF" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#2EFFAF" stopOpacity="0.8" />
            </linearGradient>
          </defs>
          
          {/* Background route */}
          <path
            d={routePath}
            fill="none"
            stroke="rgba(46, 255, 175, 0.2)"
            strokeWidth="0.8"
            strokeLinecap="round"
          />
          
          {/* Animated route */}
          <motion.path
            id="route-path"
            d={routePath}
            fill="none"
            stroke="url(#routeGradient)"
            strokeWidth="0.6"
            strokeLinecap="round"
            strokeDasharray={pathLength}
            initial={{ strokeDashoffset: pathLength }}
            animate={{ strokeDashoffset: 0 }}
            transition={{ duration: 2, ease: "easeInOut" }}
          />

          {/* Animated dots along route */}
          <motion.circle
            animate={{
              offsetDistance: ["0%", "100%"],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "linear",
            }}
            style={{
              offsetPath: `path("${routePath}")`,
            }}
            r="0.5"
            fill="#2EFFAF"
          >
            <animateMotion dur="3s" repeatCount="indefinite">
              <mpath href="#route-path" />
            </animateMotion>
          </motion.circle>
        </svg>
      )}

      {/* Landmarks */}
      <div className="absolute top-[20%] left-[25%] w-3 h-3 bg-white/40 rounded-full" />
      <div className="absolute top-[40%] right-[30%] w-2 h-2 bg-white/40 rounded-full" />
      <div className="absolute bottom-[35%] left-[40%] w-2 h-2 bg-white/40 rounded-full" />
      <div className="absolute top-[70%] right-[25%] w-3 h-3 bg-white/40 rounded-full" />
    </div>
  );
}
