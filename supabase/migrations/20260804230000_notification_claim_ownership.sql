-- Ownership-safe notification delivery claims.
--
-- Adds claim_token, claimed_at, lease_expires_at, attempt_count to
-- notification_delivery_log. Rewrites claim/mark RPCs to require
-- token ownership for finalization.

BEGIN;

-- ============================================================
-- 1) Add ownership columns
-- ============================================================
ALTER TABLE public.notification_delivery_log
  ADD COLUMN IF NOT EXISTS claim_token UUID,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;

-- ============================================================
-- 2) Rewrite claim_notification_delivery
--    Returns UUID (claim token) or NULL.
-- ============================================================
DROP FUNCTION IF EXISTS public.claim_notification_delivery(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.claim_notification_delivery(
  p_event_key TEXT,
  p_channel TEXT DEFAULT 'email',
  p_template TEXT DEFAULT ''
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token UUID;
  v_existing RECORD;
BEGIN
  v_token := gen_random_uuid();

  -- Atomic first-claim: INSERT ... ON CONFLICT handles the race
  -- where two workers both see no row.
  BEGIN
    INSERT INTO notification_delivery_log
      (event_key, channel, template, status, claim_token, claimed_at, lease_expires_at, attempt_count)
    VALUES
      (p_event_key, p_channel, p_template, 'pending', v_token, now(), now() + interval '10 minutes', 1);
    RETURN v_token;
  EXCEPTION WHEN unique_violation THEN
    -- Row already exists — fall through to existing-row logic
    NULL;
  END;

  -- Lock the existing row
  SELECT * INTO v_existing
    FROM notification_delivery_log
    WHERE event_key = p_event_key
    FOR UPDATE;

  -- Already sent — never reclaim
  IF v_existing.status = 'sent' THEN
    RETURN NULL;
  END IF;

  -- Failed — allow retry with new token
  IF v_existing.status = 'failed' THEN
    UPDATE notification_delivery_log SET
      status = 'pending',
      claim_token = v_token,
      claimed_at = now(),
      lease_expires_at = now() + interval '10 minutes',
      attempt_count = v_existing.attempt_count + 1,
      error_message = NULL,
      updated_at = now()
    WHERE id = v_existing.id;
    RETURN v_token;
  END IF;

  -- Pending with active lease — another worker owns it
  IF v_existing.status = 'pending' AND v_existing.lease_expires_at > now() THEN
    RETURN NULL;
  END IF;

  -- Pending with expired lease — stale worker crashed, reclaim
  IF v_existing.status = 'pending' AND v_existing.lease_expires_at <= now() THEN
    UPDATE notification_delivery_log SET
      claim_token = v_token,
      claimed_at = now(),
      lease_expires_at = now() + interval '10 minutes',
      attempt_count = v_existing.attempt_count + 1,
      error_message = 'Reclaimed after stale lease',
      updated_at = now()
    WHERE id = v_existing.id;
    RETURN v_token;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_notification_delivery(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_notification_delivery(TEXT, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_notification_delivery(TEXT, TEXT, TEXT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_notification_delivery(TEXT, TEXT, TEXT) TO service_role;

-- ============================================================
-- 3) Rewrite mark_notification_delivery to require claim_token
--    Returns BOOLEAN: true if this token owned the claim, false otherwise.
-- ============================================================
DROP FUNCTION IF EXISTS public.mark_notification_delivery(TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.mark_notification_delivery(
  p_event_key TEXT,
  p_claim_token UUID,
  p_status TEXT,
  p_external_id TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL,
  p_recipient TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  -- Only allow sent or failed as final status
  IF p_status NOT IN ('sent', 'failed') THEN
    RAISE EXCEPTION 'mark_notification_delivery: status must be sent or failed, got %', p_status;
  END IF;

  -- Only update if this token owns the current pending claim
  UPDATE notification_delivery_log
  SET status = p_status,
      external_id = COALESCE(p_external_id, external_id),
      error_message = p_error_message,
      recipient = COALESCE(p_recipient, recipient),
      updated_at = now()
  WHERE event_key = p_event_key
    AND claim_token = p_claim_token
    AND status = 'pending';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_notification_delivery(TEXT, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_notification_delivery(TEXT, UUID, TEXT, TEXT, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_notification_delivery(TEXT, UUID, TEXT, TEXT, TEXT, TEXT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.mark_notification_delivery(TEXT, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- ============================================================
-- Assertions
-- ============================================================
DO $$ BEGIN
  -- Verify claim returns UUID
  ASSERT (SELECT data_type FROM information_schema.columns
    WHERE table_name = 'notification_delivery_log' AND column_name = 'claim_token') = 'uuid',
    'claim_token column must exist';
END $$;

COMMIT;
