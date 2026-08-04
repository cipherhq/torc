-- ============================================================
-- 058: Fix remaining RLS recursion on profiles, provider_locations, chat_messages
-- ============================================================
-- The "Users can view profiles of active job participants" policy
-- on profiles references the jobs table. When provider_locations or
-- chat_messages policies also reference jobs (which references profiles
-- through evaluation chains), PostgreSQL detects circular RLS.
--
-- Fix: wrap the job-participant check in a SECURITY DEFINER function
-- so the profiles→jobs subquery bypasses RLS on both sides.
-- ============================================================

-- Helper: check if two users share an active job
CREATE OR REPLACE FUNCTION public.shares_active_job(viewer_id uuid, target_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.jobs
    WHERE status IN ('pending', 'matching', 'accepted', 'enroute', 'arrived', 'inprogress')
      AND (
        (customer_id = viewer_id AND provider_id = target_id)
        OR
        (provider_id = viewer_id AND customer_id = target_id)
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.shares_active_job(uuid, uuid) TO authenticated, anon;

-- Helper: check if a customer has an active job with a given provider
CREATE OR REPLACE FUNCTION public.customer_has_active_job_with_provider(customer_uid uuid, provider_uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.jobs
    WHERE customer_id = customer_uid
      AND provider_id = provider_uid
      AND status IN ('accepted', 'enroute', 'arrived', 'inprogress')
  );
$$;

GRANT EXECUTE ON FUNCTION public.customer_has_active_job_with_provider(uuid, uuid) TO authenticated, anon;

-- Helper: check if user is participant in a job
CREATE OR REPLACE FUNCTION public.is_job_participant(user_id uuid, p_job_id text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.jobs
    WHERE id::text = p_job_id
      AND (customer_id = user_id OR provider_id = user_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_job_participant(uuid, text) TO authenticated, anon;


-- ============================================================
-- A. PROFILES — replace job-subquery policy with SECURITY DEFINER call
-- ============================================================

DROP POLICY IF EXISTS "Users can view profiles of active job participants" ON public.profiles;
CREATE POLICY "Users can view profiles of active job participants"
  ON public.profiles
  FOR SELECT
  USING (public.shares_active_job(auth.uid(), id));


-- ============================================================
-- B. PROVIDER_LOCATIONS — replace job-subquery policies
-- ============================================================

DROP POLICY IF EXISTS "Customers can view matched provider locations" ON public.provider_locations;
CREATE POLICY "Customers can view matched provider locations"
  ON public.provider_locations
  FOR SELECT
  USING (public.customer_has_active_job_with_provider(auth.uid(), provider_id));


-- ============================================================
-- C. CHAT_MESSAGES — replace job-subquery + admin policies
-- ============================================================

DROP POLICY IF EXISTS "Job participants can read chat messages" ON public.chat_messages;
CREATE POLICY "Job participants can read chat messages"
  ON public.chat_messages
  FOR SELECT
  USING (public.is_job_participant(auth.uid(), job_id));

DROP POLICY IF EXISTS "Job participants can insert chat messages" ON public.chat_messages;
CREATE POLICY "Job participants can insert chat messages"
  ON public.chat_messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()::text
    AND public.is_job_participant(auth.uid(), job_id)
  );

DROP POLICY IF EXISTS "Admins can read all chat messages" ON public.chat_messages;
CREATE POLICY "Admins can read all chat messages"
  ON public.chat_messages
  FOR SELECT
  USING (public.is_admin(auth.uid()));
