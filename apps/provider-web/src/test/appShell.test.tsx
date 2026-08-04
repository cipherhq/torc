/**
 * AppShell route set tests — verifies that PROTECTED_DATA_ENTRY_ROUTES and
 * AUTO_REDIRECT_ALLOWED_ROUTES are correctly defined and contain the expected
 * routes for redirect safety.
 *
 * These are static assertions against the exported route sets, so they do not
 * require rendering the full AppShell component.
 */
import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// We import the AppShell module to access its route sets. Since the component
// itself has many dependencies (supabase, react-router, capacitor, etc.), we
// mock those dependencies but only test the static Set constants.
// ---------------------------------------------------------------------------

// Mock variables (vi.hoisted for use in vi.mock factories)
const mocks = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockLocation: { pathname: '/' },
}));

vi.mock('react-router', () => ({
  Navigate: () => null,
  Outlet: () => null,
  useLocation: () => mocks.mockLocation,
  useNavigate: () => mocks.mockNavigate,
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    loading: false,
    profile: null,
    user: null,
  }),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          in: () => ({
            gte: () => ({
              limit: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null }) }),
            }),
            lt: () => ({ then: vi.fn() }),
          }),
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        }),
      }),
      update: () => ({
        eq: () => ({
          in: () => ({
            lt: () => ({ then: vi.fn() }),
          }),
        }),
      }),
    }),
    channel: () => ({
      on: function () { return this; },
      subscribe: vi.fn(),
    }),
    removeChannel: vi.fn(),
  },
}));

vi.mock('../components/ProviderBottomNav', () => ({
  ProviderBottomNav: () => null,
}));

vi.mock('../components/LoadingScreen', () => ({
  LoadingScreen: () => null,
}));

vi.mock('../utils/audio', () => ({
  initAudio: vi.fn(),
  playMessageSound: vi.fn(),
  showSystemNotification: vi.fn(),
}));

vi.mock('../lib/chatEncryption', () => ({
  decryptMessage: vi.fn(),
}));

vi.mock('@capacitor/haptics', () => ({
  Haptics: { vibrate: vi.fn().mockResolvedValue(undefined) },
}));

// ---------------------------------------------------------------------------
// Since the route sets are module-level constants (not exported), we read the
// source file content and verify the sets declaratively. This avoids needing
// to export internal constants just for testing.
// ---------------------------------------------------------------------------

// We can directly read the file to verify the sets, or we can re-declare them
// here and test that the expected routes are present. The safer approach is to
// re-read the source and verify the strings are present.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const appShellSource = readFileSync(
  resolve(__dirname, '../components/AppShell.tsx'),
  'utf-8',
);

