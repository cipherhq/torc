import { motion } from 'motion/react';
import * as Icons from 'lucide-react';
import { Service } from '../data/services';
import { useNavigate } from 'react-router';

interface ServiceCardProps {
  service: Service;
  index: number;
}

export function ServiceCard({ service, index }: ServiceCardProps) {
  const navigate = useNavigate();
  const Icon = Icons[service.icon as keyof typeof Icons] as any;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      whileHover={{ scale: 1.05, y: -5 }}
      whileTap={{ scale: 0.95 }}
      onClick={() => navigate(`/service-details/${service.id}`)}
      className="glass rounded-[32px] p-6 flex flex-col items-center justify-center gap-4 cursor-pointer relative overflow-hidden group min-w-[160px]"
      style={{
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
      }}
    >
      {/* Hover glow effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#2EFFAF]/20 to-[#007AFF]/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      {/* 3D Icon container */}
      <div className="relative z-10">
        <motion.div
          className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#2EFFAF]/20 to-[#007AFF]/20 flex items-center justify-center relative"
          style={{
            boxShadow: '0 4px 16px rgba(46, 255, 175, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
          }}
          whileHover={{ rotateY: 10, rotateX: 10 }}
        >
          {Icon && <Icon className="w-8 h-8 text-[#2EFFAF]" />}
          
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