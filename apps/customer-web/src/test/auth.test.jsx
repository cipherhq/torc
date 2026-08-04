import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

// --- Mocks ---

const mockAuthStateChangeCallbacks = vi.hoisted(() => []);
const mockSupabase = vi.hoisted(() => ({
  auth: {
    getSession: vi.fn(),
    getUser: vi.fn(),
    onAuthStateChange: vi.fn((callback) => {
      // Will be overridden per-test via mockImplementation
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
    setSession: vi.fn(),
    signUp: vi.fn(),
    resetPasswordForEmail: vi.fn(),
  },
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    })),
    update: vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
    })),
  })),
  channel: vi.fn(() => ({
    on: vi.fn(() => ({ subscribe: vi.fn() })),
    subscribe: vi.fn(),
  })),
  removeChannel: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({ supabase: mockSupabase, default: mockSupabase }));
vi.mock('../utils/nativePush', () => ({
  registerNativePushForUser: vi.fn(),
  deactivateNativePushToken: vi.fn(),
}));
vi.mock('../lib/authRedirectUrl', () => ({
  getAuthCallbackUrl: vi.fn(() => 'http://localhost/auth/callback'),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}));
vi.mock('../components/LoadingScreen', () => ({
  LoadingScreen: () => <div data-testid="loading-screen">Loading...</div>,
}));
vi.mock('motion/react', () => ({
  motion: new Proxy({}, {
    get: (_, tag) => {
      const MotionComponent = (props) => {
        const { animate, transition, ...rest } = props;
        const Tag = typeof tag === 'string' ? tag : 'div';
        return <Tag {...rest} />;
      };
      MotionComponent.displayName = `motion.${String(tag)}`;
      return MotionComponent;
    },
  }),
}));

// Helper: configure supabase.from to return profile data for a given userId
function mockProfileQuery(userId, profileData) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: profileData, error: null });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  mockSupabase.from.mockReturnValue({
    select,
    update: vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: profileData, error: null }),
        })),
      })),
    })),
  });
}

// Helper: fire auth state change event
function fireAuthStateChange(event, session) {
  mockAuthStateChangeCallbacks.forEach((cb) => cb(event, session));
}

// We import AuthProvider and related after mocks are set up
import { AuthProvider, useAuth, ProtectedRoute } from '../context/AuthContext';

// Test consumer component
function AuthConsumer() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(auth.loading)}</span>
      <span data-testid="is-authenticated">{String(auth.isAuthenticated)}</span>
      <span data-testid="user-id">{auth.user?.id || 'none'}</span>
      <span data-testid="profile-role">{auth.profile?.role || 'none'}</span>
    </div>
  );
}

