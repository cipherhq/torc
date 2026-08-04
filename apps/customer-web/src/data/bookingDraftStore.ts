/**
 * Persisted, versioned booking draft store.
 *
 * Replaces the in-memory-only requestContext with a localStorage-backed store
 * so the booking flow survives page refreshes and app restarts.
 *
 * Re-exports getRequestContext / updateRequestContext / resetRequestContext
 * for drop-in compatibility with existing imports from requestContext.ts.
 */

const STORAGE_KEY = 'torc_booking_draft_v1';
const SCHEMA_VERSION = 1;

export interface RequestContext {
  whoNeedsHelp: 'me' | 'new' | null;
  personName?: string;
  personPhone?: string;
  location: {
    lat: number;
    lng: number;
    address: string;
  } | null;
  isHazardous: boolean;
  serviceId: string | null;
  serviceName?: string | null;
  serviceBasePrice?: number | null;
  serviceIcon?: string | null;
  vehicleId: string | null;
  notes: string;
  photos: string[];
  destinationAddress?: string;
  scheduledFor: Date | null;
  paymentMethodId: string | null;
  estimatedPrice: number;
  paymentIntentId?: string | null;
  paymentStatus?: 'unpaid' | 'requires_action' | 'paid' | 'failed' | 'refunded' | null;
  paymentCurrency?: string | null;
}

interface StoredDraft {
  _v: number;
  _ts: number;
  data: RequestContext;
}

function getDefaults(): RequestContext {
  return {
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
  };
}

// Max age for a persisted draft: 4 hours
const MAX_AGE_MS = 4 * 60 * 60 * 1000;

function loadFromStorage(): RequestContext {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaults();

    const stored: StoredDraft = JSON.parse(raw);

    // Version mismatch or expired -- discard
    if (stored._v !== SCHEMA_VERSION) return getDefaults();
    if (Date.now() - stored._ts > MAX_AGE_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return getDefaults();
    }

    // Rehydrate scheduledFor from ISO string
    const data = { ...getDefaults(), ...stored.data };
    if (typeof data.scheduledFor === 'string') {
      data.scheduledFor = new Date(data.scheduledFor);
    }
    return data;
  } catch {
    return getDefaults();
  }
}

function saveToStorage(ctx: RequestContext): void {
  try {
    const stored: StoredDraft = {
      _v: SCHEMA_VERSION,
      _ts: Date.now(),
      data: ctx,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Storage full or unavailable -- best-effort
  }
}

// In-memory state, hydrated from localStorage on module load
let requestContext: RequestContext = loadFromStorage();

export const getRequestContext = (): RequestContext => requestContext;

export const updateRequestContext = (updates: Partial<RequestContext>): void => {
  requestContext = { ...requestContext, ...updates };
  saveToStorage(requestContext);
};

export const resetRequestContext = (): void => {
  requestContext = getDefaults();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
};
