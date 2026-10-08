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
