-- Secure job tracking Realtime channels (TRACK-001).
--
-- Supabase Realtime Broadcast/Presence authorization for private channels
-- is enforced via RLS policies on realtime.messages.
--
-- This migration adds SELECT and INSERT policies scoped to job-tracking-*
-- topics. A user may only subscribe to or broadcast on a job tracking channel
-- if they are the customer_id or provider_id on a non-terminal job.
--
-- Terminal states (completed, cancelled, expired) deny NEW channel establishment.
--
-- UUID parsing: the topic suffix is validated with a strict UUID regex before
-- casting. Malformed topics (wrong length, invalid characters) fail closed
-- without raising a cast exception.

-- RLS is already enabled on realtime.messages in hosted Supabase.
-- Do not ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY.

-- Helper: safely extract a UUID from a job-tracking-* topic string.
-- Returns NULL (fail closed) for any topic that is not exactly
-- 'job-tracking-' followed by a canonical lowercase UUID.
CREATE OR REPLACE FUNCTION public.extract_job_tracking_uuid(topic_name TEXT)
RETURNS UUID
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN topic_name ~ '^job-tracking-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN substring(topic_name FROM 14)::uuid
    ELSE NULL
  END;
$$;

-- ============================================================
-- SELECT policy: controls who can RECEIVE Broadcast/Presence
-- ============================================================
CREATE POLICY "Job participants can receive tracking messages"
  ON realtime.messages
  FOR SELECT
  USING (
    realtime.topic() LIKE 'job-tracking-%'
    AND EXISTS (
      SELECT 1 FROM public.jobs
      WHERE id = public.extract_job_tracking_uuid(realtime.topic())
        AND (customer_id = auth.uid() OR provider_id = auth.uid())
        AND status NOT IN ('completed', 'cancelled', 'expired')
    )
  );

-- ============================================================
-- INSERT policy: controls who can SEND Broadcast/Presence
-- Uses the row's topic column since INSERT WITH CHECK evaluates
-- against the row being inserted.
-- ============================================================
CREATE POLICY "Job participants can send tracking messages"
  ON realtime.messages
  FOR INSERT
  WITH CHECK (
    topic LIKE 'job-tracking-%'
    AND EXISTS (
      SELECT 1 FROM public.jobs
      WHERE id = public.extract_job_tracking_uuid(topic)
        AND (customer_id = auth.uid() OR provider_id = auth.uid())
        AND status NOT IN ('completed', 'cancelled', 'expired')
    )
  );
