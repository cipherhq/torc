import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Wrench, Plus, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import * as LucideIcons from 'lucide-react';

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
  const { user } = useAuth();
  const { isDark } = useTheme();

  const [services, setServices] = useState<Service[]>([]);
  const [savingServiceId, setSavingServiceId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const { data: allServices } = await supabase.from('services').select('*').eq('is_active', true);
        
        let providerServices: string[] = [];
        if (user) {
          const { data: pp } = await supabase.from('provider_profiles').select('services').eq('id', user.id).single();
          if (pp?.services) providerServices = pp.services;
        }

        if (allServices) {
          setServices(allServices.map(s => ({
            id: s.id,
            name: s.name,
            icon: (LucideIcons as any)[s.icon] || Wrench,
            description: s.description || '',
            baseRate: `$${s.base_price}/service`,
            enabled: providerServices.includes(s.id),
          })));
        }
      } catch (e) { console.warn('Failed to load services:', e); }
    }
    load();
  }, [user]);

  const toggleService = async (serviceId: string, nextEnabled: boolean) => {
    const previous = services;
    const updated = previous.map(service =>
      service.id === serviceId 
        ? { ...service, enabled: nextEnabled }
        : service
    );
    setServices(updated);

    if (!user) return;

    try {
      setSavingServiceId(serviceId);
      const newEnabledIds = updated.filter(s => s.enabled).map(s => s.id);
      const { error } = await supabase
        .from('provider_profiles')
        .upsert({ id: user.id, services: newEnabledIds })
        .select();
      if (error) throw error;
    } catch (error) {
      console.warn('Failed to save provider services:', error);
      setServices(previous);
    } finally {
      setSavingServiceId(null);
    }
  };

  const enabledCount = services.filter(s => s.enabled).length;

  return (
    <div
      className="min-h-screen relative overflow-hidden pb-24"
      style={{
        background: isDark
          ? 'linear-gradient(180deg, #091524 0%, #11263D 55%, #0E1D30 100%)'
          : 'linear-gradient(180deg, #F8FBFF 0%, #EEF5FF 50%, #E8F1FC 100%)',
      }}
    >
      {/* Background accents */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-24 -right-16 w-96 h-96 rounded-full blur-3xl"
          style={{
            background: 'radial-gradient(circle, rgba(0,140,229,0.28) 0%, rgba(0,140,229,0) 70%)',
            opacity: isDark ? 0.65 : 0.4,
          }}
        />
        <div
          className="absolute bottom-36 -left-10 w-96 h-96 rounded-full blur-3xl"
          style={{
            background: 'radial-gradient(circle, rgba(0,112,184,0.24) 0%, rgba(0,112,184,0) 72%)',
            opacity: isDark ? 0.55 : 0.3,
          }}
        />
      </div>

      {/* Header */}
      <div
        className="relative z-10 p-6 flex items-center justify-between border-b"
        style={{
          paddingTop: 'var(--safe-top)',
          borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(20,38,61,0.08)',
        }}
      >
        <div className="flex items-center gap-4">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate('/profile')}
            className="rounded-full p-3"
            style={{
              backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#FFFFFF',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.16)' : '#D5E2F2'}`,
            }}
          >
            <ArrowLeft className="w-6 h-6" style={{ color: isDark ? '#FFFFFF' : '#14263D' }} />
          </motion.button>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: isDark ? '#FFFFFF' : '#14263D' }}>My Services</h1>
            <p className="text-sm" style={{ color: isDark ? 'rgba(255,255,255,0.65)' : '#6B7280' }}>Manage your service offerings</p>
          </div>
        </div>
      </div>

      {/* Stats banner */}
      <div className="relative z-10 p-6">
        <div
          className="rounded-[30px] p-6"
          style={{
            background: 'linear-gradient(135deg, #008CE5 0%, #0070B8 100%)',
            border: `1px solid ${isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,112,184,0.28)'}`,
            boxShadow: '0 10px 28px rgba(0,140,229,0.28)',
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm mb-1" style={{ color: 'rgba(255,255,255,0.85)' }}>Active Services</p>
              <p className="text-4xl font-bold" style={{ color: '#FFFFFF' }}>{enabledCount}</p>
            </div>
            <div className="text-right">
              <p className="text-sm mb-1" style={{ color: 'rgba(255,255,255,0.85)' }}>Total Available</p>
              <p className="text-4xl font-bold" style={{ color: '#FFFFFF' }}>{services.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Services list */}
      <div className="relative z-10 px-6 space-y-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold" style={{ color: isDark ? '#FFFFFF' : '#14263D' }}>Available Services</h2>
          <p className="text-sm" style={{ color: isDark ? 'rgba(255,255,255,0.65)' : '#6B7280' }}>Toggle to enable/disable</p>
        </div>

        {services.map((service, index) => {
          const Icon = service.icon;
          return (
            <motion.div
              key={service.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="rounded-[24px] p-5"
              style={{
                backgroundColor: service.enabled
                  ? (isDark ? 'rgba(11,31,53,0.78)' : '#FFFFFF')
                  : (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.82)'),
                border: `1px solid ${service.enabled
                  ? (isDark ? 'rgba(0,140,229,0.55)' : '#BFDAF8')
                  : (isDark ? 'rgba(255,255,255,0.1)' : '#D7E5F5')}`,
                boxShadow: service.enabled
                  ? (isDark ? '0 10px 24px rgba(0,140,229,0.2)' : '0 8px 20px rgba(0,140,229,0.12)')
                  : (isDark ? 'none' : '0 2px 10px rgba(20,38,61,0.05)'),
              }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: service.enabled
                      ? 'linear-gradient(135deg, #008CE5, #0070B8)'
                      : (isDark ? 'rgba(255,255,255,0.08)' : '#EAF3FF'),
                  }}
                >
                  <Icon
                    className="w-7 h-7"
                    style={{
                      color: service.enabled ? '#FFFFFF' : (isDark ? 'rgba(255,255,255,0.5)' : '#7C8CA1'),
                    }}
                  />
                </div>

                <div className="flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3
                        className="font-bold text-lg"
                        style={{ color: service.enabled ? (isDark ? '#FFFFFF' : '#14263D') : (isDark ? 'rgba(255,255,255,0.72)' : '#45566B') }}
                      >
                        {service.name}
                      </h3>
                      <p
                        className="text-sm"
                        style={{ color: service.enabled ? (isDark ? 'rgba(255,255,255,0.75)' : '#516173') : (isDark ? 'rgba(255,255,255,0.5)' : '#7A8798') }}
                      >
                        {service.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {savingServiceId === service.id && (
                        <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#008CE5' }} />
                      )}
                      <button
                        role="switch"
                        aria-checked={service.enabled}
                        aria-label={`Toggle ${service.name}`}
                        disabled={savingServiceId === service.id}
                        onClick={() => { void toggleService(service.id, !service.enabled); }}
                        className="relative inline-flex items-center shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50"
                        style={{
                          width: 52,
                          height: 30,
                          backgroundColor: service.enabled
                            ? '#008CE5'
                            : (isDark ? 'rgba(255,255,255,0.12)' : '#DCEAF8'),
                          border: `1.5px solid ${service.enabled
                            ? '#008CE5'
                            : (isDark ? 'rgba(255,255,255,0.2)' : '#BED5F2')}`,
                        }}
                      >
                        <span
                          className="block rounded-full bg-white shadow-md transition-transform duration-200"
                          style={{
                            width: 22,
                            height: 22,
                            transform: service.enabled ? 'translateX(24px)' : 'translateX(3px)',
                          }}
                        />
                      </button>
                    </div>
                  </div>

                  <div
                    className="flex items-center justify-between mt-3 pt-3 border-t"
                    style={{ borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E2ECF8' }}
                  >
                    <div>
                      <p className="text-xs mb-1" style={{ color: isDark ? 'rgba(255,255,255,0.55)' : '#7A8798' }}>Base Rate</p>
                      <p className="font-bold" style={{ color: service.enabled ? '#008CE5' : (isDark ? 'rgba(255,255,255,0.45)' : '#7A8798') }}>
                        {service.baseRate}
                      </p>
                    </div>
                    {service.enabled && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="px-3 py-1 rounded-full text-xs font-semibold"
                        style={{
                          backgroundColor: isDark ? 'rgba(0,140,229,0.22)' : 'rgba(0,140,229,0.14)',
                          color: '#008CE5',
                        }}
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
          className="w-full rounded-[24px] p-5 border flex items-center justify-center gap-3"
          style={{
            backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF',
            borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#D7E5F5',
          }}
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#EAF3FF' }}
          >
            <Plus className="w-5 h-5" style={{ color: '#008CE5' }} />
          </div>
          <div className="text-left">
            <p className="font-semibold" style={{ color: isDark ? '#FFFFFF' : '#14263D' }}>Request New Service</p>
            <p className="text-sm" style={{ color: isDark ? 'rgba(255,255,255,0.65)' : '#6B7280' }}>Contact support to add more services</p>
          </div>
        </motion.button>
      </div>

      {/* Save button */}
      <div className="relative z-10 px-6 mt-6 pb-6">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/profile')}
          className="w-full py-5 rounded-[32px] bg-gradient-to-r from-[#008CE5] to-[#0070B8] text-white font-bold text-lg shadow-2xl shadow-[#008CE5]/30"
        >
          Save Changes
        </motion.button>
      </div>
    </div>
  );
}
