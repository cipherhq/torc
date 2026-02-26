import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { CustomerBottomNav } from '../../components/CustomerBottomNav';
import { Search, MapPin, Phone, Navigation, Star, SlidersHorizontal, Wrench, Car } from 'lucide-react';
import { useLocation as useLocationCtx } from '../../context/LocationContext';
import { useGoogleMaps } from '../../context/GoogleMapsContext';
import { useTheme } from '../../context/ThemeContext';
import { GoogleMap, MarkerF } from '@react-google-maps/api';
import { useState, useEffect, useCallback, useRef } from 'react';

interface NearbyShop {
  place_id: string;
  name: string;
  vicinity: string;
  rating: number;
  user_ratings_total: number;
  distance: number;
  distanceText: string;
  lat: number;
  lng: number;
  open_now?: boolean;
  phone?: string;
  types: string[];
}

const MILE_IN_METERS = 1609.34;

function getDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getShopType(types: string[]): string {
  if (types.includes('car_repair')) return 'Auto Repair';
  if (types.includes('car_dealer')) return 'Car Dealer';
  if (types.includes('car_wash')) return 'Car Wash';
  if (types.includes('gas_station')) return 'Gas Station';
  if (types.includes('parking')) return 'Parking';
  return 'Auto Service';
}

const darkMapStyles = [
  { elementType: 'geometry', stylers: [{ color: '#1A1F2E' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1A1F2E' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6B7280' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2A3441' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#252B3D' }] },
];

