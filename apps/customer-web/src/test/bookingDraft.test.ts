import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
  type BookingDraft,
} from '../data/bookingDraftStore';

const STORAGE_KEY = 'torc_booking_draft_v1';
const DRAFT_TTL_MS = 4 * 60 * 60 * 1000;

describe('BookingDraftStore', () => {
  beforeEach(() => {
    // Reset the module's in-memory state by resetting the draft
    resetDraft(null);
    // Clear sessionStorage mock
    Object.keys(sessionStorageData).forEach(k => delete sessionStorageData[k]);
    vi.clearAllMocks();
  });

  describe('getDraft', () => {
    it('returns empty draft initially', () => {
      const draft = getDraft();
      expect(draft.whoNeedsHelp).toBeNull();
      expect(draft.personName).toBe('');
      expect(draft.serviceId).toBeNull();
      expect(draft.estimatedPrice).toBe(0);
      expect(draft._version).toBe(1);
    });
  });

  describe('updateDraft', () => {
    it('persists changes', () => {
      updateDraft({ personName: 'Alice', notes: 'Flat tire' });
      const draft = getDraft();
      expect(draft.personName).toBe('Alice');
      expect(draft.notes).toBe('Flat tire');
    });

    it('preserves existing fields when partially updating', () => {
      updateDraft({ personName: 'Alice' });
      updateDraft({ notes: 'Help needed' });
      const draft = getDraft();
      expect(draft.personName).toBe('Alice');
      expect(draft.notes).toBe('Help needed');
    });
  });

  describe('resetDraft', () => {
    it('clears to empty', () => {
      updateDraft({ personName: 'Alice', notes: 'Test' });
      resetDraft(null);
      const draft = getDraft();
      expect(draft.personName).toBe('');
      expect(draft.notes).toBe('');
      expect(draft.whoNeedsHelp).toBeNull();
    });
  });

  describe('loadDraft', () => {
    it('returns empty for null storage', async () => {
      mockSessionStorage.getItem.mockReturnValue(null);
      const draft = await loadDraft('user-1');
      expect(draft.personName).toBe('');
      expect(draft._userId).toBe('user-1');
    });

    it('discards expired drafts', async () => {
      const expiredDraft = {
        _version: 1,
        _createdAt: Date.now() - DRAFT_TTL_MS - 10000,
        _updatedAt: Date.now() - DRAFT_TTL_MS - 10000,
        _userId: 'user-1',
        personName: 'Expired Alice',
        whoNeedsHelp: null,
        personPhone: '',
        location: null,
        isHazardous: false,
        serviceId: null,
        serviceName: null,
        serviceBasePrice: null,
        serviceIcon: null,
        vehicleId: null,
        notes: '',
        photos: [],
        destinationAddress: '',
        destinationCoords: null,
        fuelType: '',
        scheduledFor: null,
        paymentMethodId: null,
        estimatedPrice: 0,
        paymentIntentId: null,
        paymentStatus: null,
        paymentCurrency: null,
        checkoutId: null,
      };
      mockSessionStorage.getItem.mockReturnValue(JSON.stringify(expiredDraft));

      const draft = await loadDraft('user-1');
      expect(draft.personName).toBe('');
      expect(draft._userId).toBe('user-1');
    });

    it('discards drafts from different user', async () => {
      const otherUserDraft = {
        _version: 1,
        _createdAt: Date.now(),
        _updatedAt: Date.now(),
        _userId: 'user-other',
        personName: 'Other Person',
        whoNeedsHelp: null,
        personPhone: '',
        location: null,
        isHazardous: false,
        serviceId: null,
        serviceName: null,
        serviceBasePrice: null,
        serviceIcon: null,
        vehicleId: null,
        notes: '',
        photos: [],
        destinationAddress: '',
        destinationCoords: null,
        fuelType: '',
        scheduledFor: null,
        paymentMethodId: null,
        estimatedPrice: 0,
        paymentIntentId: null,
        paymentStatus: null,
        paymentCurrency: null,
        checkoutId: null,
      };
      mockSessionStorage.getItem.mockReturnValue(JSON.stringify(otherUserDraft));

      const draft = await loadDraft('user-1');
      expect(draft.personName).toBe('');
      expect(draft._userId).toBe('user-1');
    });

    it('restores valid draft', async () => {
      const validDraft = {
        _version: 1,
        _createdAt: Date.now(),
        _updatedAt: Date.now(),
        _userId: 'user-1',
        personName: 'Valid Person',
        whoNeedsHelp: 'me',
        personPhone: '555-1234',
        location: null,
        isHazardous: false,
        serviceId: 'svc-1',
        serviceName: 'Towing',
        serviceBasePrice: 50,
        serviceIcon: null,
        vehicleId: null,
        notes: 'Need help',
        photos: [],
        destinationAddress: '',
        destinationCoords: null,
        fuelType: '',
        scheduledFor: null,
        paymentMethodId: null,
        estimatedPrice: 75,
        paymentIntentId: null,
        paymentStatus: null,
        paymentCurrency: null,
        checkoutId: null,
      };
      mockSessionStorage.getItem.mockReturnValue(JSON.stringify(validDraft));

      const draft = await loadDraft('user-1');
      expect(draft.personName).toBe('Valid Person');
      expect(draft.whoNeedsHelp).toBe('me');
      expect(draft.serviceId).toBe('svc-1');
      expect(draft.estimatedPrice).toBe(75);
    });
  });

  describe('Card data stripping', () => {
    it('strips card data from updates (never persisted)', () => {
      updateDraft({
        personName: 'Alice',
        cardNumber: '4242424242424242',
        cardCvc: '123',
        cardExpiry: '12/25',
        card: { number: '4242' },
      } as any);

      const draft = getDraft() as any;
      expect(draft.personName).toBe('Alice');
      expect(draft.cardNumber).toBeUndefined();
      expect(draft.cardCvc).toBeUndefined();
      expect(draft.cardExpiry).toBeUndefined();
      expect(draft.card).toBeUndefined();
    });
  });

  describe('Schema version mismatch', () => {
    it('discards draft with wrong version', async () => {
      const wrongVersionDraft = {
        _version: 999,
        _createdAt: Date.now(),
        _updatedAt: Date.now(),
        _userId: 'user-1',
        personName: 'Wrong Version',
      };
      mockSessionStorage.getItem.mockReturnValue(JSON.stringify(wrongVersionDraft));

      const draft = await loadDraft('user-1');
      expect(draft.personName).toBe('');
      expect(draft._version).toBe(1);
    });
  });
});
