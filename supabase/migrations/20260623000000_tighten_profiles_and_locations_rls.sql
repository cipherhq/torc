-- ============================================================
-- 056: Tighten profiles + provider_locations RLS
-- ============================================================
-- Fixes overly permissive SELECT policies that let any authenticated
-- user see ALL profiles and ALL provider GPS locations.
-- Must be run AFTER migration 055.

-- ============================================================
-- A. PROFILES — replace blanket authenticated SELECT
-- ============================================================

-- Drop the overly permissive policy from migration 051
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;

-- 1. Users can always see their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- 2. Users can see profiles of people they share an active job with
--    (customer sees provider profile and vice versa)
CREATE POLICY "Users can view profiles of active job participants"
  ON public.profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.status IN ('pending', 'matching', 'accepted', 'enroute', 'arrived', 'inprogress')
        AND (
          -- Current user is the customer, viewing the provider's profile
          (jobs.customer_id = auth.uid() AND jobs.provider_id = profiles.id)
          OR
          -- Current user is the provider, viewing the customer's profile
          (jobs.provider_id = auth.uid() AND jobs.customer_id = profiles.id)
        )
    )
  );

-- 3. Admins can see all profiles
CREATE POLICY "Admins can view all profiles"
  ON public.profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles AS p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- ============================================================
-- B. PROVIDER_LOCATIONS — replace blanket authenticated SELECT
-- ============================================================

-- Drop the overly permissive policy from migration 052
DROP POLICY IF EXISTS "Authenticated users can view online provider locations" ON public.provider_locations;

-- Also drop the legacy "Providers can update their own location" ALL policy
-- and replace with properly scoped per-operation policies
DROP POLICY IF EXISTS "Providers can update their own location" ON public.provider_locations;

-- 1. Providers can see their own location
CREATE POLICY "Providers can view own location"
  ON public.provider_locations
  FOR SELECT
  USING (auth.uid() = provider_id);

-- 2. Providers can insert their own location
CREATE POLICY "Providers can insert own location"
  ON public.provider_locations
  FOR INSERT
  WITH CHECK (auth.uid() = provider_id);

-- 3. Providers can update their own location
CREATE POLICY "Providers can update own location"
  ON public.provider_locations
  FOR UPDATE
  USING (auth.uid() = provider_id);

-- 4. Providers can delete their own location
CREATE POLICY "Providers can delete own location"
  ON public.provider_locations
  FOR DELETE
  USING (auth.uid() = provider_id);

-- 5. Customers can see provider locations ONLY for providers matched to their active jobs
CREATE POLICY "Customers can view matched provider locations"
  ON public.provider_locations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.customer_id = auth.uid()
        AND jobs.provider_id = provider_locations.provider_id
        AND jobs.status IN ('accepted', 'enroute', 'arrived', 'inprogress')
    )
  );

-- 6. Admins can see all provider locations
CREATE POLICY "Admins can view all provider locations"
  ON public.provider_locations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================
-- NOTE: The get_nearby_providers() RPC function is SECURITY DEFINER
-- so it bypasses RLS and will continue to work for dispatch.
-- ============================================================
