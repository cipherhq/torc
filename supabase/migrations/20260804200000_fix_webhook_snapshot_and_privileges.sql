-- Fix P0 production issues discovered post-deployment:
--
-- 1. process_stripe_webhook validated 'pickup_address' (snake_case) but
--    create-payment-intent stores 'pickupAddress' (camelCase). Use COALESCE
--    for backward compatibility with both formats.
--
-- 2. Strict Stripe customer validation: both checkout.stripe_customer_id
--    and event customer must be non-null and exactly match.
--
-- 3. cleanup_rate_limit_log: remove jwt.claim.role check that blocks
--    pg_cron execution. Rely on database EXECUTE privileges instead.
--
-- 4. Codify anon REVOKE for all protected RPCs (was done manually,
--    now captured in migration code).

BEGIN;

-- ============================================================
-- 0) Fix checkouts.service_id type: services.id is TEXT, not UUID
-- ============================================================
ALTER TABLE public.checkouts ALTER COLUMN service_id TYPE TEXT;

-- ============================================================
-- 1) Fix process_stripe_webhook: camelCase snapshot + strict customer
-- ============================================================

-- Drop existing 7-param signature so we can replace it
DROP FUNCTION IF EXISTS public.process_stripe_webhook(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT);

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
  v_pickup_address TEXT;
