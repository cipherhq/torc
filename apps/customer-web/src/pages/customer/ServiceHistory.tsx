import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, MapPin, Clock, DollarSign, Star, Download, Calendar } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

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
  const { user } = useAuth();
  const [filter, setFilter] = useState<'all' | 'completed' | 'cancelled'>('all');
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    async function load() {
      try {
        setLoadError(null);

        const { data: jobs, error: jobsError } = await supabase
          .from('jobs')
          .select('id, created_at, completed_at, status, service_id, provider_id, pickup_address, total_amount, base_price, tip, rating')
          .eq('customer_id', user.id)
          .in('status', ['completed', 'cancelled'])
          .order('created_at', { ascending: false });

        if (jobsError) throw jobsError;

        const rows = jobs || [];
        const serviceIds = Array.from(new Set(rows.map((j: any) => j.service_id).filter(Boolean)));
        const providerIds = Array.from(new Set(rows.map((j: any) => j.provider_id).filter(Boolean)));

        const [servicesRes, providersRes] = await Promise.all([
          serviceIds.length
            ? supabase.from('services').select('id, name').in('id', serviceIds)
            : Promise.resolve({ data: [], error: null } as any),
          providerIds.length
            ? supabase.from('profiles').select('id, first_name, last_name').in('id', providerIds)
            : Promise.resolve({ data: [], error: null } as any),
        ]);

        const serviceById = new Map<string, string>();
        if (!servicesRes.error) {
          for (const row of servicesRes.data || []) {
            serviceById.set(row.id, row.name || 'Service');
          }
        }

        const providerById = new Map<string, string>();
        if (!providersRes.error) {
          for (const row of providersRes.data || []) {
            const fullName = `${row.first_name || ''} ${row.last_name || ''}`.trim();
            providerById.set(row.id, fullName || 'Provider');
          }
        }

        setServices(rows.map((j: any) => ({
          id: j.id || '-',
          date: new Date(j.completed_at || j.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          service: serviceById.get(j.service_id) || j.service_id || 'Service',
          provider: providerById.get(j.provider_id) || 'Provider',
          location: j.pickup_address || '-',
          amount: Number(j.total_amount || j.base_price || 0),
          tip: Number(j.tip || 0),
          rating: Number(j.rating || 0),
          status: j.status,
        })));
      } catch (e: any) {
        console.warn('Failed to load service history:', e);
        setServices([]);
        setLoadError(e?.message || 'Could not load service history right now.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [user]);

  // Services loaded from Supabase in useEffect above

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
        <div className="max-w-2xl mx-auto p-6" style={{ paddingTop: 'var(--safe-top)' }}>
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
        {loadError && (
          <div className="glass rounded-[20px] p-4 border border-red-400/30">
            <p className="text-red-300 text-sm">{loadError}</p>
          </div>
        )}

        {/* Stats Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-[24px] p-6"
        >
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#008CE5] to-[#0070B8] flex items-center justify-center mx-auto mb-2">
                <Calendar className="w-6 h-6 text-white" />
              </div>
              <p className="text-white/60 text-xs mb-1">Total</p>
              <p className="text-white font-bold text-xl">{services.length}</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#008CE5] to-[#0070B8] flex items-center justify-center mx-auto mb-2">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
              <p className="text-white/60 text-xs mb-1">Spent</p>
              <p className="text-white font-bold text-xl">${totalSpent}</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#008CE5] to-[#0070B8] flex items-center justify-center mx-auto mb-2">
                <Star className="w-6 h-6 text-white" />
              </div>
              <p className="text-white/60 text-xs mb-1">Avg Rating</p>
              <p className="text-white font-bold text-xl">{services.length > 0 ? (services.reduce((sum, s) => sum + s.rating, 0) / services.filter(s => s.rating > 0).length || 0).toFixed(1) : '-'}</p>
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
                  ? 'bg-gradient-to-r from-[#008CE5] to-[#0070B8] text-white'
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
                    ? 'bg-[#008CE5]/20 text-[#008CE5]'
                    : 'bg-red-400/20 text-red-400'
                }`}>
                  {service.status === 'completed' ? '✓ Completed' : '✕ Cancelled'}
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-white/70 text-sm">
                  <MapPin className="w-4 h-4 text-[#008CE5]" />
                  {service.location}
                </div>
                <div className="flex items-center gap-2 text-white/70 text-sm">
                  <Clock className="w-4 h-4 text-[#0070B8]" />
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
                    <span className="text-[#008CE5] font-semibold">${service.tip}</span>
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
                              ? 'fill-[#008CE5] text-[#008CE5]'
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
                      className="flex-1 px-4 py-3 rounded-[16px] bg-gradient-to-r from-[#008CE5] to-[#0070B8] text-white font-semibold text-sm"
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
