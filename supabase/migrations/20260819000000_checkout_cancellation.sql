-- Checkout cancellation: allow customers to cancel a checkout before the
-- Stripe webhook creates a job, preventing ghost jobs.
--
-- Adds 'customer_cancelled' to checkout status enum.
-- Adds cancel_checkout RPC (self-only, authenticated).
-- process_stripe_webhook updates are in migration 20260820.

-- 1. Expand checkout status constraint to include customer_cancelled
ALTER TABLE public.checkouts DROP CONSTRAINT IF EXISTS checkouts_status_check;
ALTER TABLE public.checkouts ADD CONSTRAINT checkouts_status_check
  CHECK (status IN ('pending', 'payment_processing', 'paid', 'failed', 'expired', 'refunded', 'customer_cancelled'));

-- 2. Add cancelled_at column if not exists
ALTER TABLE public.checkouts ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- 3. cancel_checkout RPC — marks cancelled only, NO refund op here
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

DO $$ BEGIN RAISE NOTICE 'Checkout cancellation migration complete.'; END $$;
