// Global request context that persists across the booking flow
export interface RequestContext {
  whoNeedsHelp: 'me' | 'family' | 'new' | null;
  personName?: string;
  personPhone?: string;
  location: {
    lat: number;
    lng: number;
    address: string;
  } | null;
  isHazardous: boolean;
  serviceId: string | null;
  vehicleId: string | null;
  notes: string;
  photos: string[];
  destinationAddress?: string;
  scheduledFor: Date | null;
  paymentMethodId: string | null;
  estimatedPrice: number;
}

let requestContext: RequestContext = {
  whoNeedsHelp: null,
  location: null,
  isHazardous: false,
  serviceId: null,
  vehicleId: null,
  notes: '',
  photos: [],
  scheduledFor: null,
  paymentMethodId: null,
  estimatedPrice: 0,
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
    vehicleId: null,
    notes: '',
    photos: [],
    scheduledFor: null,
    paymentMethodId: null,
    estimatedPrice: 0,
  };
};
