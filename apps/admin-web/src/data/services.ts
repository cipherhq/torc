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
    id: 'tire',
    name: 'Flat Tire',
    icon: 'Circle',
    description: 'Tire change with your spare or roadside repair',
    estimatedTime: '15-25 min',
    basePrice: 69,
  },
  {
    id: 'fuel',
    name: 'Fuel Delivery',
    icon: 'Fuel',
    description: 'Emergency fuel delivery to your location',
    estimatedTime: '15-20 min',
    basePrice: 55,
  },
  {
    id: 'winching',
    name: 'Winching',
    icon: 'Anchor',
    description: 'Professional winching service for stuck vehicles',
    estimatedTime: '20-30 min',
    basePrice: 99,
  },
  {
    id: 'mechanical',
    name: 'Mechanical',
    icon: 'Wrench',
    description: 'On-site mechanical diagnosis and minor repairs',
    estimatedTime: '25-40 min',
    basePrice: 79,
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
    id: 'exotic',
    name: 'Exotic/Luxury',
    icon: 'Sparkles',
    description: 'White-glove service for high-end vehicles',
    estimatedTime: '20-30 min',
    basePrice: 149,
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
    id: 'accident',
    name: 'Accident',
    icon: 'AlertTriangle',
    description: 'Post-accident towing and documentation',
    estimatedTime: '15-25 min',
    basePrice: 99,
  },
  {
    id: 'recovery',
    name: 'Recovery',
    icon: 'LifeBuoy',
    description: 'Off-road and ditch recovery services',
    estimatedTime: '25-35 min',
    basePrice: 109,
  },
];
