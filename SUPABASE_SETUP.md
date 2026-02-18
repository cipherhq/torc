# Supabase Setup Guide for Torc

## 1. Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up / Log in
3. Click "New Project"
4. Fill in:
   - **Name**: torc-production
   - **Database Password**: (save this securely!)
   - **Region**: Choose closest to your users
   - **Pricing Plan**: Free tier to start

## 2. Database Schema

Run these SQL commands in Supabase SQL Editor:

### Step 1: Enable Required Extensions

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable PostGIS for location features
CREATE EXTENSION IF NOT EXISTS postgis;
```

### Step 2: Create Enum Types

```sql
-- User roles
CREATE TYPE user_role AS ENUM ('customer', 'provider', 'admin');

-- Job status
CREATE TYPE job_status AS ENUM (
  'requested',
  'matched',
  'accepted',
  'en_route',
  'arrived',
  'in_progress',
  'completed',
  'cancelled',
  'rated'
);

-- Provider status
CREATE TYPE provider_status AS ENUM ('pending', 'approved', 'suspended', 'rejected');

-- Document status
CREATE TYPE document_status AS ENUM ('pending', 'approved', 'rejected');

-- Payment status
CREATE TYPE payment_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'refunded');

-- Payout status
CREATE TYPE payout_status AS ENUM ('pending', 'processing', 'paid', 'failed');
```

### Step 3: Create Core Tables

```sql
-- Users table (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'customer',
  phone VARCHAR(20),
  full_name VARCHAR(255),
  email VARCHAR(255),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customers table
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  total_jobs INT DEFAULT 0,
  total_spent DECIMAL(10,2) DEFAULT 0,
  rating DECIMAL(3,2) DEFAULT 5.0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Providers table
CREATE TABLE providers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  status provider_status DEFAULT 'pending',
  account_type VARCHAR(20) CHECK (account_type IN ('individual', 'company')),
  company_name VARCHAR(255),
  rating DECIMAL(3,2) DEFAULT 5.0,
  total_jobs INT DEFAULT 0,
  total_earnings DECIMAL(10,2) DEFAULT 0,
  is_online BOOLEAN DEFAULT false,
  current_location GEOGRAPHY(POINT, 4326),
  vehicle_type VARCHAR(100),
  vehicle_make VARCHAR(100),
  vehicle_model VARCHAR(100),
  vehicle_year INT,
  vehicle_plate VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Services table
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(50),
  base_price DECIMAL(10,2) NOT NULL,
  estimated_time VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Provider services (many-to-many)
CREATE TABLE provider_services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID REFERENCES providers(id) ON DELETE CASCADE,
  service_id UUID REFERENCES services(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider_id, service_id)
);

-- Vehicles (customer vehicles)
CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  make VARCHAR(100),
  model VARCHAR(100),
  year INT,
  color VARCHAR(50),
  plate VARCHAR(50),
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Family members
CREATE TABLE family_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  name VARCHAR(255),
  phone VARCHAR(20),
  relation VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Jobs/Service Requests
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id),
  provider_id UUID REFERENCES providers(id),
  service_id UUID REFERENCES services(id),
  vehicle_id UUID REFERENCES vehicles(id),
  
  -- Request details
  status job_status DEFAULT 'requested',
  pickup_location GEOGRAPHY(POINT, 4326),
  pickup_address TEXT,
  destination_location GEOGRAPHY(POINT, 4326),
  destination_address TEXT,
  is_hazard_location BOOLEAN DEFAULT false,
  
  -- Who needs help
  requester_type VARCHAR(20) CHECK (requester_type IN ('self', 'family', 'other')),
  requester_name VARCHAR(255),
  requester_phone VARCHAR(20),
  
  -- Scheduling
  scheduled_for TIMESTAMPTZ,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Pricing
  base_price DECIMAL(10,2),
  distance_fee DECIMAL(10,2),
  additional_fees DECIMAL(10,2),
  total_price DECIMAL(10,2),
  tip DECIMAL(10,2) DEFAULT 0,
  
  -- Notes and photos
  customer_notes TEXT,
  completion_notes TEXT,
  completion_photos TEXT[], -- Array of image URLs
  
  -- Ratings
  customer_rating INT CHECK (customer_rating >= 1 AND customer_rating <= 5),
  provider_rating INT CHECK (provider_rating >= 1 AND provider_rating <= 5),
  customer_review TEXT,
  provider_review TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Job timeline (track status changes)
