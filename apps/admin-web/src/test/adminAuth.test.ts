import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks ---

const mockSupabase = vi.hoisted(() => ({
  auth: {
    getSession: vi.fn(),
    getUser: vi.fn(),
    onAuthStateChange: vi.fn(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    })),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
  },
  from: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({ supabase: mockSupabase, default: mockSupabase }));

import { requireAdminSession } from '../lib/adminAuth';

describe('Admin Auth - requireAdminSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated users (no session)', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await expect(requireAdminSession()).rejects.toThrow('No active session');
  });

  it('rejects non-admin users', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'user-1', email: 'customer@test.com' },
        },
      },
      error: null,
    });

    // Profile says role is 'customer', not 'admin'
    mockSupabase.from.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { role: 'customer', admin_role: null },
            error: null,
          }),
        })),
      })),
    });

    await expect(requireAdminSession()).rejects.toThrow('not an admin');
  });

  it('accepts admin users and returns session info', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'admin-1', email: 'admin@test.com' },
        },
      },
      error: null,
    });

    mockSupabase.from.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { role: 'admin', admin_role: 'super_admin' },
            error: null,
          }),
        })),
      })),
    });

    const result = await requireAdminSession();
    expect(result.userId).toBe('admin-1');
    expect(result.email).toBe('admin@test.com');
    expect(result.adminRole).toBe('super_admin');
  });

  it('defaults admin_role to "admin" when column is null or absent', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'admin-2', email: 'admin2@test.com' },
        },
      },
      error: null,
    });

    mockSupabase.from.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { role: 'admin', admin_role: null },
            error: null,
          }),
        })),
      })),
    });

    const result = await requireAdminSession();
    expect(result.adminRole).toBe('admin');
  });

  it('defaults admin_role to "admin" for unrecognized role values', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'admin-3', email: 'admin3@test.com' },
        },
      },
      error: null,
    });

    mockSupabase.from.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { role: 'admin', admin_role: 'some_unknown_role' },
            error: null,
          }),
        })),
      })),
    });

    const result = await requireAdminSession();
    expect(result.adminRole).toBe('admin');
  });
});
