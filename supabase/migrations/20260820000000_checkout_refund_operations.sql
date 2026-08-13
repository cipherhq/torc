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
  -- Stripe refund tracking
  stripe_refund_id TEXT,
  stripe_refund_status TEXT,
  idempotency_key TEXT NOT NULL,
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

-- cancel_checkout: mark cancelled but do NOT create refund op.
-- Refund op is created only by the payment_intent.succeeded webhook AFTER
-- validating the Stripe event. cancel_checkout from payment_processing
-- does not prove payment succeeded — PI may still be processing/failed.
CREATE OR REPLACE FUNCTION public.cancel_checkout(
  p_checkout_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_checkout RECORD;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT id, user_id, status, payment_intent_id, job_id, total_amount, currency
  INTO v_checkout
  FROM checkouts
  WHERE id = p_checkout_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Checkout not found');
  END IF;

  IF v_checkout.user_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF v_checkout.status = 'customer_cancelled' THEN
    RETURN jsonb_build_object('success', true, 'already_cancelled', true);
  END IF;

  IF v_checkout.job_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Job already created. Use job cancellation instead.',
      'job_id', v_checkout.job_id
    );
  END IF;

  IF v_checkout.status IN ('refunded', 'expired') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Checkout is already terminal: ' || v_checkout.status);
  END IF;

  -- Mark cancelled. Do NOT create refund op here — the webhook will do it
  -- after validating that Stripe payment actually succeeded.
  UPDATE checkouts
  SET status = 'customer_cancelled', cancelled_at = now()
  WHERE id = p_checkout_id;

  RETURN jsonb_build_object('success', true, 'checkout_id', p_checkout_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_checkout(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_checkout(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_checkout(UUID) TO authenticated;

-- process_stripe_webhook: validate BEFORE checking cancelled status.
-- For cancelled checkouts, create refund op with validated Stripe amount.
DROP FUNCTION IF EXISTS public.process_stripe_webhook(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.process_stripe_webhook(
  p_event_id TEXT,
  p_event_type TEXT,
  p_payment_intent_id TEXT,
  p_checkout_id TEXT,
  p_amount INTEGER,
  p_currency TEXT,
  p_stripe_customer_id TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_checkout RECORD;
  v_job_id UUID;
  v_snapshot JSONB;
BEGIN
  -- Idempotency
  BEGIN
    INSERT INTO processed_webhook_events (event_id, event_type)
    VALUES (p_event_id, p_event_type);
  EXCEPTION WHEN unique_violation THEN
    RETURN json_build_object('success', true, 'duplicate', true);
  END;

  IF p_event_type = 'payment_intent.succeeded' THEN
    SELECT * INTO v_checkout FROM checkouts WHERE id = p_checkout_id::uuid FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'payment_intent.succeeded: checkout % not found', p_checkout_id;
    END IF;

    IF v_checkout.status = 'paid' THEN
      RETURN json_build_object('success', true, 'already_paid', true);
    END IF;

    -- === VALIDATE event data BEFORE any financial decision ===
    IF v_checkout.payment_intent_id IS NULL OR v_checkout.payment_intent_id != p_payment_intent_id THEN
      RAISE EXCEPTION 'PaymentIntent ID mismatch: checkout has %, event has %',
        v_checkout.payment_intent_id, p_payment_intent_id;
    END IF;

    IF p_amount IS NULL THEN
      RAISE EXCEPTION 'payment_intent.succeeded: amount is required';
    END IF;
    IF p_amount != ROUND(v_checkout.total_amount * 100) THEN
      RAISE EXCEPTION 'Amount mismatch: checkout expects % cents, Stripe sent %',
        ROUND(v_checkout.total_amount * 100), p_amount;
    END IF;

    IF p_currency IS NULL THEN
      RAISE EXCEPTION 'payment_intent.succeeded: currency is required';
    END IF;
    IF LOWER(p_currency) != LOWER(v_checkout.currency) THEN
      RAISE EXCEPTION 'Currency mismatch: checkout expects %, Stripe sent %',
        v_checkout.currency, p_currency;
    END IF;

    IF p_stripe_customer_id IS NULL THEN
      RAISE EXCEPTION 'payment_intent.succeeded: stripe_customer_id is required';
    END IF;
    IF v_checkout.stripe_customer_id IS NOT NULL AND v_checkout.stripe_customer_id != p_stripe_customer_id THEN
      RAISE EXCEPTION 'Stripe customer mismatch: checkout has %, event has %',
        v_checkout.stripe_customer_id, p_stripe_customer_id;
    END IF;

    -- === Event validated. Now check for cancellation. ===
    IF v_checkout.status = 'customer_cancelled' THEN
      -- Payment succeeded but customer already cancelled.
      -- Create refund op with VALIDATED Stripe amount (100% refund).
      INSERT INTO checkout_refund_operations (
        checkout_id, user_id, payment_intent_id,
        refund_amount, currency,
        idempotency_key, status
      ) VALUES (
        v_checkout.id, v_checkout.user_id, p_payment_intent_id,
        v_checkout.total_amount, COALESCE(v_checkout.currency, 'usd'),
        'checkout_refund_' || v_checkout.id::text, 'pending'
      ) ON CONFLICT (checkout_id) DO NOTHING;

      RETURN json_build_object('success', true, 'cancelled', true, 'refund_created', true);
    END IF;

    -- === Normal payment path — create job ===
    v_snapshot := v_checkout.booking_snapshot;
    IF v_snapshot IS NULL THEN
      RAISE EXCEPTION 'payment_intent.succeeded: booking_snapshot is NULL';
    END IF;
    IF v_snapshot->>'pickup_address' IS NULL THEN
      RAISE EXCEPTION 'payment_intent.succeeded: booking_snapshot missing pickup_address';
    END IF;

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
      UPDATE checkouts SET job_id = v_job_id WHERE id = v_checkout.id;
    ELSE
      UPDATE jobs SET payment_status = 'paid', paid_at = now() WHERE id = v_job_id AND payment_status != 'paid';
    END IF;

    UPDATE checkouts SET status = 'paid', paid_at = now() WHERE id = v_checkout.id;
    RETURN json_build_object('success', true, 'duplicate', false, 'job_id', v_job_id);

  ELSIF p_event_type = 'payment_intent.payment_failed' THEN
    -- Do NOT overwrite customer_cancelled or paid
    UPDATE checkouts SET status = 'failed'
    WHERE id = p_checkout_id::uuid
    AND status NOT IN ('paid', 'customer_cancelled', 'refunded');
    RETURN json_build_object('success', true, 'event', 'payment_failed');

  ELSIF p_event_type = 'charge.refunded' THEN
    -- Correlate with checkout_refund_operations for async refund finalization
    -- The Edge Function handles this correlation (see stripe-webhook/index.ts)
    RETURN json_build_object('success', true, 'event', 'charge_refunded');

  ELSE
    RETURN json_build_object('success', true, 'event', 'unhandled', 'type', p_event_type);
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_stripe_webhook(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_stripe_webhook(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_stripe_webhook(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.process_stripe_webhook(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT) TO service_role;

-- Assertions
DO $$ BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'checkout_refund_operations' AND table_schema = 'public'
  ), 'checkout_refund_operations table must exist';
  RAISE NOTICE 'Checkout refund operations migration complete.';
END $$;
