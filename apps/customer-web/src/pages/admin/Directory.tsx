import { motion } from 'motion/react';
import { MapPin, Search, Star, Loader2, Wifi, WifiOff } from 'lucide-react';
import { AdminLayout } from '../../components/AdminLayout';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';

interface ProviderListing {
  id: string;
  name: string;
  email: string;
  services: string[];
  rating: number;
  totalJobs: number;
  isOnline: boolean;
  isVerified: boolean;
  joinedDate: string;
}

export function AdminDirectory() {
  const [listings, setListings] = useState<ProviderListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'online' | 'verified'>('all');

  useEffect(() => {
    async function loadProviders() {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('provider_profiles')
          .select('id, is_verified, is_online, total_jobs, rating, services, created_at, user:profiles(full_name, email)')
          .order('created_at', { ascending: false });

        if (error) throw error;

        // Load service names
        const { data: serviceRows } = await supabase.from('services').select('id, name');
        const serviceMap = new Map<string, string>();
        (serviceRows || []).forEach((s: any) => serviceMap.set(s.id, s.name));

        const formatted: ProviderListing[] = (data || []).map((p: any) => {
          const name = p.user?.full_name || p.user?.email?.split('@')[0] || 'Unknown';
          const svcIds: string[] = p.services || [];
          const svcNames = svcIds.map((id: string) => serviceMap.get(id) || id);

          return {
            id: p.id,
            name,
            email: p.user?.email || '-',
            services: svcNames,
            rating: p.rating || 0,
            totalJobs: p.total_jobs || 0,
            isOnline: !!p.is_online,
            isVerified: !!p.is_verified,
            joinedDate: new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
          };
        });

        setListings(formatted);
      } catch (error) {
        console.warn('Failed to load provider directory:', error);
      } finally {
        setLoading(false);
      }
    }
    loadProviders();
  }, []);

  const filtered = useMemo(() => {
    let result = listings;
    if (filter === 'online') result = result.filter(l => l.isOnline);
    if (filter === 'verified') result = result.filter(l => l.isVerified);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(l =>
        l.name.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q) ||
        l.services.some(s => s.toLowerCase().includes(q))
      );
    }
    return result;
  }, [listings, filter, searchQuery]);

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Provider Directory</h1>
          <p className="text-white/60">{listings.length} registered providers</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
            <input
              type="text"
              placeholder="Search by name, email, or service..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:border-[#008CE5]/50"
            />
          </div>
          {(['all', 'online', 'verified'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-5 py-3 rounded-2xl font-semibold text-sm transition-all ${
                filter === f
                  ? 'bg-gradient-to-r from-[#008CE5] to-[#0070B8] text-white'
                  : 'bg-white/5 text-white/60 hover:bg-white/10'
              }`}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-[#008CE5] animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass-light rounded-[24px] p-8 text-center">
            <p className="text-white/60">No providers found.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((listing, index) => (
              <motion.div
                key={listing.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.03, 0.3) }}
                className="glass-light rounded-[24px] p-5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#008CE5]/20 to-[#0070B8]/20 flex items-center justify-center">
                      <MapPin className="w-6 h-6 text-[#008CE5]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-white font-semibold">{listing.name}</h3>
                        {listing.isVerified && (
                          <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs font-semibold">
                            Verified
                          </span>
                        )}
                        {!listing.isVerified && (
                          <span className="px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 text-xs font-semibold">
                            Pending
                          </span>
                        )}
                      </div>
                      <p className="text-white/50 text-sm">{listing.email}</p>
                      {listing.services.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {listing.services.slice(0, 4).map((svc) => (
                            <span key={svc} className="px-2 py-0.5 rounded-full bg-white/5 text-white/60 text-xs">
                              {svc}
                            </span>
                          ))}
                          {listing.services.length > 4 && (
                            <span className="px-2 py-0.5 rounded-full bg-white/5 text-white/40 text-xs">
                              +{listing.services.length - 4} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-center">
                      <div className="flex items-center gap-1 text-yellow-400">
                        <Star className="w-4 h-4 fill-current" />
                        <span className="font-semibold">{listing.rating > 0 ? listing.rating.toFixed(1) : '-'}</span>
                      </div>
                      <p className="text-white/40 text-xs mt-0.5">Rating</p>
                    </div>
                    <div className="text-center">
                      <p className="text-white font-semibold">{listing.totalJobs}</p>
                      <p className="text-white/40 text-xs mt-0.5">Jobs</p>
                    </div>
                    <div className="text-center">
                      <p className="text-white/50 text-xs">{listing.joinedDate}</p>
                      <p className="text-white/40 text-xs mt-0.5">Joined</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {listing.isOnline ? (
                        <>
                          <Wifi className="w-4 h-4 text-green-400" />
                          <span className="text-green-400 text-xs font-semibold">Online</span>
                        </>
                      ) : (
                        <>
                          <WifiOff className="w-4 h-4 text-white/30" />
                          <span className="text-white/30 text-xs">Offline</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
