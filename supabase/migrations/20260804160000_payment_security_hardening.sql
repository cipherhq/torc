-- Payment security hardening: Items 5, 6, 7
--
--   - Add booking_snapshot JSONB to checkouts (stores trusted booking data)
--   - Add attempt_number to checkouts (used for idempotency key generation)
--   - Prevent client INSERT of payment_status='paid' on jobs
--   - Atomic webhook processing RPC (process_stripe_webhook)

BEGIN;

-- ============================================================
-- 1) Add booking_snapshot JSONB column to checkouts
--    Stores the complete trusted booking details so the webhook
--    (or server) can create the job from verified data.
-- ============================================================
ALTER TABLE public.checkouts
  ADD COLUMN IF NOT EXISTS booking_snapshot JSONB;

-- Also add attempt_number to checkouts (create-payment-intent uses it
-- for idempotency key generation across retry attempts)
ALTER TABLE public.checkouts
  ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 1;

-- ============================================================
-- 2) Prevent client INSERT of payment_status='paid' on jobs
--    The existing trigger only fires on UPDATE. This covers INSERT.
-- ============================================================
CREATE OR REPLACE FUNCTION public.prevent_client_payment_insert_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- service_role bypasses this check (webhooks, admin functions)
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_status = 'paid' THEN
    RAISE EXCEPTION 'Cannot insert job with payment_status=paid from client';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_client_payment_insert_paid ON public.jobs;
CREATE TRIGGER trg_prevent_client_payment_insert_paid
  BEFORE INSERT ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_client_payment_insert_paid();

-- ============================================================
-- 3) Atomic webhook processing RPC
--    Server-authoritative job creation from booking_snapshot.
--    Idempotent via processed_webhook_events.
-- ============================================================

-- Drop old signature first (6 params) so we can create with 7 params
DROP FUNCTION IF EXISTS public.process_stripe_webhook(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT);

