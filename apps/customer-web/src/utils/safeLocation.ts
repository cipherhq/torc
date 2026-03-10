import { Geolocation } from '@capacitor/geolocation';

const DEFAULT_POS = { lat: 40.7128, lng: -74.006 };

/**
 * Get current position without ever prompting for permission.
 * Uses Capacitor native geolocation (bypasses WKWebView prompt).
 * Returns fallback position if permission not granted.
 */
export async function getSafePosition(): Promise<{ lat: number; lng: number }> {
  try {
    const perms = await Geolocation.checkPermissions();
    if (perms.location !== 'granted' && perms.coarseLocation !== 'granted') return DEFAULT_POS;

    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0, // Always fetch fresh GPS — never use cached
    });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return DEFAULT_POS;
  }
}

/**
 * Watch position without ever prompting for permission.
 * Returns null watch ID if permission not granted.
 */
export async function safeWatchPosition(
  callback: (pos: { lat: number; lng: number; heading: number | null; speed: number | null }) => void,
  errorCallback?: (err: any) => void
): Promise<string | null> {
  try {
    const perms = await Geolocation.checkPermissions();
    if (perms.location !== 'granted' && perms.coarseLocation !== 'granted') return null;

    const id = await Geolocation.watchPosition(
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0, // Always fresh position — never cache
      },
      (pos, err) => {
        if (err) { errorCallback?.(err); return; }
        if (pos) {
          callback({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            heading: pos.coords.heading,
            speed: pos.coords.speed,
          });
        }
      }
    );
    return id;
  } catch {
    return null;
  }
}

export async function safeClearWatch(id: string | null) {
  if (id) {
    try { await Geolocation.clearWatch({ id }); } catch {}
  }
}
