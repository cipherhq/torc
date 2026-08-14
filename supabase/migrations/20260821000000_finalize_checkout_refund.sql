-- Checkout refund claim + atomic finalization RPCs.

-- 1. claim_checkout_refund: atomic claim with lease for worker ownership
CREATE OR REPLACE FUNCTION public.claim_checkout_refund(p_batch_size INTEGER DEFAULT 5)
RETURNS JSON[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_results JSON[];
  v_op RECORD;
  v_claim_token UUID;
  v_lease_until TIMESTAMPTZ;
BEGIN
  v_results := ARRAY[]::JSON[];
  v_lease_until := now() + interval '5 minutes';

  FOR v_op IN
    SELECT id, checkout_id, payment_intent_id, refund_amount, currency, idempotency_key
    FROM checkout_refund_operations
    WHERE (status = 'pending')
       OR (status = 'refund_requesting' AND lease_expires_at IS NOT NULL AND lease_expires_at <= now())
    ORDER BY created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  LOOP
    v_claim_token := gen_random_uuid();

    UPDATE checkout_refund_operations SET
      status = 'refund_requesting',
      claim_token = v_claim_token,
      lease_expires_at = v_lease_until
    WHERE id = v_op.id;

    v_results := v_results || json_build_object(
      'id', v_op.id,
      'checkout_id', v_op.checkout_id,
      'payment_intent_id', v_op.payment_intent_id,
      'refund_amount', v_op.refund_amount,
      'currency', v_op.currency,
      'idempotency_key', v_op.idempotency_key,
      'claim_token', v_claim_token
    )::json;
  END LOOP;

  RETURN v_results;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_checkout_refund(INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_checkout_refund(INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_checkout_refund(INTEGER) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_checkout_refund(INTEGER) TO service_role;

-- 2. finalize_checkout_refund: atomic op + checkout transition
-- NULL-SAFE claim token verification for refund_requesting.
-- refund_pending does not require claim token (webhook/reconciliation path).
CREATE OR REPLACE FUNCTION public.finalize_checkout_refund(
  p_operation_id UUID,
  p_claim_token UUID,
  p_stripe_refund_id TEXT,
  p_stripe_refund_status TEXT,
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
  SELECT * INTO v_op FROM checkout_refund_operations WHERE id = p_operation_id FOR UPDATE;

  IF v_op IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Operation not found');
  END IF;

  -- Terminal states are idempotent
  IF v_op.status = 'completed' THEN
    RETURN json_build_object('success', true, 'already_completed', true);
  END IF;
  IF v_op.status = 'manual_review' THEN
    RETURN json_build_object('success', true, 'already_manual_review', true);
  END IF;

  -- Only finalize from refund_requesting or refund_pending
  IF v_op.status NOT IN ('refund_pending', 'refund_requesting') THEN
    RETURN json_build_object('success', false, 'error', 'Cannot finalize from status: ' || v_op.status);
  END IF;

  -- NULL-SAFE claim ownership for refund_requesting:
  -- BOTH tokens must be non-null and match exactly.
  IF v_op.status = 'refund_requesting' THEN
    IF v_op.claim_token IS NULL
       OR p_claim_token IS NULL
       OR v_op.claim_token IS DISTINCT FROM p_claim_token
    THEN
      RETURN json_build_object('success', false, 'error', 'Claim token mismatch or missing');
    END IF;
  END IF;

  -- Verify stripe_refund_id matches if already set
  IF v_op.stripe_refund_id IS NOT NULL AND v_op.stripe_refund_id != p_stripe_refund_id THEN
    RETURN json_build_object('success', false, 'error', 'Stripe refund ID mismatch');
  END IF;

  IF p_stripe_refund_status = 'succeeded' THEN
    -- ATOMIC: both operation and checkout in one transaction
    UPDATE checkout_refund_operations SET
      status = 'completed', stripe_refund_id = p_stripe_refund_id,
      stripe_refund_status = 'succeeded', completed_at = now(),
      claim_token = NULL, lease_expires_at = NULL
    WHERE id = p_operation_id;
    UPDATE checkouts SET status = 'refunded' WHERE id = v_op.checkout_id;
    RETURN json_build_object('success', true, 'status', 'completed');

  ELSIF p_stripe_refund_status = 'pending' THEN
    UPDATE checkout_refund_operations SET
      stripe_refund_id = p_stripe_refund_id, stripe_refund_status = 'pending',
      status = 'refund_pending', claim_token = NULL, lease_expires_at = NULL
    WHERE id = p_operation_id;
    RETURN json_build_object('success', true, 'status', 'refund_pending');

  ELSE
    -- Failed or unknown — manual_review
    UPDATE checkout_refund_operations SET
      status = 'manual_review', stripe_refund_id = p_stripe_refund_id,
      stripe_refund_status = p_stripe_refund_status,
      last_error = COALESCE(p_error_message, 'Stripe refund status: ' || p_stripe_refund_status),
      claim_token = NULL, lease_expires_at = NULL
    WHERE id = p_operation_id;
    RETURN json_build_object('success', true, 'status', 'manual_review');
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finalize_checkout_refund(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finalize_checkout_refund(UUID, UUID, TEXT, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.finalize_checkout_refund(UUID, UUID, TEXT, TEXT, TEXT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.finalize_checkout_refund(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;

-- Drop old 4-param signature if it exists
DROP FUNCTION IF EXISTS public.finalize_checkout_refund(UUID, TEXT, TEXT, TEXT);

DO $$ BEGIN RAISE NOTICE 'Checkout refund claim + finalization RPCs complete.'; END $$;
