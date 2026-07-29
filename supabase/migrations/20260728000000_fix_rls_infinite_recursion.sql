-- ============================================================
-- 057: Fix RLS infinite recursion (ERROR 42P17)
-- ============================================================
-- Migration 056 introduced admin policies on `profiles` that
-- query `profiles` itself → infinite recursion. Every other
-- table with an admin policy that checks `profiles.role`
-- cascades into the same error.
--
-- Fix: create a SECURITY DEFINER helper `is_admin()` that
-- bypasses RLS, then rewrite every admin/role-checking policy
-- to call it instead of sub-selecting from `profiles`.
-- ============================================================

-- 1. Create SECURITY DEFINER helper (bypasses RLS on profiles)
CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_id AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, anon;

-- Helper for provider role check (used by jobs pending policy)
CREATE OR REPLACE FUNCTION public.is_provider(user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_id AND role = 'provider'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_provider(uuid) TO authenticated, anon;


-- ============================================================
-- 2. PROFILES table
-- ============================================================

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_admin(auth.uid()));

-- admin_can_update_profiles from migration 034
DROP POLICY IF EXISTS "admin_can_update_profiles" ON public.profiles;
CREATE POLICY "admin_can_update_profiles"
  ON public.profiles FOR UPDATE
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));


-- ============================================================
-- 3. SERVICES table
-- ============================================================

DROP POLICY IF EXISTS "Admins have full access to services" ON public.services;
CREATE POLICY "Admins have full access to services"
  ON public.services FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));


-- ============================================================
-- 4. PROVIDER_PROFILES table
-- ============================================================

DROP POLICY IF EXISTS "admin_full_access_provider_profiles" ON public.provider_profiles;
CREATE POLICY "admin_full_access_provider_profiles"
  ON public.provider_profiles FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));


-- ============================================================
-- 5. PROVIDER_LOCATIONS table
-- ============================================================

DROP POLICY IF EXISTS "Admins can view all provider locations" ON public.provider_locations;
CREATE POLICY "Admins can view all provider locations"
  ON public.provider_locations FOR SELECT
  USING (public.is_admin(auth.uid()));


-- ============================================================
-- 6. JOBS table
-- ============================================================

DROP POLICY IF EXISTS "Admins have full access to jobs" ON public.jobs;
CREATE POLICY "Admins have full access to jobs"
  ON public.jobs FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Providers can view pending jobs (also referenced profiles.role)
DROP POLICY IF EXISTS "Providers can view pending jobs" ON public.jobs;
CREATE POLICY "Providers can view pending jobs"
  ON public.jobs FOR SELECT
  USING (
    status = 'pending'
    AND public.is_provider(auth.uid())
  );


-- ============================================================
-- 7. SUPPORT_TICKETS table
-- ============================================================

DROP POLICY IF EXISTS "Admins can manage tickets" ON public.support_tickets;
CREATE POLICY "Admins can manage tickets"
  ON public.support_tickets FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));


-- ============================================================
-- 8. DOCUMENTS table
-- ============================================================

DROP POLICY IF EXISTS "Admins can manage documents" ON public.documents;
CREATE POLICY "Admins can manage documents"
  ON public.documents FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));


-- ============================================================
-- 9. PLATFORM_SETTINGS table
-- ============================================================

DROP POLICY IF EXISTS "Admins can read platform settings" ON public.platform_settings;
CREATE POLICY "Admins can read platform settings"
  ON public.platform_settings FOR SELECT
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can write platform settings" ON public.platform_settings;
CREATE POLICY "Admins can write platform settings"
  ON public.platform_settings FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));


-- ============================================================
-- 10. PROVIDER_PAYOUTS table
-- ============================================================

DROP POLICY IF EXISTS "admin_full_access_payouts" ON public.provider_payouts;
CREATE POLICY "admin_full_access_payouts"
  ON public.provider_payouts FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));


-- ============================================================
-- 11. DIRECTORY_LISTINGS table
-- ============================================================

DROP POLICY IF EXISTS "Admin full access directory" ON public.directory_listings;
CREATE POLICY "Admin full access directory"
  ON public.directory_listings FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
