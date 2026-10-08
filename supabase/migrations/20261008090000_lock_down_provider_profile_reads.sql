-- Restrict provider profile reads to provider owners, administrators, and the
-- customer assigned to that provider during an active job. This preserves the
-- direct table contract used by released native clients while eliminating
-- global reads by unrelated authenticated users.

DROP POLICY IF EXISTS "Authenticated users can view providers" ON public.provider_profiles;
DROP POLICY IF EXISTS "Anyone can view providers" ON public.provider_profiles;
DROP POLICY IF EXISTS "Support can view provider profiles" ON public.provider_profiles;

-- Anonymous users do not use provider profile data. Authenticated table
-- privileges remain subject to the owner/admin/active-job RLS policies.
REVOKE ALL ON TABLE public.provider_profiles FROM anon;

-- This helper exists in production already and is also the authorization
-- predicate used by existing profile/job policies. Define it here so a clean
-- migration chain from GitHub main is self-contained and behavior-compatible.
CREATE OR REPLACE FUNCTION public.customer_has_active_job_with_provider(customer_uid uuid, provider_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND (auth.uid() = customer_uid OR auth.uid() = provider_uid)
     AND EXISTS (
       SELECT 1 FROM public.jobs AS j
       WHERE j.customer_id = customer_uid AND j.provider_id = provider_uid
         AND j.status IN ('accepted', 'enroute', 'en_route', 'arrived', 'inprogress', 'in_progress')
     );
$$;
REVOKE ALL ON FUNCTION public.customer_has_active_job_with_provider(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_has_active_job_with_provider(uuid, uuid) TO authenticated;

CREATE POLICY "Customer can view assigned active provider profile"
  ON public.provider_profiles FOR SELECT TO authenticated
  USING (public.customer_has_active_job_with_provider(auth.uid(), id));

-- Safe customer-facing compatibility API. Updated clients use this instead of
-- provider_profiles; legacy clients remain on the job-scoped row policy until
-- the separately reviewed Stage 2 cutover removes that policy.
CREATE OR REPLACE FUNCTION public.get_job_provider_details(p_job_id uuid)
RETURNS TABLE (
  id uuid,
  full_name text,
  first_name text,
  last_name text,
  phone text,
  avatar_url text,
  services text[],
  vehicle_make text,
  vehicle_model text,
  vehicle_year integer,
  is_verified boolean,
  rating numeric,
  total_jobs integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT pp.id,
         pr.full_name::text,
         pr.first_name,
         pr.last_name,
         CASE WHEN j.status IN ('accepted', 'enroute', 'en_route', 'arrived', 'inprogress', 'in_progress')
              THEN pr.phone::text END,
         pr.avatar_url,
         pp.services,
         pp.vehicle_make,
         pp.vehicle_model,
         pp.vehicle_year,
         pp.is_verified,
         pp.rating,
         pp.total_jobs
  FROM public.jobs AS j
  JOIN public.provider_profiles AS pp ON pp.id = j.provider_id
  JOIN public.profiles AS pr ON pr.id = pp.id
  WHERE j.id = p_job_id
    AND j.customer_id = auth.uid()
    AND j.status IN ('accepted', 'enroute', 'en_route', 'arrived', 'inprogress', 'in_progress', 'completed');
$$;
REVOKE ALL ON FUNCTION public.get_job_provider_details(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_job_provider_details(uuid) TO authenticated;
COMMENT ON FUNCTION public.get_job_provider_details(uuid) IS
  'Returns customer-safe provider display and dispatch details for the caller’s own active or completed job. Excludes plate, license, earnings, and acceptance metrics.';
