import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Check } from 'lucide-react';
import { services } from '../../data/services';
import * as Icons from 'lucide-react';
import { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';

export function ProviderServiceSelection() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const [selectedServices, setSelectedServices] = useState<string[]>([]);

  const toggleService = (serviceId: string) => {
    setSelectedServices(prev =>
      prev.includes(serviceId) ? prev.filter(id => id !== serviceId) : [...prev, serviceId]
    );
  };

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-hidden"
      style={{
        background: isDark
          ? 'linear-gradient(180deg, #1A1F2E 0%, #0F1419 100%)'
          : 'linear-gradient(180deg, #FFFFFF 0%, #F0F4F8 100%)',
      }}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] rounded-full" style={{ backgroundColor: '#2EFFAF', filter: 'blur(160px)', opacity: isDark ? 0.06 : 0.03 }} />
      </div>

      {/* Header */}
      <div className="relative z-10 p-6 flex items-center gap-4">
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate(-1)} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}>
          <ArrowLeft className="w-5 h-5" style={{ color: isDark ? '#FFFFFF' : '#1F2937' }} />
        </motion.button>
        <h1 className="text-xl font-bold" style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }}>Select Services</h1>
      </div>

      <div className="relative z-10 flex-1 px-6 pb-32 overflow-y-auto">
        <p className="mb-6 text-sm" style={{ color: isDark ? 'rgba(255,255,255,0.5)' : '#6B7280' }}>
          Choose all services you can provide
        </p>

        <div className="grid grid-cols-2 gap-3">
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
                className="rounded-2xl p-4 flex flex-col items-center gap-3 transition-all"
                style={{
                  backgroundColor: isSelected
                    ? (isDark ? 'rgba(46,255,175,0.1)' : 'rgba(46,255,175,0.08)')
                    : (isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF'),
                  border: `2px solid ${isSelected ? '#2EFFAF' : (isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB')}`,
                  boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.04)',
                }}
              >
                <div className="relative">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{
                      backgroundColor: isSelected ? 'linear-gradient(135deg, #2EFFAF, #007AFF)' : (isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6'),
                      background: isSelected ? 'linear-gradient(135deg, #2EFFAF, #007AFF)' : undefined,
                    }}
                  >
                    {Icon && <Icon className="w-6 h-6" style={{ color: isSelected ? '#0F1419' : (isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF') }} />}
                  </div>
                  {isSelected && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#2EFFAF] flex items-center justify-center">
                      <Check className="w-3 h-3 text-[#0F1419]" />
                    </div>
                  )}
                </div>
                <div className="text-center">
                  <p className="font-semibold text-sm" style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }}>{service.name}</p>
                  <p className="text-xs mt-0.5" style={{ color: isSelected ? '#2EFFAF' : (isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF') }}>${service.basePrice}+</p>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Fixed bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-20 p-6" style={{ backgroundColor: isDark ? '#1A1F2E' : '#FFFFFF', borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB'}` }}>
        <p className="text-sm mb-3 text-center" style={{ color: isDark ? 'rgba(255,255,255,0.5)' : '#6B7280' }}>
          {selectedServices.length} service{selectedServices.length !== 1 ? 's' : ''} selected
        </p>
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/provider/documents')}
          disabled={selectedServices.length === 0}
          className="w-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-2xl py-4 font-bold text-[#0F1419] text-lg shadow-lg shadow-[#2EFFAF]/30 disabled:opacity-50"
        >
          Continue
        </motion.button>
      </div>
    </div>
  );
}
