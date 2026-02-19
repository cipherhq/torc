// Global request context that persists across the booking flow
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

let requestContext: RequestContext = {
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

export const getRequestContext = () => requestContext;

export const updateRequestContext = (updates: Partial<RequestContext>) => {
  requestContext = { ...requestContext, ...updates };
};

export const resetRequestContext = () => {
  requestContext = {
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
};
