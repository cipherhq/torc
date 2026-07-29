import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/** Haversine distance in meters between two lat/lng points. */
function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6_371_000; // Earth radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const MIN_DISTANCE_METERS = 5;
const MAX_STALE_MS = 3_000;

interface LocationUpdate {
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  timestamp: number;
}

interface UseRealtimeLocationOptions {
  jobId: string | undefined;
  role: 'customer' | 'provider';
  enabled?: boolean;
}

export function useRealtimeLocation({ jobId, role, enabled = true }: UseRealtimeLocationOptions) {
  const [peerLocation, setPeerLocation] = useState<LocationUpdate | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!jobId || !enabled) return;

    const channelName = `job-tracking-${jobId}`;
    const channel = supabase.channel(channelName, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'location_update' }, (payload) => {
        const data = payload.payload as LocationUpdate & { from: string };
        if (data.from !== role) {
          setPeerLocation({
            lat: data.lat,
            lng: data.lng,
            heading: data.heading,
            speed: data.speed,
            timestamp: data.timestamp,
          });
        }
      })
      .on('presence', { event: 'join' }, () => {
        setIsConnected(true);
      })
      .on('presence', { event: 'leave' }, () => {
        setIsConnected(false);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          channel.track({ role, online_at: new Date().toISOString() });
        }
      });

    channelRef.current = channel;

    // Reconnect channel when app returns from background
    function handleVisibility() {
      if (document.visibilityState === 'visible' && channelRef.current) {
        // Re-subscribe if the channel was disconnected while backgrounded
        const state = (channelRef.current as any).state;
        if (state !== 'joined' && state !== 'joining') {
          channelRef.current.subscribe((s) => {
            if (s === 'SUBSCRIBED') {
              setIsConnected(true);
              channelRef.current?.track({ role, online_at: new Date().toISOString() });
            }
          });
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [jobId, role, enabled]);

  const broadcastLocation = useCallback(
    (location: { lat: number; lng: number; heading?: number; speed?: number }) => {
      if (!channelRef.current) return;
      channelRef.current.send({
        type: 'broadcast',
        event: 'location_update',
        payload: {
          ...location,
          from: role,
          timestamp: Date.now(),
        },
      });
    },
    [role]
  );

  return {
    peerLocation,
    isConnected,
    broadcastLocation,
  };
}

export type DutyStatus = 'OFFLINE' | 'IDLE' | 'EN_ROUTE' | 'ON_JOB';

export function useWatchPosition(enabled = true, dutyStatus: DutyStatus = 'IDLE') {
  // GPS is fully stopped when disabled or provider is offline
  const active = enabled && dutyStatus !== 'OFFLINE';

  const [position, setPosition] = useState<{ lat: number; lng: number; heading: number | null; speed: number | null } | null>(null);
  const watchIdRef = useRef<string | null>(null);
  const lastUpdateRef = useRef<{ lat: number; lng: number; time: number } | null>(null);

  useEffect(() => {
    if (!active) {
      // Stop existing watcher when going offline
      if (watchIdRef.current) {
        import('../utils/safeLocation').then(({ safeClearWatch }) => safeClearWatch(watchIdRef.current));
        watchIdRef.current = null;
      }
      return;
    }
    let cancelled = false;

    async function start() {
      const { safeWatchPosition } = await import('../utils/safeLocation');
      if (cancelled) return;

      watchIdRef.current = await safeWatchPosition(
        (pos) => {
          const now = Date.now();
          const last = lastUpdateRef.current;
          if (last) {
            const dist = haversineMeters(last.lat, last.lng, pos.lat, pos.lng);
            const elapsed = now - last.time;
            if (dist < MIN_DISTANCE_METERS && elapsed < MAX_STALE_MS) return;
          }
          lastUpdateRef.current = { lat: pos.lat, lng: pos.lng, time: now };
          setPosition(pos);
        },
        (err) => console.error('Watch position error:', err)
      );
    }
    start();

    return () => {
      cancelled = true;
      if (watchIdRef.current) {
        import('../utils/safeLocation').then(({ safeClearWatch }) => safeClearWatch(watchIdRef.current));
        watchIdRef.current = null;
      }
    };
  }, [active]);

  return position;
}
