import { ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { AdminSidebar } from './AdminSidebar';
import { ErrorBoundary } from './ErrorBoundary';
import { supabase } from '../lib/supabase';
import { requireAdminSession, type AdminSession } from '../lib/adminAuth';
import { hasRouteAccess } from '../lib/rbac';
import { ShieldX } from 'lucide-react';

// ---- Context for child components to consume the admin session ----
export const AdminSessionContext = createContext<AdminSession | null>(null);

export function useAdminSession(): AdminSession | null {
  return useContext(AdminSessionContext);
}

// ---- Layout component ----

interface AdminLayoutProps {
  children: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  // If ProtectedAdminRoute already verified the session, use it directly
  // to avoid a redundant requireAdminSession() call + loading flash.
  const parentSession = useContext(AdminSessionContext);

  const [checkingAccess, setCheckingAccess] = useState(!parentSession);
  const [session, setSession] = useState<AdminSession | null>(parentSession);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // When wrapped by ProtectedAdminRoute, auth is already verified — skip
    if (parentSession) {
      setSession(parentSession);
      setCheckingAccess(false);
      return;
    }

    let cancelled = false;

    const verifyAccess = async () => {
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
          setCheckingAccess(false);
        }
      }
    };

    verifyAccess();

    const { data: authSub } = supabase.auth.onAuthStateChange(() => {
      verifyAccess();
    });

    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
    };
  }, [parentSession, location.pathname, navigate]);

  // Loading state
  if (checkingAccess) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-gray-500">Checking admin access...</p>
      </div>
    );
  }

  // Not authenticated
  if (!session) {
    return null;
  }

  // Authenticated but lacking route-level permission
  const routeAllowed = hasRouteAccess(session.adminRole, location.pathname);

  return (
    <AdminSessionContext.Provider value={session}>
      <div className="flex h-screen bg-white overflow-hidden">
        <AdminSidebar />
        <div className="flex-1 overflow-y-auto">
          <ErrorBoundary fallback={
            <div className="flex flex-col items-center justify-center h-full p-8">
              <p className="text-red-500 font-semibold text-lg mb-2">This page crashed</p>
              <p className="text-gray-500 text-sm mb-4">Try reloading or navigating to another page.</p>
              <button onClick={() => window.location.reload()} className="px-4 py-2 rounded-xl text-white font-semibold" style={{ background: 'linear-gradient(to right, #008CE5, #0070B8)' }}>
                Reload
              </button>
            </div>
          }>
          {routeAllowed ? (
            children
          ) : (
            <div className="flex flex-col items-center justify-center min-h-full py-24 px-6 text-center">
              <div
                className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6"
                style={{ background: 'rgba(239,68,68,0.1)' }}
              >
                <ShieldX className="w-10 h-10 text-red-500" />
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-3">Access Denied</h1>
              <p className="text-gray-500 max-w-md mb-8">
                Your role ({session.adminRole}) does not have permission to view this page.
                Contact a Super Admin if you believe this is an error.
              </p>
              <button
                onClick={() => navigate('/dashboard')}
                className="px-6 py-3 rounded-[20px] font-bold text-white"
                style={{
                  background: 'linear-gradient(to right, #008CE5, #0070B8)',
                  boxShadow: '0 8px 24px rgba(0,140,229,0.3)',
                }}
              >
                Back to Dashboard
              </button>
            </div>
          )}
          </ErrorBoundary>
        </div>
      </div>
    </AdminSessionContext.Provider>
  );
}
