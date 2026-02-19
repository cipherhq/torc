import { Navigate, Outlet, useLocation } from 'react-router';
import { ProviderBottomNav } from './ProviderBottomNav';
import { useAuth } from '../context/AuthContext';

const NO_NAV_PATHS = new Set([
  '/',
  '/login',
  '/signup',
  '/verify-email',
  '/auth/callback',
  '/forgot-password',
  '/reset-password',
]);

export function AppShell() {
  const location = useLocation();
  const { isAuthenticated, loading, profile } = useAuth() as any;
  const showBottomNav = !NO_NAV_PATHS.has(location.pathname);
  const isPublicPath = NO_NAV_PATHS.has(location.pathname);

  if (isPublicPath) {
    return <Outlet />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1A1F2E] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#2EFFAF] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/60">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || profile?.role !== 'provider') {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <Outlet />
      {showBottomNav && <ProviderBottomNav />}
    </>
  );
}
