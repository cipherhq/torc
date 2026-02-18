import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, MapPin, Clock, DollarSign, Star, Download, Calendar, Filter } from 'lucide-react';
import { useState } from 'react';

interface Service {
  id: string;
  date: string;
  service: string;
  provider: string;
  location: string;
  amount: number;
  tip: number;
  rating: number;
  status: 'completed' | 'cancelled';
  receiptUrl?: string;
}

export function ServiceHistory() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'completed' | 'cancelled'>('all');

  const services: Service[] = [
    {
      id: 'SVC-2045',
      date: 'Feb 8, 2026',
      service: 'Jump Start',
      provider: 'Marcus Rodriguez',
      location: '1234 Tech Blvd, SF',
      amount: 45,
      tip: 10,
      rating: 5,
      status: 'completed',
    },
    {
      id: 'SVC-2039',
      date: 'Feb 3, 2026',
      service: 'Towing (15 miles)',
      provider: 'Sarah Williams',
      location: '567 Market St, SF',
      amount: 180,
      tip: 20,
      rating: 5,
      status: 'completed',
    },
    {
      id: 'SVC-2028',
      date: 'Jan 28, 2026',
      service: 'Tire Change',
      provider: 'James Chen',
      location: '890 Mission St, SF',
      amount: 75,
      tip: 15,
      rating: 4,
      status: 'completed',
    },
    {
      id: 'SVC-2015',
      date: 'Jan 20, 2026',
      service: 'Fuel Delivery',
      provider: 'Mike Johnson',
      location: '234 Valencia St, SF',
      amount: 35,
      tip: 5,
      rating: 5,
      status: 'completed',
    },
    {
      id: 'SVC-2001',
      date: 'Jan 12, 2026',
      service: 'Lockout Service',
      provider: 'Emma Davis',
      location: '456 Castro St, SF',
      amount: 65,
      tip: 0,
      rating: 3,
      status: 'cancelled',
    },
  ];

  const filteredServices = services.filter(s => 
    filter === 'all' ? true : s.status === filter
  );

  const totalSpent = services
    .filter(s => s.status === 'completed')
    .reduce((sum, s) => sum + s.amount + s.tip, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1E2433] via-[#252B3D] to-[#2F3548] pb-24">
      {/* Header */}
      <div className="glass-light border-b border-white/10 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto p-6">
          <div className="flex items-center gap-4 mb-2">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => navigate('/profile')}
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </motion.button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-white">Service History</h1>
              <p className="text-white/70 text-sm">{services.length} total services</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Stats Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-[24px] p-6"
        >
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center mx-auto mb-2">
                <Calendar className="w-6 h-6 text-[#0F1419]" />
              </div>
              <p className="text-white/60 text-xs mb-1">Total</p>
              <p className="text-white font-bold text-xl">{services.length}</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center mx-auto mb-2">
                <DollarSign className="w-6 h-6 text-[#0F1419]" />
              </div>
              <p className="text-white/60 text-xs mb-1">Spent</p>
              <p className="text-white font-bold text-xl">${totalSpent}</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center mx-auto mb-2">
                <Star className="w-6 h-6 text-[#0F1419]" />
              </div>
              <p className="text-white/60 text-xs mb-1">Avg Rating</p>
              <p className="text-white font-bold text-xl">4.8</p>
            </div>
          </div>
        </motion.div>

        {/* Filter Tabs */}
        <div className="flex gap-2">
          {(['all', 'completed', 'cancelled'] as const).map((f) => (
            <motion.button
              key={f}
              whileTap={{ scale: 0.95 }}
              onClick={() => setFilter(f)}
              className={`flex-1 px-4 py-3 rounded-[16px] font-semibold text-sm transition-all ${
                filter === f
                  ? 'bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0F1419]'
                  : 'glass text-white/70'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </motion.button>
          ))}
        </div>

        {/* Service List */}
        <div className="space-y-4">
          {filteredServices.map((service, index) => (
            <motion.div
              key={service.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="glass rounded-[24px] p-5"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-white font-bold text-lg mb-1">{service.service}</h3>
                  <p className="text-white/60 text-sm">{service.provider}</p>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  service.status === 'completed'
                    ? 'bg-[#2EFFAF]/20 text-[#2EFFAF]'
                    : 'bg-red-400/20 text-red-400'
                }`}>
                  {service.status === 'completed' ? '✓ Completed' : '✕ Cancelled'}
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-white/70 text-sm">
                  <MapPin className="w-4 h-4 text-[#2EFFAF]" />
                  {service.location}
                </div>
                <div className="flex items-center gap-2 text-white/70 text-sm">
                  <Clock className="w-4 h-4 text-[#007AFF]" />
                  {service.date}
                </div>
              </div>

              {service.status === 'completed' && (
                <>
                  <div className="flex items-center justify-between mb-3 pb-3 border-b border-white/10">
                    <span className="text-white/60 text-sm">Service</span>
                    <span className="text-white font-semibold">${service.amount}</span>
                  </div>
                  <div className="flex items-center justify-between mb-3 pb-3 border-b border-white/10">
                    <span className="text-white/60 text-sm">Tip</span>
                    <span className="text-[#2EFFAF] font-semibold">${service.tip}</span>
                  </div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-white/60 text-sm">Total</span>
                    <span className="text-white font-bold text-lg">${service.amount + service.tip}</span>
                  </div>

                  {/* Rating */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-white/60 text-sm">Your Rating:</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`w-4 h-4 ${
                            star <= service.rating
                              ? 'fill-[#2EFFAF] text-[#2EFFAF]'
                              : 'text-white/20'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="flex-1 px-4 py-3 rounded-[16px] bg-white/10 text-white font-semibold text-sm flex items-center justify-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Receipt
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="flex-1 px-4 py-3 rounded-[16px] bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0F1419] font-semibold text-sm"
                    >
                      Book Again
                    </motion.button>
                  </div>
                </>
              )}
            </motion.div>
          ))}
        </div>

        {filteredServices.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <Calendar className="w-16 h-16 text-white/20 mx-auto mb-4" />
            <p className="text-white/60">No {filter} services found</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
