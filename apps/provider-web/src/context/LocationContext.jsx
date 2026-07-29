import { createContext, useContext, useState, useEffect, useRef } from 'react';

const LocationContext = createContext({});

export function LocationProvider({ children }) {
  const [currentLocation, setCurrentLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [address, setAddress] = useState('');
  const [permissionStatus, setPermissionStatus] = useState('prompt');
  const watchIdRef = useRef(null);

  useEffect(() => {
    startWatching();
    return () => {
      if (watchIdRef.current) {
        import('../utils/safeLocation').then(({ safeClearWatch }) => safeClearWatch(watchIdRef.current));
      }
    };
  }, []);

  async function startWatching() {
    try {
      const { safeWatchPosition, getSafePosition } = await import('../utils/safeLocation');

      watchIdRef.current = await safeWatchPosition(
        (pos) => {
          const location = {
            latitude: pos.lat,
            longitude: pos.lng,
            accuracy: null,
          };
          setCurrentLocation(location);
          setPermissionStatus('granted');
          setLoading(false);
        },
        (err) => {
          console.warn('Location watch error:', err);
        }
      );

      if (!watchIdRef.current) {
        // Watch didn't start (no permission) — try one-shot fallback
        const fallback = await getSafePosition();
        if (fallback) {
          setCurrentLocation({ latitude: fallback.lat, longitude: fallback.lng, accuracy: null });
          setPermissionStatus('granted');
        } else {
          // Try browser API as last resort
          fallbackBrowserLocation();
          return;
        }
      }
      setLoading(false);
    } catch {
      fallbackBrowserLocation();
    }
  }

  function fallbackBrowserLocation() {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported');
      setLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setPermissionStatus('granted');
        setLoading(false);
      },
      (error) => {
        setLocationError(error.message);
        if (error.code === 1) setPermissionStatus('denied');
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  function requestPermission() {
    return new Promise((resolve) => {
      setLoading(true);
      setLocationError(null);

      if (!navigator.geolocation) {
        setLocationError('Geolocation is not supported by your browser');
        setLoading(false);
        resolve(false);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          };
          setCurrentLocation(location);
          setPermissionStatus('granted');
          await reverseGeocode(location);
          setLoading(false);
          resolve(true);
        },
        (error) => {
          setLocationError(error.message);
          setPermissionStatus('denied');
          setLoading(false);
          resolve(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }

  function getCurrentLocation() {
    startWatching();
  }

  async function reverseGeocode(location) {
    try {
      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${location.latitude},${location.longitude}&key=${apiKey}`
      );
      const data = await response.json();
      if (data.results && data.results[0]) {
        setAddress(data.results[0].formatted_address);
      }
    } catch (error) {
      console.error('Reverse geocode error:', error);
    }
  }

  async function geocodeAddress(searchAddress) {
    try {
      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(searchAddress)}&key=${apiKey}`
      );
      const data = await response.json();
      if (data.results && data.results[0]) {
        const { lat, lng } = data.results[0].geometry.location;
        const location = { latitude: lat, longitude: lng };
        setCurrentLocation(location);
        setAddress(data.results[0].formatted_address);
        return location;
      }
      return null;
    } catch (error) {
      console.error('Geocode error:', error);
      return null;
    }
  }

  function updateLocation(location, newAddress) {
    setCurrentLocation(location);
    if (newAddress) setAddress(newAddress);
  }

  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  const value = {
    currentLocation,
    address,
    locationError,
    loading,
    permissionStatus,
    getCurrentLocation,
    requestPermission,
    updateLocation,
    geocodeAddress,
    reverseGeocode,
    calculateDistance,
  };

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation() {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error('useLocation must be used within LocationProvider');
  }
  return context;
}
