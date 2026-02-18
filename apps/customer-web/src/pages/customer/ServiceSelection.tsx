import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Search } from 'lucide-react';
import { ServiceCard } from '../../components/ServiceCard';
import { services } from '../../data/services';
import { useState } from 'react';
import { updateRequestContext } from '../../data/requestContext';

export function ServiceSelection() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const filteredServices = services.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.description.toLowerCase().includes(search.toLowerCase())
  );

  const handleServiceSelect = (serviceId: string) => {
    updateRequestContext({ serviceId });
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

        {/* Service grid */}
        <div className="grid grid-cols-2 gap-4">
          {filteredServices.map((service, index) => (
            <div key={service.id} onClick={() => handleServiceSelect(service.id)}>
              <ServiceCard service={service} index={index} />
            </div>
          ))}
        </div>

        {filteredServices.length === 0 && (
          <div className="text-center py-12">
            <p className="text-white/60">No services found</p>
          </div>
        )}
      </div>
    </div>
  );
}
