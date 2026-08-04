import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { Check, Loader2 } from 'lucide-react';
import * as Icons from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { PageHeader } from '../../components/PageHeader';
import { supabase } from '../../lib/supabase';

interface ServiceRow {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  base_price: number | null;
  is_active: boolean | null;
}

export function ProviderServiceSelection() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { user } = useAuth() as any;
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);

  useEffect(() => {
    async function loadServices() {
      try {
        setLoading(true);

        const { data: allServices, error: servicesError } = await supabase
          .from('services')
          .select('id, name, description, icon, base_price, is_active')
          .eq('is_active', true)
          .order('name', { ascending: true });
        if (servicesError) throw servicesError;
        setServices((allServices || []) as ServiceRow[]);

        if (user?.id) {
          const { data: providerProfile } = await supabase
            .from('provider_profiles')
            .select('services')
            .eq('id', user.id)
            .maybeSingle();
          setSelectedServices(providerProfile?.services || []);
        }
      } catch (error) {
        console.warn('Failed to load provider services:', error);
      } finally {
        setLoading(false);
      }
    }
    void loadServices();
  }, [user?.id]);

  const toggleService = (serviceId: string) => {
    setSelectedServices(prev =>
      prev.includes(serviceId) ? prev.filter(id => id !== serviceId) : [...prev, serviceId]
    );
  };

  async function handleContinue() {
    if (!user || selectedServices.length === 0) return;
    try {
      setSaving(true);
      const { error } = await supabase
        .from('provider_profiles')
        .upsert({
          id: user.id,
          services: selectedServices,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
      if (error) throw error;
      navigate(-1);
    } catch (error: any) {
      console.warn('Failed to save provider services:', error);
      window.alert(error?.message || 'Could not save selected services.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-hidden"
      style={{
        background: isDark
          ? 'linear-gradient(180deg, #14263D 0%, #0A1626 100%)'
          : 'linear-gradient(180deg, #FFFFFF 0%, #EAF3FF 100%)',
      }}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] rounded-full" style={{ backgroundColor: '#008CE5', filter: 'blur(160px)', opacity: isDark ? 0.06 : 0.03 }} />
      </div>

      <PageHeader title="Select Services" onBack={() => navigate(-1)} />

      <div className="relative z-10 flex-1 px-6 pb-48 overflow-y-auto" style={{ paddingTop: 'calc(var(--safe-top) + 64px)' }}>
        <p className="mb-6 text-sm" style={{ color: isDark ? 'rgba(255,255,255,0.5)' : '#6B7280' }}>
          Choose all services you can provide
        </p>

        {loading ? (
          <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF' }}>
            <Loader2 className="w-5 h-5 mx-auto mb-2 animate-spin" style={{ color: '#008CE5' }} />
            <p style={{ color: isDark ? 'rgba(255,255,255,0.6)' : '#6B7280' }}>Loading services...</p>
          </div>
        ) : (
        <div className="space-y-3">
          {services.map((service, index) => {
            const Icon = (service.icon && (Icons as any)[service.icon]) || Icons.Wrench;
            const isSelected = selectedServices.includes(service.id);

            return (
              <motion.button
                key={service.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => toggleService(service.id)}
                className="w-full rounded-2xl p-4 flex items-center gap-4 transition-all"
                style={{
                  backgroundColor: isSelected
                    ? (isDark ? 'rgba(0,140,229,0.1)' : 'rgba(0,140,229,0.08)')
                    : (isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF'),
                  border: `2px solid ${isSelected ? '#008CE5' : (isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2')}`,
                  boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.04)',
                }}
              >
                <div className="relative flex-shrink-0">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{
                      backgroundColor: isSelected ? undefined : (isDark ? 'rgba(255,255,255,0.05)' : '#E8F0FB'),
                      background: isSelected ? 'linear-gradient(135deg, #008CE5, #0070B8)' : undefined,
                    }}
                  >
                    {Icon && <Icon className="w-6 h-6" style={{ color: isSelected ? '#FFFFFF' : (isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF') }} />}
                  </div>
                  {isSelected && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#008CE5] flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                </div>
                <div className="flex-1 text-left">
                  <p className="font-semibold text-sm" style={{ color: isDark ? '#FFFFFF' : '#14263D' }}>{service.name}</p>
                  {service.description && (
                    <p className="text-xs mt-0.5" style={{ color: isDark ? 'rgba(255,255,255,0.5)' : '#6B7280' }}>{service.description}</p>
                  )}
                </div>
                <p className="text-sm font-bold flex-shrink-0" style={{ color: isSelected ? '#008CE5' : (isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF') }}>
                  ${Number(service.base_price || 0)}+
                </p>
              </motion.button>
            );
          })}
        </div>
        )}
      </div>

      {/* Fixed bottom — positioned above the bottom nav bar */}
      <div className="fixed left-0 right-0 z-30 px-5 pt-3 pb-3" style={{ bottom: 'calc(70px + env(safe-area-inset-bottom, 0px))', backgroundColor: isDark ? 'rgba(20,38,61,0.95)' : 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2'}` }}>
        <div className="flex items-center gap-3">
          <p className="text-sm flex-shrink-0" style={{ color: isDark ? 'rgba(255,255,255,0.5)' : '#6B7280' }}>
            {selectedServices.length} selected
          </p>
          <motion.button whileTap={{ scale: 0.98 }}
            onClick={handleContinue}
            disabled={selectedServices.length === 0 || saving}
            className="flex-1 bg-gradient-to-r from-[#008CE5] to-[#0070B8] rounded-2xl py-3.5 font-bold text-white text-base shadow-lg shadow-[#008CE5]/30 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Services'}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
