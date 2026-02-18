// User types
export type UserRole = 'customer' | 'provider' | 'admin';

export interface Profile {
  id: string;
  role: UserRole;
  phone?: string;
  full_name?: string;
  email?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

// Service types
export interface Service {
  id: string;
  name: string;
  icon: string;
  description: string;
  estimatedTime: string;
  basePrice: number;
  is_active?: boolean;
}

// Job/Request types
export type JobStatus =
  | 'requested'
  | 'matched'
  | 'accepted'
  | 'en_route'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'rated';

export interface Job {
  id: string;
  customer_id: string;
  provider_id?: string;
  service_id: string;
  vehicle_id?: string;
  status: JobStatus;
  pickup_location?: string;
  pickup_address?: string;
  destination_location?: string;
  destination_address?: string;
  is_hazard_location?: boolean;
  requester_type?: 'self' | 'family' | 'other';
  requester_name?: string;
  requester_phone?: string;
  scheduled_for?: string;
  requested_at: string;
  accepted_at?: string;
  started_at?: string;
  completed_at?: string;
  base_price?: number;
  distance_fee?: number;
  additional_fees?: number;
  total_price?: number;
  tip?: number;
  customer_notes?: string;
  completion_notes?: string;
  completion_photos?: string[];
  customer_rating?: number;
  provider_rating?: number;
  customer_review?: string;
  provider_review?: string;
  created_at: string;
  updated_at: string;
}

// Provider types
export type ProviderStatus = 'pending' | 'approved' | 'suspended' | 'rejected';

export interface Provider {
  id: string;
  user_id: string;
  status: ProviderStatus;
  account_type?: 'individual' | 'company';
  company_name?: string;
  rating: number;
  total_jobs: number;
  total_earnings: number;
  is_online: boolean;
  current_location?: any;
  vehicle_type?: string;
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_year?: number;
  vehicle_plate?: string;
  created_at: string;
  updated_at: string;
}

// Customer types
export interface Customer {
  id: string;
  user_id: string;
  total_jobs: number;
  total_spent: number;
  rating: number;
  created_at: string;
}

// Vehicle types
export interface Vehicle {
  id: string;
  customer_id: string;
  make: string;
  model: string;
  year: number;
  color: string;
  plate: string;
  is_default: boolean;
  created_at: string;
}

// Payment types
export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';

export interface Payment {
  id: string;
  job_id: string;
  customer_id: string;
  amount: number;
  tip: number;
  total: number;
  status: PaymentStatus;
  stripe_payment_intent_id?: string;
  created_at: string;
}

// Notification types
export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  data?: any;
  is_read: boolean;
  created_at: string;
}
