import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase
const mockInsert = vi.fn().mockResolvedValue({ error: null });
const mockFrom = vi.fn().mockReturnValue({ insert: mockInsert });
const mockGetSession = vi.fn();

vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: any[]) => mockGetSession(...args),
    },
    from: (...args: any[]) => mockFrom(...args),
  },
}));

import { logAudit } from '../auditLog';

describe('logAudit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not throw when session is missing', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    await expect(
      logAudit({
        action: 'test_action',
        entity_type: 'test',
        entity_id: '123',
      })
    ).resolves.toBeUndefined();
  });

  it('does not insert when there is no authenticated user', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    await logAudit({
      action: 'test_action',
      entity_type: 'test',
      entity_id: '123',
    });

    // Should not call from().insert() because no actor_id
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('inserts audit log when session has a user', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'user-abc-123' },
        },
      },
    });

    await logAudit({
      action: 'update_user',
      entity_type: 'user',
      entity_id: 'user-xyz',
      details: { reason: 'test' },
    });

    expect(mockFrom).toHaveBeenCalledWith('admin_audit_logs');
    expect(mockInsert).toHaveBeenCalledWith({
      actor_id: 'user-abc-123',
      action: 'update_user',
      entity_type: 'user',
      entity_id: 'user-xyz',
      details: { reason: 'test' },
    });
  });

  it('provides empty object for details when not specified', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'user-abc-123' },
        },
      },
    });

    await logAudit({
      action: 'delete_item',
      entity_type: 'item',
      entity_id: 'item-456',
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ details: {} })
    );
  });

  it('does not throw even when insert fails', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'user-abc-123' },
        },
      },
    });
    mockInsert.mockRejectedValue(new Error('DB error'));

    await expect(
      logAudit({
        action: 'test_action',
        entity_type: 'test',
        entity_id: '123',
      })
    ).resolves.toBeUndefined();
  });
});
