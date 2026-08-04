import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { requireAdminSession, type AdminSession } from '../lib/adminAuth';
import { supabase } from '../lib/supabase';
import { AdminSessionContext } from './AdminLayout';

/**
 * Centralised admin route guard.
 *
 * Wrap all privileged routes under this component in the router config so
 * that auth is checked ONCE at the parent level before any child page mounts.
 * - Shows a stable loading screen while verifying the session.
 * - Redirects to /login if the user is not an admin.
 * - Re-verifies on auth state changes.
 * - Provides the AdminSession via context so children can consume it.
 */
export function ProtectedAdminRoute() {
  const [checking, setChecking] = useState(true);
  const [session, setSession] = useState<AdminSession | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;

    const verify = async () => {
      try {
        const adminSession = await requireAdminSession();
        if (!cancelled) {
          setSession(adminSession);
        }
      } catch {
        if (!cancelled) {
          setSession(null);
          navigate('/login', {
            replace: true,
            state: { from: location.pathname },
          });
        }
      } finally {
        if (!cancelled) {
          setChecking(false);
        }
      }
    };

    verify();

    // Re-check when auth state changes (e.g. token refresh, sign-out in another tab)
    const { data: authSub } = supabase.auth.onAuthStateChange(() => {
      verify();
    });

    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
    };
  }, [location.pathname, navigate]);

  // Stable loading screen — no flash
  if (checking) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm font-medium">Verifying admin access...</p>
        </div>
      </div>
    );
  }

  // Not authenticated — navigate effect will redirect, render nothing
  if (!session) {
    return null;
  }

  // Authenticated — render child routes with session context
  return (
    <AdminSessionContext.Provider value={session}>
      <Outlet />
    </AdminSessionContext.Provider>
  );
}
