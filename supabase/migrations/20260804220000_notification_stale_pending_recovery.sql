-- Add stale-pending recovery to claim_notification_delivery.
-- If a delivery row has been 'pending' for more than 10 minutes
-- (crashed Edge Function), treat it as failed and allow reclaim.

BEGIN;

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
  SELECT * INTO v_existing FROM notification_delivery_log
    WHERE event_key = p_event_key FOR UPDATE;

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
    UPDATE notification_delivery_log
      SET status = 'pending', updated_at = now(), error_message = NULL
      WHERE id = v_existing.id;
    RETURN true;
  END IF;

  -- Status is 'pending' — check for stale lease (crashed Edge Function)
  IF v_existing.status = 'pending' AND v_existing.updated_at < now() - interval '10 minutes' THEN
    -- Stale pending — reclaim (treat as crashed, allow retry)
    UPDATE notification_delivery_log
      SET status = 'pending', updated_at = now(), error_message = 'Reclaimed after stale pending'
      WHERE id = v_existing.id;
    RETURN true;
  END IF;

  -- Status is 'pending' and recent — another call is in progress
  RETURN false;
END;
$$;

-- Privileges (unchanged — just re-assert after CREATE OR REPLACE)
REVOKE EXECUTE ON FUNCTION public.claim_notification_delivery(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_notification_delivery(TEXT, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_notification_delivery(TEXT, TEXT, TEXT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_notification_delivery(TEXT, TEXT, TEXT) TO service_role;

COMMIT;