export function Explore() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { currentLocation, requestPermission } = useLocationCtx();
  const { isLoaded } = useGoogleMaps();
  const [view, setView] = useState<'map' | 'list'>('list');
  const [search, setSearch] = useState('');
  const [shops, setShops] = useState<NearbyShop[]>([]);
  const [loading, setLoading] = useState(true);
  const [maxDistance, setMaxDistance] = useState(25);
  const [showFilter, setShowFilter] = useState(false);
  const [selectedShop, setSelectedShop] = useState<NearbyShop | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const serviceRef = useRef<google.maps.places.PlacesService | null>(null);

  const textColor = isDark ? '#FFFFFF' : '#1A1F2E';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E8E4DE';
  const pageBg = isDark ? '#0F1419' : '#FAF8F5';

  useEffect(() => {
    if (!currentLocation) {
      requestPermission();
    }
  }, []);

  useEffect(() => {
    if (isLoaded && currentLocation && map) {
      searchNearbyShops();
    }
  }, [isLoaded, currentLocation, map]);

  const onMapLoad = useCallback((mapInstance: google.maps.Map) => {
    setMap(mapInstance);
    serviceRef.current = new google.maps.places.PlacesService(mapInstance);
  }, []);

  const searchNearbyShops = () => {
    if (!serviceRef.current || !currentLocation) return;
    setLoading(true);

    const searchTypes = ['car_repair', 'car_dealer', 'car_wash'];
    const allResults: NearbyShop[] = [];
    let completed = 0;

    searchTypes.forEach(type => {
      serviceRef.current!.nearbySearch(
        {
          location: { lat: currentLocation.latitude, lng: currentLocation.longitude },
          radius: 25 * MILE_IN_METERS,
          type: type,
        },
        (results, status) => {
          completed++;
          if (status === google.maps.places.PlacesServiceStatus.OK && results) {
            results.forEach(place => {
              if (!place.geometry?.location) return;
              const lat = place.geometry.location.lat();
              const lng = place.geometry.location.lng();
              const dist = getDistanceMiles(currentLocation.latitude, currentLocation.longitude, lat, lng);

              if (!allResults.find(s => s.place_id === place.place_id)) {
                allResults.push({
                  place_id: place.place_id!,
                  name: place.name || 'Unknown',
                  vicinity: place.vicinity || '',
                  rating: place.rating || 0,
                  user_ratings_total: place.user_ratings_total || 0,
                  distance: dist,
                  distanceText: dist < 1 ? `${(dist * 5280).toFixed(0)} ft` : `${dist.toFixed(1)} mi`,
                  lat,
                  lng,
                  open_now: place.opening_hours?.isOpen?.() ?? undefined,
                  types: place.types || [],
                });
              }
            });
          }

          if (completed === searchTypes.length) {
            allResults.sort((a, b) => a.distance - b.distance);
            setShops(allResults);
            setLoading(false);
          }
        }
      );
    });

    // Also search with keyword "mechanic" for broader results
    serviceRef.current.nearbySearch(
      {
        location: { lat: currentLocation.latitude, lng: currentLocation.longitude },
        radius: 25 * MILE_IN_METERS,
        keyword: 'auto mechanic',
      },
      (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results) {
          results.forEach(place => {
            if (!place.geometry?.location) return;
            const lat = place.geometry.location.lat();
            const lng = place.geometry.location.lng();
            const dist = getDistanceMiles(currentLocation.latitude, currentLocation.longitude, lat, lng);

            if (!allResults.find(s => s.place_id === place.place_id)) {
              allResults.push({
                place_id: place.place_id!,
                name: place.name || 'Unknown',
                vicinity: place.vicinity || '',
                rating: place.rating || 0,
                user_ratings_total: place.user_ratings_total || 0,
                distance: dist,
                distanceText: dist < 1 ? `${(dist * 5280).toFixed(0)} ft` : `${dist.toFixed(1)} mi`,
                lat,
                lng,
                open_now: place.opening_hours?.isOpen?.() ?? undefined,
                types: place.types || [],
              });
            }
          });
          allResults.sort((a, b) => a.distance - b.distance);
          setShops([...allResults]);
        }
      }
    );
  };

  const filteredShops = shops
    .filter(s => s.distance <= maxDistance)
    .filter(s =>
      search === '' ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.vicinity.toLowerCase().includes(search.toLowerCase())
    );

  const center = currentLocation
    ? { lat: currentLocation.latitude, lng: currentLocation.longitude }
    : { lat: 37.7749, lng: -122.4194 };

  return (
    <div className="min-h-screen pb-24" style={{ background: pageBg }}>
      {/* Hidden map for PlacesService (needed even in list view) */}
      {isLoaded && (
        <div style={{ width: 0, height: 0, overflow: 'hidden', position: 'absolute' }}>
          <GoogleMap
            mapContainerStyle={{ width: '1px', height: '1px' }}
            center={center}
            zoom={12}
            onLoad={onMapLoad}
          />
        </div>
      )}

      {/* Header */}
      <div className="p-6 pb-2" style={{ paddingTop: 'var(--safe-top)' }}>
        <div className="flex items-center gap-3 mb-4">
          <h1 className="text-2xl font-bold flex-1" style={{ color: textColor }}>Explore</h1>
          <button onClick={() => setShowFilter(!showFilter)} className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: showFilter ? 'rgba(0,140,229,0.15)' : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)') }}>
            <SlidersHorizontal className="w-5 h-5" style={{ color: showFilter ? '#008CE5' : subColor }} />
          </button>
          <div className="flex rounded-xl overflow-hidden" style={{ border: `1px solid ${cardBorder}` }}>
            <button onClick={() => setView('list')} className="px-4 py-2 text-sm font-semibold transition-all" style={{ backgroundColor: view === 'list' ? '#008CE5' : 'transparent', color: view === 'list' ? '#0F1419' : subColor }}>
              List
            </button>
            <button onClick={() => setView('map')} className="px-4 py-2 text-sm font-semibold transition-all" style={{ backgroundColor: view === 'map' ? '#008CE5' : 'transparent', color: view === 'map' ? '#0F1419' : subColor }}>
              Map
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center gap-3 rounded-2xl px-4 py-3 mb-3" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF', border: `1px solid ${cardBorder}` }}>
          <Search className="w-5 h-5" style={{ color: subColor }} />
          <input type="text" placeholder="Search auto shops, mechanics..." value={search} onChange={e => setSearch(e.target.value)} className="flex-1 bg-transparent outline-none text-sm" style={{ color: textColor }} />
        </div>

        {/* Distance filter */}
        {showFilter && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="rounded-2xl p-4 mb-3" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium" style={{ color: textColor }}>Distance</p>
              <p className="text-sm font-bold" style={{ color: '#008CE5' }}>{maxDistance} miles</p>
            </div>
            <input type="range" min={1} max={25} value={maxDistance} onChange={e => setMaxDistance(parseInt(e.target.value))} className="w-full accent-[#008CE5]" />
            <div className="flex justify-between text-xs mt-1" style={{ color: subColor }}>
              <span>1 mi</span><span>10 mi</span><span>25 mi</span>
            </div>
          </motion.div>
        )}

        {/* Results count */}
        <div className="flex items-center justify-between px-1">
          <p className="text-sm" style={{ color: subColor }}>
            {loading ? 'Searching nearby...' : `${filteredShops.length} shops found within ${maxDistance} mi`}
          </p>
        </div>
      </div>

      {/* Map View */}
      {view === 'map' && isLoaded && (
        <div className="mx-6 mb-4 rounded-2xl overflow-hidden" style={{ height: '300px', border: `1px solid ${cardBorder}` }}>
          <GoogleMap
            mapContainerStyle={{ width: '100%', height: '100%' }}
            center={center}
            zoom={11}
            options={{ styles: isDark ? darkMapStyles : [], disableDefaultUI: true, zoomControl: true }}
          >
            {/* User marker */}
            {currentLocation && (
              <MarkerF position={{ lat: currentLocation.latitude, lng: currentLocation.longitude }} icon={{ path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#008CE5', fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 3 }} />
            )}
            {/* Shop markers */}
            {filteredShops.map(shop => (
              <MarkerF key={shop.place_id} position={{ lat: shop.lat, lng: shop.lng }}
                onClick={() => setSelectedShop(shop)}
                icon={{ path: google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: '#0070B8', fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 2 }}
              />
            ))}
          </GoogleMap>
        </div>
      )}

      {/* Selected shop from map */}
      {view === 'map' && selectedShop && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mx-6 mb-4 rounded-2xl p-4" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(0,140,229,0.1)' }}>
              <Wrench className="w-5 h-5" style={{ color: '#008CE5' }} />
            </div>
            <div className="flex-1">
              <p className="font-semibold" style={{ color: textColor }}>{selectedShop.name}</p>
              <p className="text-xs" style={{ color: subColor }}>{selectedShop.vicinity}</p>
            </div>
            <span className="text-sm font-bold" style={{ color: '#008CE5' }}>{selectedShop.distanceText}</span>
          </div>
        </motion.div>
      )}

      {/* List */}
      <div className="px-6">
        {loading ? (
          <div className="text-center py-16">
            <div className="w-10 h-10 border-3 border-[#008CE5] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm" style={{ color: subColor }}>Finding nearby auto shops...</p>
          </div>
        ) : !currentLocation ? (
          <div className="text-center py-16">
            <MapPin className="w-14 h-14 mx-auto mb-4" style={{ color: subColor }} />
            <p className="font-semibold text-lg mb-2" style={{ color: textColor }}>Location needed</p>
            <p className="text-sm mb-6" style={{ color: subColor }}>Enable location to find nearby shops</p>
            <button onClick={() => requestPermission()} className="px-6 py-3 rounded-xl bg-[#008CE5] text-white font-bold text-sm">
              Enable Location
            </button>
          </div>
        ) : filteredShops.length === 0 ? (
          <div className="text-center py-16">
            <Car className="w-14 h-14 mx-auto mb-4" style={{ color: subColor }} />
            <p className="font-semibold text-lg mb-1" style={{ color: textColor }}>No shops found</p>
            <p className="text-sm" style={{ color: subColor }}>Try increasing the distance or adjusting your search</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredShops.map((shop, i) => (
              <motion.div key={shop.place_id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className="rounded-2xl p-4" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}`, boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.04)' }}
              >
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(0,140,229,0.1)' }}>
                    <Wrench className="w-6 h-6" style={{ color: '#008CE5' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold truncate" style={{ color: textColor }}>{shop.name}</h3>
                        <p className="text-xs truncate" style={{ color: subColor }}>{shop.vicinity}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold" style={{ color: '#008CE5' }}>{shop.distanceText}</p>
                        {shop.open_now !== undefined && (
                          <p className="text-xs font-medium" style={{ color: shop.open_now ? '#22C55E' : '#EF4444' }}>
                            {shop.open_now ? 'Open' : 'Closed'}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 mt-2">
                      {shop.rating > 0 && (
                        <div className="flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                          <span className="text-sm font-semibold" style={{ color: textColor }}>{shop.rating}</span>
                          <span className="text-xs" style={{ color: subColor }}>({shop.user_ratings_total})</span>
                        </div>
                      )}
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F5F2ED', color: subColor }}>
                        {getShopType(shop.types)}
                      </span>
                    </div>

                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${shop.lat},${shop.lng}`, '_blank')}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
                        style={{ backgroundColor: 'rgba(0,140,229,0.1)', color: '#008CE5' }}
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        Directions
                      </button>
                      <button
                        onClick={() => window.open(`https://www.google.com/maps/place/?q=place_id:${shop.place_id}`, '_blank')}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
                        style={{ backgroundColor: 'rgba(0,122,255,0.1)', color: '#0070B8' }}
                      >
                        <Phone className="w-3.5 h-3.5" />
                        Details
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <CustomerBottomNav />
    </div>
  );
}
