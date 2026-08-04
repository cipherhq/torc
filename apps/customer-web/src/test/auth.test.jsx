/**
 * Auth context tests — verifies that TOKEN_REFRESHED does NOT unmount routes,
 * same-user SIGNED_IN does NOT re-render children, and sign-out clears state.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// ---------------------------------------------------------------------------
// Mock variables (vi.hoisted so they are available inside vi.mock factories)
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => {
  let authChangeCallback = null;

  return {
    mockGetSession: vi.fn(),
    mockGetUser: vi.fn(),
    mockOnAuthStateChange: vi.fn((cb) => {
      authChangeCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    mockSignOut: vi.fn(),
    mockSelectFrom: vi.fn(),
    mockNavigate: vi.fn(),
    getAuthChangeCallback: () => authChangeCallback,
  };
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mocks.mockGetSession,
      getUser: mocks.mockGetUser,
      onAuthStateChange: mocks.mockOnAuthStateChange,
      signOut: mocks.mockSignOut,
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      refreshSession: vi.fn(),
      setSession: vi.fn(),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: mocks.mockSelectFrom,
          single: mocks.mockSelectFrom,
          select: () => ({ eq: () => ({ maybeSingle: mocks.mockSelectFrom }) }),
        }),
      }),
      update: () => ({
        eq: () => ({
          select: () => ({
            single: mocks.mockSelectFrom,
          }),
        }),
      }),
    }),
  },
}));

vi.mock('react-router', () => ({
  useNavigate: () => mocks.mockNavigate,
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}));

vi.mock('../utils/nativePush', () => ({
  registerNativePushForUser: vi.fn(),
  deactivateNativePushToken: vi.fn(),
}));

vi.mock('../lib/authRedirectUrl', () => ({
  getAuthCallbackUrl: () => 'http://localhost/auth/callback',
}));

vi.mock('../components/LoadingScreen', () => ({
  LoadingScreen: () => <div data-testid="loading-screen">Loading...</div>,
}));

// ---------------------------------------------------------------------------
// Import AFTER mocks
// ---------------------------------------------------------------------------
import { AuthProvider, useAuth, ProtectedRoute } from '../context/AuthContext';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const TEST_USER = { id: 'user-1', email: 'test@example.com', user_metadata: {} };
const TEST_PROFILE = {
  id: 'user-1',
  email: 'test@example.com',
  first_name: 'Jane',
  last_name: 'Doe',
  full_name: 'Jane Doe',
  phone: '+15551234567',
  role: 'customer',
};

function ChildSpy() {
  const { user, profile, loading } = useAuth();
  return (
    <div data-testid="child">
      {user ? `user:${user.id}` : 'no-user'}
      {profile ? `,role:${profile.role}` : ''}
      {loading ? ',loading' : ''}
    </div>
  );
}

let renderCounter = 0;
function RenderCounter() {
  renderCounter++;
  const { user } = useAuth();
  return <div data-testid="render-counter">renders:{renderCounter},user:{user?.id ?? 'none'}</div>;
}

function setupSessionAndProfile(sessionUser, profile) {
  mocks.mockGetSession.mockResolvedValue({
    data: { session: sessionUser ? { user: sessionUser } : null },
  });
  mocks.mockGetUser.mockResolvedValue({
    data: { user: sessionUser },
  });
  mocks.mockSelectFrom.mockResolvedValue({
    data: profile,
    error: null,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    renderCounter = 0;
  });

  it('shows loading screen initially then resolves with no session', async () => {
    setupSessionAndProfile(null, null);

    render(
      <AuthProvider>
        <ChildSpy />
      </AuthProvider>,
    );

    // Initially shows loading screen
    expect(screen.getByTestId('loading-screen')).toBeInTheDocument();

    // After session resolves, shows children
    await waitFor(() => {
      expect(screen.getByTestId('child')).toHaveTextContent('no-user');
    });
  });

  it('shows loading screen initially then resolves with active session', async () => {
    setupSessionAndProfile(TEST_USER, TEST_PROFILE);

    render(
      <AuthProvider>
        <ChildSpy />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('child')).toHaveTextContent('user:user-1');
      expect(screen.getByTestId('child')).toHaveTextContent('role:customer');
    });
  });

  it('TOKEN_REFRESHED does NOT set loading or unmount children', async () => {
    setupSessionAndProfile(TEST_USER, TEST_PROFILE);

    render(
      <AuthProvider>
        <ChildSpy />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('child')).toHaveTextContent('user:user-1');
    });

    // Fire TOKEN_REFRESHED
    const cb = mocks.getAuthChangeCallback();
    act(() => {
      cb('TOKEN_REFRESHED', { user: TEST_USER });
    });

    // Children should still be visible, NOT replaced by loading screen
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByTestId('child')).toHaveTextContent('user:user-1');
    expect(screen.queryByTestId('loading-screen')).not.toBeInTheDocument();
    // No loading state in child text
    expect(screen.getByTestId('child').textContent).not.toContain('loading');
  });

  it('same-user SIGNED_IN does NOT trigger re-render with loading', async () => {
    setupSessionAndProfile(TEST_USER, TEST_PROFILE);

    render(
      <AuthProvider>
        <ChildSpy />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('child')).toHaveTextContent('user:user-1');
    });

    // Fire SIGNED_IN with same user id
    const cb = mocks.getAuthChangeCallback();
    act(() => {
      cb('SIGNED_IN', { user: TEST_USER });
    });

    // Should still show children, no loading
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.queryByTestId('loading-screen')).not.toBeInTheDocument();
  });

  it('different-user SIGNED_IN fetches new profile', async () => {
    setupSessionAndProfile(TEST_USER, TEST_PROFILE);

    render(
      <AuthProvider>
        <ChildSpy />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('child')).toHaveTextContent('user:user-1');
    });

    // Setup new user profile
    const newUser = { id: 'user-2', email: 'new@example.com', user_metadata: {} };
    const newProfile = { ...TEST_PROFILE, id: 'user-2', first_name: 'Bob', role: 'customer' };
    mocks.mockSelectFrom.mockResolvedValue({ data: newProfile, error: null });
    mocks.mockGetUser.mockResolvedValue({ data: { user: newUser } });

    const cb = mocks.getAuthChangeCallback();
    act(() => {
      cb('SIGNED_IN', { user: newUser });
    });

    await waitFor(() => {
      expect(screen.getByTestId('child')).toHaveTextContent('user:user-2');
    });
  });

  it('sign-out clears user and profile state', async () => {
    setupSessionAndProfile(TEST_USER, TEST_PROFILE);

    render(
      <AuthProvider>
        <ChildSpy />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('child')).toHaveTextContent('user:user-1');
    });

    const cb = mocks.getAuthChangeCallback();
    act(() => {
      cb('SIGNED_OUT', null);
    });

    await waitFor(() => {
      expect(screen.getByTestId('child')).toHaveTextContent('no-user');
    });
  });
});

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders children when authenticated', async () => {
    setupSessionAndProfile(TEST_USER, TEST_PROFILE);

    render(
      <AuthProvider>
        <ProtectedRoute>
          <div data-testid="protected-child">Protected Content</div>
        </ProtectedRoute>
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('protected-child')).toBeInTheDocument();
    });
  });

  it('does NOT unmount children during background refresh (TOKEN_REFRESHED)', async () => {
    setupSessionAndProfile(TEST_USER, TEST_PROFILE);

    render(
      <AuthProvider>
        <ProtectedRoute>
          <div data-testid="protected-child">Protected Content</div>
        </ProtectedRoute>
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('protected-child')).toBeInTheDocument();
    });

    // Fire TOKEN_REFRESHED - children must survive
    const cb = mocks.getAuthChangeCallback();
    act(() => {
      cb('TOKEN_REFRESHED', { user: TEST_USER });
    });

    expect(screen.getByTestId('protected-child')).toBeInTheDocument();
    expect(screen.queryByTestId('loading-screen')).not.toBeInTheDocument();
  });

  it('redirects to login when not authenticated', async () => {
    setupSessionAndProfile(null, null);

    render(
      <AuthProvider>
        <ProtectedRoute>
          <div data-testid="protected-child">Protected Content</div>
        </ProtectedRoute>
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(mocks.mockNavigate).toHaveBeenCalledWith('/login');
    });
  });
});
