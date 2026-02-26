import { useNavigate } from 'react-router';
import { services } from '../../data/services';
import * as Icons from 'lucide-react';
import { ArrowLeft } from 'lucide-react';

export function WebsiteServices() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <button onClick={() => navigate('/website')} className="p-2 hover:bg-gray-100 rounded-xl">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-[#008CE5] to-[#0070B8] bg-clip-text text-transparent">
            TORC
          </h1>
        </div>
      </nav>

      <div className="pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">Our Services</h1>
          <p className="text-xl text-gray-600 mb-12">Professional roadside assistance for every situation</p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((service) => {
              const Icon = Icons[service.icon as keyof typeof Icons] as any;
              return (
                <div key={service.id} className="bg-white rounded-3xl p-8 shadow-lg hover:shadow-xl transition-all border border-gray-100">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#008CE5]/20 to-[#0070B8]/20 flex items-center justify-center mb-6">
                    {Icon && <Icon className="w-8 h-8 text-[#008CE5]" />}
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-3">{service.name}</h3>
                  <p className="text-gray-600 mb-4">{service.description}</p>
                  <p className="text-[#0070B8] font-bold">From ${service.basePrice}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
