import { Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { useEffect, useRef, useState, useCallback } from 'react';
import { ProviderBottomNav } from './ProviderBottomNav';
import { LoadingScreen } from './LoadingScreen';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { initAudio, playMessageSound, showSystemNotification } from '../utils/audio';
import { decryptMessage } from '../lib/chatEncryption';
import { Haptics } from '@capacitor/haptics';

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

// Routes where provider enters/edits data -- never auto-redirect away from these
const PROTECTED_DATA_ENTRY_ROUTES = new Set([
  '/onboarding',
  '/services',
  '/documents',
  '/payout',
  '/provider/documents',
  '/provider/payout',
  '/profile',
  '/provider/personal-information',
  '/provider/vehicles',
  '/provider/account-security',
]);

// Routes where auto-redirect to an active job is allowed
const AUTO_REDIRECT_ALLOWED_ROUTES = new Set([
  '/home',
  '/earnings',
  '/provider/earnings',
  '/explore',
  '/messages',
  '/provider/messages',
]);

const HIDE_NAV_PATHS = new Set([
  ...PUBLIC_PATHS,
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
      // Find provider's active jobs (only recent — stale jobs are ignored)
      const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('jobs')
        .select('id')
        .eq('provider_id', userId!)
        .in('status', ['accepted', 'en_route', 'enroute', 'arrived', 'in_progress', 'inprogress'])
        .gte('created_at', twelveHoursAgo)
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
          .on('broadcast', { event: 'new_message' }, async (payload) => {
            const msg = payload.payload;
            if (!msg || msg.sender_role === 'provider') return;
            // Don't double-notify if already on the job page (JobActiveRealtime has its own listener)
            if (isOnJobPage) return;
            initAudio();
            playMessageSound();
            Haptics.vibrate({ duration: 300 }).catch(() => {});
            navigator.vibrate?.([200, 100, 200]);
            const senderName = msg.sender_name || 'Customer';
            const plainText = msg.text ? await decryptMessage(jobId, msg.text) : '';
            showSystemNotification(
              `Message from ${senderName}`,
              plainText?.slice(0, 80) || 'Sent you a message',
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

const ACTIVE_JOB_STATUSES = ['accepted', 'en_route', 'enroute', 'arrived', 'in_progress', 'inprogress'];

/**
 * Track active job globally so a "Return to Job" banner appears on every page.
 * Also auto-redirects to the active job on first detection (crash recovery).
 * Only considers jobs from the last 12 hours — older stuck jobs are auto-cancelled.
 */
function useActiveJobTracker(userId: string | undefined) {
  const [activeJob, setActiveJob] = useState<{ id: string; status: string; service_name?: string; customer_name?: string } | null>(null);
  const hasAutoRedirected = useRef(false);
  const hasCleaned = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!userId) { setActiveJob(null); return; }
    let cancelled = false;

    async function check() {
      try {
        const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

        // One-time cleanup: auto-cancel stale jobs stuck in active statuses for 12+ hours
        if (!hasCleaned.current) {
          hasCleaned.current = true;
          supabase
            .from('jobs')
            .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancellation_reason: 'auto_expired_stale' })
            .eq('provider_id', userId!)
            .in('status', ACTIVE_JOB_STATUSES)
            .lt('created_at', twelveHoursAgo)
            .then(() => {});
        }

        const { data } = await supabase
          .from('jobs')
          .select('id, status, provider_id, service_id, created_at, services(name), customers:customer_id(first_name)')
          .eq('provider_id', userId!)
          .in('status', ACTIVE_JOB_STATUSES)
          .gte('created_at', twelveHoursAgo)
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        // Validate job ownership -- discard if provider_id doesn't match
        if (data && data.provider_id === userId) {
          setActiveJob({
            id: data.id,
            status: data.status,
            service_name: (data as any).services?.name || undefined,
            customer_name: (data as any).customers?.first_name || undefined,
          });

          // Auto-redirect on first detection (crash / app restart recovery)
          // Only redirect from safe routes -- never from data entry routes
          if (!hasAutoRedirected.current) {
            hasAutoRedirected.current = true;
            const path = location.pathname;
            const isAlreadyOnJob = path.startsWith('/job/') || path.startsWith('/complete/') || path.startsWith('/request/');
            const isDataEntry = PROTECTED_DATA_ENTRY_ROUTES.has(path);
            if (!isAlreadyOnJob && !isDataEntry && AUTO_REDIRECT_ALLOWED_ROUTES.has(path)) {
              navigate(`/job/${data.id}`, { replace: true });
            }
          }
        } else {
          setActiveJob(null);
        }
      } catch { if (!cancelled) setActiveJob(null); }
    }

    check();
    const interval = setInterval(check, 8000);

    // Also re-check when app returns from background (crash recovery, task switch)
    function handleVisibility() {
      if (document.visibilityState === 'visible') check();
    }
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [userId]);

  return activeJob;
}

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, loading, profile, user } = useAuth() as any;
  const showBottomNav = !shouldHideNav(location.pathname);
  const isPublicPath = PUBLIC_PATHS.has(location.pathname);
  const isOnJobPage = location.pathname.startsWith('/job/') || location.pathname.startsWith('/complete/');

  // Refresh auth session when app returns from background
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        supabase.auth.getSession().catch(() => {});
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Global message notification listener for authenticated providers
  useGlobalMessageNotifications(isAuthenticated && profile?.role === 'provider' ? user?.id : undefined);

  // Global active job tracking — banner appears on all non-job pages + auto-redirect on crash
  const activeJob = useActiveJobTracker(isAuthenticated && profile?.role === 'provider' ? user?.id : undefined);

  if (isPublicPath) {
    return <Outlet />;
  }

  if (loading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Profile still loading after auth — show logo screen instead of redirecting
  if (!profile) {
    return <LoadingScreen />;
  }

  if (profile.role !== 'provider') {
    return <Navigate to="/login" replace />;
  }

  // Verification is handled as an in-app warning banner; do not hard-block routes.

  return (
    <>
      <Outlet />
      {/* Floating active job banner — visible from any page except the job page itself */}
      {activeJob && !isOnJobPage && (
        <div className="fixed left-0 right-0 z-40" style={{ bottom: showBottomNav ? 'calc(75px + env(safe-area-inset-bottom, 0px))' : 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
          <button
            onClick={() => navigate(`/job/${activeJob.id}`)}
            className="mx-4 rounded-2xl px-4 py-3 flex items-center gap-3 active:scale-[0.98] transition-transform shadow-xl"
            style={{
              background: 'linear-gradient(135deg, #008CE5, #0070B8)',
              boxShadow: '0 8px 24px rgba(0,140,229,0.5)',
            }}
          >
            <div className="w-3 h-3 rounded-full bg-white animate-pulse flex-shrink-0" />
            <div className="flex-1 text-left">
              <p className="text-white font-bold text-sm">Active Job — Tap to Return</p>
              <p className="text-white/70 text-xs">
                {activeJob.service_name || 'Service'}{activeJob.customer_name ? ` · ${activeJob.customer_name}` : ''}
              </p>
            </div>
            <span className="text-white text-lg font-bold">&rarr;</span>
          </button>
        </div>
      )}
      {showBottomNav && <ProviderBottomNav />}
    </>
  );
}
