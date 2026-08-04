/**
 * Persisted, versioned booking draft store.
 *
 * Replaces the volatile module-level requestContext with a store that:
 * - Persists to Capacitor Preferences (native) or sessionStorage (web)
 * - Tracks a schema version for safe migration
 * - Expires stale drafts (configurable TTL)
 * - Never stores raw card data
 * - Clears only on confirmed job creation or explicit abandonment
 */
import { Capacitor } from '@capacitor/core';

const STORAGE_KEY = 'torc_booking_draft_v1';
const DRAFT_SCHEMA_VERSION = 1;
const DRAFT_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

export interface BookingDraft {
  _version: number;
  _createdAt: number;
  _updatedAt: number;
  _userId: string | null;
  whoNeedsHelp: 'me' | 'new' | null;
  personName: string;
  personPhone: string;
  location: { lat: number; lng: number; address: string } | null;
  isHazardous: boolean;
  serviceId: string | null;
  serviceName: string | null;
  serviceBasePrice: number | null;
  serviceIcon: string | null;
  vehicleId: string | null;
  notes: string;
  photos: string[];
  destinationAddress: string;
  destinationCoords: { lat: number; lng: number } | null;
  fuelType: string;
  scheduledFor: string | null; // ISO string, not Date (for serialization)
  paymentMethodId: string | null;
  estimatedPrice: number;
  // Payment fields — IDs only, never raw card data
  paymentIntentId: string | null;
  paymentStatus: 'unpaid' | 'requires_action' | 'paid' | 'failed' | 'refunded' | null;
  paymentCurrency: string | null;
  // Checkout tracking
  checkoutId: string | null;
}

function createEmptyDraft(userId: string | null = null): BookingDraft {
  const now = Date.now();
  return {
    _version: DRAFT_SCHEMA_VERSION,
    _createdAt: now,
    _updatedAt: now,
    _userId: userId,
    whoNeedsHelp: null,
    personName: '',
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
}

// --- Storage abstraction ---

const isNative = typeof window !== 'undefined' &&
  (Capacitor.isNativePlatform() || (window as any).__TORC_NATIVE__ === true);

async function readRaw(): Promise<string | null> {
  if (isNative) {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      const result = await Preferences.get({ key: STORAGE_KEY });
      return result.value;
    } catch {
      return null;
    }
  }
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

async function writeRaw(json: string): Promise<void> {
  if (isNative) {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.set({ key: STORAGE_KEY, value: json });
    } catch {
      // Fallback: at least keep in memory
    }
    return;
  }
  try {
    sessionStorage.setItem(STORAGE_KEY, json);
  } catch {
    // Storage full or unavailable — draft stays in memory only
  }
}

async function removeRaw(): Promise<void> {
  if (isNative) {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.remove({ key: STORAGE_KEY });
    } catch {}
    return;
  }
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
}

// --- Validation and migration ---

function stripCardData(draft: any): any {
  // Ensure no raw card data is ever stored
  const clone = { ...draft };
  delete clone.cardNumber;
  delete clone.cardCvc;
  delete clone.cardExpiry;
  delete clone.card;
  return clone;
}

function isDraftValid(draft: any): draft is BookingDraft {
  if (!draft || typeof draft !== 'object') return false;
  if (draft._version !== DRAFT_SCHEMA_VERSION) return false;
  if (typeof draft._createdAt !== 'number') return false;
  if (typeof draft._updatedAt !== 'number') return false;
  return true;
}

function isDraftExpired(draft: BookingDraft): boolean {
  return Date.now() - draft._updatedAt > DRAFT_TTL_MS;
}

function isDraftForUser(draft: BookingDraft, userId: string | null): boolean {
  if (!userId) return false;
  return draft._userId === userId;
}

// --- In-memory state ---

let currentDraft: BookingDraft = createEmptyDraft();
let listeners: Array<() => void> = [];

function notify() {
  listeners.forEach((fn) => fn());
}

// --- Public API ---

export function subscribe(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((fn) => fn !== listener);
  };
}

export function getDraft(): Readonly<BookingDraft> {
  return currentDraft;
}

export function updateDraft(updates: Partial<Omit<BookingDraft, '_version' | '_createdAt'>>): void {
  currentDraft = stripCardData({
    ...currentDraft,
    ...updates,
    _updatedAt: Date.now(),
  });
  notify();
  // Persist async — fire and forget
  writeRaw(JSON.stringify(currentDraft)).catch(() => {});
}

export function resetDraft(userId: string | null = null): void {
  currentDraft = createEmptyDraft(userId);
  notify();
  removeRaw().catch(() => {});
}

/**
 * Load draft from storage. Call once at app startup.
 * Returns the loaded draft or a fresh one.
 */
export async function loadDraft(userId: string | null): Promise<BookingDraft> {
  try {
    const raw = await readRaw();
    if (!raw) {
      currentDraft = createEmptyDraft(userId);
      notify();
      return currentDraft;
    }

    const parsed = JSON.parse(raw);
    if (!isDraftValid(parsed)) {
      // Invalid or old schema — discard
      await removeRaw();
      currentDraft = createEmptyDraft(userId);
      notify();
      return currentDraft;
    }

    if (isDraftExpired(parsed)) {
      await removeRaw();
      currentDraft = createEmptyDraft(userId);
      notify();
      return currentDraft;
    }

    if (!isDraftForUser(parsed, userId)) {
      // Draft belongs to a different user — discard
      await removeRaw();
      currentDraft = createEmptyDraft(userId);
      notify();
      return currentDraft;
    }

    // Valid, unexpired, correct user
    currentDraft = stripCardData(parsed);
    notify();
    return currentDraft;
  } catch {
    currentDraft = createEmptyDraft(userId);
    notify();
    return currentDraft;
  }
}

/**
 * For backward compatibility: get/update functions matching old requestContext API.
 */
export const getRequestContext = getDraft;

export const updateRequestContext = (updates: Partial<BookingDraft>): void => {
  updateDraft(updates);
};

export const resetRequestContext = (): void => {
  resetDraft(currentDraft._userId);
};
