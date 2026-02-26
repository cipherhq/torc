import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'motion/react';
import { MapPin, Star, Clock, Navigation, Search, Filter, ChevronRight, Phone, ExternalLink } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useGoogleMaps } from '../../context/GoogleMapsContext';
import { GoogleMap, Marker, InfoWindow } from '@react-google-maps/api';

interface Shop {
  place_id: string;
  name: string;
  vicinity: string;
  rating?: number;
  user_ratings_total?: number;
  opening_hours?: { open_now?: boolean };
  geometry: { location: { lat: () => number; lng: () => number } };
  photos?: google.maps.places.PlacePhoto[];
  distance?: number;
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#1A1F2E' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1A1F2E' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6B7280' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2A3040' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0E1621' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#1F2535' }] },
];

export function Explore() {
  const { isDark } = useTheme();
  const { isLoaded } = useGoogleMaps();
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPos, setCurrentPos] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [mapRef, setMapRef] = useState<google.maps.Map | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const textColor = isDark ? '#FFFFFF' : '#1A1F2E';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E8E4DE';

  // Get provider location
  useEffect(() => {
    if (!navigator.geolocation) {
      setCurrentPos({ lat: 40.7128, lng: -74.006 });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCurrentPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setCurrentPos({ lat: 40.7128, lng: -74.006 }),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  // Search for auto shops nearby
  const searchShops = useCallback(() => {
    if (!isLoaded || !currentPos || !mapRef) return;

    setLoading(true);
    const service = new google.maps.places.PlacesService(mapRef);

    const request: google.maps.places.PlaceSearchRequest = {
      location: new google.maps.LatLng(currentPos.lat, currentPos.lng),
      radius: 48280, // 30 miles in meters
      type: 'car_repair',
      keyword: searchQuery || 'auto shop mechanic',
    };

    service.nearbySearch(request, (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results) {
        const withDistance = results.map((place) => ({
          ...place,
          distance: haversineDistance(
            currentPos.lat, currentPos.lng,
            place.geometry!.location!.lat(), place.geometry!.location!.lng()
          ),
        })) as Shop[];
        withDistance.sort((a, b) => (a.distance || 0) - (b.distance || 0));
        setShops(withDistance);
      } else {
        setShops([]);
      }
      setLoading(false);
    });
  }, [isLoaded, currentPos, mapRef, searchQuery]);

  useEffect(() => {
    searchShops();
  }, [searchShops]);

  const handleShopTap = (shop: Shop) => {
    setSelectedShop(shop);
    if (mapRef) {
      mapRef.panTo({
        lat: shop.geometry.location.lat(),
        lng: shop.geometry.location.lng(),
      });
      mapRef.setZoom(15);
    }
  };

  const openDirections = (shop: Shop) => {
    const lat = shop.geometry.location.lat();
    const lng = shop.geometry.location.lng();
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: isDark ? '#0F1419' : '#FAF8F5' }}>
      {/* Header */}
      <div className="p-6 pb-3" style={{ paddingTop: 'var(--safe-top)' }}>
        <h1 className="text-2xl font-bold mb-4" style={{ color: textColor }}>Explore Shops</h1>

        {/* Search bar */}
        <div className="flex items-center gap-3 rounded-2xl px-4 py-3"
          style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF', border: `1px solid ${cardBorder}` }}
        >
          <Search className="w-5 h-5 flex-shrink-0" style={{ color: '#008CE5' }} />
          <input
            type="text"
            placeholder="Search auto shops, mechanics..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchShops()}
            className="flex-1 bg-transparent text-base"
            style={{ color: textColor }}
          />
        </div>
      </div>

      {/* Map */}
      <div className="px-4 mb-3">
        <div className="rounded-2xl overflow-hidden" style={{ height: 220, border: `1px solid ${cardBorder}` }}>
          {isLoaded && currentPos ? (
            <GoogleMap
              mapContainerStyle={{ width: '100%', height: '100%' }}
              center={currentPos}
              zoom={11}
              onLoad={(map) => setMapRef(map)}
              options={{
                disableDefaultUI: true,
                zoomControl: false,
                styles: isDark ? darkMapStyle : [],
                gestureHandling: 'greedy',
              }}
            >
              {/* Provider marker */}
              <Marker
                position={currentPos}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 8,
                  fillColor: '#008CE5',
                  fillOpacity: 1,
                  strokeColor: '#FFFFFF',
                  strokeWeight: 3,
                }}
              />

              {/* Shop markers */}
              {shops.map((shop) => (
                <Marker
                  key={shop.place_id}
                  position={{
                    lat: shop.geometry.location.lat(),
                    lng: shop.geometry.location.lng(),
                  }}
                  onClick={() => setSelectedShop(shop)}
                  icon={{
                    path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',
                    fillColor: selectedShop?.place_id === shop.place_id ? '#008CE5' : '#0070B8',
                    fillOpacity: 1,
                    strokeColor: '#FFFFFF',
                    strokeWeight: 1,
                    scale: 1.5,
                    anchor: new google.maps.Point(12, 22),
                  }}
                />
              ))}

              {selectedShop && (
                <InfoWindow
                  position={{
                    lat: selectedShop.geometry.location.lat(),
                    lng: selectedShop.geometry.location.lng(),
                  }}
                  onCloseClick={() => setSelectedShop(null)}
                >
                  <div style={{ padding: 4, maxWidth: 200 }}>
                    <p style={{ fontWeight: 'bold', fontSize: 14, marginBottom: 2 }}>{selectedShop.name}</p>
                    {selectedShop.rating && (
                      <p style={{ fontSize: 12, color: '#666' }}>
                        ⭐ {selectedShop.rating} ({selectedShop.user_ratings_total || 0} reviews)
                      </p>
                    )}
                    <p style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{selectedShop.vicinity}</p>
                  </div>
                </InfoWindow>
              )}
            </GoogleMap>
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: isDark ? '#1A1F2E' : '#F5F2ED' }}>
              <div className="w-8 h-8 border-3 border-[#008CE5] border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* Results count */}
      <div className="px-6 mb-2 flex items-center justify-between">
        <p className="text-sm font-medium" style={{ color: subColor }}>
          {loading ? 'Searching...' : `${shops.length} shops within 30 miles`}
        </p>
      </div>

      {/* Shop list */}
      <div ref={listRef} className="flex-1 overflow-auto px-4 space-y-3" style={{ paddingBottom: 'calc(100px + var(--safe-bottom, 20px))' }}>
        {loading ? (
          <div className="flex flex-col items-center py-12">
            <div className="w-10 h-10 border-3 border-[#008CE5] border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm" style={{ color: subColor }}>Finding nearby auto shops...</p>
          </div>
        ) : shops.length === 0 ? (
          <div className="text-center py-12">
            <MapPin className="w-12 h-12 mx-auto mb-3" style={{ color: subColor }} />
            <p className="font-medium" style={{ color: textColor }}>No shops found nearby</p>
            <p className="text-sm mt-1" style={{ color: subColor }}>Try adjusting your search</p>
          </div>
        ) : (
          shops.map((shop, idx) => (
            <motion.button
              key={shop.place_id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03 }}
              onClick={() => handleShopTap(shop)}
              className="w-full rounded-2xl p-4 text-left flex items-start gap-3"
              style={{
                backgroundColor: selectedShop?.place_id === shop.place_id
                  ? (isDark ? 'rgba(78,205,196,0.1)' : 'rgba(78,205,196,0.08)')
                  : cardBg,
                border: `1px solid ${selectedShop?.place_id === shop.place_id ? '#008CE5' : cardBorder}`,
              }}
            >
              {/* Icon */}
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: isDark ? 'rgba(78,205,196,0.15)' : 'rgba(78,205,196,0.1)' }}
              >
                <MapPin className="w-6 h-6" style={{ color: '#008CE5' }} />
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate" style={{ color: textColor }}>{shop.name}</p>
                <p className="text-sm truncate mt-0.5" style={{ color: subColor }}>{shop.vicinity}</p>

                <div className="flex items-center gap-3 mt-2">
                  {shop.rating && (
                    <div className="flex items-center gap-1">
                      <Star className="w-3.5 h-3.5" style={{ color: '#F59E0B', fill: '#F59E0B' }} />
                      <span className="text-xs font-medium" style={{ color: textColor }}>
                        {shop.rating}
                      </span>
                      <span className="text-xs" style={{ color: subColor }}>
                        ({shop.user_ratings_total || 0})
                      </span>
                    </div>
                  )}
                  {shop.opening_hours && (
                    <div className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" style={{ color: shop.opening_hours.open_now ? '#22C55E' : '#EF4444' }} />
                      <span className="text-xs font-medium" style={{ color: shop.opening_hours.open_now ? '#22C55E' : '#EF4444' }}>
                        {shop.opening_hours.open_now ? 'Open' : 'Closed'}
                      </span>
                    </div>
                  )}
                  {shop.distance !== undefined && (
                    <div className="flex items-center gap-1">
                      <Navigation className="w-3.5 h-3.5" style={{ color: '#008CE5' }} />
                      <span className="text-xs" style={{ color: subColor }}>
                        {shop.distance < 1 ? `${(shop.distance * 5280).toFixed(0)} ft` : `${shop.distance.toFixed(1)} mi`}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Directions button */}
              <button
                onClick={(e) => { e.stopPropagation(); openDirections(shop); }}
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-1"
                style={{ backgroundColor: isDark ? 'rgba(78,205,196,0.15)' : 'rgba(78,205,196,0.1)' }}
              >
                <ExternalLink className="w-4 h-4" style={{ color: '#008CE5' }} />
              </button>
            </motion.button>
          ))
        )}
      </div>
    </div>
  );
}