describe('AppShell Route Sets', () => {
  describe('PROTECTED_DATA_ENTRY_ROUTES', () => {
    it('is defined in AppShell.tsx', () => {
      expect(appShellSource).toContain('PROTECTED_DATA_ENTRY_ROUTES');
    });

    it('contains /provider/personal-information', () => {
      // Extract the PROTECTED_DATA_ENTRY_ROUTES set definition
      const match = appShellSource.match(
        /PROTECTED_DATA_ENTRY_ROUTES\s*=\s*new Set\(\[([\s\S]*?)\]\)/,
      );
      expect(match).not.toBeNull();
      const setContents = match![1];
      expect(setContents).toContain('/provider/personal-information');
    });

    it('contains /onboarding', () => {
      const match = appShellSource.match(
        /PROTECTED_DATA_ENTRY_ROUTES\s*=\s*new Set\(\[([\s\S]*?)\]\)/,
      );
      expect(match).not.toBeNull();
      expect(match![1]).toContain('/onboarding');
    });

    it('contains /services', () => {
      const match = appShellSource.match(
        /PROTECTED_DATA_ENTRY_ROUTES\s*=\s*new Set\(\[([\s\S]*?)\]\)/,
      );
      expect(match).not.toBeNull();
      expect(match![1]).toContain("'/services'");
    });

    it('contains /profile', () => {
      const match = appShellSource.match(
        /PROTECTED_DATA_ENTRY_ROUTES\s*=\s*new Set\(\[([\s\S]*?)\]\)/,
      );
      expect(match).not.toBeNull();
      expect(match![1]).toContain("'/profile'");
    });

    it('contains /documents', () => {
      const match = appShellSource.match(
        /PROTECTED_DATA_ENTRY_ROUTES\s*=\s*new Set\(\[([\s\S]*?)\]\)/,
      );
      expect(match).not.toBeNull();
      expect(match![1]).toContain('/documents');
    });

    it('contains /payout', () => {
      const match = appShellSource.match(
        /PROTECTED_DATA_ENTRY_ROUTES\s*=\s*new Set\(\[([\s\S]*?)\]\)/,
      );
      expect(match).not.toBeNull();
      expect(match![1]).toContain('/payout');
    });
  });

  describe('AUTO_REDIRECT_ALLOWED_ROUTES', () => {
    it('is defined in AppShell.tsx', () => {
      expect(appShellSource).toContain('AUTO_REDIRECT_ALLOWED_ROUTES');
    });

    it('contains /home', () => {
      const match = appShellSource.match(
        /AUTO_REDIRECT_ALLOWED_ROUTES\s*=\s*new Set\(\[([\s\S]*?)\]\)/,
      );
      expect(match).not.toBeNull();
      expect(match![1]).toContain("'/home'");
    });

    it('contains /earnings', () => {
      const match = appShellSource.match(
        /AUTO_REDIRECT_ALLOWED_ROUTES\s*=\s*new Set\(\[([\s\S]*?)\]\)/,
      );
      expect(match).not.toBeNull();
      expect(match![1]).toContain('/earnings');
    });

    it('contains /messages', () => {
      const match = appShellSource.match(
        /AUTO_REDIRECT_ALLOWED_ROUTES\s*=\s*new Set\(\[([\s\S]*?)\]\)/,
      );
      expect(match).not.toBeNull();
      expect(match![1]).toContain('/messages');
    });

    it('does NOT contain /provider/personal-information', () => {
      const match = appShellSource.match(
        /AUTO_REDIRECT_ALLOWED_ROUTES\s*=\s*new Set\(\[([\s\S]*?)\]\)/,
      );
      expect(match).not.toBeNull();
      expect(match![1]).not.toContain('/provider/personal-information');
    });

    it('does NOT contain /onboarding', () => {
      const match = appShellSource.match(
        /AUTO_REDIRECT_ALLOWED_ROUTES\s*=\s*new Set\(\[([\s\S]*?)\]\)/,
      );
      expect(match).not.toBeNull();
      expect(match![1]).not.toContain('/onboarding');
    });
  });

  describe('Route set disjointness', () => {
    it('PROTECTED_DATA_ENTRY_ROUTES and AUTO_REDIRECT_ALLOWED_ROUTES have no overlap', () => {
      const protectedMatch = appShellSource.match(
        /PROTECTED_DATA_ENTRY_ROUTES\s*=\s*new Set\(\[([\s\S]*?)\]\)/,
      );
      const autoMatch = appShellSource.match(
        /AUTO_REDIRECT_ALLOWED_ROUTES\s*=\s*new Set\(\[([\s\S]*?)\]\)/,
      );

      expect(protectedMatch).not.toBeNull();
      expect(autoMatch).not.toBeNull();

      // Extract route strings from both sets
      const extractRoutes = (content: string) => {
        const routes: string[] = [];
        const re = /'([^']+)'/g;
        let m;
        while ((m = re.exec(content)) !== null) {
          routes.push(m[1]);
        }
        return routes;
      };

      const protectedRoutes = extractRoutes(protectedMatch![1]);
      const autoRoutes = extractRoutes(autoMatch![1]);

      // No route should appear in both sets
      const overlap = protectedRoutes.filter((r) => autoRoutes.includes(r));
      expect(overlap).toEqual([]);
    });
  });
});
