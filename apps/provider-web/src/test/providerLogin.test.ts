/**
 * Provider Login role-redirect tests.
 *
 * Verifies the login page only redirects when profile.role === 'provider',
 * preventing a customer account from briefly entering Provider screens.
 */
import { describe, it, expect } from 'vitest';

/**
 * Simulates the ProviderLogin useEffect redirect logic.
 * Returns true if the effect would navigate to /home.
 */
function wouldRedirect(state: {
  authLoading: boolean;
  isAuthenticated: boolean;
  profileRole: string | null | undefined;
}): boolean {
  const { authLoading, isAuthenticated, profileRole } = state;
  return !authLoading && isAuthenticated && profileRole === 'provider';
}

describe('ProviderLogin — redirect condition', () => {
  it('provider account: redirects to /home', () => {
    expect(wouldRedirect({
      authLoading: false, isAuthenticated: true, profileRole: 'provider',
    })).toBe(true);
  });

  it('customer account: does NOT redirect', () => {
    expect(wouldRedirect({
      authLoading: false, isAuthenticated: true, profileRole: 'customer',
    })).toBe(false);
  });

  it('admin account: does NOT redirect', () => {
    expect(wouldRedirect({
      authLoading: false, isAuthenticated: true, profileRole: 'admin',
    })).toBe(false);
  });

  it('authenticated but profile not yet loaded (null role): does NOT redirect', () => {
    expect(wouldRedirect({
      authLoading: false, isAuthenticated: true, profileRole: null,
    })).toBe(false);
  });

  it('authenticated but profile role is undefined: does NOT redirect', () => {
    expect(wouldRedirect({
      authLoading: false, isAuthenticated: true, profileRole: undefined,
    })).toBe(false);
  });

  it('auth still loading: does NOT redirect', () => {
    expect(wouldRedirect({
      authLoading: true, isAuthenticated: true, profileRole: 'provider',
    })).toBe(false);
  });

  it('not authenticated: does NOT redirect', () => {
    expect(wouldRedirect({
      authLoading: false, isAuthenticated: false, profileRole: null,
    })).toBe(false);
  });
});

describe('ProviderLogin — source verification', () => {
  let source: string;

  it('loads source', async () => {
    const fs = await import('fs');
    const path = await import('path');
    source = fs.readFileSync(
      path.resolve(__dirname, '../pages/provider/ProviderLogin.tsx'),
      'utf-8',
    );
    expect(source).toBeTruthy();
  });

  it('redirect condition checks profile.role === provider', () => {
    expect(source).toContain("profile?.role === 'provider'");
  });

  it('useEffect depends on profile.role', () => {
    expect(source).toContain('profile?.role, navigate');
  });

  it('destructures profile from useAuth', () => {
    expect(source).toContain('profile,');
    expect(source).toContain('useAuth()');
  });

  it('does NOT redirect on isAuthenticated alone', () => {
    // The old pattern was: if (!authLoading && isAuthenticated)
    // The new pattern requires profile?.role === 'provider' too
    const redirectEffect = source.substring(
      source.indexOf('useEffect(() => {'),
      source.indexOf('}, [authLoading'),
    );
    // Must NOT have a redirect that only checks isAuthenticated
    expect(redirectEffect).not.toMatch(
      /if\s*\(\s*!authLoading\s*&&\s*isAuthenticated\s*\)\s*\{?\s*navigate/,
    );
  });

  it('handleLogin catches errors and sets error state', () => {
    expect(source).toContain("setError(err.message || 'Failed to sign in.')");
  });

  it('error is rendered in the UI', () => {
    expect(source).toContain('{error}');
  });
});

describe('AuthContext — signIn role enforcement', () => {
  it('signIn checks role and throws for non-provider', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../context/AuthContext.jsx'),
      'utf-8',
    );

    // signIn must check role and sign out non-providers
    expect(source).toContain("prof.role !== 'provider'");
    expect(source).toContain('supabase.auth.signOut()');
    expect(source).toContain('This account is registered as a customer');
  });

  it('isAuthenticated is based on !!user (Supabase session)', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../context/AuthContext.jsx'),
      'utf-8',
    );
    // This confirms the race: isAuthenticated is true before role validation
    expect(source).toContain('isAuthenticated: !!user');
  });
});
