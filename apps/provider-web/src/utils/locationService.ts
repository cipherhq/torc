import { Capacitor, registerPlugin } from '@capacitor/core';

interface LocationServicePlugin {
  start(): Promise<void>;
  stop(): Promise<void>;
}

const LocationService = registerPlugin<LocationServicePlugin>('LocationService');

export async function startLocationService() {
  if (Capacitor.isNativePlatform()) {
    try {
      await LocationService.start();
    } catch (e) {
      console.warn('Failed to start location service:', e);
    }
  }
}

export async function stopLocationService() {
  if (Capacitor.isNativePlatform()) {
    try {
      await LocationService.stop();
    } catch (e) {
      console.warn('Failed to stop location service:', e);
    }
  }
}
