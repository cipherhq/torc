export const mockVehicles = [
  {
    id: '1',
    make: 'Tesla',
    model: 'Model 3',
    year: 2023,
    color: 'Silver',
    plate: 'ABC 1234',
  },
  {
    id: '2',
    make: 'Ford',
    model: 'F-150',
    year: 2022,
    color: 'Black',
    plate: 'XYZ 5678',
  },
];

export const mockPaymentMethods = [
  {
    id: '1',
    type: 'card',
    brand: 'Visa',
    last4: '4242',
    isDefault: true,
  },
  {
    id: '2',
    type: 'card',
    brand: 'Mastercard',
    last4: '8888',
    isDefault: false,
  },
];

export const mockFamilyMembers = [
  {
    id: '1',
    name: 'Sarah Johnson',
    phone: '+1 (555) 123-4567',
    relation: 'Spouse',
  },
  {
    id: '2',
    name: 'Michael Johnson',
    phone: '+1 (555) 987-6543',
    relation: 'Parent',
  },
];

export const mockJobs = [
  {
    id: '1',
    service: 'Jump Start',
    status: 'scheduled',
    scheduledFor: new Date('2026-02-12T10:00:00'),
    location: '1234 Tech Boulevard, San Francisco, CA',
    vehicle: 'Silver Tesla Model 3',
    price: 49,
  },
  {
    id: '2',
    service: 'Towing',
    status: 'completed',
    completedAt: new Date('2026-02-05T14:30:00'),
    location: '5678 Innovation Drive, San Francisco, CA',
    destination: '9012 Repair Lane, San Francisco, CA',
    vehicle: 'Black Ford F-150',
    price: 89,
    providerName: 'Marcus Rodriguez',
    providerRating: 4.9,
    tip: 15,
    customerRating: 5,
  },
  {
    id: '3',
    service: 'Flat Tire',
    status: 'completed',
    completedAt: new Date('2026-01-28T09:15:00'),
    location: '3456 Downtown Street, San Francisco, CA',
    vehicle: 'Silver Tesla Model 3',
    price: 69,
    providerName: 'Jessica Chen',
    providerRating: 5.0,
    tip: 10,
    customerRating: 5,
  },
];

export const mockShops = [
  {
    id: '1',
    name: 'Bay Area Auto Repair',
    type: 'Repair Shop',
    rating: 4.8,
    reviews: 342,
    distance: '1.2 mi',
    address: '789 Workshop Ave, San Francisco, CA',
    phone: '+1 (555) 246-8101',
    lat: 37.7749,
    lng: -122.4194,
    hours: 'Mon-Fri 8AM-6PM',
    services: ['Oil Change', 'Brake Repair', 'Diagnostics'],
  },
  {
    id: '2',
    name: 'Golden Gate Tires',
    type: 'Tire Shop',
    rating: 4.9,
    reviews: 156,
    distance: '0.8 mi',
    address: '234 Tire Street, San Francisco, CA',
    phone: '+1 (555) 369-2580',
    lat: 37.7849,
    lng: -122.4094,
    hours: 'Mon-Sat 7AM-7PM',
    services: ['Tire Replacement', 'Alignment', 'Rotation'],
  },
];
