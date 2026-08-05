-- Durable notification delivery tracking.
-- Replaces the rate-limit-based "idempotency" with proper delivery states.
--
-- States: pending → sent | failed
-- - pending: claimed, send in progress
-- - sent: Resend/Twilio confirmed delivery
-- - failed: transient error, retryable
--
-- Unique key prevents concurrent duplicate sends.
-- Failed entries can be retried (status reset to pending).
-- Sent entries are permanent — cannot be re-sent.

BEGIN;

CREATE TABLE IF NOT EXISTS public.notification_delivery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL UNIQUE,  -- e.g. 'welcome:user-uuid' or 'customer_invoice:job-uuid'
  channel TEXT NOT NULL DEFAULT 'email',  -- 'email' or 'sms'
  template TEXT NOT NULL,
  recipient TEXT,  -- email or phone (for audit, not for routing)
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed')),
  external_id TEXT,  -- Resend email ID or Twilio SID
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_event_key
  ON public.notification_delivery_log(event_key);

ALTER TABLE public.notification_delivery_log ENABLE ROW LEVEL SECURITY;

-- No client access — service_role only
CREATE POLICY "Service role only for notification log"
  ON public.notification_delivery_log FOR ALL USING (false);

-- Atomic claim: try to insert a pending entry. If already exists and sent, return false.
-- If exists and failed, reset to pending for retry. If exists and pending, return false (in progress).
CREATE OR REPLACE FUNCTION public.claim_notification_delivery(
  p_event_key TEXT,
  p_channel TEXT DEFAULT 'email',
  p_template TEXT DEFAULT ''
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing RECORD;
BEGIN
  -- Try to find existing entry
  SELECT * INTO v_existing FROM notification_delivery_log WHERE event_key = p_event_key FOR UPDATE;

  IF v_existing IS NULL THEN
    -- First attempt — claim it
    INSERT INTO notification_delivery_log (event_key, channel, template, status)
    VALUES (p_event_key, p_channel, p_template, 'pending');
    RETURN true;
  END IF;

  IF v_existing.status = 'sent' THEN
    -- Already delivered — do not re-send
    RETURN false;
  END IF;

  IF v_existing.status = 'failed' THEN
    -- Previous attempt failed — allow retry
    UPDATE notification_delivery_log SET status = 'pending', updated_at = now(), error_message = NULL
    WHERE id = v_existing.id;
    RETURN true;
  END IF;

  -- Status is 'pending' — another call is in progress
  RETURN false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_notification_delivery(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_notification_delivery(TEXT, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_notification_delivery(TEXT, TEXT, TEXT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_notification_delivery(TEXT, TEXT, TEXT) TO service_role;

-- Mark delivery as sent or failed
CREATE OR REPLACE FUNCTION public.mark_notification_delivery(
  p_event_key TEXT,
  p_status TEXT,  -- 'sent' or 'failed'
  p_external_id TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL,
  p_recipient TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE notification_delivery_log
  SET status = p_status,
      external_id = COALESCE(p_external_id, external_id),
      error_message = p_error_message,
      recipient = COALESCE(p_recipient, recipient),
      updated_at = now()
  WHERE event_key = p_event_key;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_notification_delivery(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_notification_delivery(TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_notification_delivery(TEXT, TEXT, TEXT, TEXT, TEXT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.mark_notification_delivery(TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

COMMIT;
