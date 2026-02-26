import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Check } from 'lucide-react';
import { services } from '../../data/services';
import * as Icons from 'lucide-react';
import { useState } from 'react';

export function ProviderServiceSelection() {
  const navigate = useNavigate();
  const [selectedServices, setSelectedServices] = useState<string[]>([]);

  const toggleService = (serviceId: string) => {
    setSelectedServices(prev =>
      prev.includes(serviceId)
        ? prev.filter(id => id !== serviceId)
        : [...prev, serviceId]
    );
  };

  return (
    <div className="min-h-screen bg-[#1A1F2E] flex flex-col relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#008CE5] opacity-10 blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <div className="relative z-10 p-6 flex items-center gap-4">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate(-1)}
          className="glass rounded-full p-3"
        >
          <ArrowLeft className="w-6 h-6 text-white" />
        </motion.button>
        <h1 className="text-2xl font-bold text-white">Services Offered</h1>
      </div>

      <div className="relative z-10 flex-1 px-6 pb-32 overflow-y-auto">
        <p className="text-white/60 mb-6">
          Select all services you can provide
        </p>

        <div className="grid grid-cols-2 gap-4">
          {services.map((service, index) => {
            const Icon = Icons[service.icon as keyof typeof Icons] as any;
            const isSelected = selectedServices.includes(service.id);

            return (
              <motion.button
                key={service.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => toggleService(service.id)}
                className={`rounded-[24px] p-5 flex flex-col items-center gap-3 transition-all ${
                  isSelected
                    ? 'bg-gradient-to-br from-[#008CE5]/20 to-[#0070B8]/20 border-2 border-[#008CE5]'
                    : 'glass'
                }`}
              >
                <div className="relative">
                  <div 
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                      isSelected
                        ? 'bg-gradient-to-br from-[#008CE5] to-[#0070B8]'
                        : 'bg-white/5'
                    }`}
                  >
                    {Icon && <Icon className={`w-7 h-7 ${isSelected ? 'text-white' : 'text-white/40'}`} />}
                  </div>
                  {isSelected && (
                    <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-[#008CE5] flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                </div>
                <div className="text-center">
                  <p className={`font-semibold text-sm ${isSelected ? 'text-white' : 'text-white/80'}`}>
                    {service.name}
                  </p>
                  <p className={`text-xs mt-1 ${isSelected ? 'text-[#008CE5]' : 'text-white/60'}`}>
                    ${service.basePrice}+
                  </p>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Fixed bottom button */}
      <div className="fixed bottom-0 left-0 right-0 z-20 p-6 glass border-t border-white/10">
        <p className="text-white/60 text-sm mb-3 text-center">
          {selectedServices.length} service{selectedServices.length !== 1 ? 's' : ''} selected
        </p>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/provider/documents')}
          disabled={selectedServices.length === 0}
          className="w-full bg-gradient-to-r from-[#008CE5] to-[#0070B8] rounded-[32px] py-5 font-bold text-white text-lg shadow-lg shadow-[#008CE5]/30 disabled:opacity-50"
        >
          Continue
        </motion.button>
      </div>
    </div>
  );
}