CREATE OR REPLACE FUNCTION public.process_stripe_webhook(
  p_event_id TEXT,
  p_event_type TEXT,
  p_payment_intent_id TEXT,
  p_checkout_id TEXT DEFAULT NULL,
  p_amount INTEGER DEFAULT NULL,
  p_currency TEXT DEFAULT NULL,
  p_stripe_customer_id TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_checkout RECORD;
  v_job_id UUID;
  v_snapshot JSONB;
BEGIN
  -- 1. Claim event
  BEGIN
    INSERT INTO processed_webhook_events (event_id, event_type, gateway)
    VALUES (p_event_id, p_event_type, 'stripe');
  EXCEPTION WHEN unique_violation THEN
    RETURN json_build_object('success', true, 'duplicate', true);
  END;

  -- 2. Find and lock checkout
  IF p_checkout_id IS NOT NULL THEN
    SELECT * INTO v_checkout FROM checkouts WHERE id = p_checkout_id::uuid FOR UPDATE;
  ELSIF p_payment_intent_id IS NOT NULL THEN
    SELECT * INTO v_checkout FROM checkouts WHERE payment_intent_id = p_payment_intent_id FOR UPDATE;
  END IF;

  IF v_checkout IS NULL THEN
    RETURN json_build_object('success', true, 'message', 'No checkout found');
  END IF;

  IF p_event_type = 'payment_intent.succeeded' THEN
    -- 3. Validate
    IF v_checkout.payment_intent_id IS DISTINCT FROM p_payment_intent_id THEN
      RAISE EXCEPTION 'PaymentIntent ID mismatch: expected %, got %', v_checkout.payment_intent_id, p_payment_intent_id;
    END IF;
    IF p_amount IS NOT NULL AND p_amount != ROUND(v_checkout.total_amount * 100) THEN
      RAISE EXCEPTION 'Amount mismatch: expected % cents, got %', ROUND(v_checkout.total_amount * 100), p_amount;
    END IF;
    IF p_currency IS NOT NULL AND LOWER(p_currency) != LOWER(v_checkout.currency) THEN
      RAISE EXCEPTION 'Currency mismatch: expected %, got %', v_checkout.currency, p_currency;
    END IF;
    IF v_checkout.status = 'paid' THEN
      -- Already paid (idempotent)
      RETURN json_build_object('success', true, 'already_paid', true);
    END IF;

    -- 4. Mark checkout paid
    UPDATE checkouts SET status = 'paid', paid_at = now() WHERE id = v_checkout.id;

    -- 5. Create or update job
    SELECT id INTO v_job_id FROM jobs WHERE checkout_id = v_checkout.id LIMIT 1;

    IF v_job_id IS NULL THEN
      -- Create job from booking_snapshot
      v_snapshot := v_checkout.booking_snapshot;
      IF v_snapshot IS NOT NULL THEN
        INSERT INTO jobs (
          customer_id, service_id, vehicle_id,
          pickup_latitude, pickup_longitude, pickup_address,
          destination_address,
          requester_type, requester_name, requester_phone,
          scheduled_for, customer_notes,
          status, payment_status, payment_intent_id, payment_currency,
          paid_at, checkout_id, base_price, total_amount, tax
        ) VALUES (
          v_checkout.user_id, v_checkout.service_id, v_checkout.vehicle_id,
          (v_snapshot->'pickupLocation'->>'latitude')::numeric,
          (v_snapshot->'pickupLocation'->>'longitude')::numeric,
          v_snapshot->>'pickupAddress',
          v_snapshot->>'destinationAddress',
          COALESCE(v_snapshot->>'requesterType', 'self'),
          v_snapshot->>'requesterName',
          v_snapshot->>'requesterPhone',
          v_checkout.scheduled_for,
          v_snapshot->>'customerNotes',
          'pending', 'paid', p_payment_intent_id, v_checkout.currency,
          now(), v_checkout.id, v_checkout.base_price, v_checkout.total_amount, v_checkout.tax
        ) RETURNING id INTO v_job_id;

        -- Link job back to checkout
        UPDATE checkouts SET job_id = v_job_id WHERE id = v_checkout.id;
      END IF;
    ELSE
      -- Job already exists — mark paid
      UPDATE jobs SET payment_status = 'paid', paid_at = now() WHERE id = v_job_id AND payment_status != 'paid';
    END IF;

    RETURN json_build_object('success', true, 'duplicate', false, 'job_id', v_job_id);

  ELSIF p_event_type = 'payment_intent.payment_failed' THEN
    UPDATE checkouts SET status = 'failed' WHERE id = v_checkout.id;
    UPDATE jobs SET payment_status = 'failed' WHERE checkout_id = v_checkout.id;
    RETURN json_build_object('success', true, 'duplicate', false);

  ELSIF p_event_type = 'charge.refunded' THEN
    UPDATE checkouts SET status = 'refunded' WHERE id = v_checkout.id;
    UPDATE jobs SET payment_status = 'refunded' WHERE checkout_id = v_checkout.id;
    RETURN json_build_object('success', true, 'duplicate', false);
  END IF;

  RETURN json_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_stripe_webhook(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_stripe_webhook(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.process_stripe_webhook(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT) TO service_role;

-- ============================================================
-- 3b) claim_payment_attempt RPC — atomic idempotency key claim
-- ============================================================
CREATE OR REPLACE FUNCTION public.claim_payment_attempt(
  p_checkout_id UUID,
  p_attempt_number INTEGER
)
RETURNS TEXT -- returns the idempotency key
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key TEXT;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_key := p_checkout_id::text || ':' || p_attempt_number::text;

  INSERT INTO payment_attempts (checkout_id, attempt_number, stripe_idempotency_key, status)
  VALUES (p_checkout_id, p_attempt_number, v_key, 'pending');
  -- unique constraint on stripe_idempotency_key prevents duplicates

  RETURN v_key;
EXCEPTION WHEN unique_violation THEN
  -- Concurrent retry tried the same attempt — return the key anyway
  SELECT stripe_idempotency_key INTO v_key
  FROM payment_attempts
  WHERE checkout_id = p_checkout_id AND attempt_number = p_attempt_number;
  RETURN v_key;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_payment_attempt(UUID, INTEGER) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_payment_attempt(UUID, INTEGER) TO service_role;

-- ============================================================
-- Assertions
-- ============================================================

-- Assert: process_stripe_webhook is NOT executable by authenticated
DO $$
BEGIN
  IF has_function_privilege(
    'authenticated',
    'public.process_stripe_webhook(text, text, text, text, integer, text, text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: authenticated role can execute process_stripe_webhook';
  END IF;
END;
$$;

-- Assert: claim_payment_attempt is NOT executable by authenticated
DO $$
BEGIN
  IF has_function_privilege(
    'authenticated',
    'public.claim_payment_attempt(uuid, integer)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: authenticated role can execute claim_payment_attempt';
  END IF;
END;
$$;

COMMIT;
