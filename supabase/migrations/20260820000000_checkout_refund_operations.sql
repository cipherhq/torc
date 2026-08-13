-- Checkout-level refund operations for pre-job cancellations.
-- Separate from job_cancellation_operations because no job/provider exists.

CREATE TABLE IF NOT EXISTS public.checkout_refund_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_id UUID NOT NULL REFERENCES public.checkouts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  payment_intent_id TEXT NOT NULL,
  refund_amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  reason TEXT DEFAULT 'Customer cancelled before job creation',
  stripe_refund_id TEXT,
  stripe_refund_status TEXT,
  idempotency_key TEXT NOT NULL,
  -- Claim/lease for worker ownership
  claim_token UUID,
  lease_expires_at TIMESTAMPTZ,
  -- State machine: pending → refund_requesting → refund_pending → completed | manual_review
  status TEXT NOT NULL DEFAULT 'pending',
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT checkout_refund_ops_unique UNIQUE (checkout_id)
);

ALTER TABLE public.checkout_refund_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only checkout refund ops" ON public.checkout_refund_operations
  FOR ALL USING (false);
CREATE POLICY "Admin can read checkout refund ops" ON public.checkout_refund_operations
  FOR SELECT USING (is_admin(auth.uid()));

-- cancel_checkout: marks cancelled only, NO refund op (webhook handles that)
CREATE OR REPLACE FUNCTION public.cancel_checkout(p_checkout_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_checkout RECORD; v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;

  SELECT id, user_id, status, job_id INTO v_checkout FROM checkouts WHERE id = p_checkout_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Checkout not found'); END IF;
  IF v_checkout.user_id != v_user_id THEN RETURN jsonb_build_object('success', false, 'error', 'Unauthorized'); END IF;
  IF v_checkout.status = 'customer_cancelled' THEN RETURN jsonb_build_object('success', true, 'already_cancelled', true); END IF;
  IF v_checkout.job_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Job already created. Use job cancellation.', 'job_id', v_checkout.job_id);
  END IF;
  IF v_checkout.status IN ('refunded', 'expired') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Checkout is terminal: ' || v_checkout.status);
  END IF;

  UPDATE checkouts SET status = 'customer_cancelled', cancelled_at = now() WHERE id = p_checkout_id;
  RETURN jsonb_build_object('success', true, 'checkout_id', p_checkout_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cancel_checkout(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_checkout(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_checkout(UUID) TO authenticated;

-- process_stripe_webhook: DERIVED FROM current-main canonical (20260804200000)
-- with ONLY the customer_cancelled/refund delta added.
-- Preserves: DEFAULT NULL params, gateway column, strict Stripe customer,
-- COALESCE camelCase/snake_case, payment_failed lookup, charge.refunded behavior,
-- search_path = public, pg_temp.
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

    -- Already paid — idempotent
    IF v_checkout.status = 'paid' THEN
      RETURN json_build_object('success', true, 'already_paid', true);
    END IF;

    -- Require and validate exact PaymentIntent ID
    IF v_checkout.payment_intent_id IS NULL OR v_checkout.payment_intent_id != p_payment_intent_id THEN
      RAISE EXCEPTION 'PaymentIntent ID mismatch: checkout has %, event has %',
        v_checkout.payment_intent_id, p_payment_intent_id;
    END IF;

    -- Require non-null exact amount
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

    -- Strict Stripe customer validation — BOTH must be non-null and match
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

    -- === NEW: After ALL validations pass, check for customer cancellation ===
    IF v_checkout.status = 'customer_cancelled' THEN
      -- Payment verified but customer cancelled. Create refund op, no job.
      INSERT INTO checkout_refund_operations (
        checkout_id, user_id, payment_intent_id,
        refund_amount, currency, idempotency_key, status
      ) VALUES (
        v_checkout.id, v_checkout.user_id, p_payment_intent_id,
        v_checkout.total_amount, COALESCE(v_checkout.currency, 'usd'),
        'checkout_refund_' || v_checkout.id::text, 'pending'
      ) ON CONFLICT (checkout_id) DO NOTHING;
      RETURN json_build_object('success', true, 'cancelled', true, 'refund_created', true);
    END IF;

    -- Require valid booking_snapshot
    v_snapshot := v_checkout.booking_snapshot;
    IF v_snapshot IS NULL THEN
      RAISE EXCEPTION 'payment_intent.succeeded: booking_snapshot is NULL — cannot create job';
    END IF;

    -- COALESCE for camelCase/snake_case compatibility
    v_pickup_address := COALESCE(v_snapshot->>'pickupAddress', v_snapshot->>'pickup_address');
    IF v_pickup_address IS NULL THEN
      RAISE EXCEPTION 'payment_intent.succeeded: booking_snapshot missing pickupAddress';
    END IF;

    -- Create or find the linked job
    SELECT id INTO v_job_id FROM jobs WHERE checkout_id = v_checkout.id LIMIT 1;

    IF v_job_id IS NULL THEN
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
        COALESCE((v_snapshot->'pickupLocation'->>'latitude')::numeric, (v_snapshot->>'pickup_latitude')::numeric),
        COALESCE((v_snapshot->'pickupLocation'->>'longitude')::numeric, (v_snapshot->>'pickup_longitude')::numeric),
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

      UPDATE checkouts SET job_id = v_job_id WHERE id = v_checkout.id;
    ELSE
      UPDATE jobs SET payment_status = 'paid', paid_at = now()
        WHERE id = v_job_id AND payment_status != 'paid';
    END IF;

    UPDATE checkouts SET status = 'paid', paid_at = now() WHERE id = v_checkout.id;
    RETURN json_build_object('success', true, 'duplicate', false, 'job_id', v_job_id);

  -- ================================================================
  -- payment_intent.payment_failed (preserved from current main)
  -- ================================================================
  ELSIF p_event_type = 'payment_intent.payment_failed' THEN
    IF p_checkout_id IS NOT NULL THEN
      SELECT * INTO v_checkout FROM checkouts WHERE id = p_checkout_id::uuid FOR UPDATE;
    ELSIF p_payment_intent_id IS NOT NULL THEN
      SELECT * INTO v_checkout FROM checkouts WHERE payment_intent_id = p_payment_intent_id FOR UPDATE;
    END IF;
    IF v_checkout IS NOT NULL THEN
      -- NEW: Do NOT overwrite customer_cancelled or paid
      IF v_checkout.status NOT IN ('paid', 'customer_cancelled', 'refunded') THEN
        UPDATE checkouts SET status = 'failed' WHERE id = v_checkout.id;
        UPDATE jobs SET payment_status = 'failed' WHERE checkout_id = v_checkout.id;
      END IF;
    END IF;
    RETURN json_build_object('success', true, 'duplicate', false);

  -- ================================================================
  -- charge.refunded (preserved from current main)
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

DO $$ BEGIN
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'checkout_refund_operations' AND table_schema = 'public');
  RAISE NOTICE 'Checkout refund operations migration complete.';
END $$;
