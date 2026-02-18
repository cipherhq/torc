import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { BottomNav } from '../../components/BottomNav';
import { MapBackground } from '../../components/MapBackground';
import { Search, MapPin, Phone, Navigation, Star } from 'lucide-react';
import { mockShops } from '../../data/mockData';
import { useState } from 'react';

export function Explore() {
  const navigate = useNavigate();
  const [view, setView] = useState<'map' | 'list'>('map');
  const [search, setSearch] = useState('');

  const filteredShops = mockShops.filter(shop =>
    shop.name.toLowerCase().includes(search.toLowerCase()) ||
    shop.type.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen pb-24 relative overflow-hidden">
      {view === 'map' && <MapBackground />}
      {view === 'list' && (
        <>
          <div className="absolute inset-0 bg-[#0A0F1E]" />
          <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-[#2EFFAF] opacity-10 blur-[120px] rounded-full" />
        </>
      )}

      {/* Header with search */}
      <div className="relative z-20 p-6">
        <div className="flex items-center gap-3 mb-4">
          <h1 className="text-3xl font-bold text-white flex-1">Explore</h1>
          
          {/* View toggle */}
          <div className="glass rounded-full p-1 flex">
            <button
              onClick={() => setView('map')}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                view === 'map'
                  ? 'bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0A0F1E]'
                  : 'text-white/60'
              }`}
            >
              Map
            </button>
            <button
              onClick={() => setView('list')}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                view === 'list'
                  ? 'bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0A0F1E]'
                  : 'text-white/60'
              }`}
            >
              List
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="glass rounded-[24px] px-4 py-3 flex items-center gap-3">
          <Search className="w-5 h-5 text-white/40" />
          <input
            type="text"
            placeholder="Search shops, services..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-white placeholder-white/40 focus:outline-none"
          />
        </div>
      </div>

      {/* Map view with pins */}
      {view === 'map' && (
        <div className="relative z-10 px-6">
          <div className="flex items-center justify-center min-h-[300px]">
            {filteredShops.map((shop, i) => (
              <motion.button
                key={shop.id}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.1 }}
                onClick={() => navigate(`/shop/${shop.id}`)}
                className="absolute"
                style={{
                  left: `${30 + i * 25}%`,
                  top: `${40 + (i % 2) * 30}%`,
                }}
              >
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center shadow-lg shadow-[#2EFFAF]/50">
                  <MapPin className="w-6 h-6 text-[#0A0F1E]" />
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {/* Bottom sheet with shops */}
      <div className={`fixed ${view === 'map' ? 'bottom-24' : 'bottom-24 top-48'} left-0 right-0 z-30`}>
        <div className={`${view === 'list' ? 'h-full overflow-y-auto' : ''}`}>
          <motion.div
            initial={{ y: view === 'map' ? 100 : 0 }}
            animate={{ y: 0 }}
            className={`glass ${view === 'map' ? 'rounded-t-[32px]' : 'rounded-[32px] mx-6'} p-6 border-t border-white/10`}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-white font-semibold text-lg">Nearby Shops</h2>
              <span className="text-[#2EFFAF] text-sm font-semibold">
                {filteredShops.length} found
              </span>
            </div>

            <div className="space-y-4">
              {filteredShops.map((shop, index) => (
                <motion.div
                  key={shop.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate(`/shop/${shop.id}`)}
                  className="w-full glass rounded-[24px] p-5 text-left cursor-pointer"
                >
                  <div className="flex items-start gap-4">
                    <div 
                      className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#2EFFAF]/20 to-[#007AFF]/20 flex items-center justify-center flex-shrink-0"
                      style={{
                        boxShadow: '0 4px 16px rgba(46, 255, 175, 0.2)',
                      }}
                    >
                      <MapPin className="w-8 h-8 text-[#2EFFAF]" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="text-white font-semibold text-lg">{shop.name}</h3>
                          <p className="text-white/60 text-sm">{shop.type}</p>
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          <p className="text-[#2EFFAF] text-sm font-semibold">{shop.distance}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 mb-3">
                        <div className="flex items-center gap-1">
                          <Star className="w-4 h-4 text-[#2EFFAF] fill-[#2EFFAF]" />
                          <span className="text-white font-semibold text-sm">{shop.rating}</span>
                          <span className="text-white/60 text-sm">({shop.reviews})</span>
                        </div>
                        <span className="text-white/60 text-sm">{shop.hours}</span>
                      </div>

                      <div className="flex gap-2">
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                          className="px-4 py-2 rounded-xl bg-[#2EFFAF]/20 text-[#2EFFAF] text-sm font-semibold flex items-center gap-2"
                        >
                          <Phone className="w-4 h-4" />
                          Call
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                          className="px-4 py-2 rounded-xl bg-[#007AFF]/20 text-[#007AFF] text-sm font-semibold flex items-center gap-2"
                        >
                          <Navigation className="w-4 h-4" />
                          Navigate
                        </motion.button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}