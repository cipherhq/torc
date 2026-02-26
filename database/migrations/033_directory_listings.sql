-- Directory listings for partner businesses (shops, gas stations, repair facilities).
-- Used by the admin Directory Management page.

CREATE TABLE IF NOT EXISTS public.directory_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL,
  business_type TEXT NOT NULL DEFAULT 'repair_shop',
  -- Types: repair_shop, gas_station, tow_yard, body_shop, tire_shop, dealership, other
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  description TEXT,
  is_partner BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  hours JSONB DEFAULT '{}',
  services_offered TEXT[] DEFAULT '{}',
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id)
);

-- RLS
ALTER TABLE public.directory_listings ENABLE ROW LEVEL SECURITY;

-- Anyone can view active listings
DROP POLICY IF EXISTS "Anyone can view active listings" ON public.directory_listings;
CREATE POLICY "Anyone can view active listings" ON public.directory_listings
  FOR SELECT USING (is_active = true);

-- Admins have full access
DROP POLICY IF EXISTS "Admin full access directory" ON public.directory_listings;
CREATE POLICY "Admin full access directory" ON public.directory_listings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Index for geo lookups
CREATE INDEX IF NOT EXISTS idx_directory_listings_geo
  ON public.directory_listings (latitude, longitude)
  WHERE is_active = true;

-- Index for type filtering
CREATE INDEX IF NOT EXISTS idx_directory_listings_type
  ON public.directory_listings (business_type)
  WHERE is_active = true;
