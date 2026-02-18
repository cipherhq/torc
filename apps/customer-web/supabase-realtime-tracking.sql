-- ============================================
-- TORC - Real-time Location Tracking Setup
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Enable Realtime for the jobs table (skip if already added)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE jobs;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Create a table to store location snapshots (for audit trail / history)
CREATE TABLE IF NOT EXISTS public.job_location_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('customer', 'provider')),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  heading DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  accuracy DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_location_logs_job ON public.job_location_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_job_location_logs_created ON public.job_location_logs(created_at);

-- 3. Enable RLS on location logs
ALTER TABLE public.job_location_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Job participants can view locations" ON public.job_location_logs;
DROP POLICY IF EXISTS "Job participants can insert locations" ON public.job_location_logs;

CREATE POLICY "Job participants can view locations"
  ON public.job_location_logs
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT customer_id FROM public.jobs WHERE id = job_id
      UNION
      SELECT provider_id FROM public.jobs WHERE id = job_id
    )
  );

CREATE POLICY "Job participants can insert locations"
  ON public.job_location_logs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 4. Create a provider_locations table for current live positions
CREATE TABLE IF NOT EXISTS public.provider_locations (
  provider_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  heading DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  is_online BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.provider_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view online provider locations" ON public.provider_locations;
DROP POLICY IF EXISTS "Providers can update their own location" ON public.provider_locations;

CREATE POLICY "Anyone can view online provider locations"
  ON public.provider_locations
  FOR SELECT
  USING (true);

CREATE POLICY "Providers can update their own location"
  ON public.provider_locations
  FOR ALL
  USING (auth.uid() = provider_id);

-- Enable realtime on provider_locations (skip if already added)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE provider_locations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. Ensure the jobs table has the columns we need
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'jobs' AND column_name = 'provider_id'
  ) THEN
    ALTER TABLE public.jobs ADD COLUMN provider_id UUID REFERENCES auth.users(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'jobs' AND column_name = 'provider_latitude'
  ) THEN
    ALTER TABLE public.jobs ADD COLUMN provider_latitude DOUBLE PRECISION;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'jobs' AND column_name = 'provider_longitude'
  ) THEN
    ALTER TABLE public.jobs ADD COLUMN provider_longitude DOUBLE PRECISION;
  END IF;
END $$;

-- ============================================
-- VERIFICATION
-- ============================================
SELECT 'job_location_logs' AS table_name, 
       EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'job_location_logs') AS exists;
SELECT 'provider_locations' AS table_name, 
       EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'provider_locations') AS exists;

-- ============================================
-- DONE! Real-time tracking tables are ready.
-- The app uses Supabase Realtime Broadcast for 
-- live location streaming (no table writes needed
-- for real-time movement). These tables provide
-- persistence and audit logging.
-- ============================================
