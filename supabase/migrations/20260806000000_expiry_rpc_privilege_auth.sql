-- Remove legacy JWT-GUC authorization checks from expiry RPCs.
--
-- The five service-only expiry RPCs previously checked:
--   current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
--
-- This pattern fails when the caller's key is not a legacy Supabase JWT.
-- Authorization is instead enforced by PostgreSQL EXECUTE privileges:
--   REVOKE from PUBLIC, anon, authenticated
--   GRANT to service_role only
--
-- No business logic is changed. Only the redundant JWT-GUC IF/RAISE blocks are removed.

-- ============================================================
-- 1) claim_expiry_eligible_jobs
-- ============================================================
CREATE OR REPLACE FUNCTION public.claim_expiry_eligible_jobs(
  p_batch_size INTEGER DEFAULT 10
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job           RECORD;
  v_claim_token   UUID;
  v_idempotency   TEXT;
  v_attempt       INTEGER;
  v_op_id         UUID;
  v_results       JSON[];
  v_lease_until   TIMESTAMPTZ;
  v_existing_op   RECORD;
BEGIN
  v_results := ARRAY[]::JSON[];
  v_lease_until := now() + interval '5 minutes';

  FOR v_job IN
    SELECT j.id AS job_id, j.checkout_id, j.payment_intent_id,
           j.status, j.provider_id, j.created_at, j.scheduled_for
    FROM public.jobs j
    WHERE j.status = 'pending'
      AND j.provider_id IS NULL
      AND GREATEST(j.created_at, COALESCE(j.scheduled_for, j.created_at)) < now() - interval '2 hours'
      -- Exclude jobs that already have an active, non-reclaimable operation
      AND NOT EXISTS (
        SELECT 1 FROM public.job_expiry_refund_operations op
        WHERE op.job_id = j.id
          AND op.status NOT IN ('abandoned_before_refund', 'no_refund_required', 'refund_failed_retryable')
          AND (op.lease_expires_at IS NULL OR op.lease_expires_at > now())
      )
    ORDER BY j.created_at ASC
    LIMIT p_batch_size
    FOR UPDATE OF j SKIP LOCKED
  LOOP
    -- Re-check eligibility after lock
    IF v_job.provider_id IS NOT NULL OR v_job.status != 'pending' THEN
      CONTINUE;
    END IF;

    v_claim_token := gen_random_uuid();

    -- Look up checkout for payment_intent_id if not on job
    DECLARE
      v_checkout_id UUID := NULL;
      v_checkout_pi TEXT := NULL;
    BEGIN
      IF v_job.checkout_id IS NOT NULL THEN
        SELECT id, payment_intent_id INTO v_checkout_id, v_checkout_pi
        FROM public.checkouts
        WHERE id = v_job.checkout_id;
      END IF;

      -- Generate operation ID first so we can build the immutable idempotency key
      v_op_id := gen_random_uuid();
      v_idempotency := 'torc:no-provider-expiry:' || v_op_id::text;

      INSERT INTO public.job_expiry_refund_operations (
        id, job_id, checkout_id, payment_intent_id, reason, status,
        idempotency_key, claim_token, lease_expires_at, attempt_count
      ) VALUES (
        v_op_id,
        v_job.job_id,
        COALESCE(v_job.checkout_id, v_checkout_id),
        COALESCE(v_job.payment_intent_id, v_checkout_pi),
        'no_provider', 'claimed',
        v_idempotency, v_claim_token, v_lease_until, 1
      );
    EXCEPTION WHEN unique_violation THEN
      -- Job already has an operation -- check if we can reclaim
      SELECT id, attempt_count, status, lease_expires_at,
             idempotency_key, stripe_refund_id
      INTO v_existing_op
      FROM public.job_expiry_refund_operations
      WHERE job_id = v_job.job_id
      FOR UPDATE;

      v_op_id := v_existing_op.id;

      -- Only reclaim if retryable-failed or lease expired on claimed/refund_requesting
      IF v_existing_op.status = 'refund_failed_retryable'
         OR (v_existing_op.status IN ('claimed', 'refund_requesting')
             AND v_existing_op.lease_expires_at IS NOT NULL
             AND v_existing_op.lease_expires_at <= now())
      THEN
        v_claim_token := gen_random_uuid();
        -- idempotency_key is IMMUTABLE -- never update it
        -- stripe_refund_id preserved if already known
        UPDATE public.job_expiry_refund_operations
        SET status = 'claimed',
            claim_token = v_claim_token,
            lease_expires_at = now() + interval '5 minutes',
            attempt_count = v_existing_op.attempt_count + 1,
            last_error = NULL,
            completed_at = NULL
        WHERE id = v_op_id;

        -- Read back the preserved idempotency_key for the response
        v_idempotency := v_existing_op.idempotency_key;
      ELSE
        -- Cannot reclaim -- skip
        CONTINUE;
      END IF;
    END;

    -- Re-read the operation to get final checkout/PI values
    DECLARE
      v_final_checkout_id UUID;
      v_final_pi TEXT;
    BEGIN
      SELECT checkout_id, payment_intent_id INTO v_final_checkout_id, v_final_pi
      FROM public.job_expiry_refund_operations WHERE id = v_op_id;

      v_results := v_results || json_build_object(
        'job_id', v_job.job_id,
        'payment_intent_id', v_final_pi,
        'checkout_id', v_final_checkout_id,
        'idempotency_key', v_idempotency,
        'claim_token', v_claim_token,
        'operation_id', v_op_id
      )::json;
    END;
  END LOOP;

  RETURN array_to_json(v_results);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_expiry_eligible_jobs(INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_expiry_eligible_jobs(INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_expiry_eligible_jobs(INTEGER) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_expiry_eligible_jobs(INTEGER) TO service_role;


-- ============================================================
-- 2) begin_expiry_refund_request
-- ============================================================
CREATE OR REPLACE FUNCTION public.begin_expiry_refund_request(
  p_operation_id UUID,
  p_claim_token UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_op RECORD;
BEGIN
  SELECT * INTO v_op FROM job_expiry_refund_operations WHERE id = p_operation_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'NOT_FOUND'); END IF;
  IF v_op.claim_token IS DISTINCT FROM p_claim_token THEN
    RETURN json_build_object('success', false, 'error', 'STALE_CLAIM');
  END IF;
  -- Only transition from 'claimed' or reclaimed states
  IF v_op.status NOT IN ('claimed', 'refund_failed_retryable') THEN
    RETURN json_build_object('success', false, 'error', 'INVALID_STATE', 'current_status', v_op.status);
  END IF;

  UPDATE job_expiry_refund_operations
  SET status = 'refund_requesting', attempt_count = attempt_count + 1, updated_at = now()
  WHERE id = p_operation_id;

  RETURN json_build_object('success', true,
    'idempotency_key', v_op.idempotency_key,
    'payment_intent_id', v_op.payment_intent_id,
    'stripe_refund_id', v_op.stripe_refund_id,
    'job_id', v_op.job_id,
    'checkout_id', v_op.checkout_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.begin_expiry_refund_request(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.begin_expiry_refund_request(UUID, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.begin_expiry_refund_request(UUID, UUID) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.begin_expiry_refund_request(UUID, UUID) TO service_role;


-- ============================================================
-- 3) finalize_expiry_refund
-- ============================================================
CREATE OR REPLACE FUNCTION public.finalize_expiry_refund(
  p_operation_id         UUID,
  p_claim_token          UUID,
  p_stripe_refund_id     TEXT DEFAULT NULL,
  p_stripe_refund_status TEXT DEFAULT NULL,
  p_error_message        TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_op    RECORD;
  v_job   RECORD;
BEGIN
  -- Lock and verify the operation
  SELECT * INTO v_op
  FROM public.job_expiry_refund_operations
  WHERE id = p_operation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'OPERATION_NOT_FOUND');
  END IF;

  -- Validate claim token BEFORE duplicate/idempotency handling
  IF v_op.claim_token IS DISTINCT FROM p_claim_token THEN
    RETURN json_build_object('success', false, 'error', 'CLAIM_TOKEN_MISMATCH');
  END IF;

  -- Idempotent finalization
  IF v_op.status = 'finalized' THEN
    IF p_stripe_refund_id IS NOT NULL
       AND v_op.stripe_refund_id IS NOT NULL
       AND v_op.stripe_refund_id IS DISTINCT FROM p_stripe_refund_id
    THEN
      UPDATE public.job_expiry_refund_operations
      SET last_error = 'Conflict: finalized with refund ' || v_op.stripe_refund_id
                       || ' but received different refund ' || p_stripe_refund_id
      WHERE id = p_operation_id;
      RETURN json_build_object('success', false, 'error', 'CONFLICT',
        'message', 'Operation was already finalized with a different refund ID',
        'manual_review_needed', true);
    END IF;
    RETURN json_build_object('success', true, 'status', 'already_finalized',
      'already_finalized', true,
      'job_id', v_op.job_id, 'refund_id', v_op.stripe_refund_id);
  END IF;

  -- Missing payment intent
  IF p_stripe_refund_status = 'missing_payment_intent' THEN
    UPDATE public.job_expiry_refund_operations
    SET status = 'manual_review',
        last_error = 'Job is paid but payment_intent_id is missing',
        stripe_refund_status = p_stripe_refund_status
    WHERE id = p_operation_id;
    RETURN json_build_object('success', false, 'error', 'MISSING_PAYMENT_INTENT',
      'status', 'manual_review',
      'job_id', v_op.job_id,
      'message', 'Job is paid but payment_intent_id is missing. Requires manual review.');
  END IF;

  -- Verify the job still exists
  SELECT * INTO v_job
  FROM public.jobs
  WHERE id = v_op.job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    UPDATE public.job_expiry_refund_operations
    SET status = 'manual_review', last_error = 'Job not found'
    WHERE id = p_operation_id;
    RETURN json_build_object('success', false, 'error', 'JOB_NOT_FOUND');
  END IF;

  -- Refund SUCCEEDED
  IF p_stripe_refund_status = 'succeeded' THEN

    IF p_stripe_refund_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'REFUND_ID_REQUIRED',
        'message', 'stripe_refund_id is required when status is succeeded');
    END IF;

    IF v_job.status = 'expired' AND v_job.payment_status = 'refunded' THEN
      UPDATE public.job_expiry_refund_operations
      SET status = 'finalized',
          stripe_refund_id = COALESCE(p_stripe_refund_id, v_op.stripe_refund_id),
          stripe_refund_status = p_stripe_refund_status,
          completed_at = COALESCE(v_op.completed_at, now())
      WHERE id = p_operation_id;
      RETURN json_build_object('success', true, 'status', 'already_finalized',
        'already_finalized', true, 'repaired', true,
        'job_id', v_op.job_id, 'refund_id', COALESCE(p_stripe_refund_id, v_op.stripe_refund_id));
    END IF;

    IF v_job.status != 'pending' OR v_job.provider_id IS NOT NULL THEN
      UPDATE public.job_expiry_refund_operations
      SET status = 'manual_review',
          last_error = 'Refund succeeded but job changed: status=' || v_job.status
                       || ', provider_id=' || COALESCE(v_job.provider_id::text, 'null'),
          stripe_refund_id = COALESCE(p_stripe_refund_id, v_op.stripe_refund_id),
          stripe_refund_status = p_stripe_refund_status
      WHERE id = p_operation_id;
      RETURN json_build_object('success', false, 'error', 'JOB_NO_LONGER_ELIGIBLE',
        'status', 'manual_review',
        'message', 'Refund succeeded but job was already accepted/changed. Manual review needed.');
    END IF;

    UPDATE public.jobs
    SET status = 'expired',
        payment_status = 'refunded',
        updated_at = now()
    WHERE id = v_op.job_id;

    IF v_op.checkout_id IS NOT NULL THEN
      UPDATE public.checkouts
      SET status = 'refunded'
      WHERE id = v_op.checkout_id;
    END IF;

    UPDATE public.job_expiry_refund_operations
    SET status = 'finalized',
        stripe_refund_id = COALESCE(p_stripe_refund_id, v_op.stripe_refund_id),
        stripe_refund_status = p_stripe_refund_status,
        completed_at = now()
    WHERE id = p_operation_id;

    INSERT INTO public.job_status_audit
      (job_id, previous_status, new_status, actor_type, reason)
    VALUES
      (v_op.job_id, v_job.status, 'expired', 'system',
       'No provider available. Payment refunded (refund: ' || COALESCE(p_stripe_refund_id, 'unknown') || ')');

    INSERT INTO public.job_events
      (job_id, event_type, actor_type, metadata)
    VALUES
      (v_op.job_id, 'job_expired_no_provider', 'system',
       jsonb_build_object(
         'reason', 'no_provider',
         'previous_status', v_job.status,
         'stripe_refund_id', p_stripe_refund_id,
         'operation_id', p_operation_id
       ));

    INSERT INTO public.notifications (user_id, type, title, message)
    VALUES (
      v_job.customer_id,
      'payment',
      'Service Request Expired',
      'No provider was available. Your payment has been refunded.'
    );

    RETURN json_build_object('success', true, 'status', 'finalized',
      'job_id', v_op.job_id, 'refund_id', p_stripe_refund_id);

  -- Refund PENDING
  ELSIF p_stripe_refund_status = 'pending' THEN

    UPDATE public.job_expiry_refund_operations
    SET status = 'refund_pending',
        stripe_refund_id = COALESCE(p_stripe_refund_id, v_op.stripe_refund_id),
        stripe_refund_status = p_stripe_refund_status
    WHERE id = p_operation_id;

    RETURN json_build_object('success', true, 'status', 'refund_pending',
      'job_id', v_op.job_id, 'refund_id', p_stripe_refund_id);

  -- Permanent failure
  ELSIF p_stripe_refund_status = 'permanent_failure' THEN

    UPDATE public.job_expiry_refund_operations
    SET status = 'manual_review',
        stripe_refund_id = COALESCE(p_stripe_refund_id, v_op.stripe_refund_id),
        stripe_refund_status = p_stripe_refund_status,
        last_error = p_error_message
    WHERE id = p_operation_id;

    RETURN json_build_object('success', false, 'status', 'manual_review',
      'job_id', v_op.job_id, 'error', COALESCE(p_error_message, 'permanent_failure'));

  -- Terminal Stripe failed
  ELSIF p_stripe_refund_status = 'failed' THEN

    UPDATE public.job_expiry_refund_operations
    SET status = 'manual_review',
        stripe_refund_id = COALESCE(p_stripe_refund_id, v_op.stripe_refund_id),
        stripe_refund_status = 'failed',
        last_error = COALESCE(p_error_message, 'Stripe refund terminal status: failed')
    WHERE id = p_operation_id;

    RETURN json_build_object('success', false, 'status', 'manual_review',
      'job_id', v_op.job_id, 'error', 'Stripe refund failed terminally');

  -- Retryable failure
  ELSE

    UPDATE public.job_expiry_refund_operations
    SET status = 'refund_failed_retryable',
        stripe_refund_id = COALESCE(p_stripe_refund_id, v_op.stripe_refund_id),
        stripe_refund_status = p_stripe_refund_status,
        last_error = p_error_message
    WHERE id = p_operation_id;

    RETURN json_build_object('success', false, 'status', 'refund_failed_retryable',
      'job_id', v_op.job_id, 'error', COALESCE(p_error_message, p_stripe_refund_status));

  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finalize_expiry_refund(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finalize_expiry_refund(UUID, UUID, TEXT, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.finalize_expiry_refund(UUID, UUID, TEXT, TEXT, TEXT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.finalize_expiry_refund(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;


-- ============================================================
-- 4) finalize_expiry_no_refund
-- ============================================================
CREATE OR REPLACE FUNCTION public.finalize_expiry_no_refund(
  p_operation_id UUID,
  p_claim_token UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_op RECORD;
  v_job RECORD;
  v_checkout RECORD;
BEGIN
  SELECT * INTO v_op FROM job_expiry_refund_operations WHERE id = p_operation_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'NOT_FOUND'); END IF;
  IF v_op.claim_token IS DISTINCT FROM p_claim_token THEN
    RETURN json_build_object('success', false, 'error', 'STALE_CLAIM');
  END IF;

  -- Idempotent: if already finalized as no_refund_required, return success
  IF v_op.status = 'no_refund_required' THEN
    RETURN json_build_object('success', true, 'status', 'already_finalized',
      'already_finalized', true, 'job_id', v_op.job_id);
  END IF;

  SELECT * INTO v_job FROM jobs WHERE id = v_op.job_id FOR UPDATE;
  IF NOT FOUND THEN
    UPDATE job_expiry_refund_operations SET status = 'manual_review', last_error = 'Job not found' WHERE id = p_operation_id;
    RETURN json_build_object('success', false, 'error', 'JOB_NOT_FOUND');
  END IF;

  IF v_job.status != 'pending' OR v_job.provider_id IS NOT NULL THEN
    UPDATE job_expiry_refund_operations SET status = 'manual_review', last_error = 'Job changed' WHERE id = p_operation_id;
    RETURN json_build_object('success', false, 'error', 'JOB_CHANGED');
  END IF;

  -- FAIL-CLOSED: only EXPLICITLY proven non-captured payment states may expire without refund.
  IF v_job.payment_status IS NULL OR v_job.payment_status NOT IN ('unpaid', 'failed') THEN
    UPDATE job_expiry_refund_operations SET status = 'manual_review',
      last_error = 'Payment status ' || COALESCE(v_job.payment_status, 'NULL') || ' requires review'
    WHERE id = p_operation_id;
    RETURN json_build_object('success', false, 'error', 'PAYMENT_REVIEW_NEEDED');
  END IF;

  -- FAIL-CLOSED checkout verification.
  IF v_op.checkout_id IS NOT NULL THEN
    SELECT * INTO v_checkout FROM checkouts WHERE id = v_op.checkout_id FOR UPDATE;
    IF NOT FOUND THEN
      UPDATE job_expiry_refund_operations SET status = 'manual_review',
        last_error = 'Referenced checkout ' || v_op.checkout_id || ' does not exist — cannot verify payment state'
      WHERE id = p_operation_id;
      RETURN json_build_object('success', false, 'error', 'CHECKOUT_NOT_FOUND');
    END IF;
    IF v_checkout.status IS NULL
       OR v_checkout.status NOT IN ('pending', 'failed', 'expired')
    THEN
      UPDATE job_expiry_refund_operations SET status = 'manual_review',
        last_error = 'Checkout status ' || COALESCE(v_checkout.status, 'NULL') || ' not proven safe for no-refund expiry'
      WHERE id = p_operation_id;
      RETURN json_build_object('success', false, 'error', 'CHECKOUT_INCONSISTENCY');
    END IF;
    IF v_checkout.paid_at IS NOT NULL THEN
      UPDATE job_expiry_refund_operations SET status = 'manual_review',
        last_error = 'Checkout has paid_at set — payment may have been captured'
      WHERE id = p_operation_id;
      RETURN json_build_object('success', false, 'error', 'CHECKOUT_PAID_AT_SET');
    END IF;
    IF v_checkout.payment_intent_id IS NOT NULL THEN
      UPDATE job_expiry_refund_operations SET status = 'manual_review',
        last_error = 'Checkout has payment_intent_id — payment may have been initiated'
      WHERE id = p_operation_id;
      RETURN json_build_object('success', false, 'error', 'CHECKOUT_HAS_PAYMENT_INTENT');
    END IF;
  END IF;

  -- Atomically expire
  UPDATE jobs SET status = 'expired', updated_at = now() WHERE id = v_op.job_id;

  UPDATE job_expiry_refund_operations SET
    status = 'no_refund_required', completed_at = now()
  WHERE id = p_operation_id;

  INSERT INTO job_status_audit (job_id, previous_status, new_status, actor_type, reason)
  VALUES (v_op.job_id, v_job.status, 'expired', 'system', 'No provider available. No payment captured.');

  INSERT INTO job_events (job_id, event_type, actor_type, metadata)
  VALUES (v_op.job_id, 'job_expired_no_provider', 'system',
    jsonb_build_object('reason', 'no_provider', 'payment_status', v_job.payment_status));

  INSERT INTO notifications (user_id, type, title, message)
  VALUES (v_job.customer_id, 'service', 'Service Request Expired',
    'No provider was available for your request. You were not charged.');

  RETURN json_build_object('success', true, 'status', 'no_refund_required', 'job_id', v_op.job_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finalize_expiry_no_refund(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finalize_expiry_no_refund(UUID, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.finalize_expiry_no_refund(UUID, UUID) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.finalize_expiry_no_refund(UUID, UUID) TO service_role;


-- ============================================================
-- 5) reconcile_pending_refunds
-- ============================================================
CREATE OR REPLACE FUNCTION public.reconcile_pending_refunds(
  p_batch_size INTEGER DEFAULT 10,
  p_stale_minutes INTEGER DEFAULT 30
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_op RECORD;
  v_token UUID;
  v_results JSON[];
BEGIN
  v_results := ARRAY[]::JSON[];

  FOR v_op IN
    SELECT * FROM job_expiry_refund_operations
    WHERE status = 'refund_pending'
      AND stripe_refund_id IS NOT NULL
      AND updated_at < now() - (p_stale_minutes || ' minutes')::interval
    ORDER BY updated_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  LOOP
    v_token := gen_random_uuid();
    UPDATE job_expiry_refund_operations
    SET claim_token = v_token,
        lease_expires_at = now() + interval '5 minutes',
        attempt_count = attempt_count + 1
    WHERE id = v_op.id;

    v_results := v_results || json_build_object(
      'operation_id', v_op.id,
      'job_id', v_op.job_id,
      'stripe_refund_id', v_op.stripe_refund_id,
      'idempotency_key', v_op.idempotency_key,
      'claim_token', v_token,
      'payment_intent_id', v_op.payment_intent_id
    )::json;
  END LOOP;

  RETURN array_to_json(v_results);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reconcile_pending_refunds(INTEGER, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reconcile_pending_refunds(INTEGER, INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reconcile_pending_refunds(INTEGER, INTEGER) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.reconcile_pending_refunds(INTEGER, INTEGER) TO service_role;
