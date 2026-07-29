export type AdminRole = 'super_admin' | 'admin' | 'manager' | 'support';

/**
 * Maps each admin sub-role to the route prefixes it may access.
 * super_admin uses the wildcard '*' to indicate full access.
 */
export const ROLE_PERMISSIONS: Record<AdminRole, string[]> = {
  super_admin: ['*'],
  admin: [
    '/dashboard',
    '/users',
    '/providers',
    '/provider-approval',
    '/jobs',
    '/live-dispatch',
    '/services',
    '/settings',
    '/payouts',
    '/payout-history',
    '/payments',
    '/finance',
    '/reporting',
    '/analytics',
    '/notifications',
    '/support-tickets',
    '/audit-trail',
    '/documents',
    '/team',
    '/directory',
  ],
  manager: [
    '/dashboard',
    '/jobs',
    '/live-dispatch',
    '/services',
    '/providers',
    '/provider-approval',
    '/payments',
    '/directory',
    '/notifications',
  ],
  support: [
    '/dashboard',
    '/jobs',
    '/users',
    '/support-tickets',
    '/notifications',
    '/directory',
  ],
};

/**
 * Returns true when the given admin role is allowed to access the specified path.
 * Handles exact matches and prefix matches (e.g. '/users/123' matches '/users').
 */
export function hasRouteAccess(role: string, path: string): boolean {
  const permissions = ROLE_PERMISSIONS[role as AdminRole];
  if (!permissions) return false;
  if (permissions.includes('*')) return true;
  return permissions.some((p) => path === p || path.startsWith(p + '/'));
}

/**
 * Returns the list of allowed route prefixes for a role.
 * Used by the sidebar to decide which nav items to render.
 */
export function getVisibleRoutes(role: string): string[] {
  const permissions = ROLE_PERMISSIONS[role as AdminRole];
  if (!permissions) return [];
  if (permissions.includes('*')) return ['*'];
  return permissions;
}
