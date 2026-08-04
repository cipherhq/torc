-- ============================================================
-- 051: Security Hardening — RLS policies, storage buckets, role protection
-- ============================================================
-- Fixes overly permissive RLS policies identified in security audit.
-- Must be run AFTER all prior migrations (001–050).

-- ============================================================
-- A. PROVIDER_PAYOUTS — drop permissive insert/update
-- Migration 021 already has admin_full_access_payouts + providers_view_own_payouts.
-- Migration 030 added "Anyone can" as a workaround — remove them.
-- ============================================================

DROP POLICY IF EXISTS "Anyone can insert payouts" ON public.provider_payouts;
DROP POLICY IF EXISTS "Anyone can update payouts" ON public.provider_payouts;

-- ============================================================
-- B. PROVIDER_PAYOUT_METHODS — drop public read, ensure scoped access
-- ============================================================

DROP POLICY IF EXISTS "Anyone can read payout methods" ON public.provider_payout_methods;

-- Idempotent: ensure admin can read all payout methods
DROP POLICY IF EXISTS "Admins can read payout methods" ON public.provider_payout_methods;
CREATE POLICY "Admins can read payout methods"
  ON public.provider_payout_methods
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================
-- C. CHAT_MESSAGES — restrict to job participants + admins
-- job_id and sender_id are TEXT columns; jobs.id is UUID.
-- ============================================================

DROP POLICY IF EXISTS "Anyone can read chat messages" ON public.chat_messages;
CREATE POLICY "Job participants can read chat messages"
  ON public.chat_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.id::text = chat_messages.job_id
        AND (jobs.customer_id = auth.uid() OR jobs.provider_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Anyone can insert chat messages" ON public.chat_messages;
CREATE POLICY "Job participants can insert chat messages"
  ON public.chat_messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.id::text = chat_messages.job_id
        AND (jobs.customer_id = auth.uid() OR jobs.provider_id = auth.uid())
    )
  );

-- Admin moderation access
DROP POLICY IF EXISTS "Admins can read all chat messages" ON public.chat_messages;
CREATE POLICY "Admins can read all chat messages"
  ON public.chat_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================
-- D. REFUNDS — restrict create/update to admins only
-- Keep "Users can view own refunds" for SELECT.
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can create refunds" ON public.refunds;
CREATE POLICY "Admins can create refunds"
  ON public.refunds
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Authenticated users can update refunds" ON public.refunds;
CREATE POLICY "Admins can update refunds"
  ON public.refunds
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================
-- E. NOTIFICATIONS — restrict inserts to service_role
-- All inserts come from SECURITY DEFINER functions (triggers,
-- send_broadcast_notification RPC) which bypass RLS.
-- ============================================================

DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
CREATE POLICY "Service role can insert notifications"
  ON public.notifications
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- F. PROFILES — authenticated-only read (was public/anon)
-- ============================================================

DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;
CREATE POLICY "Authenticated users can view profiles"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- G. PROVIDER_PROFILES — authenticated-only read
-- ============================================================

DROP POLICY IF EXISTS "Anyone can view providers" ON public.provider_profiles;
CREATE POLICY "Authenticated users can view providers"
  ON public.provider_profiles
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- H. ROLE ESCALATION PREVENTION TRIGGER
-- Prevents non-admin users from changing their own role.
-- ============================================================

CREATE OR REPLACE FUNCTION public.prevent_role_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    ) THEN
      NEW.role := OLD.role;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_self_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_role_self_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_self_escalation();

-- ============================================================
-- I. STORAGE BUCKETS — make private
-- ============================================================

UPDATE storage.buckets SET public = false WHERE id = 'provider-documents';
UPDATE storage.buckets SET public = false WHERE id = 'job-photos';

-- Replace job-photos storage policies with participant-scoped policies.
-- Upload path pattern: jobs/{jobId}/filename.ext

DROP POLICY IF EXISTS "Allow public read of job-photos" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads to job-photos" ON storage.objects;

-- Job participants + admins can read photos
CREATE POLICY "Job participants can read job-photos"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'job-photos'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
      )
      OR EXISTS (
        SELECT 1 FROM public.jobs
        WHERE jobs.id::text = (storage.foldername(name))[2]
          AND (jobs.customer_id = auth.uid() OR jobs.provider_id = auth.uid())
      )
    )
  );

-- Only job participants can upload photos
CREATE POLICY "Job participants can upload job-photos"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'job-photos'
    AND EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.id::text = (storage.foldername(name))[2]
        AND (jobs.customer_id = auth.uid() OR jobs.provider_id = auth.uid())
    )
  );
