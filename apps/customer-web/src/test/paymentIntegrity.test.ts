import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks ---

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}));

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: null }),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock sessionStorage
const sessionStorageData: Record<string, string> = {};
const mockSessionStorage = {
  getItem: vi.fn((key: string) => sessionStorageData[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { sessionStorageData[key] = value; }),
  removeItem: vi.fn((key: string) => { delete sessionStorageData[key]; }),
  clear: vi.fn(() => { Object.keys(sessionStorageData).forEach(k => delete sessionStorageData[k]); }),
  get length() { return Object.keys(sessionStorageData).length; },
  key: vi.fn((i: number) => Object.keys(sessionStorageData)[i] ?? null),
};

Object.defineProperty(globalThis, 'sessionStorage', { value: mockSessionStorage, writable: true });

import {
  getDraft,
  updateDraft,
  resetDraft,
  loadDraft,
} from '../data/bookingDraftStore';

describe('Payment Integrity (Booking Draft)', () => {
  beforeEach(() => {
    resetDraft(null);
    Object.keys(sessionStorageData).forEach(k => delete sessionStorageData[k]);
    vi.clearAllMocks();
  });

  it('checkoutId is preserved through draft updates', () => {
    updateDraft({ checkoutId: 'co_abc123' });
    updateDraft({ personName: 'Alice' });
    updateDraft({ notes: 'Flat tire on I-95' });

    const draft = getDraft();
    expect(draft.checkoutId).toBe('co_abc123');
    expect(draft.personName).toBe('Alice');
    expect(draft.notes).toBe('Flat tire on I-95');
  });

  it('draft does not store raw card data even when explicitly set', () => {
    updateDraft({
      checkoutId: 'co_xyz',
      paymentMethodId: 'pm_test_123',
      paymentIntentId: 'pi_test_456',
      // Attempt to sneak in card data
      cardNumber: '4242424242424242',
      cardCvc: '123',
      cardExpiry: '12/28',
      card: { number: '4242', cvc: '999' },
    } as any);

    const draft = getDraft() as any;
    // Payment IDs should be preserved
    expect(draft.checkoutId).toBe('co_xyz');
    expect(draft.paymentMethodId).toBe('pm_test_123');
    expect(draft.paymentIntentId).toBe('pi_test_456');
    // Raw card data must NOT be stored
    expect(draft.cardNumber).toBeUndefined();
    expect(draft.cardCvc).toBeUndefined();
    expect(draft.cardExpiry).toBeUndefined();
    expect(draft.card).toBeUndefined();
  });

  it('draft with payment data survives reload simulation', async () => {
    // Set up draft with payment info
    updateDraft({
      checkoutId: 'co_persist',
      paymentMethodId: 'pm_persist',
      paymentIntentId: 'pi_persist',
      paymentStatus: 'requires_action',
      paymentCurrency: 'usd',
      estimatedPrice: 150,
      _userId: 'user-1',
    } as any);

    // Get what was written to sessionStorage
    const storedJson = mockSessionStorage.setItem.mock.calls.at(-1)?.[1];
    expect(storedJson).toBeTruthy();

    // Simulate reload: clear in-memory state and load from storage
    resetDraft(null);
    mockSessionStorage.getItem.mockReturnValue(storedJson);

    const loaded = await loadDraft('user-1');

    expect(loaded.checkoutId).toBe('co_persist');
    expect(loaded.paymentMethodId).toBe('pm_persist');
    expect(loaded.paymentIntentId).toBe('pi_persist');
    expect(loaded.paymentStatus).toBe('requires_action');
    expect(loaded.paymentCurrency).toBe('usd');
    expect(loaded.estimatedPrice).toBe(150);
  });

  it('paymentStatus field can store valid statuses but card data is always stripped', () => {
    const statuses = ['unpaid', 'requires_action', 'paid', 'failed', 'refunded'] as const;

    for (const status of statuses) {
      updateDraft({
        paymentStatus: status,
        cardNumber: '1111222233334444',
      } as any);

      const draft = getDraft() as any;
      expect(draft.paymentStatus).toBe(status);
      expect(draft.cardNumber).toBeUndefined();
    }
  });
});
