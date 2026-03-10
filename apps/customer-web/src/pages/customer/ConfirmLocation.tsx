import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, MapPin, AlertTriangle, Navigation2, Search, X, LocateFixed, MapPinOff } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleMap, MarkerF, Autocomplete } from '@react-google-maps/api';
import { useGoogleMaps } from '../../context/GoogleMapsContext';
import { useLocation as useLocationCtx } from '../../context/LocationContext';
import { useJob } from '../../context/JobContext';
import { useTheme } from '../../context/ThemeContext';
import { getRequestContext, updateRequestContext } from '../../data/requestContext';

const mapContainerStyle = { width: '100%', height: '100%' };

const darkMapStyles = [
  { elementType: 'geometry', stylers: [{ color: '#14263D' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#14263D' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6B7280' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2A3441' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#323B4C' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#1B2F4A' }] },
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
    locationError,
    loading: locationLoading,
  } = useLocationCtx();
  const { updateJobDetails } = useJob();
  const { isDark } = useTheme();
  const ctx = getRequestContext();
  const isForSomeoneElse = ctx.whoNeedsHelp === 'new';

  const textColor = isDark ? '#FFFFFF' : '#14263D';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2';

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

  // Initialize marker with current location (skip for "someone else" — they must search)
  useEffect(() => {
    if (currentLocation && !isForSomeoneElse) {
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

  // Auto-open search when requesting for someone else
  useEffect(() => {
    if (isForSomeoneElse && !markerPos) {
      setShowSearch(true);
    }
  }, []);

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
    if (isForSomeoneElse) {
      // Don't snap to customer's GPS — open search for recipient's address
      setShowSearch(true);
      return;
    }
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
    // Also save to requestContext so Matching.tsx can read it
    updateRequestContext({
      location: { lat: markerPos.lat, lng: markerPos.lng, address },
      isHazardous,
    });
    navigate('/service-selection');
  };

  const center = markerPos
    || (currentLocation ? { lat: currentLocation.latitude, lng: currentLocation.longitude } : defaultCenter);
  const permissionTitle = permissionStatus === 'denied'
    ? 'Location Access Denied'
    : locationError
      ? 'Location Not Available'
      : 'Enable Location';
  const permissionMessage = locationError
    || (permissionStatus === 'denied'
      ? 'Please enable location in your browser settings, or search for your address manually.'
      : 'Allow location access so we can find your exact position for faster assistance.');

  return (
    <div className="h-screen flex flex-col relative overflow-hidden" style={{ background: isDark ? 'linear-gradient(180deg, #0A1626 0%, #081427 100%)' : 'linear-gradient(180deg, #F8FBFF 0%, #EAF2FF 100%)' }}>
      <PageHeader
        title="Confirm Location"
        rightAction={
          <button
            onClick={() => setShowSearch(true)}
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
          >
            <Search className="w-5 h-5 text-white" />
          </button>
        }
      />

      {/* Spacer for fixed header */}
      <div style={{ paddingTop: 'calc(var(--safe-top) + 64px)' }} />

      {/* Location permission banner */}
      <AnimatePresence>
        {showPermissionBanner && (
          <motion.div
            initial={{ opacity: 0, y: -20, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -20, height: 0 }}
            className="relative z-40 mx-4 mb-2"
          >
            <div className="rounded-2xl p-4" style={{ backgroundColor: cardBg, border: '1px solid rgba(78,205,196,0.3)' }}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#008CE5]/20 flex items-center justify-center flex-shrink-0">
                  <LocateFixed className="w-5 h-5 text-[#008CE5]" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-sm mb-1" style={{ color: textColor }}>
                    {permissionTitle}
                  </h3>
                  <p className="text-xs mb-3" style={{ color: subColor }}>
                    {permissionMessage}
                  </p>
                  <div className="flex gap-2">
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={handleAllowLocation}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#008CE5] to-[#0070B8] font-semibold text-xs"
                      style={{ color: isDark ? '#081427' : '#14263D' }}
                    >
                      {permissionStatus === 'denied' ? 'Try Again' : 'Allow Location'}
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        setShowPermissionBanner(false);
                        setShowSearch(true);
                      }}
                      className="px-4 py-2 rounded-xl font-semibold text-xs"
                      style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', color: textColor }}
                    >
                      Search Instead
                    </motion.button>
                  </div>
                </div>
                <button onClick={() => setShowPermissionBanner(false)} aria-label="Dismiss">
                  <X className="w-4 h-4" style={{ color: subColor }} />
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
            className="absolute inset-0 z-50 flex flex-col"
            style={{ background: isDark ? 'rgba(15,20,25,0.95)' : 'rgba(250,248,245,0.98)' }}
          >
            <div className="p-4 pt-6">
              <div className="flex items-center gap-3 mb-4">
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => {
                    setShowSearch(false);
                    setSearchValue('');
                  }}
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}
                >
                  <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
                </motion.button>
                <h2 className="text-lg font-bold" style={{ color: textColor }}>Search Address</h2>
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
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: subColor }} />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    placeholder="Search for a street, city, or place..."
                    className="w-full rounded-2xl pl-12 pr-10 py-4 focus:outline-none transition-colors text-sm"
                    style={{
                      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                      border: '1px solid ' + (isDark ? 'rgba(255,255,255,0.2)' : '#D3E0F2'),
                      color: textColor,
                    }}
                  />
                  {searchValue && (
                    <button
                      onClick={() => setSearchValue('')}
                      className="absolute right-4 top-1/2 -translate-y-1/2"
                      aria-label="Clear search"
                    >
                      <X className="w-4 h-4" style={{ color: subColor }} />
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
                    className="w-full rounded-2xl p-4 flex items-center gap-3 text-left"
                    style={{ backgroundColor: cardBg, border: '1px solid ' + cardBorder }}
                  >
                    <div className="w-10 h-10 rounded-xl bg-[#008CE5]/20 flex items-center justify-center flex-shrink-0">
                      <LocateFixed className="w-5 h-5 text-[#008CE5]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm" style={{ color: textColor }}>Use Current Location</p>
                      <p className="text-xs truncate" style={{ color: subColor }}>{ctxAddress || 'Your GPS position'}</p>
                    </div>
                  </motion.button>
                )}

                {permissionStatus !== 'granted' && (
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={handleAllowLocation}
                    className="w-full rounded-2xl p-4 flex items-center gap-3 text-left"
                    style={{ backgroundColor: cardBg, border: '1px solid rgba(78,205,196,0.2)' }}
                  >
                    <div className="w-10 h-10 rounded-xl bg-[#008CE5]/20 flex items-center justify-center flex-shrink-0">
                      <LocateFixed className="w-5 h-5 text-[#008CE5]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm" style={{ color: textColor }}>Allow Location Access</p>
                      <p className="text-xs" style={{ color: subColor }}>Use your GPS for exact position</p>
                    </div>
                  </motion.button>
                )}

                <p className="text-xs px-2 pt-2" style={{ color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)' }}>
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
                    fillColor: '#008CE5',
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
                      ? 'bg-[#008CE5] shadow-[#008CE5]/40'
                      : 'bg-[#008CE5] shadow-[#008CE5]/30'
                  }`}
                >
                  <MapPin className="w-4 h-4 text-white" style={{ color: '#fff' }} />
                </div>
                <div className="w-1 h-4 bg-gradient-to-b from-[#008CE5] to-transparent" />
              </motion.div>
            </div>

            {/* Recenter button */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleRecenter}
              className="absolute bottom-4 right-4 z-20 w-10 h-10 rounded-full flex items-center justify-center shadow-lg"
              style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.9)', border: '1px solid ' + cardBorder }}
            >
              <Navigation2 className="w-5 h-5 text-[#008CE5]" />
            </motion.button>

            {/* No location indicator */}
            {!markerPos && !currentLocation && (
              <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                <div className="rounded-2xl p-4 text-center pointer-events-auto" style={{ backgroundColor: cardBg, border: '1px solid ' + cardBorder }}>
                  <MapPinOff className="w-8 h-8 mx-auto mb-2" style={{ color: subColor }} />
                  <p className="text-sm mb-2" style={{ color: subColor }}>No location set</p>
                  <button
                    onClick={() => setShowSearch(true)}
                    className="text-[#008CE5] text-sm font-semibold"
                  >
                    Search for address
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="h-full flex items-center justify-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }}>
            <div className="w-10 h-10 border-4 border-[#008CE5] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Bottom sheet */}
      <motion.div
        initial={{ y: 60 }}
        animate={{ y: 0 }}
        className="relative z-30 rounded-t-[28px] p-5"
        style={{ backgroundColor: isDark ? '#14263D' : '#FFFFFF', borderTop: '1px solid ' + (isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2') }}
      >
        {/* Address display with search trigger */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-4 h-4 text-[#008CE5]" />
            <p className="font-semibold text-sm" style={{ color: textColor }}>
              {isForSomeoneElse ? `Where does ${ctx.personName || 'this person'} need help?` : 'Service Location'}
            </p>
          </div>
          <button
            onClick={() => setShowSearch(true)}
            className="w-full rounded-xl px-4 py-4 text-left flex items-center gap-3 focus:outline-none transition-all active:scale-[0.99]"
            style={{
              backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F5F8FC',
              border: '1.5px solid ' + (isDark ? 'rgba(255,255,255,0.12)' : '#C8D8E8'),
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: isDark ? 'rgba(0,140,229,0.15)' : 'rgba(0,140,229,0.08)' }}>
              <Search className="w-4.5 h-4.5" style={{ color: '#008CE5' }} />
            </div>
            <div className="flex-1 min-w-0">
              {address ? (
                <p className="text-sm font-medium leading-snug" style={{ color: textColor, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{address}</p>
              ) : (
                <p className="text-sm" style={{ color: subColor }}>Search for an address...</p>
              )}
            </div>
          </button>
          <p className="text-xs mt-2 ml-1" style={{ color: subColor }}>
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
              : ''
          }`}
          style={isHazardous ? {} : { backgroundColor: cardBg, border: '1px solid ' + cardBorder }}
        >
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              isHazardous ? 'bg-red-500' : ''
            }`}
            style={isHazardous ? {} : { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}
          >
            <AlertTriangle className={`w-5 h-5 ${isHazardous ? 'text-white' : ''}`} style={isHazardous ? {} : { color: subColor }} />
          </div>
          <div className="flex-1 text-left">
            <h3 className={`font-semibold text-sm ${isHazardous ? 'text-red-400' : ''}`} style={isHazardous ? {} : { color: textColor }}>
              In a dangerous spot
            </h3>
            <p className="text-xs" style={{ color: subColor }}>Highway, busy road, or unsafe location</p>
          </div>
          <div
            className={`w-12 h-7 rounded-full relative transition-colors flex-shrink-0 ${
              isHazardous ? 'bg-red-500' : ''
            }`}
            style={isHazardous ? {} : { backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)' }}
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
            className="rounded-2xl p-3 mb-4 border border-red-500/30"
            style={{ backgroundColor: cardBg }}
          >
            <p className="text-red-400 text-xs font-semibold mb-1">Safety First</p>
            <ul className="text-xs space-y-0.5" style={{ color: isDark ? 'rgba(255,255,255,0.8)' : '#4B5563' }}>
              <li>- Turn on hazard lights if possible</li>
              <li>- Stay in your vehicle if on highway</li>
              <li>- Provider will be notified of hazardous location</li>
            </ul>
          </motion.div>
        )}

        {/* Confirm button */}
        <button
          onClick={handleContinue}
          disabled={!markerPos}
          className="torc-btn-primary"
          style={
            !(address || markerPos)
              ? { background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)', color: subColor, boxShadow: 'none' }
              : undefined
          }
        >
          Confirm Location
        </button>
      </motion.div>
    </div>
  );
}
