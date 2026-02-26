import { createContext, useContext, useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

const LocationContext = createContext({});

function normalizePermissionState(state) {
  if (state === 'granted') return 'granted';
  if (state === 'denied') return 'denied';
  return 'prompt';
}

function classifyLocationError(error) {
  const code = Number(error?.code);
  const message = String(error?.message || '').toLowerCase();

  if (
    code === 1
    || message.includes('denied')
    || message.includes('not authorized')
    || message.includes('not allowed')
    || message.includes('permission')
  ) {
    return {
      status: 'denied',
      message: 'Location access was denied. Enable it in device settings or search for your address manually.',
    };
  }

  if (code === 3 || message.includes('timeout')) {
    return {
      status: 'prompt',
      message: 'Location request timed out. Try again or search for your address manually.',
    };
  }

  if (code === 2 || message.includes('unavailable') || message.includes('network')) {
    return {
      status: 'prompt',
      message: 'Current location is unavailable. Set emulator/device location or search for your address manually.',
    };
  }

  return {
    status: 'prompt',
    message: error?.message || 'Unable to get current location. Search for your address manually.',
  };
}

export function LocationProvider({ children }) {
  const [currentLocation, setCurrentLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [address, setAddress] = useState('');
  const [permissionStatus, setPermissionStatus] = useState('prompt'); // 'granted' | 'denied' | 'prompt'
  const isNative = typeof window !== 'undefined' && (window.__TORC_NATIVE__ === true || Capacitor.isNativePlatform());

  useEffect(() => {
    checkPermission();
  }, [isNative]);

  async function checkPermission() {
    try {
      if (isNative) {
        const { Geolocation } = await import('@capacitor/geolocation');
        const result = await Geolocation.checkPermissions();
        const state = normalizePermissionState(result?.location || result?.coarseLocation);
        setPermissionStatus(state);

        if (state === 'granted') {
          await getCurrentLocation();
        } else {
          setLoading(false);
        }
        return;
      }

      if (navigator.permissions) {
        const result = await navigator.permissions.query({ name: 'geolocation' });
        setPermissionStatus(result.state);

        result.addEventListener('change', () => {
          setPermissionStatus(result.state);
          if (result.state === 'granted') {
            getCurrentLocation();
          }
        });

        if (result.state === 'granted') {
          getCurrentLocation();
        } else {
          setLoading(false);
        }
      } else {
        // Fallback: just try to get location
        await getCurrentLocation();
      }
    } catch {
      await getCurrentLocation();
    }
  }

  function applyLocationFromPosition(position) {
    const location = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
    };
    setCurrentLocation(location);
    setPermissionStatus('granted');
    return location;
  }

  function getBrowserCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        const unsupportedError = new Error('Geolocation is not supported by your browser');
        unsupportedError.code = 0;
        reject(unsupportedError);
        return;
      }

      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      });
    });
  }

  async function getNativeCurrentPosition({ requestPermissions = false } = {}) {
    const { Geolocation } = await import('@capacitor/geolocation');

    if (requestPermissions) {
      const requested = await Geolocation.requestPermissions();
      const state = normalizePermissionState(requested?.location || requested?.coarseLocation);
      setPermissionStatus(state);
      if (state !== 'granted') {
        const deniedError = new Error('Location permission denied');
        deniedError.code = 1;
        throw deniedError;
      }
    }

    const checked = await Geolocation.checkPermissions();
    const state = normalizePermissionState(checked?.location || checked?.coarseLocation);
    setPermissionStatus(state);
    if (state !== 'granted') {
      const permissionError = new Error('Location permission not granted');
      permissionError.code = state === 'denied' ? 1 : 0;
      throw permissionError;
    }

    return Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  }

  async function fetchCurrentLocation({ requestPermissions = false } = {}) {
    setLoading(true);
    setLocationError(null);

    try {
      const position = isNative
        ? await getNativeCurrentPosition({ requestPermissions })
        : await getBrowserCurrentPosition();

      const location = applyLocationFromPosition(position);
      await reverseGeocode(location);
      setLoading(false);
      return true;
    } catch (error) {
      const parsed = classifyLocationError(error);
      setLocationError(parsed.message);
      setPermissionStatus(parsed.status);
      setLoading(false);
      return false;
    }
  }

  function requestPermission() {
    return fetchCurrentLocation({ requestPermissions: isNative });
  }

  function getCurrentLocation() {
    return fetchCurrentLocation({ requestPermissions: false });
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
        const location = {
          latitude: lat,
          longitude: lng,
        };
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
    if (newAddress) {
      setAddress(newAddress);
    }
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
