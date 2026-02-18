import { motion } from 'motion/react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, MapPin, Phone, Navigation, Clock, Star, Wrench } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useState, useEffect } from 'react';
import { MapBackground } from '../../components/MapBackground';

export function ShopDetail() {
  const navigate = useNavigate();
  const { shopId } = useParams();
  const [shop, setShop] = useState(null);

  useEffect(() => {
    if (!shopId) return;

    async function fetchProvider() {
      try {
        const { data, error } = await supabase
          .from('provider_profiles')
          .select('*, profile:profiles(*)')
          .eq('id', shopId)
          .single();

        if (error) throw error;
        setShop(data);
      } catch (error) {
        console.warn('Error fetching provider:', error);
        setShop(null);
      }
    }

    fetchProvider();
  }, [shopId]);

  if (!shop) {
    return (
      <div className="min-h-screen relative overflow-hidden">
        <MapBackground />
        <div className="relative z-20 p-6 flex items-center gap-4">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate('/explore')}
            className="glass rounded-full p-3"
          >
            <ArrowLeft className="w-6 h-6 text-white" />
          </motion.button>
          <h1 className="text-2xl font-bold text-white">Shop Details</h1>
        </div>
        <div className="relative z-10 px-6 py-12">
          <div className="glass rounded-[32px] p-8 text-center">
            <p className="text-white/60">Provider not found</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      <MapBackground />

      {/* Header */}
      <div className="relative z-20 p-6 flex items-center gap-4">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate('/explore')}
          className="glass rounded-full p-3"
        >
          <ArrowLeft className="w-6 h-6 text-white" />
        </motion.button>
        <h1 className="text-2xl font-bold text-white">Shop Details</h1>
      </div>

      {/* Map preview */}
      <div className="relative z-10 flex items-center justify-center mt-12">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="w-24 h-24 rounded-full bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center"
          style={{
            boxShadow: '0 20px 40px rgba(46, 255, 175, 0.5)',
          }}
        >
          <MapPin className="w-12 h-12 text-[#0A0F1E]" />
        </motion.div>
      </div>

      {/* Bottom sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-30">
        <motion.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          className="glass rounded-t-[32px] p-6 border-t border-white/10 max-h-[70vh] overflow-y-auto"
        >
          {/* Shop info */}
          <div className="mb-6">
            <h2 className="text-white font-bold text-2xl mb-2">{shop.business_name || shop.profile?.full_name || 'Provider'}</h2>
            <p className="text-white/60 mb-4">{shop.business_type || 'Service Provider'}</p>

            <div className="flex items-center gap-4 mb-6">
              {shop.rating && (
                <>
                  <div className="flex items-center gap-1">
                    <Star className="w-5 h-5 text-[#2EFFAF] fill-[#2EFFAF]" />
                    <span className="text-white font-semibold">{shop.rating}</span>
                    {shop.review_count && (
                      <span className="text-white/60 text-sm">({shop.review_count} reviews)</span>
                    )}
                  </div>
                  <span className="text-white/40">•</span>
                </>
              )}
              {shop.distance && (
                <span className="text-[#2EFFAF] font-semibold">{shop.distance}</span>
              )}
            </div>

            {/* Quick actions */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-[24px] py-4 flex items-center justify-center gap-3 font-bold text-[#0A0F1E]"
              >
                <Phone className="w-5 h-5" />
                Call Shop
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="glass rounded-[24px] py-4 flex items-center justify-center gap-3 font-semibold text-white"
              >
                <Navigation className="w-5 h-5 text-[#2EFFAF]" />
                Get Directions
              </motion.button>
            </div>
          </div>

          {/* Contact info */}
          <div className="mb-6">
            <h3 className="text-white font-semibold text-lg mb-4">Contact Information</h3>
            <div className="space-y-4">
              {shop.address && (
                <div className="flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-[#2EFFAF]" />
                  <div>
                    <p className="text-white/60 text-sm">Address</p>
                    <p className="text-white font-semibold">{shop.address}</p>
                  </div>
                </div>
              )}
              {shop.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="w-5 h-5 text-[#2EFFAF]" />
                  <div>
                    <p className="text-white/60 text-sm">Phone</p>
                    <p className="text-white font-semibold">{shop.phone}</p>
                  </div>
                </div>
              )}
              {shop.business_hours && (
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-[#2EFFAF]" />
                  <div>
                    <p className="text-white/60 text-sm">Hours</p>
                    <p className="text-white font-semibold">{shop.business_hours}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Services */}
          {shop.services_offered && shop.services_offered.length > 0 && (
            <div className="mb-6">
              <h3 className="text-white font-semibold text-lg mb-4">Services Offered</h3>
              <div className="flex flex-wrap gap-2">
                {shop.services_offered.map((service: string, index: number) => (
                  <div
                    key={index}
                    className="px-4 py-2 glass rounded-full flex items-center gap-2"
                  >
                    <Wrench className="w-4 h-4 text-[#2EFFAF]" />
                    <span className="text-white text-sm">{service}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Request service here */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/who-needs-help')}
            className="w-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-[32px] py-5 font-bold text-[#0A0F1E] text-lg shadow-lg shadow-[#2EFFAF]/30"
          >
            Request Service Here
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
}
