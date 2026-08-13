-- Atomic checkout refund finalizer.
-- Used by both webhook correlation and scheduled reconciliation
-- to ensure operation + checkout status transition atomically.

CREATE OR REPLACE FUNCTION public.finalize_checkout_refund(
  p_operation_id UUID,
  p_stripe_refund_id TEXT,
  p_stripe_refund_status TEXT,  -- 'succeeded' | 'failed' | 'pending'
  p_error_message TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_op RECORD;
BEGIN
  -- Lock the operation row
  SELECT * INTO v_op
  FROM checkout_refund_operations
  WHERE id = p_operation_id
  FOR UPDATE;

  IF v_op IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Operation not found');
  END IF;

  -- Already completed — idempotent
  IF v_op.status = 'completed' THEN
    RETURN json_build_object('success', true, 'already_completed', true);
  END IF;

  -- Already manual_review — don't overwrite
  IF v_op.status = 'manual_review' THEN
    RETURN json_build_object('success', true, 'already_manual_review', true);
  END IF;

  -- Only finalize from refund_pending or refund_requesting
  IF v_op.status NOT IN ('refund_pending', 'refund_requesting', 'pending') THEN
    RETURN json_build_object('success', false, 'error', 'Cannot finalize from status: ' || v_op.status);
  END IF;

  -- Verify stripe_refund_id matches if operation already has one
  IF v_op.stripe_refund_id IS NOT NULL AND v_op.stripe_refund_id != p_stripe_refund_id THEN
    RETURN json_build_object('success', false, 'error', 'Stripe refund ID mismatch');
  END IF;

  IF p_stripe_refund_status = 'succeeded' THEN
    -- ATOMIC: both operation and checkout in one transaction
    UPDATE checkout_refund_operations SET
      status = 'completed',
      stripe_refund_id = p_stripe_refund_id,
      stripe_refund_status = 'succeeded',
      completed_at = now()
    WHERE id = p_operation_id;

    UPDATE checkouts SET status = 'refunded'
    WHERE id = v_op.checkout_id;

    RETURN json_build_object('success', true, 'status', 'completed');

  ELSIF p_stripe_refund_status = 'pending' THEN
    -- Still pending at Stripe — update refund ID but remain refund_pending
    UPDATE checkout_refund_operations SET
      stripe_refund_id = p_stripe_refund_id,
      stripe_refund_status = 'pending',
      status = 'refund_pending'
    WHERE id = p_operation_id;

    RETURN json_build_object('success', true, 'status', 'refund_pending');

  ELSE
    -- Failed or unknown — manual_review
    UPDATE checkout_refund_operations SET
      status = 'manual_review',
      stripe_refund_id = p_stripe_refund_id,
      stripe_refund_status = p_stripe_refund_status,
      last_error = COALESCE(p_error_message, 'Stripe refund status: ' || p_stripe_refund_status)
    WHERE id = p_operation_id;

    RETURN json_build_object('success', true, 'status', 'manual_review');
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finalize_checkout_refund(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finalize_checkout_refund(UUID, TEXT, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.finalize_checkout_refund(UUID, TEXT, TEXT, TEXT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.finalize_checkout_refund(UUID, TEXT, TEXT, TEXT) TO service_role;

DO $$ BEGIN RAISE NOTICE 'finalize_checkout_refund migration complete.'; END $$;