const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function makeSession(userId, email = 'test@test.com') {
  return {
    user: { id: userId, email, user_metadata: {} },
    access_token: 'tok_' + userId,
    refresh_token: 'ref_' + userId,
  };
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthStateChangeCallbacks.length = 0;
    mockNavigate.mockReset();
    // Re-configure onAuthStateChange to capture callbacks
    mockSupabase.auth.onAuthStateChange.mockImplementation((callback) => {
      mockAuthStateChangeCallbacks.push(callback);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    // Default: no session
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
  });

  afterEach(() => {
    cleanup();
  });

  describe('Initial session resolution', () => {
    it('shows loading then resolves to unauthenticated', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null } });

      let container;
      await act(async () => {
        container = render(
          <MemoryRouter>
            <AuthProvider>
              <AuthConsumer />
            </AuthProvider>
          </MemoryRouter>
        );
      });

      // After bootstrap resolves, loading should be false
      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });
      expect(screen.getByTestId('is-authenticated').textContent).toBe('false');

      container.unmount();
    });

    it('shows loading then resolves to authenticated with profile', async () => {
      const session = makeSession('user-1');
      mockSupabase.auth.getSession.mockResolvedValue({ data: { session } });
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: session.user } });
      mockProfileQuery('user-1', { id: 'user-1', role: 'customer', first_name: 'Jane' });

      let container;
      await act(async () => {
        container = render(
          <MemoryRouter>
            <AuthProvider>
              <AuthConsumer />
            </AuthProvider>
          </MemoryRouter>
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });
      expect(screen.getByTestId('is-authenticated').textContent).toBe('true');
      expect(screen.getByTestId('user-id').textContent).toBe('user-1');

      container.unmount();
    });
  });

  describe('TOKEN_REFRESHED event', () => {
    it('does NOT unmount children or set loading', async () => {
      const session = makeSession('user-1');
      mockSupabase.auth.getSession.mockResolvedValue({ data: { session } });
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: session.user } });
      mockProfileQuery('user-1', { id: 'user-1', role: 'customer' });

      let container;
      await act(async () => {
        container = render(
          <MemoryRouter>
            <AuthProvider>
              <AuthConsumer />
            </AuthProvider>
          </MemoryRouter>
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });

      // Clear the from mock call count to track if profile is re-fetched
      mockSupabase.from.mockClear();

      // Fire TOKEN_REFRESHED
      const refreshedSession = makeSession('user-1');
      await act(async () => {
        fireAuthStateChange('TOKEN_REFRESHED', refreshedSession);
      });

      // Loading should still be false
      expect(screen.getByTestId('loading').textContent).toBe('false');
      // Children should still be rendered
      expect(screen.getByTestId('is-authenticated').textContent).toBe('true');
      // Profile should NOT have been re-fetched
      expect(mockSupabase.from).not.toHaveBeenCalled();

      container.unmount();
    });
  });

  describe('Repeated SIGNED_IN for same user', () => {
    it('does NOT trigger re-render or profile re-fetch', async () => {
      const session = makeSession('user-1');
      mockSupabase.auth.getSession.mockResolvedValue({ data: { session } });
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: session.user } });
      mockProfileQuery('user-1', { id: 'user-1', role: 'customer' });

      let container;
      await act(async () => {
        container = render(
          <MemoryRouter>
            <AuthProvider>
              <AuthConsumer />
            </AuthProvider>
          </MemoryRouter>
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });

      mockSupabase.from.mockClear();

      // Fire SIGNED_IN for same user
      await act(async () => {
        fireAuthStateChange('SIGNED_IN', session);
      });

      // Should not re-fetch profile for same user
      expect(mockSupabase.from).not.toHaveBeenCalled();
      expect(screen.getByTestId('user-id').textContent).toBe('user-1');

      container.unmount();
    });
  });

  describe('SIGNED_IN for different user', () => {
    it('fetches new profile', async () => {
      const session1 = makeSession('user-1');
      mockSupabase.auth.getSession.mockResolvedValue({ data: { session: session1 } });
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: session1.user } });
      mockProfileQuery('user-1', { id: 'user-1', role: 'customer' });

      let container;
      await act(async () => {
        container = render(
          <MemoryRouter>
            <AuthProvider>
              <AuthConsumer />
            </AuthProvider>
          </MemoryRouter>
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('user-id').textContent).toBe('user-1');
      });

      // Now sign in as different user
      const session2 = makeSession('user-2');
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: session2.user } });
      mockProfileQuery('user-2', { id: 'user-2', role: 'customer', first_name: 'Bob' });

      await act(async () => {
        fireAuthStateChange('SIGNED_IN', session2);
      });

      await waitFor(() => {
        expect(screen.getByTestId('user-id').textContent).toBe('user-2');
      });

      container.unmount();
    });
  });

  describe('Sign-out', () => {
    it('clears all state', async () => {
      const session = makeSession('user-1');
      mockSupabase.auth.getSession.mockResolvedValue({ data: { session } });
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: session.user } });
      mockProfileQuery('user-1', { id: 'user-1', role: 'customer' });

      let container;
      await act(async () => {
        container = render(
          <MemoryRouter>
            <AuthProvider>
              <AuthConsumer />
            </AuthProvider>
          </MemoryRouter>
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('is-authenticated').textContent).toBe('true');
      });

      // Fire SIGNED_OUT
      await act(async () => {
        fireAuthStateChange('SIGNED_OUT', null);
      });

      await waitFor(() => {
        expect(screen.getByTestId('is-authenticated').textContent).toBe('false');
        expect(screen.getByTestId('user-id').textContent).toBe('none');
        expect(screen.getByTestId('profile-role').textContent).toBe('none');
      });

      container.unmount();
    });
  });

  describe('Stale profile fetch', () => {
    it('is discarded when newer fetch starts', async () => {
      const session = makeSession('user-1');
      mockSupabase.auth.getSession.mockResolvedValue({ data: { session } });
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: session.user } });

      // First profile fetch: delayed
      let resolveSlowFetch;
      const slowPromise = new Promise((resolve) => { resolveSlowFetch = resolve; });

      const maybeSingle1 = vi.fn(() => slowPromise);
      const eq1 = vi.fn(() => ({ maybeSingle: maybeSingle1 }));
      const select1 = vi.fn(() => ({ eq: eq1 }));

      mockSupabase.from.mockReturnValueOnce({ select: select1 });

      let container;
      await act(async () => {
        container = render(
          <MemoryRouter>
            <AuthProvider>
              <AuthConsumer />
            </AuthProvider>
          </MemoryRouter>
        );
      });

      // Now fire a second SIGNED_IN for a different user, which starts a new fetch
      const session2 = makeSession('user-2');
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: session2.user } });
      mockProfileQuery('user-2', { id: 'user-2', role: 'customer', first_name: 'Fresh' });

      await act(async () => {
        fireAuthStateChange('SIGNED_IN', session2);
      });

      // Now resolve the slow fetch from user-1 (should be discarded)
      await act(async () => {
        resolveSlowFetch({ data: { id: 'user-1', role: 'provider', first_name: 'Stale' }, error: null });
      });

      await waitFor(() => {
        expect(screen.getByTestId('user-id').textContent).toBe('user-2');
      });

      container.unmount();
    });
  });

  describe('ProtectedRoute', () => {
    it('renders children when authenticated', async () => {
      const session = makeSession('user-1');
      mockSupabase.auth.getSession.mockResolvedValue({ data: { session } });
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: session.user } });
      mockProfileQuery('user-1', { id: 'user-1', role: 'customer' });

      let container;
      await act(async () => {
        container = render(
          <MemoryRouter>
            <AuthProvider>
              <ProtectedRoute>
                <div data-testid="protected-content">Secret stuff</div>
              </ProtectedRoute>
            </AuthProvider>
          </MemoryRouter>
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      });

      container.unmount();
    });

    it('redirects to /login when not authenticated', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null } });

      let container;
      await act(async () => {
        container = render(
          <MemoryRouter>
            <AuthProvider>
              <ProtectedRoute>
                <div data-testid="protected-content">Secret stuff</div>
              </ProtectedRoute>
            </AuthProvider>
          </MemoryRouter>
        );
      });

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/login');
      });
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();

      container.unmount();
    });

    it('does NOT unmount children during background profile refresh (hasRenderedRef)', async () => {
      const session = makeSession('user-1');
      mockSupabase.auth.getSession.mockResolvedValue({ data: { session } });
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: session.user } });
      mockProfileQuery('user-1', { id: 'user-1', role: 'customer' });

      const ChildWithEffect = () => {
        return <div data-testid="protected-child">Rendered</div>;
      };

      let container;
      await act(async () => {
        container = render(
          <MemoryRouter>
            <AuthProvider>
              <ProtectedRoute>
                <ChildWithEffect />
              </ProtectedRoute>
            </AuthProvider>
          </MemoryRouter>
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('protected-child')).toBeInTheDocument();
      });

      // Fire USER_UPDATED which triggers a background profile refresh
      // The children should remain mounted
      await act(async () => {
        fireAuthStateChange('USER_UPDATED', session);
      });

      // Children should still be present (not unmounted)
      expect(screen.getByTestId('protected-child')).toBeInTheDocument();

      container.unmount();
    });
  });
});
