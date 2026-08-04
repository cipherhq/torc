/**
 * Provider auth context tests — verifies that TOKEN_REFRESHED does NOT unmount
 * routes, same-user SIGNED_IN does NOT re-render children, sign-out clears state,
 * ProtectedRoute hasRenderedRef stability, and ProviderProtectedRoute role check.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    mockRemoveChannel: vi.fn(),
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
    channel: () => ({
      on: function () { return this; },
      subscribe: vi.fn(),
    }),
    removeChannel: mocks.mockRemoveChannel,
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
import { AuthProvider, useAuth, ProtectedRoute, ProviderProtectedRoute } from '../context/AuthContext';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const TEST_USER = { id: 'provider-1', email: 'provider@example.com', user_metadata: { role: 'provider' } };
const TEST_PROFILE = {
  id: 'provider-1',
  email: 'provider@example.com',
  first_name: 'Mike',
  last_name: 'Smith',
  full_name: 'Mike Smith',
  phone: '+15559876543',
  role: 'provider',
};

const TEST_PROVIDER_PROFILE = {
  id: 'provider-1',
  is_verified: true,
  created_at: '2026-01-01T00:00:00Z',
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
describe('Provider AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves initial session and loads profile', async () => {
    setupSessionAndProfile(TEST_USER, TEST_PROFILE);

    render(
      <AuthProvider>
        <ChildSpy />
      </AuthProvider>,
    );

    // Initially shows loading screen
    expect(screen.getByTestId('loading-screen')).toBeInTheDocument();

    // After session resolves, shows children with user and role
    await waitFor(() => {
      expect(screen.getByTestId('child')).toHaveTextContent('user:provider-1');
      expect(screen.getByTestId('child')).toHaveTextContent('role:provider');
    });
  });

  it('resolves with no session (unauthenticated)', async () => {
    setupSessionAndProfile(null, null);

    render(
      <AuthProvider>
        <ChildSpy />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('child')).toHaveTextContent('no-user');
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
      expect(screen.getByTestId('child')).toHaveTextContent('user:provider-1');
    });

    // Fire TOKEN_REFRESHED
    const cb = mocks.getAuthChangeCallback();
    act(() => {
      cb('TOKEN_REFRESHED', { user: TEST_USER });
    });

    // Children should still be visible, NOT replaced by loading screen
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByTestId('child')).toHaveTextContent('user:provider-1');
    expect(screen.queryByTestId('loading-screen')).not.toBeInTheDocument();
    expect(screen.getByTestId('child').textContent).not.toContain('loading');
  });

  it('same-user SIGNED_IN is deduplicated (no loading flash)', async () => {
    setupSessionAndProfile(TEST_USER, TEST_PROFILE);

    render(
      <AuthProvider>
        <ChildSpy />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('child')).toHaveTextContent('user:provider-1');
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

  it('sign-out clears user and profile state', async () => {
    setupSessionAndProfile(TEST_USER, TEST_PROFILE);

    render(
      <AuthProvider>
        <ChildSpy />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('child')).toHaveTextContent('user:provider-1');
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

describe('Provider ProtectedRoute', () => {
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

  it('hasRenderedRef keeps children visible during TOKEN_REFRESHED', async () => {
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

    // Fire TOKEN_REFRESHED — children must survive due to hasRenderedRef
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

describe('ProviderProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders children when authenticated with provider role', async () => {
    setupSessionAndProfile(TEST_USER, TEST_PROFILE);

    render(
      <AuthProvider>
        <ProviderProtectedRoute>
          <div data-testid="provider-child">Provider Content</div>
        </ProviderProtectedRoute>
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('provider-child')).toBeInTheDocument();
    });
  });

  it('redirects to login when authenticated with non-provider role', async () => {
    const customerUser = { id: 'customer-1', email: 'customer@example.com', user_metadata: { role: 'customer' } };
    const customerProfile = { ...TEST_PROFILE, id: 'customer-1', role: 'customer' };
    setupSessionAndProfile(customerUser, customerProfile);

    render(
      <AuthProvider>
        <ProviderProtectedRoute>
          <div data-testid="provider-child">Provider Content</div>
        </ProviderProtectedRoute>
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(mocks.mockNavigate).toHaveBeenCalledWith('/login');
    });

    // Should NOT render children
    expect(screen.queryByTestId('provider-child')).not.toBeInTheDocument();
  });

  it('redirects to login when not authenticated', async () => {
    setupSessionAndProfile(null, null);

    render(
      <AuthProvider>
        <ProviderProtectedRoute>
          <div data-testid="provider-child">Provider Content</div>
        </ProviderProtectedRoute>
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(mocks.mockNavigate).toHaveBeenCalledWith('/login');
    });
  });

  it('hasRenderedRef keeps children visible during background refresh', async () => {
    setupSessionAndProfile(TEST_USER, TEST_PROFILE);

    render(
      <AuthProvider>
        <ProviderProtectedRoute>
          <div data-testid="provider-child">Provider Content</div>
        </ProviderProtectedRoute>
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('provider-child')).toBeInTheDocument();
    });

    // Fire TOKEN_REFRESHED — children must survive
    const cb = mocks.getAuthChangeCallback();
    act(() => {
      cb('TOKEN_REFRESHED', { user: TEST_USER });
    });

    expect(screen.getByTestId('provider-child')).toBeInTheDocument();
    expect(screen.queryByTestId('loading-screen')).not.toBeInTheDocument();
  });
});
