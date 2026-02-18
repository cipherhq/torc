import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Wrench, Zap, Droplet, Gauge, Shield, Key, Plus, Check } from 'lucide-react';
import { useState } from 'react';

interface Service {
  id: string;
  name: string;
  icon: any;
  description: string;
  baseRate: string;
  enabled: boolean;
}

export function ProviderServices() {
  const navigate = useNavigate();
  
  const [services, setServices] = useState<Service[]>([
    {
      id: 'towing',
      name: 'Towing',
      icon: Wrench,
      description: 'Vehicle towing and transportation',
      baseRate: '$75/tow',
      enabled: true,
    },
    {
      id: 'battery',
      name: 'Battery Jumpstart',
      icon: Zap,
      description: 'Dead battery assistance',
      baseRate: '$45/service',
      enabled: true,
    },
    {
      id: 'tire',
      name: 'Tire Change',
      icon: Shield,
      description: 'Flat tire replacement',
      baseRate: '$50/tire',
      enabled: true,
    },
    {
      id: 'fuel',
      name: 'Fuel Delivery',
      icon: Droplet,
      description: 'Emergency fuel delivery',
      baseRate: '$35 + fuel',
      enabled: false,
    },
    {
      id: 'lockout',
      name: 'Lockout Service',
      icon: Key,
      description: 'Vehicle unlock assistance',
      baseRate: '$55/service',
      enabled: false,
    },
    {
      id: 'winch',
      name: 'Winch Out',
      icon: Gauge,
      description: 'Vehicle recovery from ditch/mud',
      baseRate: '$85/service',
      enabled: false,
    },
  ]);

  const toggleService = (serviceId: string) => {
    setServices(services.map(service => 
      service.id === serviceId 
        ? { ...service, enabled: !service.enabled }
        : service
    ));
  };

  const enabledCount = services.filter(s => s.enabled).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0F1419] via-[#1A1F2E] to-[#252B3D] relative overflow-hidden pb-24">
      {/* Background accents */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-20 right-20 w-96 h-96 bg-gradient-to-br from-[#2EFFAF]/30 to-transparent blur-3xl rounded-full animate-pulse" />
        <div className="absolute bottom-40 left-20 w-96 h-96 bg-gradient-to-br from-[#007AFF]/30 to-transparent blur-3xl rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      {/* Header */}
      <div className="relative z-10 p-6 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-4">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate('/provider/profile')}
            className="glass rounded-full p-3"
          >
            <ArrowLeft className="w-6 h-6 text-white" />
          </motion.button>
          <div>
            <h1 className="text-2xl font-bold text-white">My Services</h1>
            <p className="text-white/60 text-sm">Manage your service offerings</p>
          </div>
        </div>
      </div>

      {/* Stats banner */}
      <div className="relative z-10 p-6">
        <div className="glass-light rounded-[32px] p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/60 text-sm mb-1">Active Services</p>
              <p className="text-4xl font-bold text-white">{enabledCount}</p>
            </div>
            <div className="text-right">
              <p className="text-white/60 text-sm mb-1">Total Available</p>
              <p className="text-4xl font-bold text-white/40">{services.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Services list */}
      <div className="relative z-10 px-6 space-y-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-white font-semibold">Available Services</h2>
          <p className="text-white/60 text-sm">Toggle to enable/disable</p>
        </div>

        {services.map((service, index) => {
          const Icon = service.icon;
          return (
            <motion.div
              key={service.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className={service.enabled 
                ? 'glass-light rounded-[24px] p-5 border-2 border-[#2EFFAF]/30' 
                : 'glass rounded-[24px] p-5 border border-white/10'
              }
            >
              <div className="flex items-start gap-4">
                <div className={service.enabled
                  ? 'w-14 h-14 rounded-2xl bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center flex-shrink-0'
                  : 'w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center flex-shrink-0'
                }>
                  <Icon className={service.enabled ? 'w-7 h-7 text-[#0F1419]' : 'w-7 h-7 text-white/40'} />
                </div>

                <div className="flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className={service.enabled ? 'text-white font-bold text-lg' : 'text-white/60 font-bold text-lg'}>
                        {service.name}
                      </h3>
                      <p className={service.enabled ? 'text-white/70 text-sm' : 'text-white/40 text-sm'}>
                        {service.description}
                      </p>
                    </div>
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => toggleService(service.id)}
                      className={service.enabled
                        ? 'w-12 h-7 rounded-full relative transition-all bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] shadow-lg shadow-[#2EFFAF]/30'
                        : 'w-12 h-7 rounded-full relative transition-all bg-white/10'
                      }
                    >
                      <div className={service.enabled
                        ? 'absolute w-5 h-5 bg-white rounded-full top-1 right-1 transition-all shadow-lg flex items-center justify-center'
                        : 'absolute w-5 h-5 bg-white/50 rounded-full top-1 left-1 transition-all'
                      }>
                        {service.enabled && <Check className="w-3 h-3 text-[#2EFFAF]" />}
                      </div>
                    </motion.button>
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/10">
                    <div>
                      <p className="text-white/50 text-xs mb-1">Base Rate</p>
                      <p className={service.enabled ? 'text-[#2EFFAF] font-bold' : 'text-white/40 font-bold'}>
                        {service.baseRate}
                      </p>
                    </div>
                    {service.enabled && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="px-3 py-1 rounded-full bg-[#2EFFAF]/20 text-[#2EFFAF] text-xs font-semibold"
                      >
                        Active
                      </motion.div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Request new service */}
      <div className="relative z-10 px-6 mt-6">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="w-full glass-light rounded-[24px] p-5 border border-white/20 flex items-center justify-center gap-3"
        >
          <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
            <Plus className="w-5 h-5 text-white" />
          </div>
          <div className="text-left">
            <p className="text-white font-semibold">Request New Service</p>
            <p className="text-white/60 text-sm">Contact support to add more services</p>
          </div>
        </motion.button>
      </div>

      {/* Save button */}
      <div className="relative z-10 px-6 mt-6 pb-6">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/provider/profile')}
          className="w-full py-5 rounded-[32px] bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0F1419] font-bold text-lg shadow-2xl shadow-[#2EFFAF]/30"
        >
          Save Changes
        </motion.button>
      </div>
    </div>
  );
}
