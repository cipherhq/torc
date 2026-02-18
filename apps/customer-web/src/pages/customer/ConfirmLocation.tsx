import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, MapPin, AlertTriangle, Navigation2, Search, X, LocateFixed, MapPinOff } from 'lucide-react';
import { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleMap, MarkerF, Autocomplete } from '@react-google-maps/api';
import { useGoogleMaps } from '../../context/GoogleMapsContext';
import { useLocation as useLocationCtx } from '../../context/LocationContext';
import { useJob } from '../../context/JobContext';
import { useTheme } from '../../context/ThemeContext';

const mapContainerStyle = { width: '100%', height: '100%' };

const darkMapStyles = [
  { elementType: 'geometry', stylers: [{ color: '#1A1F2E' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1A1F2E' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6B7280' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2A3441' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#323B4C' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#252B3D' }] },
];

const lightMapStyles = [
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
];

const defaultCenter = { lat: 37.7749, lng: -122.4194 };

export function ConfirmLocation() {
  const navigate = useNavigate();
  const { isLoaded } = useGoogleMaps();
  const {
    currentLocation,
    address: ctxAddress,
    getCurrentLocation,
    permissionStatus,
    requestPermission,
    loading: locationLoading,
  } = useLocationCtx();
  const { updateJobDetails } = useJob();
  const { isDark } = useTheme();

  const [isHazardous, setIsHazardous] = useState(false);
  const [address, setAddress] = useState('');
  const [markerPos, setMarkerPos] = useState<google.maps.LatLngLiteral | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [showPermissionBanner, setShowPermissionBanner] = useState(false);

  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Show permission banner if location not granted
  useEffect(() => {
    if (permissionStatus !== 'granted' && !locationLoading) {
      setShowPermissionBanner(true);
    } else {
      setShowPermissionBanner(false);
    }
  }, [permissionStatus, locationLoading]);

  // Initialize marker with current location
  useEffect(() => {
    if (currentLocation) {
      setMarkerPos({ lat: currentLocation.latitude, lng: currentLocation.longitude });
    }
  }, [currentLocation]);

  // Set address from context
  useEffect(() => {
    if (ctxAddress && !address) {
      setAddress(ctxAddress);
    }
  }, [ctxAddress]);

  // Create geocoder
  useEffect(() => {
    if (isLoaded && !geocoderRef.current) {
      geocoderRef.current = new google.maps.Geocoder();
    }
  }, [isLoaded]);

  // Focus search input when opened
  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showSearch]);

  const onMapLoad = useCallback((m: google.maps.Map) => setMap(m), []);

  const handleMapDragEnd = useCallback(() => {
    if (!map) return;
    const center = map.getCenter();
    if (!center) return;

    const pos = { lat: center.lat(), lng: center.lng() };
    setMarkerPos(pos);
    setIsDragging(false);

    if (geocoderRef.current) {
      geocoderRef.current.geocode({ location: pos }, (results, status) => {
        if (status === 'OK' && results?.[0]) {
          setAddress(results[0].formatted_address);
        }
      });
    }
  }, [map]);

  const handleAllowLocation = async () => {
    const granted = await requestPermission();
    if (granted) {
      setShowPermissionBanner(false);
    }
  };

  const handleRecenter = () => {
    if (permissionStatus !== 'granted') {
      handleAllowLocation();
      return;
    }
    getCurrentLocation();
    if (currentLocation && map) {
      const pos = { lat: currentLocation.latitude, lng: currentLocation.longitude };
      map.panTo(pos);
      setMarkerPos(pos);
    }
  };

  // Autocomplete handlers
  const onAutocompleteLoad = (ac: google.maps.places.Autocomplete) => {
    autocompleteRef.current = ac;
  };

  const onPlaceChanged = () => {
    const place = autocompleteRef.current?.getPlace();
    if (!place?.geometry?.location) return;

    const lat = place.geometry.location.lat();
    const lng = place.geometry.location.lng();
    const pos = { lat, lng };
    const formattedAddress = place.formatted_address || place.name || '';

    setMarkerPos(pos);
    setAddress(formattedAddress);
    setSearchValue('');
    setShowSearch(false);

    if (map) {
      map.panTo(pos);
      map.setZoom(17);
    }
  };

  const handleContinue = () => {
    if (!markerPos) return;
    updateJobDetails({
      pickupLocation: { latitude: markerPos.lat, longitude: markerPos.lng },
      pickupAddress: address,
      isHazardLocation: isHazardous,
    });
    navigate('/service-selection');
  };

  const center = markerPos
    || (currentLocation ? { lat: currentLocation.latitude, lng: currentLocation.longitude } : defaultCenter);

  return (
    <div className="h-screen flex flex-col relative overflow-hidden bg-[#0A0F1E]">
      {/* Header */}
      <div className="relative z-40 p-4 pt-6 flex items-center gap-3">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate(-1)}
          className="glass rounded-full p-3"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </motion.button>
        <h1 className="text-xl font-bold text-white flex-1">Confirm Location</h1>
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setShowSearch(true)}
          className="glass rounded-full p-3"
        >
          <Search className="w-5 h-5 text-[#2EFFAF]" />
        </motion.button>
      </div>

      {/* Location permission banner */}
      <AnimatePresence>
        {showPermissionBanner && (
          <motion.div
            initial={{ opacity: 0, y: -20, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -20, height: 0 }}
            className="relative z-40 mx-4 mb-2"
          >
            <div className="glass rounded-2xl p-4 border border-[#2EFFAF]/30">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#2EFFAF]/20 flex items-center justify-center flex-shrink-0">
                  <LocateFixed className="w-5 h-5 text-[#2EFFAF]" />
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-semibold text-sm mb-1">
                    {permissionStatus === 'denied' ? 'Location Access Denied' : 'Enable Location'}
                  </h3>
                  <p className="text-white/60 text-xs mb-3">
                    {permissionStatus === 'denied'
                      ? 'Please enable location in your browser settings, or search for your address manually.'
                      : 'Allow location access so we can find your exact position for faster assistance.'}
                  </p>
                  <div className="flex gap-2">
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={handleAllowLocation}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0A0F1E] font-semibold text-xs"
                    >
                      {permissionStatus === 'denied' ? 'Try Again' : 'Allow Location'}
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        setShowPermissionBanner(false);
                        setShowSearch(true);
                      }}
                      className="px-4 py-2 rounded-xl bg-white/10 text-white font-semibold text-xs"
                    >
                      Search Instead
                    </motion.button>
                  </div>
                </div>
                <button onClick={() => setShowPermissionBanner(false)} aria-label="Dismiss">
                  <X className="w-4 h-4 text-white/40" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search overlay */}
      <AnimatePresence>
        {showSearch && isLoaded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-[#0A0F1E]/95 flex flex-col"
          >
            <div className="p-4 pt-6">
              <div className="flex items-center gap-3 mb-4">
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => {
                    setShowSearch(false);
                    setSearchValue('');
                  }}
                  className="glass rounded-full p-3"
                >
                  <ArrowLeft className="w-5 h-5 text-white" />
                </motion.button>
                <h2 className="text-lg font-bold text-white">Search Address</h2>
              </div>

              <Autocomplete
                onLoad={onAutocompleteLoad}
                onPlaceChanged={onPlaceChanged}
                options={{
                  types: ['address'],
                  componentRestrictions: undefined,
                }}
              >
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    placeholder="Search for a street, city, or place..."
                    className="w-full bg-white/5 border border-white/20 rounded-2xl pl-12 pr-10 py-4 text-white placeholder-white/40 focus:outline-none focus:border-[#2EFFAF]/50 transition-colors text-sm"
                  />
                  {searchValue && (
                    <button
                      onClick={() => setSearchValue('')}
                      className="absolute right-4 top-1/2 -translate-y-1/2"
                      aria-label="Clear search"
                    >
                      <X className="w-4 h-4 text-white/40" />
                    </button>
                  )}
                </div>
              </Autocomplete>

              {/* Quick options */}
              <div className="mt-4 space-y-2">
                {permissionStatus === 'granted' && currentLocation && (
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      const pos = { lat: currentLocation.latitude, lng: currentLocation.longitude };
                      setMarkerPos(pos);
                      if (ctxAddress) setAddress(ctxAddress);
                      setShowSearch(false);
                      setSearchValue('');
                      if (map) {
                        map.panTo(pos);
                        map.setZoom(17);
                      }
                    }}
                    className="w-full glass rounded-2xl p-4 flex items-center gap-3 text-left"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[#2EFFAF]/20 flex items-center justify-center flex-shrink-0">
                      <LocateFixed className="w-5 h-5 text-[#2EFFAF]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-sm">Use Current Location</p>
                      <p className="text-white/60 text-xs truncate">{ctxAddress || 'Your GPS position'}</p>
                    </div>
                  </motion.button>
                )}

                {permissionStatus !== 'granted' && (
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={handleAllowLocation}
                    className="w-full glass rounded-2xl p-4 flex items-center gap-3 text-left border border-[#2EFFAF]/20"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[#2EFFAF]/20 flex items-center justify-center flex-shrink-0">
                      <LocateFixed className="w-5 h-5 text-[#2EFFAF]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-sm">Allow Location Access</p>
                      <p className="text-white/60 text-xs">Use your GPS for exact position</p>
                    </div>
                  </motion.button>
                )}

                <p className="text-white/30 text-xs px-2 pt-2">
                  Type an address above and select from the suggestions
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Map area */}
      <div className="flex-1 relative z-10">
        {isLoaded ? (
          <>
            <GoogleMap
              mapContainerStyle={mapContainerStyle}
              center={center}
              zoom={16}
              onLoad={onMapLoad}
              onDragStart={() => setIsDragging(true)}
              onDragEnd={handleMapDragEnd}
              options={{
                styles: isDark ? darkMapStyles : lightMapStyles,
                disableDefaultUI: true,
                zoomControl: false,
                gestureHandling: 'greedy',
              }}
            >
              {markerPos && (
                <MarkerF
                  position={markerPos}
                  icon={{
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 12,
                    fillColor: '#059669',
                    fillOpacity: 1,
                    strokeColor: '#FFFFFF',
                    strokeWeight: 3,
                  }}
                />
              )}
            </GoogleMap>

            {/* Center pin (always visible on map center) */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
              <motion.div
                animate={{ y: isDragging ? -8 : 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="flex flex-col items-center"
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shadow-lg transition-colors ${
                    isDragging
                      ? 'bg-[#2EFFAF] shadow-[#2EFFAF]/40'
                      : 'bg-[#059669] shadow-[#059669]/30'
                  }`}
                >
                  <MapPin className="w-4 h-4 text-white" style={{ color: '#fff' }} />
                </div>
                <div className="w-1 h-4 bg-gradient-to-b from-[#059669] to-transparent" />
              </motion.div>
            </div>

            {/* Recenter button */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleRecenter}
              className="absolute bottom-4 right-4 z-20 glass rounded-full p-3 shadow-lg"
            >
              <Navigation2 className="w-5 h-5 text-[#2EFFAF]" />
            </motion.button>

            {/* No location indicator */}
            {!markerPos && !currentLocation && (
              <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                <div className="glass rounded-2xl p-4 text-center pointer-events-auto">
                  <MapPinOff className="w-8 h-8 text-white/40 mx-auto mb-2" />
                  <p className="text-white/60 text-sm mb-2">No location set</p>
                  <button
                    onClick={() => setShowSearch(true)}
                    className="text-[#2EFFAF] text-sm font-semibold"
                  >
                    Search for address
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="h-full flex items-center justify-center bg-white/5">
            <div className="w-10 h-10 border-4 border-[#2EFFAF] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Bottom sheet */}
      <motion.div
        initial={{ y: 60 }}
        animate={{ y: 0 }}
        className="relative z-30 glass rounded-t-[28px] p-5 border-t border-white/10"
      >
        {/* Address display with search trigger */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="w-4 h-4 text-[#2EFFAF]" />
            <p className="text-white font-semibold text-sm">Service Location</p>
          </div>
          <button
            onClick={() => setShowSearch(true)}
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-left flex items-center gap-3 focus:outline-none hover:border-white/20 transition-colors"
          >
            <Search className="w-4 h-4 text-white/40 flex-shrink-0" />
            {address ? (
              <span className="text-white text-sm truncate flex-1">{address}</span>
            ) : (
              <span className="text-white/40 text-sm flex-1">Search for an address...</span>
            )}
          </button>
          <p className="text-white/40 text-xs mt-1.5">
            Tap to search or drag the map to adjust
          </p>
        </div>

        {/* Hazard toggle */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => setIsHazardous(!isHazardous)}
          className={`w-full rounded-[20px] p-4 flex items-center gap-3 mb-4 transition-all ${
            isHazardous
              ? 'bg-gradient-to-r from-red-500/20 to-orange-500/20 border-2 border-red-500/50'
              : 'glass'
          }`}
        >
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              isHazardous ? 'bg-red-500' : 'bg-white/5'
            }`}
          >
            <AlertTriangle className={`w-5 h-5 ${isHazardous ? 'text-white' : 'text-white/40'}`} />
          </div>
          <div className="flex-1 text-left">
            <h3 className={`font-semibold text-sm ${isHazardous ? 'text-red-400' : 'text-white'}`}>
              In a dangerous spot
            </h3>
            <p className="text-white/60 text-xs">Highway, busy road, or unsafe location</p>
          </div>
          <div
            className={`w-12 h-7 rounded-full relative transition-colors flex-shrink-0 ${
              isHazardous ? 'bg-red-500' : 'bg-white/20'
            }`}
          >
            <motion.div
              className="absolute top-1 w-5 h-5 rounded-full bg-white shadow-lg"
              animate={{ left: isHazardous ? 25 : 4 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          </div>
        </motion.button>

        {isHazardous && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="glass rounded-2xl p-3 mb-4 border border-red-500/30"
          >
            <p className="text-red-400 text-xs font-semibold mb-1">Safety First</p>
            <ul className="text-white/80 text-xs space-y-0.5">
              <li>- Turn on hazard lights if possible</li>
              <li>- Stay in your vehicle if on highway</li>
              <li>- Provider will be notified of hazardous location</li>
            </ul>
          </motion.div>
        )}

        {/* Confirm button */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleContinue}
          disabled={!address && !markerPos}
          className={`w-full rounded-[28px] py-4 font-bold text-lg shadow-lg ${
            address || markerPos
              ? 'bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0A0F1E] shadow-[#2EFFAF]/30'
              : 'bg-white/10 text-white/40 shadow-none cursor-not-allowed'
          }`}
        >
          Confirm Location
        </motion.button>
      </motion.div>
    </div>
  );
}
