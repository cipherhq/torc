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
--    Replaces SELECT -> individual updates pattern with a single
--    atomic transaction. Idempotent via processed_webhook_events.
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_stripe_webhook(
  p_event_id TEXT,
  p_event_type TEXT,
  p_payment_intent_id TEXT,
  p_checkout_id TEXT DEFAULT NULL,
  p_amount INTEGER DEFAULT NULL,
  p_currency TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_checkout RECORD;
BEGIN
  -- Claim the event first (unique constraint prevents duplicates)
  BEGIN
    INSERT INTO public.processed_webhook_events (event_id, event_type, gateway)
    VALUES (p_event_id, p_event_type, 'stripe');
  EXCEPTION WHEN unique_violation THEN
    RETURN json_build_object('success', true, 'duplicate', true);
  END;

  -- Find the checkout (lock row for atomic update)
  IF p_checkout_id IS NOT NULL THEN
    SELECT * INTO v_checkout FROM public.checkouts WHERE id = p_checkout_id::uuid FOR UPDATE;
  ELSIF p_payment_intent_id IS NOT NULL THEN
    SELECT * INTO v_checkout FROM public.checkouts WHERE payment_intent_id = p_payment_intent_id FOR UPDATE;
  END IF;

  IF p_event_type = 'payment_intent.succeeded' THEN
    IF v_checkout IS NOT NULL THEN
      -- Validate consistency
      IF v_checkout.payment_intent_id IS NOT NULL AND v_checkout.payment_intent_id != p_payment_intent_id THEN
        RAISE EXCEPTION 'PaymentIntent ID mismatch';
      END IF;

      -- Mark checkout paid
      UPDATE public.checkouts SET status = 'paid', paid_at = now() WHERE id = v_checkout.id;

      -- Update any existing job linked to this checkout
      UPDATE public.jobs SET payment_status = 'paid', paid_at = now() WHERE checkout_id = v_checkout.id;

      -- Also update by payment_intent_id for backward compat
      UPDATE public.jobs SET payment_status = 'paid', paid_at = now()
        WHERE payment_intent_id = p_payment_intent_id AND payment_status != 'paid';
    END IF;

  ELSIF p_event_type = 'payment_intent.payment_failed' THEN
    IF v_checkout IS NOT NULL THEN
      UPDATE public.checkouts SET status = 'failed' WHERE id = v_checkout.id;
      UPDATE public.jobs SET payment_status = 'failed' WHERE checkout_id = v_checkout.id;
    END IF;

  ELSIF p_event_type = 'charge.refunded' THEN
    IF v_checkout IS NOT NULL THEN
      UPDATE public.checkouts SET status = 'refunded' WHERE id = v_checkout.id;
      UPDATE public.jobs SET payment_status = 'refunded' WHERE checkout_id = v_checkout.id;
    END IF;
  END IF;

  RETURN json_build_object('success', true, 'duplicate', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_stripe_webhook(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_stripe_webhook(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.process_stripe_webhook(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT) TO service_role;

-- ============================================================
-- Assertions
-- ============================================================

-- Assert: process_stripe_webhook is NOT executable by authenticated
DO $$
BEGIN
  IF has_function_privilege(
    'authenticated',
    'public.process_stripe_webhook(text, text, text, text, integer, text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: authenticated role can execute process_stripe_webhook';
  END IF;
END;
$$;

COMMIT;
