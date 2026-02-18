import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

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

    return () => {
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

export function useWatchPosition(enabled = true) {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !navigator.geolocation) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      (err) => {
        console.error('Watch position error:', err);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 2000,
      }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [enabled]);

  return position;
}
