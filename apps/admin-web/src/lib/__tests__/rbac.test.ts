import { describe, it, expect } from 'vitest';
import { hasRouteAccess, getVisibleRoutes, ROLE_PERMISSIONS } from '../rbac';

describe('RBAC', () => {
  describe('hasRouteAccess', () => {
    it('super_admin has access to all routes', () => {
      expect(hasRouteAccess('super_admin', '/settings')).toBe(true);
      expect(hasRouteAccess('super_admin', '/team')).toBe(true);
      expect(hasRouteAccess('super_admin', '/any-route')).toBe(true);
      expect(hasRouteAccess('super_admin', '/dashboard')).toBe(true);
    });

    it('admin has access to standard routes', () => {
      expect(hasRouteAccess('admin', '/dashboard')).toBe(true);
      expect(hasRouteAccess('admin', '/users')).toBe(true);
      expect(hasRouteAccess('admin', '/settings')).toBe(true);
      expect(hasRouteAccess('admin', '/payouts')).toBe(true);
      expect(hasRouteAccess('admin', '/finance')).toBe(true);
      expect(hasRouteAccess('admin', '/team')).toBe(true);
      expect(hasRouteAccess('admin', '/audit-trail')).toBe(true);
    });

    it('admin has access to sub-routes via prefix matching', () => {
      expect(hasRouteAccess('admin', '/users/123')).toBe(true);
      expect(hasRouteAccess('admin', '/providers/abc')).toBe(true);
    });

    it('manager has limited access', () => {
      expect(hasRouteAccess('manager', '/dashboard')).toBe(true);
      expect(hasRouteAccess('manager', '/jobs')).toBe(true);
      expect(hasRouteAccess('manager', '/live-dispatch')).toBe(true);
      expect(hasRouteAccess('manager', '/services')).toBe(true);
      expect(hasRouteAccess('manager', '/providers')).toBe(true);
      expect(hasRouteAccess('manager', '/settings')).toBe(false);
      expect(hasRouteAccess('manager', '/team')).toBe(false);
      expect(hasRouteAccess('manager', '/payouts')).toBe(false);
      expect(hasRouteAccess('manager', '/finance')).toBe(false);
    });

    it('support has support-only access', () => {
      expect(hasRouteAccess('support', '/dashboard')).toBe(true);
      expect(hasRouteAccess('support', '/support-tickets')).toBe(true);
      expect(hasRouteAccess('support', '/users')).toBe(true);
      expect(hasRouteAccess('support', '/jobs')).toBe(true);
      expect(hasRouteAccess('support', '/settings')).toBe(false);
      expect(hasRouteAccess('support', '/payouts')).toBe(false);
      expect(hasRouteAccess('support', '/finance')).toBe(false);
      expect(hasRouteAccess('support', '/team')).toBe(false);
    });

    it('unknown role has no access', () => {
      expect(hasRouteAccess('unknown', '/dashboard')).toBe(false);
      expect(hasRouteAccess('unknown', '/settings')).toBe(false);
      expect(hasRouteAccess('', '/dashboard')).toBe(false);
    });
  });

  describe('getVisibleRoutes', () => {
    it('super_admin gets wildcard', () => {
      const routes = getVisibleRoutes('super_admin');
      expect(routes).toContain('*');
      expect(routes).toEqual(['*']);
    });

    it('admin gets all defined admin routes', () => {
      const routes = getVisibleRoutes('admin');
      expect(routes.length).toBeGreaterThan(10);
      expect(routes).toContain('/dashboard');
      expect(routes).toContain('/users');
      expect(routes).toContain('/settings');
      expect(routes).toContain('/team');
    });

    it('manager gets manager routes', () => {
      const routes = getVisibleRoutes('manager');
      expect(routes).toContain('/dashboard');
      expect(routes).toContain('/jobs');
      expect(routes).not.toContain('/settings');
      expect(routes).not.toContain('/team');
    });

    it('support gets support routes', () => {
      const routes = getVisibleRoutes('support');
      expect(routes).toContain('/dashboard');
      expect(routes).toContain('/support-tickets');
      expect(routes).not.toContain('/settings');
    });

    it('unknown role gets empty array', () => {
      expect(getVisibleRoutes('unknown')).toEqual([]);
      expect(getVisibleRoutes('')).toEqual([]);
    });
  });

  describe('ROLE_PERMISSIONS', () => {
    it('has all four roles defined', () => {
      expect(ROLE_PERMISSIONS).toHaveProperty('super_admin');
      expect(ROLE_PERMISSIONS).toHaveProperty('admin');
      expect(ROLE_PERMISSIONS).toHaveProperty('manager');
      expect(ROLE_PERMISSIONS).toHaveProperty('support');
    });

    it('super_admin has wildcard permission', () => {
      expect(ROLE_PERMISSIONS.super_admin).toEqual(['*']);
    });

    it('admin routes include all expected paths', () => {
      const adminRoutes = ROLE_PERMISSIONS.admin;
      expect(adminRoutes).toContain('/dashboard');
      expect(adminRoutes).toContain('/users');
      expect(adminRoutes).toContain('/providers');
      expect(adminRoutes).toContain('/settings');
      expect(adminRoutes).toContain('/payouts');
    });
  });
});
