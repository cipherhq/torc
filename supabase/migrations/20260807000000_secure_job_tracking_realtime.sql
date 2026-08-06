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

-- Enable RLS on realtime.messages (idempotent — may already be enabled)
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SELECT policy: controls who can RECEIVE Broadcast/Presence
-- ============================================================
CREATE POLICY "Job participants can receive tracking messages"
  ON realtime.messages
  FOR SELECT
  USING (
    -- Only apply to job-tracking-* topics
    realtime.topic() LIKE 'job-tracking-%'
    AND EXISTS (
      SELECT 1 FROM public.jobs
      WHERE id = (
        CASE
          WHEN length(realtime.topic()) = 49  -- 'job-tracking-' (13) + UUID (36)
            THEN NULLIF(substring(realtime.topic() FROM 14), '')::uuid
          ELSE NULL
        END
      )
      AND (customer_id = auth.uid() OR provider_id = auth.uid())
      AND status NOT IN ('completed', 'cancelled', 'expired')
    )
  );

-- ============================================================
-- INSERT policy: controls who can SEND Broadcast/Presence
-- ============================================================
CREATE POLICY "Job participants can send tracking messages"
  ON realtime.messages
  FOR INSERT
  WITH CHECK (
    realtime.topic() LIKE 'job-tracking-%'
    AND EXISTS (
      SELECT 1 FROM public.jobs
      WHERE id = (
        CASE
          WHEN length(realtime.topic()) = 49
            THEN NULLIF(substring(realtime.topic() FROM 14), '')::uuid
          ELSE NULL
        END
      )
      AND (customer_id = auth.uid() OR provider_id = auth.uid())
      AND status NOT IN ('completed', 'cancelled', 'expired')
    )
  );
