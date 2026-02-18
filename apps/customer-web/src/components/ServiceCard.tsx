import { motion } from 'motion/react';
import * as LucideIcons from 'lucide-react';
import { useNavigate } from 'react-router';

interface ServiceCardProps {
  service: {
    id: string;
    name: string;
    icon: string;
    basePrice: number;
    [key: string]: any;
  };
  index: number;
}

function isEmoji(str: string) {
  return /\p{Emoji}/u.test(str) && str.length <= 4;
}

export function ServiceCard({ service, index }: ServiceCardProps) {
  const navigate = useNavigate();
  const LucideIcon = !isEmoji(service.icon)
    ? (LucideIcons[service.icon as keyof typeof LucideIcons] as any)
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      whileHover={{ scale: 1.05, y: -5 }}
      whileTap={{ scale: 0.95 }}
      onClick={() => navigate(`/service-details/${service.id}`)}
      className="glass rounded-[32px] p-6 flex flex-col items-center justify-center gap-4 cursor-pointer relative overflow-hidden group min-w-[160px]"
    >
      {/* Hover glow effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#2EFFAF]/20 to-[#007AFF]/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      {/* Icon container */}
      <div className="relative z-10">
        <motion.div
          className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#2EFFAF]/20 to-[#007AFF]/20 flex items-center justify-center relative"
          whileHover={{ rotateY: 10, rotateX: 10 }}
        >
          {LucideIcon ? (
            <LucideIcon className="w-8 h-8 text-[#2EFFAF]" />
          ) : (
            <span className="text-3xl leading-none" role="img" aria-label={service.name}>{service.icon}</span>
          )}

          {/* Light reflection */}
          <div className="absolute top-0 left-0 w-8 h-8 bg-gradient-to-br from-white/30 to-transparent rounded-tl-2xl" />
        </motion.div>
      </div>

      {/* Service name */}
      <div className="relative z-10 text-center">
        <h3 className="text-white font-semibold text-sm">{service.name}</h3>
        <p className="text-[#2EFFAF] text-xs mt-1">${service.basePrice}</p>
      </div>

      {/* Shine effect on hover */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%]"
        transition={{ duration: 0.6 }}
      />
    </motion.div>
  );
}