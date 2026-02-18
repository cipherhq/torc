import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Search, CheckCircle, Clock, XCircle, MoreHorizontal } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface Provider {
  id: string;
  name: string;
  status: string;
  rating: number;
  jobs: number;
  joined: string;
  verification: string;
}

export function AdminProviders() {
  const navigate = useNavigate();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function loadProviders() {
      try {
        setLoading(true);
        
        const { data, error } = await supabase
          .from('provider_profiles')
          .select(`
            id,
            is_verified,
            total_jobs,
            rating,
            created_at,
            user:profiles(full_name, email)
          `)
          .order('created_at', { ascending: false });

        if (error) throw error;

        const formattedProviders: Provider[] = (data || []).map((provider: any) => {
          const name = provider.user?.full_name || provider.user?.email?.split('@')[0] || 'Unknown';
          const joined = new Date(provider.created_at).toLocaleDateString('en-US', { 
            month: 'short', 
            year: 'numeric' 
          });
          
          return {
            id: provider.id,
            name,
            status: provider.is_verified ? 'active' : 'pending',
            rating: provider.rating || 0,
            jobs: provider.total_jobs || 0,
            joined,
            verification: provider.is_verified ? 'verified' : 'pending',
          };
        });

        setProviders(formattedProviders);
      } catch (error) {
        console.warn('Failed to load providers:', error);
        setProviders([]);
      } finally {
        setLoading(false);
      }
    }
    loadProviders();
  }, []);

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <div className="bg-gradient-to-r from-[#1A1F2E] to-[#2F3548] p-8">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate('/admin')}
            className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center"
          >
            <ArrowLeft className="w-6 h-6 text-white" />
          </motion.button>
          <h1 className="text-3xl font-bold text-white">Provider Management</h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-8">
        <div className="bg-white rounded-3xl p-6 shadow-lg">
          <div className="flex items-center gap-3 mb-6">
            <Search className="w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search providers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent text-gray-900 placeholder-gray-400 focus:outline-none"
            />
          </div>

          {loading ? (
            <div className="p-12 text-center">
              <p className="text-gray-600">Loading providers...</p>
            </div>
          ) : providers.filter(p => 
            !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase())
          ).length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-600">No providers found</p>
            </div>
          ) : (
          <div className="space-y-4">
            {providers
              .filter(p => !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()))
              .map((provider) => (
              <div key={provider.id} className="p-5 rounded-2xl bg-gray-50 hover:bg-gray-100 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center">
                      <span className="text-white font-bold">{provider.name[0]}</span>
                    </div>
                    <div>
                      <h3 className="text-gray-900 font-semibold">{provider.name}</h3>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-sm text-gray-600">{provider.jobs} jobs</span>
                        {provider.rating > 0 && (
                          <span className="text-sm text-gray-600">⭐ {provider.rating}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {provider.verification === 'verified' ? (
                      <span className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-sm font-semibold flex items-center gap-1">
                        <CheckCircle className="w-4 h-4" /> Verified
                      </span>
                    ) : (
                      <span className="px-3 py-1 rounded-full bg-yellow-100 text-yellow-700 text-sm font-semibold flex items-center gap-1">
                        <Clock className="w-4 h-4" /> Pending
                      </span>
                    )}
                    <button className="p-2 hover:bg-gray-200 rounded-xl">
                      <MoreHorizontal className="w-5 h-5 text-gray-600" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
