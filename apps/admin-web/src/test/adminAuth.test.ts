/**
 * Admin auth tests — verifies requireAdminSession rejects unauthenticated
 * users, non-admin roles, and does NOT default role to 'customer'.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock variables (vi.hoisted)
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockSelectProfile: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock supabase
// ---------------------------------------------------------------------------
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mocks.mockGetSession,
    },
    from: (table: string) => ({
      select: (cols: string) => ({
        eq: (col: string, val: string) => ({
          maybeSingle: mocks.mockSelectProfile,
        }),
      }),
    }),
  },
}));

// ---------------------------------------------------------------------------
// Import AFTER mocks
// ---------------------------------------------------------------------------
import { requireAdminSession } from '../lib/adminAuth';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('requireAdminSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated user (no session)', async () => {
    mocks.mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await expect(requireAdminSession()).rejects.toThrow(
      'No active session',
    );
  });

  it('rejects when getSession returns an error', async () => {
    mocks.mockGetSession.mockResolvedValue({
      data: { session: null },
      error: new Error('Session expired'),
    });

    await expect(requireAdminSession()).rejects.toThrow('Session expired');
  });

  it('rejects non-admin user (role=customer)', async () => {
    mocks.mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'user-1', email: 'customer@example.com' },
        },
      },
      error: null,
    });
    mocks.mockSelectProfile.mockResolvedValue({
      data: { role: 'customer' },
      error: null,
    });

    await expect(requireAdminSession()).rejects.toThrow(
      'not an admin',
    );
  });

  it('rejects non-admin user (role=provider)', async () => {
    mocks.mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'user-2', email: 'provider@example.com' },
        },
      },
      error: null,
    });
    mocks.mockSelectProfile.mockResolvedValue({
      data: { role: 'provider' },
      error: null,
    });

    await expect(requireAdminSession()).rejects.toThrow(
      'not an admin',
    );
  });

  it('rejects user with no profile (null)', async () => {
    mocks.mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'user-3', email: 'ghost@example.com' },
        },
      },
      error: null,
    });
    mocks.mockSelectProfile.mockResolvedValue({
      data: null,
      error: null,
    });

    await expect(requireAdminSession()).rejects.toThrow(
      'not an admin',
    );
  });

  it('does NOT default role to customer — null profile role is rejected', async () => {
    mocks.mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'user-4', email: 'new@example.com' },
        },
      },
      error: null,
    });
    // Profile exists but role is null/undefined
    mocks.mockSelectProfile.mockResolvedValue({
      data: { role: null },
      error: null,
    });

    await expect(requireAdminSession()).rejects.toThrow(
      'not an admin',
    );
  });

  it('accepts admin user and returns AdminSession', async () => {
    mocks.mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'admin-1', email: 'admin@torcapp.com' },
        },
      },
      error: null,
    });
    mocks.mockSelectProfile.mockResolvedValue({
      data: { role: 'admin' },
      error: null,
    });

    const result = await requireAdminSession();

    expect(result).toEqual({
      userId: 'admin-1',
      email: 'admin@torcapp.com',
    });
  });

  it('returns empty email when auth user has no email', async () => {
    mocks.mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'admin-2' }, // no email field
        },
      },
      error: null,
    });
    mocks.mockSelectProfile.mockResolvedValue({
      data: { role: 'admin' },
      error: null,
    });

    const result = await requireAdminSession();

    expect(result.userId).toBe('admin-2');
    expect(result.email).toBe('');
  });

  it('propagates profile fetch errors', async () => {
    mocks.mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'admin-3', email: 'admin3@torcapp.com' },
        },
      },
      error: null,
    });
    mocks.mockSelectProfile.mockResolvedValue({
      data: null,
      error: new Error('Database connection failed'),
    });

    await expect(requireAdminSession()).rejects.toThrow(
      'Database connection failed',
    );
  });
});