BEGIN
  -- 1. Claim event atomically (unique constraint prevents concurrent duplicates)
  BEGIN
    INSERT INTO processed_webhook_events (event_id, event_type, gateway)
    VALUES (p_event_id, p_event_type, 'stripe');
  EXCEPTION WHEN unique_violation THEN
    RETURN json_build_object('success', true, 'duplicate', true);
  END;

  -- ================================================================
  -- payment_intent.succeeded
  -- ================================================================
  IF p_event_type = 'payment_intent.succeeded' THEN

    -- Strictly require checkout_id metadata
    IF p_checkout_id IS NULL THEN
      RAISE EXCEPTION 'payment_intent.succeeded: checkout_id metadata is required';
    END IF;

    -- Find and lock checkout
    SELECT * INTO v_checkout FROM checkouts WHERE id = p_checkout_id::uuid FOR UPDATE;
    IF v_checkout IS NULL THEN
      RAISE EXCEPTION 'payment_intent.succeeded: checkout % not found', p_checkout_id;
    END IF;

    -- Already paid — idempotent (no state change, no error)
    IF v_checkout.status = 'paid' THEN
      RETURN json_build_object('success', true, 'already_paid', true);
    END IF;

    -- Require and validate exact PaymentIntent ID
    IF v_checkout.payment_intent_id IS NULL OR v_checkout.payment_intent_id != p_payment_intent_id THEN
      RAISE EXCEPTION 'PaymentIntent ID mismatch: checkout has %, event has %',
        v_checkout.payment_intent_id, p_payment_intent_id;
    END IF;

    -- Require non-null exact amount (in cents)
    IF p_amount IS NULL THEN
      RAISE EXCEPTION 'payment_intent.succeeded: amount is required';
    END IF;
    IF p_amount != ROUND(v_checkout.total_amount * 100) THEN
      RAISE EXCEPTION 'Amount mismatch: checkout expects % cents, Stripe sent %',
        ROUND(v_checkout.total_amount * 100), p_amount;
    END IF;

    -- Require non-null exact currency
    IF p_currency IS NULL THEN
      RAISE EXCEPTION 'payment_intent.succeeded: currency is required';
    END IF;
    IF LOWER(p_currency) != LOWER(v_checkout.currency) THEN
      RAISE EXCEPTION 'Currency mismatch: checkout expects %, Stripe sent %',
        v_checkout.currency, p_currency;
    END IF;

    -- ITEM 2: Strict Stripe customer validation — BOTH must be non-null and match
    IF v_checkout.stripe_customer_id IS NULL THEN
      RAISE EXCEPTION 'payment_intent.succeeded: checkout has no stripe_customer_id';
    END IF;
    IF p_stripe_customer_id IS NULL THEN
      RAISE EXCEPTION 'payment_intent.succeeded: event has no stripe_customer_id';
    END IF;
    IF v_checkout.stripe_customer_id != p_stripe_customer_id THEN
      RAISE EXCEPTION 'Stripe customer mismatch: checkout has %, event has %',
        v_checkout.stripe_customer_id, p_stripe_customer_id;
    END IF;

    -- Require valid booking_snapshot with required fields
    v_snapshot := v_checkout.booking_snapshot;
    IF v_snapshot IS NULL THEN
      RAISE EXCEPTION 'payment_intent.succeeded: booking_snapshot is NULL — cannot create job';
    END IF;

    -- ITEM 1: Use COALESCE for backward compatibility with both camelCase and snake_case
    v_pickup_address := COALESCE(v_snapshot->>'pickupAddress', v_snapshot->>'pickup_address');
    IF v_pickup_address IS NULL THEN
      RAISE EXCEPTION 'payment_intent.succeeded: booking_snapshot missing pickupAddress';
    END IF;

    -- Create or find the linked job
    SELECT id INTO v_job_id FROM jobs WHERE checkout_id = v_checkout.id LIMIT 1;

    IF v_job_id IS NULL THEN
      -- Create job from booking_snapshot atomically
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
        -- ITEM 1: Read camelCase with snake_case fallback
        COALESCE(
          (v_snapshot->'pickupLocation'->>'latitude')::numeric,
          (v_snapshot->>'pickup_latitude')::numeric
        ),
        COALESCE(
          (v_snapshot->'pickupLocation'->>'longitude')::numeric,
          (v_snapshot->>'pickup_longitude')::numeric
        ),
        v_pickup_address,
        COALESCE(v_snapshot->>'destinationAddress', v_snapshot->>'destination_address'),
        COALESCE(v_snapshot->>'requesterType', v_snapshot->>'requester_type', 'self'),
        COALESCE(v_snapshot->>'requesterName', v_snapshot->>'requester_name'),
        COALESCE(v_snapshot->>'requesterPhone', v_snapshot->>'requester_phone'),
        v_checkout.scheduled_for,
        COALESCE(v_snapshot->>'customerNotes', v_snapshot->>'customer_notes'),
        'pending', 'paid', p_payment_intent_id, v_checkout.currency,
        now(), v_checkout.id, v_checkout.base_price, v_checkout.total_amount, v_checkout.tax
      ) RETURNING id INTO v_job_id;

      -- Link job back to checkout
      UPDATE checkouts SET job_id = v_job_id WHERE id = v_checkout.id;
    ELSE
      -- Job already exists — mark paid
      UPDATE jobs SET payment_status = 'paid', paid_at = now()
        WHERE id = v_job_id AND payment_status != 'paid';
    END IF;

    -- Mark checkout paid ONLY after job is confirmed created/linked
    UPDATE checkouts SET status = 'paid', paid_at = now() WHERE id = v_checkout.id;

    RETURN json_build_object('success', true, 'duplicate', false, 'job_id', v_job_id);

  -- ================================================================
  -- payment_intent.payment_failed
  -- ================================================================
  ELSIF p_event_type = 'payment_intent.payment_failed' THEN
    IF p_checkout_id IS NOT NULL THEN
      SELECT * INTO v_checkout FROM checkouts WHERE id = p_checkout_id::uuid FOR UPDATE;
    ELSIF p_payment_intent_id IS NOT NULL THEN
      SELECT * INTO v_checkout FROM checkouts WHERE payment_intent_id = p_payment_intent_id FOR UPDATE;
    END IF;
    IF v_checkout IS NOT NULL THEN
      UPDATE checkouts SET status = 'failed' WHERE id = v_checkout.id;
      UPDATE jobs SET payment_status = 'failed' WHERE checkout_id = v_checkout.id;
    END IF;
    RETURN json_build_object('success', true, 'duplicate', false);

  -- ================================================================
  -- charge.refunded
  -- ================================================================
  ELSIF p_event_type = 'charge.refunded' THEN
    IF p_checkout_id IS NOT NULL THEN
      SELECT * INTO v_checkout FROM checkouts WHERE id = p_checkout_id::uuid FOR UPDATE;
    ELSIF p_payment_intent_id IS NOT NULL THEN
      SELECT * INTO v_checkout FROM checkouts WHERE payment_intent_id = p_payment_intent_id FOR UPDATE;
    END IF;
    IF v_checkout IS NOT NULL THEN
      UPDATE checkouts SET status = 'refunded' WHERE id = v_checkout.id;
      UPDATE jobs SET payment_status = 'refunded' WHERE checkout_id = v_checkout.id;
    END IF;
    RETURN json_build_object('success', true, 'duplicate', false);
  END IF;

  RETURN json_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_stripe_webhook(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_stripe_webhook(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_stripe_webhook(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.process_stripe_webhook(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT) TO service_role;


-- ============================================================
-- 3) Fix cleanup_rate_limit_log for pg_cron compatibility
--    Remove JWT check (pg_cron runs as postgres, no JWT context).
--    Authorization is enforced by EXECUTE privileges only.
-- ============================================================

CREATE OR REPLACE FUNCTION public.cleanup_rate_limit_log()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- No JWT check here — pg_cron executes as postgres which has
  -- implicit EXECUTE. Authorization is enforced by:
  --   REVOKE EXECUTE FROM PUBLIC, anon, authenticated
  --   Only service_role and postgres can call this.
  DELETE FROM public.rate_limit_log
  WHERE created_at < now() - interval '24 hours';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_rate_limit_log() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_rate_limit_log() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_rate_limit_log() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.cleanup_rate_limit_log() TO service_role;
-- postgres inherits EXECUTE as superuser, so pg_cron works.


-- ============================================================
-- 4) Codify ALL anon REVOKE statements for protected RPCs
--    (was done manually post-deploy, now in migration code)
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.transition_job_status(UUID, TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.transition_job_status(UUID, TEXT, UUID, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.transition_job_status(UUID, TEXT, UUID, TEXT, TEXT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.transition_job_status(UUID, TEXT, UUID, TEXT, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.expire_stale_jobs(INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.expire_stale_jobs(INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION public.expire_stale_jobs(INTEGER) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.expire_stale_jobs(INTEGER) TO service_role;

REVOKE EXECUTE ON FUNCTION public.claim_payment_attempt(UUID, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_payment_attempt(UUID, INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_payment_attempt(UUID, INTEGER) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_payment_attempt(UUID, INTEGER) TO service_role;

REVOKE EXECUTE ON FUNCTION public.claim_rate_limit_slot(TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_rate_limit_slot(TEXT, INTEGER, INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_rate_limit_slot(TEXT, INTEGER, INTEGER) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_rate_limit_slot(TEXT, INTEGER, INTEGER) TO service_role;


-- ============================================================
-- 5) Fix payment_status triggers for SECURITY DEFINER / pg_cron
--    The triggers check request.jwt.claim.role but SECURITY DEFINER
--    functions (and pg_cron/postgres) don't have a JWT context.
--    Allow postgres role in addition to service_role.
-- ============================================================

CREATE OR REPLACE FUNCTION public.prevent_client_payment_insert_paid()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN RETURN NEW; END IF;
  IF current_user = 'postgres' OR current_setting('role', true) = 'postgres' THEN RETURN NEW; END IF;
  IF NEW.payment_status = 'paid' THEN
    RAISE EXCEPTION 'Cannot insert job with payment_status=paid from client';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.prevent_client_payment_status_paid()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN RETURN NEW; END IF;
  IF current_user = 'postgres' OR current_setting('role', true) = 'postgres' THEN RETURN NEW; END IF;
  IF NEW.payment_status = 'paid' AND (OLD.payment_status IS NULL OR OLD.payment_status != 'paid') THEN
    RAISE EXCEPTION 'Payment status can only be set to paid by the server';
  END IF;
  RETURN NEW;
END; $$;


-- ============================================================
-- Assertions: verify all privileges are correct
-- ============================================================

-- Assert: no protected RPC is executable by anon or authenticated
DO $$
DECLARE
  v_fn TEXT;
  v_fns TEXT[] := ARRAY[
    'public.process_stripe_webhook(text, text, text, text, integer, text, text)',
    'public.transition_job_status(uuid, text, uuid, text, text)',
    'public.expire_stale_jobs(integer)',
    'public.cleanup_rate_limit_log()',
    'public.claim_payment_attempt(uuid, integer)',
    'public.claim_rate_limit_slot(text, integer, integer)'
  ];
BEGIN
  FOREACH v_fn IN ARRAY v_fns LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'ASSERTION FAILED: anon can execute %', v_fn;
    END IF;
    IF has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'ASSERTION FAILED: authenticated can execute %', v_fn;
    END IF;
  END LOOP;
  RAISE NOTICE 'All privilege assertions passed.';
END;
$$;

COMMIT;
