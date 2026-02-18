-- ============================================================
-- TORC Full Database Schema
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/apojatplmfsbimgcyjoo/sql
-- ============================================================

-- Drop tables in dependency order to avoid conflicts from previous runs
DROP TABLE IF EXISTS public.jobs CASCADE;
DROP TABLE IF EXISTS public.vehicles CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.payment_methods CASCADE;
DROP TABLE IF EXISTS public.provider_profiles CASCADE;
DROP TABLE IF EXISTS public.services CASCADE;

-- 1. SERVICES TABLE (catalog of available services)
CREATE TABLE public.services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'Wrench',
  description TEXT,
  estimated_time TEXT,
  base_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed services
INSERT INTO public.services (id, name, icon, description, estimated_time, base_price) VALUES
  ('towing', 'Towing', 'Truck', 'Professional vehicle towing to your preferred destination', '15-25 min', 89),
  ('battery', 'Jump Start', 'Zap', 'Quick battery jumpstart to get you back on the road', '10-15 min', 49),
  ('lockout', 'Lockout', 'KeyRound', 'Professional lockout service for your vehicle', '10-20 min', 59),
  ('fuel', 'Fuel Delivery', 'Fuel', 'Emergency fuel delivery to your location', '15-20 min', 45),
  ('tire', 'Tire Change', 'CircleDot', 'Flat tire? We will change it for you', '15-25 min', 55),
  ('winch', 'Winch Out', 'Anchor', 'Stuck in mud, sand, or snow? We will pull you out', '20-30 min', 79),
  ('minor-repair', 'Minor Repair', 'Wrench', 'On-the-spot minor mechanical repairs', '20-40 min', 69),
  ('diagnostic', 'Diagnostic', 'ScanLine', 'Mobile diagnostic service to identify issues', '15-25 min', 59),
  ('emergency', 'Emergency Help', 'AlertTriangle', 'General emergency roadside assistance', '10-20 min', 65),
  ('motorcycle', 'Motorcycle', 'Bike', 'Specialized motorcycle towing and assistance', '15-25 min', 75),
  ('ev', 'EV Charge', 'Plug', 'Mobile charging for electric vehicles', '30-45 min', 89),
  ('consultation', 'Consultation', 'MessageSquare', 'Expert advice on vehicle issues', '15-20 min', 39)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  icon = EXCLUDED.icon,
  description = EXCLUDED.description,
  estimated_time = EXCLUDED.estimated_time,
  base_price = EXCLUDED.base_price;

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read services" ON public.services;
CREATE POLICY "Anyone can read services" ON public.services FOR SELECT USING (true);

-- 2. VEHICLES TABLE
CREATE TABLE public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER,
  color TEXT,
  plate TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicles_user ON public.vehicles(user_id);
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own vehicles" ON public.vehicles;
CREATE POLICY "Users can manage own vehicles" ON public.vehicles
  FOR ALL USING (auth.uid() = user_id);

-- 3. JOBS TABLE (service requests)
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES auth.users(id),
  provider_id UUID REFERENCES auth.users(id),
  service_id TEXT REFERENCES public.services(id),
  vehicle_id UUID REFERENCES public.vehicles(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','matching','accepted','enroute','arrived','inprogress','completed','cancelled')),
  pickup_latitude DOUBLE PRECISION,
  pickup_longitude DOUBLE PRECISION,
  pickup_address TEXT,
  destination_latitude DOUBLE PRECISION,
  destination_longitude DOUBLE PRECISION,
  destination_address TEXT,
  provider_latitude DOUBLE PRECISION,
  provider_longitude DOUBLE PRECISION,
  scheduled_for TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  customer_notes TEXT,
  requester_type TEXT DEFAULT 'self',
  requester_name TEXT,
  requester_phone TEXT,
  base_price NUMERIC(10,2),
  service_fee NUMERIC(10,2) DEFAULT 0,
  tax NUMERIC(10,2) DEFAULT 0,
  tip NUMERIC(10,2) DEFAULT 0,
  total_amount NUMERIC(10,2),
  payment_method_id UUID,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  review TEXT,
  reviewed_at TIMESTAMPTZ,
  provider_rating INTEGER CHECK (provider_rating >= 1 AND provider_rating <= 5),
  provider_review TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_customer ON public.jobs(customer_id);
CREATE INDEX IF NOT EXISTS idx_jobs_provider ON public.jobs(provider_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON public.jobs(created_at DESC);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers can view own jobs" ON public.jobs;
CREATE POLICY "Customers can view own jobs" ON public.jobs
  FOR SELECT USING (auth.uid() = customer_id OR auth.uid() = provider_id);

DROP POLICY IF EXISTS "Customers can create jobs" ON public.jobs;
CREATE POLICY "Customers can create jobs" ON public.jobs
  FOR INSERT WITH CHECK (auth.uid() = customer_id);

DROP POLICY IF EXISTS "Participants can update jobs" ON public.jobs;
CREATE POLICY "Participants can update jobs" ON public.jobs
  FOR UPDATE USING (auth.uid() = customer_id OR auth.uid() = provider_id);

-- Enable realtime (ignore error if already added)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE jobs;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. NOTIFICATIONS TABLE
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'info'
    CHECK (type IN ('service','payment','promo','rating','alert','info')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT false,
  action_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON public.notifications(created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
CREATE POLICY "System can insert notifications" ON public.notifications
  FOR INSERT WITH CHECK (true);

-- 5. PAYMENT METHODS TABLE
CREATE TABLE public.payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'card',
  brand TEXT,
  last4 TEXT,
  exp_month INTEGER,
  exp_year INTEGER,
  is_default BOOLEAN DEFAULT false,
  stripe_payment_method_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_user ON public.payment_methods(user_id);
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own payment methods" ON public.payment_methods;
CREATE POLICY "Users can manage own payment methods" ON public.payment_methods
  FOR ALL USING (auth.uid() = user_id);

-- 6. PROVIDER PROFILES (extended info for providers)
CREATE TABLE public.provider_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  services TEXT[] DEFAULT '{}',
  vehicle_make TEXT,
  vehicle_model TEXT,
  vehicle_year INTEGER,
  vehicle_plate TEXT,
  license_number TEXT,
  is_verified BOOLEAN DEFAULT false,
  is_online BOOLEAN DEFAULT false,
  rating NUMERIC(3,2) DEFAULT 0,
  total_jobs INTEGER DEFAULT 0,
  total_earnings NUMERIC(10,2) DEFAULT 0,
  acceptance_rate NUMERIC(5,2) DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.provider_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Provider can view own profile" ON public.provider_profiles;
CREATE POLICY "Provider can view own profile" ON public.provider_profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Provider can update own profile" ON public.provider_profiles;
CREATE POLICY "Provider can update own profile" ON public.provider_profiles
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Anyone can view providers" ON public.provider_profiles;
CREATE POLICY "Anyone can view providers" ON public.provider_profiles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Provider can insert own profile" ON public.provider_profiles;
CREATE POLICY "Provider can insert own profile" ON public.provider_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- 7. Update profiles table to add stats columns if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='total_jobs') THEN
    ALTER TABLE public.profiles ADD COLUMN total_jobs INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='rating') THEN
    ALTER TABLE public.profiles ADD COLUMN rating NUMERIC(3,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='member_since') THEN
    ALTER TABLE public.profiles ADD COLUMN member_since TIMESTAMPTZ DEFAULT now();
  END IF;
END $$;

-- Verify
SELECT 'Full schema created successfully!' AS status;
