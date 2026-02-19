import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Search, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { updateRequestContext } from '../../data/requestContext';
import { supabase } from '../../lib/supabase';
import * as Icons from 'lucide-react';

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
  const [search, setSearch] = useState('');
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);

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
    <div className="min-h-screen bg-[#0A0F1E] flex flex-col relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#2EFFAF] opacity-10 blur-[120px] rounded-full" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#007AFF] opacity-10 blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <div className="relative z-10 p-6 flex items-center gap-4">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate('/confirm-location')}
          className="glass rounded-full p-3"
        >
          <ArrowLeft className="w-6 h-6 text-white" />
        </motion.button>
        <h1 className="text-2xl font-bold text-white">Select Service</h1>
      </div>

      <div className="relative z-10 flex-1 px-6 pb-6 overflow-y-auto">
        {/* Search */}
        <div className="mb-6">
          <div className="glass rounded-[24px] px-4 py-3 flex items-center gap-3">
            <Search className="w-5 h-5 text-white/40" />
            <input
              type="text"
              placeholder="Search services..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-white placeholder-white/40 focus:outline-none"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <Loader2 className="w-6 h-6 text-white/60 animate-spin mx-auto mb-3" />
            <p className="text-white/60">Loading services...</p>
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
                  className="glass rounded-[24px] p-4 text-left hover:bg-white/10 transition-colors"
                >
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center mb-3">
                    <Icon className="w-6 h-6 text-[#0F1419]" />
                  </div>
                  <p className="text-white font-semibold text-sm">{service.name}</p>
                  <p className="text-white/60 text-xs mt-1 line-clamp-2">{service.description || 'Roadside support service'}</p>
                  <p className="text-[#2EFFAF] text-sm font-semibold mt-2">${Number(service.base_price || 0)}</p>
                </motion.button>
              );
            })}
          </div>
        )}

        {!loading && filteredServices.length === 0 && (
          <div className="text-center py-12">
            <p className="text-white/60">No services found</p>
          </div>
        )}
      </div>
    </div>
  );
}