CREATE TABLE job_timeline (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  status job_status,
  notes TEXT,
  location GEOGRAPHY(POINT, 4326),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Location tracking (for live tracking)
CREATE TABLE location_updates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES providers(id),
  location GEOGRAPHY(POINT, 4326),
  speed DECIMAL(5,2), -- km/h
  heading INT, -- degrees
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payment methods
CREATE TABLE payment_methods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  stripe_payment_method_id VARCHAR(255),
  type VARCHAR(20) CHECK (type IN ('card', 'bank_account')),
  brand VARCHAR(50),
  last4 VARCHAR(4),
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payments
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES jobs(id),
  customer_id UUID REFERENCES customers(id),
  amount DECIMAL(10,2),
  tip DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2),
  status payment_status DEFAULT 'pending',
  stripe_payment_intent_id VARCHAR(255),
  stripe_charge_id VARCHAR(255),
  payment_method_id UUID REFERENCES payment_methods(id),
  failure_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payout accounts
CREATE TABLE payout_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID REFERENCES providers(id) ON DELETE CASCADE,
  stripe_account_id VARCHAR(255),
  account_type VARCHAR(20) CHECK (account_type IN ('bank', 'card')),
  bank_name VARCHAR(100),
  account_last4 VARCHAR(4),
  is_default BOOLEAN DEFAULT false,
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payouts
CREATE TABLE payouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID REFERENCES providers(id),
  payout_account_id UUID REFERENCES payout_accounts(id),
  amount DECIMAL(10,2),
  status payout_status DEFAULT 'pending',
  stripe_payout_id VARCHAR(255),
  job_ids UUID[], -- Array of job IDs included
  failure_reason TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Documents (provider verification)
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID REFERENCES providers(id) ON DELETE CASCADE,
  type VARCHAR(50) CHECK (type IN ('license', 'insurance', 'registration', 'certification', 'towing_cert')),
  file_url TEXT,
  file_name VARCHAR(255),
  status document_status DEFAULT 'pending',
  admin_notes TEXT,
  expires_at DATE,
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  title VARCHAR(255),
  message TEXT,
  type VARCHAR(50),
  data JSONB, -- Additional data (job_id, etc.)
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Explore listings (shops, gas stations)
CREATE TABLE explore_listings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255),
  type VARCHAR(50), -- 'repair_shop', 'tire_shop', 'gas_station'
  rating DECIMAL(3,2),
  review_count INT DEFAULT 0,
  distance DECIMAL(5,2), -- calculated field
  address TEXT,
  phone VARCHAR(20),
  location GEOGRAPHY(POINT, 4326),
  hours TEXT,
  services TEXT[],
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin team members
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role VARCHAR(20) CHECK (role IN ('admin', 'manager', 'support')),
  permissions JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Step 4: Create Indexes for Performance

```sql
-- Location indexes
CREATE INDEX idx_providers_location ON providers USING GIST(current_location);
CREATE INDEX idx_jobs_pickup_location ON jobs USING GIST(pickup_location);
CREATE INDEX idx_explore_location ON explore_listings USING GIST(location);

-- Common query indexes
CREATE INDEX idx_jobs_customer_id ON jobs(customer_id);
CREATE INDEX idx_jobs_provider_id ON jobs(provider_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX idx_providers_status ON providers(status);
CREATE INDEX idx_providers_online ON providers(is_online);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read);
```

### Step 5: Create Functions

```sql
-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_providers_updated_at BEFORE UPDATE ON providers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate distance between two points
CREATE OR REPLACE FUNCTION calculate_distance(
  lat1 DOUBLE PRECISION,
  lon1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION,
  lon2 DOUBLE PRECISION
)
RETURNS DOUBLE PRECISION AS $$
BEGIN
  RETURN ST_Distance(
    ST_SetSRID(ST_MakePoint(lon1, lat1), 4326)::geography,
    ST_SetSRID(ST_MakePoint(lon2, lat2), 4326)::geography
  ) / 1000; -- Returns distance in kilometers
END;
$$ LANGUAGE plpgsql;

-- Function to find nearby providers
CREATE OR REPLACE FUNCTION find_nearby_providers(
  user_lat DOUBLE PRECISION,
  user_lon DOUBLE PRECISION,
  service_id_param UUID,
  radius_km DOUBLE PRECISION DEFAULT 50
)
RETURNS TABLE(
  provider_id UUID,
  provider_name VARCHAR,
  rating DECIMAL,
  distance_km DOUBLE PRECISION,
  is_online BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    pr.full_name,
    p.rating,
    ST_Distance(
      p.current_location,
      ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)::geography
    ) / 1000 AS distance_km,
    p.is_online
  FROM providers p
  JOIN profiles pr ON p.user_id = pr.id
  JOIN provider_services ps ON p.id = ps.provider_id
  WHERE 
    ps.service_id = service_id_param
    AND p.is_online = true
    AND p.status = 'approved'
    AND ps.is_active = true
    AND ST_DWithin(
      p.current_location,
      ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)::geography,
      radius_km * 1000 -- Convert km to meters
    )
  ORDER BY distance_km ASC
  LIMIT 20;
END;
$$ LANGUAGE plpgsql;
```

