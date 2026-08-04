/**
 * Booking draft persistence tests — verifies localStorage-backed draft store
 * handles expiry, schema version mismatch, and sensitive data stripping.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// We need to control localStorage before the module loads, so we use
// dynamic imports and reset modules between tests.
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'torc_booking_draft_v1';

function buildStoredDraft(overrides: Record<string, any> = {}, meta: Record<string, any> = {}) {
  return JSON.stringify({
    _v: meta._v ?? 1,
    _ts: meta._ts ?? Date.now(),
    data: {
      whoNeedsHelp: null,
      location: null,
      isHazardous: false,
      serviceId: null,
      serviceName: null,
      serviceBasePrice: null,
      serviceIcon: null,
      vehicleId: null,
      notes: '',
      photos: [],
      scheduledFor: null,
      paymentMethodId: null,
      estimatedPrice: 0,
      paymentIntentId: null,
      paymentStatus: null,
      paymentCurrency: null,
      ...overrides,
    },
  });
}

describe('bookingDraftStore', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    localStorage.clear();
  });

  async function loadStore() {
    return await import('../data/bookingDraftStore');
  }

  it('returns default empty draft when nothing is stored', async () => {
    const store = await loadStore();
    const ctx = store.getRequestContext();

    expect(ctx.whoNeedsHelp).toBeNull();
    expect(ctx.serviceId).toBeNull();
    expect(ctx.vehicleId).toBeNull();
    expect(ctx.notes).toBe('');
    expect(ctx.photos).toEqual([]);
    expect(ctx.estimatedPrice).toBe(0);
  });

  it('updateDraft persists to localStorage', async () => {
    const store = await loadStore();

    store.updateRequestContext({ serviceId: 'svc-123', notes: 'flat tire' });

    const ctx = store.getRequestContext();
    expect(ctx.serviceId).toBe('svc-123');
    expect(ctx.notes).toBe('flat tire');

    // Verify it actually wrote to localStorage
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.data.serviceId).toBe('svc-123');
    expect(parsed._v).toBe(1);
  });

  it('resetDraft clears in-memory state and removes from localStorage', async () => {
    const store = await loadStore();

    store.updateRequestContext({ serviceId: 'svc-456', notes: 'lockout' });
    expect(store.getRequestContext().serviceId).toBe('svc-456');

    store.resetRequestContext();

    expect(store.getRequestContext().serviceId).toBeNull();
    expect(store.getRequestContext().notes).toBe('');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('discards expired drafts (older than 4 hours)', async () => {
    const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
    const expiredTs = Date.now() - FOUR_HOURS_MS - 1000; // 1 second past expiry

    localStorage.setItem(STORAGE_KEY, buildStoredDraft(
      { serviceId: 'svc-old', notes: 'expired draft' },
      { _ts: expiredTs },
    ));

    const store = await loadStore();
    const ctx = store.getRequestContext();

    expect(ctx.serviceId).toBeNull();
    expect(ctx.notes).toBe('');
    // Storage should have been cleaned up
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('loads valid non-expired drafts', async () => {
    const recentTs = Date.now() - 60_000; // 1 minute ago

    localStorage.setItem(STORAGE_KEY, buildStoredDraft(
      { serviceId: 'svc-recent', notes: 'still valid' },
      { _ts: recentTs },
    ));

    const store = await loadStore();
    const ctx = store.getRequestContext();

    expect(ctx.serviceId).toBe('svc-recent');
    expect(ctx.notes).toBe('still valid');
  });

  it('discards drafts with schema version mismatch', async () => {
    localStorage.setItem(STORAGE_KEY, buildStoredDraft(
      { serviceId: 'svc-v99' },
      { _v: 99 },
    ));

    const store = await loadStore();
    const ctx = store.getRequestContext();

    // Should return defaults, not the stored data
    expect(ctx.serviceId).toBeNull();
  });

  it('does NOT persist raw card data (paymentMethodId is an opaque ID, not card numbers)', async () => {
    const store = await loadStore();

    // paymentMethodId should be a Stripe PM id, not raw card data
    store.updateRequestContext({
      paymentMethodId: 'pm_1234567890',
      serviceId: 'svc-1',
    });

    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(raw!);

    // The store should persist paymentMethodId (an opaque token), but the
    // RequestContext interface does NOT have fields for card numbers, CVV, etc.
    expect(parsed.data.paymentMethodId).toBe('pm_1234567890');
    expect(parsed.data).not.toHaveProperty('cardNumber');
    expect(parsed.data).not.toHaveProperty('cvv');
    expect(parsed.data).not.toHaveProperty('cvc');
    expect(parsed.data).not.toHaveProperty('expiryDate');
  });

  it('rehydrates scheduledFor from ISO string', async () => {
    const date = new Date('2026-08-15T14:00:00Z');

    localStorage.setItem(STORAGE_KEY, buildStoredDraft(
      { scheduledFor: date.toISOString(), serviceId: 'svc-sched' },
      { _ts: Date.now() },
    ));

    const store = await loadStore();
    const ctx = store.getRequestContext();

    expect(ctx.scheduledFor).toBeInstanceOf(Date);
    expect((ctx.scheduledFor as Date).toISOString()).toBe(date.toISOString());
  });

  it('handles corrupted localStorage gracefully', async () => {
    localStorage.setItem(STORAGE_KEY, 'not-valid-json{{{');

    const store = await loadStore();
    const ctx = store.getRequestContext();

    // Should fall back to defaults
    expect(ctx.serviceId).toBeNull();
    expect(ctx.notes).toBe('');
  });
});
