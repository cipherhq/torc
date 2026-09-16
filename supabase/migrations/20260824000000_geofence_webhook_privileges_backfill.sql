-- =============================================================================
-- WEBHOOK PICKUP COORDINATES, FUNCTION PRIVILEGES, AND COORDINATE BACKFILL
-- =============================================================================
-- The booking_snapshot stores pickupLocation as {lat, lng}, while the webhook
-- processor historically read {latitude, longitude}. Support both shapes,
-- restrict execution to service_role, and repair jobs still missing either
-- pickup coordinate without overwriting coordinates already present.

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
  BEGIN
    INSERT INTO processed_webhook_events (event_id, event_type, gateway)
    VALUES (p_event_id, p_event_type, 'stripe');
  EXCEPTION WHEN unique_violation THEN
    RETURN json_build_object('success', true, 'duplicate', true);
  END;

  IF p_event_type = 'payment_intent.succeeded' THEN
    IF p_checkout_id IS NULL THEN
      RAISE EXCEPTION 'payment_intent.succeeded: checkout_id metadata is required';
    END IF;

    SELECT * INTO v_checkout FROM checkouts WHERE id = p_checkout_id::uuid FOR UPDATE;
    IF v_checkout IS NULL THEN
      RAISE EXCEPTION 'payment_intent.succeeded: checkout % not found', p_checkout_id;
    END IF;

    IF v_checkout.status = 'paid' THEN
      RETURN json_build_object('success', true, 'already_paid', true);
    END IF;

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

    IF v_checkout.status = 'customer_cancelled' THEN
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

    v_snapshot := v_checkout.booking_snapshot;
    IF v_snapshot IS NULL THEN
      RAISE EXCEPTION 'payment_intent.succeeded: booking_snapshot is NULL — cannot create job';
    END IF;

    v_pickup_address := COALESCE(v_snapshot->>'pickupAddress', v_snapshot->>'pickup_address');
    IF v_pickup_address IS NULL THEN
      RAISE EXCEPTION 'payment_intent.succeeded: booking_snapshot missing pickupAddress';
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
        COALESCE(
          (v_snapshot->'pickupLocation'->>'latitude')::numeric,
          (v_snapshot->'pickupLocation'->>'lat')::numeric,
          (v_snapshot->>'pickup_latitude')::numeric
        ),
        COALESCE(
          (v_snapshot->'pickupLocation'->>'longitude')::numeric,
          (v_snapshot->'pickupLocation'->>'lng')::numeric,
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

      UPDATE checkouts SET job_id = v_job_id WHERE id = v_checkout.id;
    ELSE
      UPDATE jobs SET payment_status = 'paid', paid_at = now()
        WHERE id = v_job_id AND payment_status != 'paid';
    END IF;

    UPDATE checkouts SET status = 'paid', paid_at = now() WHERE id = v_checkout.id;
    RETURN json_build_object('success', true, 'duplicate', false, 'job_id', v_job_id);

  ELSIF p_event_type = 'payment_intent.payment_failed' THEN
    IF p_checkout_id IS NOT NULL THEN
      SELECT * INTO v_checkout FROM checkouts WHERE id = p_checkout_id::uuid FOR UPDATE;
    ELSIF p_payment_intent_id IS NOT NULL THEN
      SELECT * INTO v_checkout FROM checkouts WHERE payment_intent_id = p_payment_intent_id FOR UPDATE;
    END IF;
    IF v_checkout IS NOT NULL THEN
      IF v_checkout.status NOT IN ('paid', 'customer_cancelled', 'refunded') THEN
        UPDATE checkouts SET status = 'failed' WHERE id = v_checkout.id;
        UPDATE jobs SET payment_status = 'failed' WHERE checkout_id = v_checkout.id;
      END IF;
    END IF;
    RETURN json_build_object('success', true, 'duplicate', false);

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

-- Backfill only jobs that still have a missing pickup coordinate. Preserve any
-- coordinate already populated when repairing the other coordinate.
UPDATE jobs j SET
  pickup_latitude = COALESCE(
    j.pickup_latitude,
    (c.booking_snapshot->'pickupLocation'->>'latitude')::numeric,
    (c.booking_snapshot->'pickupLocation'->>'lat')::numeric,
    (c.booking_snapshot->>'pickup_latitude')::numeric
  ),
  pickup_longitude = COALESCE(
    j.pickup_longitude,
    (c.booking_snapshot->'pickupLocation'->>'longitude')::numeric,
    (c.booking_snapshot->'pickupLocation'->>'lng')::numeric,
    (c.booking_snapshot->>'pickup_longitude')::numeric
  )
FROM checkouts c
WHERE j.checkout_id = c.id
  AND (j.pickup_latitude IS NULL OR j.pickup_longitude IS NULL)
  AND c.booking_snapshot IS NOT NULL;