### Step 6: Set Up Row Level Security (RLS)

```sql
-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can read/update their own profile
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Customers: Can view own data
CREATE POLICY "Customers can view own data" ON customers
  FOR SELECT USING (
    user_id = auth.uid()
  );

-- Providers: Can view own data
CREATE POLICY "Providers can view own data" ON providers
  FOR SELECT USING (
    user_id = auth.uid()
  );

CREATE POLICY "Providers can update own data" ON providers
  FOR UPDATE USING (
    user_id = auth.uid()
  );

-- Jobs: Complex policies
CREATE POLICY "Customers can view own jobs" ON jobs
  FOR SELECT USING (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  );

CREATE POLICY "Providers can view assigned jobs" ON jobs
  FOR SELECT USING (
    provider_id IN (SELECT id FROM providers WHERE user_id = auth.uid())
  );

CREATE POLICY "Providers can view available jobs" ON jobs
  FOR SELECT USING (
    status = 'requested' AND provider_id IS NULL
  );

CREATE POLICY "Customers can create jobs" ON jobs
  FOR INSERT WITH CHECK (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  );

CREATE POLICY "Providers can update assigned jobs" ON jobs
  FOR UPDATE USING (
    provider_id IN (SELECT id FROM providers WHERE user_id = auth.uid())
  );

-- Documents: Providers can manage own documents
CREATE POLICY "Providers can view own documents" ON documents
  FOR SELECT USING (
    provider_id IN (SELECT id FROM providers WHERE user_id = auth.uid())
  );

CREATE POLICY "Providers can upload documents" ON documents
  FOR INSERT WITH CHECK (
    provider_id IN (SELECT id FROM providers WHERE user_id = auth.uid())
  );

-- Notifications: Users can view own notifications
CREATE POLICY "Users can view own notifications" ON notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (user_id = auth.uid());
```

### Step 7: Insert Initial Services Data

```sql
INSERT INTO services (name, description, icon, base_price, estimated_time) VALUES
('Jump Start', 'Quick battery jumpstart to get you back on the road', 'Zap', 49.00, '10-15 min'),
('Towing', 'Professional vehicle towing to your preferred destination', 'Truck', 89.00, '15-25 min'),
('Flat Tire', 'Tire change with your spare or roadside repair', 'Circle', 69.00, '15-25 min'),
('Fuel Delivery', 'Emergency fuel delivery to your location', 'Fuel', 55.00, '15-20 min'),
('Lockout', 'Professional lockout service for your vehicle', 'KeyRound', 59.00, '10-20 min'),
('Winching', 'Professional winching service for stuck vehicles', 'Anchor', 99.00, '20-30 min'),
('Mechanical', 'On-site mechanical diagnosis and minor repairs', 'Wrench', 79.00, '25-40 min'),
('Motorcycle', 'Specialized motorcycle towing and assistance', 'Bike', 75.00, '15-25 min'),
('Exotic/Luxury', 'White-glove service for high-end vehicles', 'Sparkles', 149.00, '20-30 min'),
('EV Charge', 'Mobile charging for electric vehicles', 'Plug', 89.00, '30-45 min'),
('Accident', 'Post-accident towing and documentation', 'AlertTriangle', 99.00, '15-25 min'),
('Recovery', 'Off-road and ditch recovery services', 'LifeBuoy', 109.00, '25-35 min');
```

## 3. Set Up Storage Buckets

In Supabase Dashboard → Storage, create these buckets:

1. **profile-avatars** (public)
   - For user profile photos
   
2. **documents** (private)
   - For provider verification documents
   - Enable RLS policies
   
3. **service-photos** (private)
   - For job completion photos
   
4. **receipts** (private)
   - For payment receipts

### Storage RLS Policies

```sql
-- Profile avatars: Anyone can read, users can upload own
CREATE POLICY "Public avatars are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'profile-avatars');

CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'profile-avatars' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Documents: Only owner and admins can access
CREATE POLICY "Providers can view own documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Providers can upload own documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
```

## 4. Get Your API Keys

1. Go to Project Settings → API
2. Copy these values:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: For client-side
   - **service_role key**: For server-side (keep secret!)

## 5. Enable Realtime

Go to Database → Replication and enable realtime for:
- `jobs` table (for live job updates)
- `location_updates` table (for live tracking)
- `notifications` table (for instant notifications)

## Next Steps

1. ✅ Create Supabase project
2. ✅ Run all SQL commands above
3. ✅ Create storage buckets
4. ✅ Copy API keys
5. ✅ Enable realtime
6. → Install Supabase client in your app
7. → Set up environment variables
