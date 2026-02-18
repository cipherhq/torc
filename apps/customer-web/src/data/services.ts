export interface Service {
  id: string;
  name: string;
  icon: string;
  description: string;
  estimatedTime: string;
  basePrice: number;
}

export const services: Service[] = [
  {
    id: 'towing',
    name: 'Towing',
    icon: 'Truck',
    description: 'Professional vehicle towing to your preferred destination',
    estimatedTime: '15-25 min',
    basePrice: 89,
  },
  {
    id: 'battery',
    name: 'Jump Start',
    icon: 'Zap',
    description: 'Quick battery jumpstart to get you back on the road',
    estimatedTime: '10-15 min',
    basePrice: 49,
  },
  {
    id: 'lockout',
    name: 'Lockout',
    icon: 'KeyRound',
    description: 'Professional lockout service for your vehicle',
    estimatedTime: '10-20 min',
    basePrice: 59,
  },
  {
    id: 'fuel',
    name: 'Fuel Delivery',
    icon: 'Fuel',
    description: 'Emergency fuel delivery to your location',
    estimatedTime: '15-20 min',
    basePrice: 45,
  },
  {
    id: 'tire',
    name: 'Tire Change',
    icon: 'CircleDot',
    description: 'Flat tire? We will change it for you',
    estimatedTime: '15-25 min',
    basePrice: 55,
  },
  {
    id: 'winch',
    name: 'Winch Out',
    icon: 'Anchor',
    description: 'Stuck in mud, sand, or snow? We will pull you out',
    estimatedTime: '20-30 min',
    basePrice: 79,
  },
  {
    id: 'minor-repair',
    name: 'Minor Repair',
    icon: 'Wrench',
    description: 'On-the-spot minor mechanical repairs',
    estimatedTime: '20-40 min',
    basePrice: 69,
  },
  {
    id: 'diagnostic',
    name: 'Diagnostic',
    icon: 'ScanLine',
    description: 'Mobile diagnostic service to identify issues',
    estimatedTime: '15-25 min',
    basePrice: 59,
  },
  {
    id: 'emergency',
    name: 'Emergency Help',
    icon: 'AlertTriangle',
    description: 'General emergency roadside assistance',
    estimatedTime: '10-20 min',
    basePrice: 65,
  },
  {
    id: 'motorcycle',
    name: 'Motorcycle',
    icon: 'Bike',
    description: 'Specialized motorcycle towing and assistance',
    estimatedTime: '15-25 min',
    basePrice: 75,
  },
  {
    id: 'ev',
    name: 'EV Charge',
    icon: 'Plug',
    description: 'Mobile charging for electric vehicles',
    estimatedTime: '30-45 min',
    basePrice: 89,
  },
  {
    id: 'consultation',
    name: 'Consultation',
    icon: 'MessageSquare',
    description: 'Expert advice on vehicle issues',
    estimatedTime: '15-20 min',
    basePrice: 39,
  },
];
