import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { MapPin, Clock, DollarSign, Star, Download, Calendar } from 'lucide-react';
import { downloadJobReceipt } from '../../utils/downloadReceipt';
import { PageHeader } from '../../components/PageHeader';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { CustomerBottomNav } from '../../components/CustomerBottomNav';

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

const INITIAL_VISIBLE_SERVICES = 6;
const LOAD_MORE_STEP = 6;

export function ServiceHistory() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const textColor = isDark ? '#FFFFFF' : '#14263D';
  const subColor = isDark ? 'rgba(255,255,255,0.6)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2';
  const { user } = useAuth();
  const [filter, setFilter] = useState<'all' | 'completed' | 'cancelled'>('all');
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_SERVICES);

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

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_SERVICES);
  }, [filter, services.length]);

  const visibleServices = filteredServices.slice(0, visibleCount);
  const hasMoreServices = filteredServices.length > visibleCount;

  const totalSpent = services
    .filter(s => s.status === 'completed')
    .reduce((sum, s) => sum + s.amount + s.tip, 0);

  const formatWholeAmount = (value: number) => Math.round(value).toLocaleString('en-US');

  return (
    <div className="min-h-screen"
      style={{ background: isDark ? 'linear-gradient(180deg, #0A1626 0%, #081427 100%)' : 'linear-gradient(180deg, #F8FBFF 0%, #EAF2FF 100%)' , paddingBottom: 'calc(96px + var(--safe-bottom, 0px))' }}>
      <PageHeader title="Service History" onBack={() => navigate('/profile')} />

      <div className="max-w-2xl mx-auto p-6 space-y-6" style={{ paddingTop: 'calc(var(--safe-top) + 64px)' }}>
        {loadError && (
          <div className="rounded-[20px] p-4" style={{ backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#FEF2F2', border: '1px solid rgba(239,68,68,0.3)' }}>
            <p className="text-red-500 text-sm">{loadError}</p>
          </div>
        )}

        {/* Stats Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[24px] p-6"
          style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
        >
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#008CE5] to-[#0070B8] flex items-center justify-center mx-auto mb-2">
                <Calendar className="w-6 h-6 text-white" />
              </div>
              <p className="text-xs mb-1" style={{ color: subColor }}>Total</p>
              <p className="font-bold text-xl" style={{ color: textColor }}>{services.length}</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#008CE5] to-[#0070B8] flex items-center justify-center mx-auto mb-2">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
              <p className="text-xs mb-1" style={{ color: subColor }}>Spent</p>
              <p className="font-bold text-xl" style={{ color: textColor }}>${formatWholeAmount(totalSpent)}</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#008CE5] to-[#0070B8] flex items-center justify-center mx-auto mb-2">
                <Star className="w-6 h-6 text-white" />
              </div>
              <p className="text-xs mb-1" style={{ color: subColor }}>Avg Rating</p>
              <p className="font-bold text-xl" style={{ color: textColor }}>{services.length > 0 ? (services.reduce((sum, s) => sum + s.rating, 0) / services.filter(s => s.rating > 0).length || 0).toFixed(1) : '-'}</p>
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
                  : ''
              }`}
              style={filter !== f ? { backgroundColor: cardBg, border: `1px solid ${cardBorder}`, color: subColor } : undefined}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </motion.button>
          ))}
        </div>

        {/* Service List */}
        <div className="space-y-4">
          {visibleServices.map((service, index) => (
            <motion.div
              key={service.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="rounded-[24px] p-5"
              style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-bold text-lg mb-1" style={{ color: textColor }}>{service.service}</h3>
                  <p className="text-sm" style={{ color: subColor }}>{service.provider}</p>
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
                <div className="flex items-center gap-2 text-sm" style={{ color: subColor }}>
                  <MapPin className="w-4 h-4 text-[#008CE5]" />
                  {service.location}
                </div>
                <div className="flex items-center gap-2 text-sm" style={{ color: subColor }}>
                  <Clock className="w-4 h-4 text-[#0070B8]" />
                  {service.date}
                </div>
              </div>

              {service.status === 'completed' && (
                <>
                  <div className="flex items-center justify-between mb-3 pb-3" style={{ borderBottom: `1px solid ${cardBorder}` }}>
                    <span className="text-sm" style={{ color: subColor }}>Service</span>
                    <span className="font-semibold" style={{ color: textColor }}>${formatWholeAmount(service.amount)}</span>
                  </div>
                  <div className="flex items-center justify-between mb-3 pb-3" style={{ borderBottom: `1px solid ${cardBorder}` }}>
                    <span className="text-sm" style={{ color: subColor }}>Tip</span>
                    <span className="text-[#008CE5] font-semibold">${formatWholeAmount(service.tip)}</span>
                  </div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm" style={{ color: subColor }}>Total</span>
                    <span className="font-bold text-lg" style={{ color: textColor }}>${formatWholeAmount(service.amount + service.tip)}</span>
                  </div>

                  {/* Rating */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm" style={{ color: subColor }}>Your Rating:</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`w-4 h-4 ${
                            star <= service.rating
                              ? 'fill-[#008CE5] text-[#008CE5]'
                              : ''
                          }`}
                          style={star > service.rating ? { color: isDark ? 'rgba(255,255,255,0.2)' : '#D3E0F2' } : undefined}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => downloadJobReceipt({
                        id: service.id,
                        service: { name: service.service },
                        pickup_address: service.location,
                        completed_at: service.date,
                        total_amount: service.amount,
                        tip: service.tip,
                        provider: { first_name: service.provider },
                      })}
                      className="flex-1 px-4 py-3 rounded-[16px] font-semibold text-sm flex items-center justify-center gap-2"
                      style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', color: textColor }}
                    >
                      <Download className="w-4 h-4" />
                      Receipt
                    </motion.button>
                  </div>
                </>
              )}
            </motion.div>
          ))}
        </div>

        {hasMoreServices && (
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => setVisibleCount((count) => count + LOAD_MORE_STEP)}
            className="w-full px-4 py-3 rounded-[16px] font-semibold text-sm"
            style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}`, color: textColor }}
          >
            Load more ({Math.min(visibleCount, filteredServices.length)} of {filteredServices.length})
          </motion.button>
        )}

        {filteredServices.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <Calendar className="w-16 h-16 mx-auto mb-4" style={{ color: isDark ? 'rgba(255,255,255,0.2)' : '#D3E0F2' }} />
            <p style={{ color: subColor }}>No {filter} services found</p>
          </motion.div>
        )}
      </div>
      <CustomerBottomNav />
    </div>
  );
}
