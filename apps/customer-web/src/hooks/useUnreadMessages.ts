import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

/**
 * Returns true if there are any unread chat messages for the current user.
 * Checks jobs with last_message_at where last sender is NOT the current role,
 * and compares against localStorage read timestamps.
 */
export function useUnreadMessages(role: 'customer' | 'provider') {
  const { user } = useAuth();
  const [hasUnread, setHasUnread] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    async function check() {
      try {
        const idCol = role === 'customer' ? 'customer_id' : 'provider_id';
        const otherRole = role === 'customer' ? 'provider' : 'customer';

        const { data } = await supabase
          .from('jobs')
          .select('id, last_message_at')
          .eq(idCol, user!.id)
          .eq('last_message_sender_role', otherRole)
          .not('last_message_at', 'is', null)
          .order('last_message_at', { ascending: false })
          .limit(20);

        if (!data || data.length === 0) {
          setHasUnread(false);
          return;
        }

        const unread = data.some((job) => {
          const lastRead = localStorage.getItem(`torc_chat_read_${job.id}`);
          if (!lastRead) return true;
          return new Date(job.last_message_at) > new Date(lastRead);
        });

        setHasUnread(unread);
      } catch {
        // Silently fail
      }
    }

    check();
    intervalRef.current = setInterval(check, 15000);

    const handleVis = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', handleVis);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', handleVis);
    };
  }, [user?.id, role]);

  return hasUnread;
}
