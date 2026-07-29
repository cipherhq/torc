-- ============================================================
-- 059: Drop duplicate RLS policies with old names
-- ============================================================
-- Migrations 057/058 created fixed policies but the old ones
-- had slightly different names and weren't dropped. This removes
-- the stale duplicates that caused continued recursion.
-- ============================================================

-- profiles: old duplicates
DROP POLICY IF EXISTS "Admin can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view active job participant profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- provider_locations: old duplicates
DROP POLICY IF EXISTS "Admin view all locations" ON public.provider_locations;
DROP POLICY IF EXISTS "Customers view matched provider locations" ON public.provider_locations;

-- Clean up temporary diagnostic function
DROP FUNCTION IF EXISTS public.dump_policies();
