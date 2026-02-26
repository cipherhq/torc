import { Navigate, Outlet, useLocation } from 'react-router';
import { useEffect, useRef } from 'react';
import { ProviderBottomNav } from './ProviderBottomNav';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { initAudio, playMessageSound, showSystemNotification } from '../utils/audio';

const PUBLIC_PATHS = new Set([
  '/',
  '/login',
  '/signup',
  '/intro/provider',
  '/verify-email',
  '/auth/callback',
  '/forgot-password',
  '/reset-password',
  '/onboarding',
  '/verification-pending',
]);

const HIDE_NAV_PATHS = new Set([
  ...PUBLIC_PATHS,
  '/services',
  '/documents',
  '/payout',
]);

function shouldHideNav(pathname: string) {
  if (HIDE_NAV_PATHS.has(pathname)) return true;
  // Hide nav on dynamic full-screen pages
  if (pathname.startsWith('/request/')) return true;
  if (pathname.startsWith('/job/')) return true;
  if (pathname.startsWith('/complete/')) return true;
  return false;
}

/**
 * Global message notification listener for the provider.
 * Subscribes to chat-notify-provider-{jobId} for all active jobs,
 * so the provider hears message sounds on ANY page (not just JobActive).
 */
function useGlobalMessageNotifications(userId: string | undefined) {
  const activeJobIds = useRef<string[]>([]);
  const channelsRef = useRef<any[]>([]);
  const location = useLocation();

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    async function setup() {
      // Find provider's active jobs
      const { data } = await supabase
        .from('jobs')
        .select('id')
        .eq('provider_id', userId!)
        .in('status', ['accepted', 'en_route', 'enroute', 'arrived', 'in_progress', 'inprogress'])
        .limit(5);

      if (cancelled || !data || data.length === 0) return;

      const jobIds = data.map((j: any) => j.id);

      // Don't re-subscribe if same jobs
      if (JSON.stringify(jobIds) === JSON.stringify(activeJobIds.current)) return;
      activeJobIds.current = jobIds;

      // Clean up old channels
      channelsRef.current.forEach((ch) => supabase.removeChannel(ch));
      channelsRef.current = [];

      // Skip if provider is already on the active job page (JobActiveRealtime handles it)
      const isOnJobPage = location.pathname.startsWith('/job/');

      for (const jobId of jobIds) {
        const channel = supabase.channel(`global-chat-notify-provider-${jobId}`, {
          config: { broadcast: { self: false } },
        });
        channel
          .on('broadcast', { event: 'new_message' }, (payload) => {
            const msg = payload.payload;
            if (!msg || msg.sender_role === 'provider') return;
            // Don't double-notify if already on the job page (JobActiveRealtime has its own listener)
            if (isOnJobPage) return;
            initAudio();
            playMessageSound();
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            const senderName = msg.sender_name || 'Customer';
            showSystemNotification(
              `Message from ${senderName}`,
              msg.text?.slice(0, 80) || 'Sent you a message',
              `chat-${jobId}`,
            );
          })
          .subscribe();
        channelsRef.current.push(channel);
      }
    }

    setup();

    // Re-check for active jobs periodically
    const interval = setInterval(setup, 30000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      channelsRef.current.forEach((ch) => supabase.removeChannel(ch));
      channelsRef.current = [];
      activeJobIds.current = [];
    };
  }, [userId, location.pathname]);
}

export function AppShell() {
  const location = useLocation();
  const { isAuthenticated, loading, profile, user, isVerified, providerProfile } = useAuth() as any;
  const showBottomNav = !shouldHideNav(location.pathname);
  const isPublicPath = PUBLIC_PATHS.has(location.pathname);

  // Global message notification listener for authenticated providers
  useGlobalMessageNotifications(isAuthenticated && profile?.role === 'provider' ? user?.id : undefined);

  if (isPublicPath) {
    return <Outlet />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1A1F2E] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#008CE5] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/60">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || profile?.role !== 'provider') {
    return <Navigate to="/login" replace />;
  }

  // Verification gate — redirect unverified providers to /verification-pending
  const UNVERIFIED_ALLOWED = new Set([
    '/verification-pending',
    '/documents',
    '/provider/documents',
    '/payout',
    '/provider/payout',
    '/onboarding',
    '/services',
    '/profile',
    '/provider/notifications',
    '/provider/personal-information',
    '/provider/help-support',
  ]);

  if (providerProfile !== null && !isVerified && !UNVERIFIED_ALLOWED.has(location.pathname)) {
    return <Navigate to="/verification-pending" replace />;
  }

  return (
    <>
      <Outlet />
      {showBottomNav && <ProviderBottomNav />}
    </>
  );
}
