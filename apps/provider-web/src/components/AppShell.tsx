import { Outlet, useLocation } from 'react-router';
import { ProviderBottomNav } from './ProviderBottomNav';

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
  const showBottomNav = !NO_NAV_PATHS.has(location.pathname);

  return (
    <>
      <Outlet />
      {showBottomNav && <ProviderBottomNav />}
    </>
  );
}
