import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { Search, Loader2 } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { useState, useEffect } from 'react';
import { updateRequestContext } from '../../data/requestContext';
import { supabase } from '../../lib/supabase';
import * as Icons from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

interface ServiceRow {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  base_price: number | null;
  is_active: boolean | null;
}

export function ServiceSelection() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const [search, setSearch] = useState('');
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const textColor = isDark ? '#FFFFFF' : '#14263D';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2';
  const mutedColor = isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF';
  const inputBg = isDark ? 'rgba(255,255,255,0.05)' : '#F9FAFB';
  const inputBorder = isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB';

  useEffect(() => {
    async function loadServices() {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('services')
          .select('id, name, description, icon, base_price, is_active')
          .eq('is_active', true)
          .order('name', { ascending: true });
        if (error) throw error;
        setServices((data || []) as ServiceRow[]);
      } catch (error) {
        console.warn('Failed to load services, falling back to empty list:', error);
        setServices([]);
      } finally {
        setLoading(false);
      }
    }
    void loadServices();
  }, []);

  const filteredServices = services.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.description || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleServiceSelect = (service: ServiceRow) => {
    updateRequestContext({
      serviceId: service.id,
      serviceName: service.name,
      serviceBasePrice: Number(service.base_price || 0),
      serviceIcon: service.icon || null,
    });
    const serviceId = encodeURIComponent(service.id);
    navigate(`/service-details/${serviceId}`);
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden" style={{ background: isDark ? 'linear-gradient(180deg, #0A1626 0%, #081427 100%)' : 'linear-gradient(180deg, #F8FBFF 0%, #EAF2FF 100%)' }}>
      {/* Background */}
      {isDark && (
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#008CE5] opacity-10 blur-[120px] rounded-full" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#0070B8] opacity-10 blur-[120px] rounded-full" />
        </div>
      )}

      <PageHeader title="Select Service" onBack={() => navigate('/confirm-location')} />

      <div className="relative z-10 flex-1 px-6 pb-6 overflow-y-auto" style={{ paddingTop: 'calc(var(--safe-top) + 64px)' }}>
        {/* Search */}
        <div className="mb-6">
          <div className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}>
            <Search className="w-5 h-5" style={{ color: mutedColor }} />
            <input
              type="text"
              placeholder="Search services..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent focus:outline-none"
              style={{ color: textColor }}
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3" style={{ color: subColor }} />
            <p style={{ color: subColor }}>Loading services...</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {filteredServices.map((service, index) => {
              const Icon = (service.icon && (Icons as any)[service.icon]) || Icons.Wrench;
              return (
                <motion.button
                  key={service.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleServiceSelect(service)}
                  className="rounded-2xl p-4 text-left active:opacity-80 cursor-pointer transition-colors"
                  style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
                >
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#008CE5] to-[#0070B8] flex items-center justify-center mb-3">
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <p className="font-semibold text-sm" style={{ color: textColor }}>{service.name}</p>
                  <p className="text-xs mt-1 line-clamp-2" style={{ color: subColor }}>{service.description || 'Roadside support service'}</p>
                  <p className="text-[#008CE5] text-sm font-semibold mt-2">${Number(service.base_price || 0)}</p>
                </motion.button>
              );
            })}
          </div>
        )}

        {!loading && filteredServices.length === 0 && (
          <div className="text-center py-12">
            <p style={{ color: subColor }}>No services found</p>
          </div>
        )}
      </div>
    </div>
  );
}
