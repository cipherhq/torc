-- No-provider expiry with Stripe refund: server-authoritative job expiry
-- when no provider accepts within the time window.
--
-- This migration:
--   1. Creates job_expiry_refund_operations table (claim-based state machine)
--   2. Creates claim_expiry_eligible_jobs() RPC (batch claim with locking)
--   3. Creates begin_expiry_refund_request() RPC (transition to refund_requesting)
--   4. Creates finalize_expiry_refund() RPC (atomic finalization for paid jobs)
--   5. Creates finalize_expiry_no_refund() RPC (atomic finalization for unpaid jobs)
--   6. Creates reconcile_pending_refunds() RPC (batch claim stale refund_pending ops)
--   7. Updates accept_job() to reject jobs with active expiry operations
--   8. Disables expire_stale_jobs() (raises exception, revokes access)
--   9. REVOKE/GRANT + privilege assertions

BEGIN;

-- ============================================================
-- 1) job_expiry_refund_operations -- claim-based state machine
-- ============================================================
CREATE TABLE IF NOT EXISTS public.job_expiry_refund_operations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              UUID NOT NULL,
  checkout_id         UUID,
  payment_intent_id   TEXT,
  reason              TEXT NOT NULL DEFAULT 'no_provider',
  status              TEXT NOT NULL DEFAULT 'claimed'
    CHECK (status IN (
      'claimed', 'refund_requesting', 'refund_pending', 'refund_succeeded',
      'refund_failed_retryable', 'manual_review', 'finalized',
      'abandoned_before_refund', 'no_refund_required'
    )),
  stripe_refund_id    TEXT,
  stripe_refund_status TEXT,
  idempotency_key     TEXT NOT NULL UNIQUE,
  claim_token         UUID,
  lease_expires_at    TIMESTAMPTZ,
  attempt_count       INTEGER NOT NULL DEFAULT 0,
  last_error          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ
);

-- One operation per job
CREATE UNIQUE INDEX IF NOT EXISTS idx_expiry_ops_job
  ON public.job_expiry_refund_operations(job_id);

-- Unique partial index on stripe_refund_id to prevent duplicate refunds
CREATE UNIQUE INDEX IF NOT EXISTS idx_expiry_ops_stripe_refund
  ON public.job_expiry_refund_operations(stripe_refund_id)
  WHERE stripe_refund_id IS NOT NULL;

-- RLS: no client access
ALTER TABLE public.job_expiry_refund_operations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON public.job_expiry_refund_operations;
CREATE POLICY "Service role only"
  ON public.job_expiry_refund_operations
  FOR ALL
  USING (false);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_expiry_ops_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expiry_ops_updated_at ON public.job_expiry_refund_operations;
CREATE TRIGGER trg_expiry_ops_updated_at
  BEFORE UPDATE ON public.job_expiry_refund_operations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_expiry_ops_updated_at();


-- ============================================================
-- 2) claim_expiry_eligible_jobs(p_batch_size) -- batch claim RPC
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
  -- Authorization: only service_role may call this
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: only service_role may call claim_expiry_eligible_jobs';
  END IF;

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
        -- BLOCKER 1: idempotency_key is IMMUTABLE -- never update it
        -- BLOCKER 1: stripe_refund_id preserved if already known
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
-- 3) begin_expiry_refund_request -- transition to refund_requesting
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
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

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
-- 4) finalize_expiry_refund -- atomic finalization RPC (paid jobs)
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
  -- Authorization: only service_role may call this
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: only service_role may call finalize_expiry_refund';
  END IF;

  -- Lock and verify the operation
  SELECT * INTO v_op
  FROM public.job_expiry_refund_operations
  WHERE id = p_operation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'OPERATION_NOT_FOUND');
  END IF;

  -- ================================================================
  -- Validate claim token BEFORE duplicate/idempotency handling
  -- ================================================================
  IF v_op.claim_token IS DISTINCT FROM p_claim_token THEN
    RETURN json_build_object('success', false, 'error', 'CLAIM_TOKEN_MISMATCH');
  END IF;

  -- ================================================================
  -- Idempotent finalization
  -- If already finalized, check if it is the same refund or a conflict
  -- ================================================================
  IF v_op.status = 'finalized' THEN
    IF p_stripe_refund_id IS NOT NULL
       AND v_op.stripe_refund_id IS NOT NULL
       AND v_op.stripe_refund_id IS DISTINCT FROM p_stripe_refund_id
    THEN
      -- Different refund_id for an already-finalized operation => conflict
      -- Do NOT change status, stripe_refund_id, or completed_at -- only record the conflict
      UPDATE public.job_expiry_refund_operations
      SET last_error = 'Conflict: finalized with refund ' || v_op.stripe_refund_id
                       || ' but received different refund ' || p_stripe_refund_id
      WHERE id = p_operation_id;
      RETURN json_build_object('success', false, 'error', 'CONFLICT',
        'message', 'Operation was already finalized with a different refund ID',
        'manual_review_needed', true);
    END IF;
    -- Same refund or no new refund_id => idempotent success
    RETURN json_build_object('success', true, 'status', 'already_finalized',
      'already_finalized', true,
      'job_id', v_op.job_id, 'refund_id', v_op.stripe_refund_id);
  END IF;

  -- ================================================================
  -- BLOCKER 4: Missing payment intent
  -- ================================================================
  IF p_stripe_refund_status = 'missing_payment_intent' THEN
    UPDATE public.job_expiry_refund_operations
    SET status = 'manual_review',
        last_error = 'Job is paid but payment_intent_id is missing',
        stripe_refund_status = p_stripe_refund_status
    WHERE id = p_operation_id;
    -- Do NOT expire the job, do NOT mark refunded
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

  -- ================================================================
  -- Refund SUCCEEDED
  -- ================================================================
  IF p_stripe_refund_status = 'succeeded' THEN

    -- Require a real refund ID for succeeded status
    IF p_stripe_refund_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'REFUND_ID_REQUIRED',
        'message', 'stripe_refund_id is required when status is succeeded');
    END IF;

    -- If job is already expired/refunded by this operation, repair and return success
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

    -- Only finalize if job is still pending with no provider
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

    -- Set job status = expired, payment_status = refunded
    UPDATE public.jobs
    SET status = 'expired',
        payment_status = 'refunded',
        updated_at = now()
    WHERE id = v_op.job_id;

    -- Update checkout status = refunded if checkout_id exists
    IF v_op.checkout_id IS NOT NULL THEN
      UPDATE public.checkouts
      SET status = 'refunded'
      WHERE id = v_op.checkout_id;
    END IF;

    -- Finalize the operation
    UPDATE public.job_expiry_refund_operations
    SET status = 'finalized',
        stripe_refund_id = COALESCE(p_stripe_refund_id, v_op.stripe_refund_id),
        stripe_refund_status = p_stripe_refund_status,
        completed_at = now()
    WHERE id = p_operation_id;

    -- Insert job_status_audit record
    INSERT INTO public.job_status_audit
      (job_id, previous_status, new_status, actor_type, reason)
    VALUES
      (v_op.job_id, v_job.status, 'expired', 'system',
       'No provider available. Payment refunded (refund: ' || COALESCE(p_stripe_refund_id, 'unknown') || ')');

    -- Insert job_events record
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

    -- Notify customer
    INSERT INTO public.notifications (user_id, type, title, message)
    VALUES (
      v_job.customer_id,
      'payment',
      'Service Request Expired',
      'No provider was available. Your payment has been refunded.'
    );

    RETURN json_build_object('success', true, 'status', 'finalized',
      'job_id', v_op.job_id, 'refund_id', p_stripe_refund_id);

  -- ================================================================
  -- Refund PENDING (webhook will finalize later)
  -- ================================================================
  ELSIF p_stripe_refund_status = 'pending' THEN

    UPDATE public.job_expiry_refund_operations
    SET status = 'refund_pending',
        stripe_refund_id = COALESCE(p_stripe_refund_id, v_op.stripe_refund_id),
        stripe_refund_status = p_stripe_refund_status
    WHERE id = p_operation_id;

    RETURN json_build_object('success', true, 'status', 'refund_pending',
      'job_id', v_op.job_id, 'refund_id', p_stripe_refund_id);

  -- ================================================================
  -- Refund PERMANENT FAILURE (non-retryable, needs manual review)
  -- ================================================================
  ELSIF p_stripe_refund_status = 'permanent_failure' THEN

    UPDATE public.job_expiry_refund_operations
    SET status = 'manual_review',
        stripe_refund_id = COALESCE(p_stripe_refund_id, v_op.stripe_refund_id),
        stripe_refund_status = p_stripe_refund_status,
        last_error = p_error_message
    WHERE id = p_operation_id;

    -- Do NOT change job status, do NOT notify customer
    RETURN json_build_object('success', false, 'status', 'manual_review',
      'job_id', v_op.job_id, 'error', COALESCE(p_error_message, 'permanent_failure'));

  -- ================================================================
  -- Refund FAILED (retryable)
  -- ================================================================
  ELSE

    UPDATE public.job_expiry_refund_operations
    SET status = 'refund_failed_retryable',
        stripe_refund_id = COALESCE(p_stripe_refund_id, v_op.stripe_refund_id),
        stripe_refund_status = p_stripe_refund_status,
        last_error = p_error_message
    WHERE id = p_operation_id;

    -- Do NOT change job status on failure
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
-- 5) finalize_expiry_no_refund -- atomic finalization for unpaid jobs
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
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

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

  -- Verify payment state: only safe unpaid/failed states
  IF v_job.payment_status NOT IN ('unpaid', 'failed') THEN
    UPDATE job_expiry_refund_operations SET status = 'manual_review',
      last_error = 'Payment status ' || v_job.payment_status || ' requires review'
    WHERE id = p_operation_id;
    RETURN json_build_object('success', false, 'error', 'PAYMENT_REVIEW_NEEDED');
  END IF;

  -- Check checkout too
  IF v_op.checkout_id IS NOT NULL THEN
    SELECT * INTO v_checkout FROM checkouts WHERE id = v_op.checkout_id;
    IF v_checkout IS NOT NULL AND v_checkout.status IN ('paid', 'refunded') THEN
      UPDATE job_expiry_refund_operations SET status = 'manual_review',
        last_error = 'Checkout status ' || v_checkout.status || ' contradicts unpaid job'
      WHERE id = p_operation_id;
      RETURN json_build_object('success', false, 'error', 'CHECKOUT_INCONSISTENCY');
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
-- 6) reconcile_pending_refunds -- batch claim stale refund_pending ops
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
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

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
GRANT EXECUTE ON FUNCTION public.reconcile_pending_refunds(INTEGER, INTEGER) TO service_role;


-- ============================================================
-- 7) Update accept_job() to reject jobs with active expiry operations
--    BLOCKER 8: ALL states except abandoned_before_refund block acceptance
-- ============================================================
CREATE OR REPLACE FUNCTION public.accept_job(
  p_job_id UUID,
  p_provider_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job RECORD;
  v_provider_name TEXT;
BEGIN
  -- SECURITY: Verify caller is the provider they claim to be
  IF p_provider_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED',
      'message', 'You can only accept jobs as yourself');
  END IF;

  SELECT * INTO v_job FROM jobs WHERE id = p_job_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'JOB_NOT_FOUND',
      'message', 'Job does not exist');
  END IF;

  IF v_job.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'JOB_ALREADY_ACCEPTED',
      'message', 'Job has already been accepted by another provider',
      'current_status', v_job.status, 'current_provider_id', v_job.provider_id);
  END IF;

  -- BLOCKER 8: Block acceptance when ANY expiry operation exists
  -- EXCEPT abandoned_before_refund (meaning no refund was ever initiated).
  IF EXISTS (
    SELECT 1 FROM job_expiry_refund_operations
    WHERE job_id = p_job_id
      AND status != 'abandoned_before_refund'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'JOB_EXPIRY_IN_PROGRESS',
      'message', 'This job is being expired due to no provider availability');
  END IF;

  UPDATE jobs
  SET provider_id = p_provider_id, status = 'accepted',
      accepted_at = NOW(), updated_at = NOW()
  WHERE id = p_job_id;

  INSERT INTO job_events (job_id, event_type, actor_id, actor_type, metadata)
  VALUES (p_job_id, 'job_accepted', p_provider_id, 'provider',
    jsonb_build_object('previous_status', v_job.status));

  PERFORM pg_notify('job_accepted', jsonb_build_object(
    'job_id', p_job_id, 'provider_id', p_provider_id, 'customer_id', v_job.customer_id
  )::text);

  -- Get provider display name
  SELECT COALESCE(
    NULLIF(TRIM(first_name), '') || COALESCE(' ' || LEFT(last_name, 1) || '.', ''),
    'A provider'
  ) INTO v_provider_name FROM profiles WHERE id = p_provider_id;

  -- Notify customer: provider accepted
  INSERT INTO notifications (user_id, type, title, message, action_url)
  VALUES (
    v_job.customer_id, 'service', 'Provider Accepted',
    v_provider_name || ' has accepted your service request.',
    '/tracking/' || p_job_id::text
  );

  -- If scheduled job, also send reminder notification to provider
  IF v_job.scheduled_for IS NOT NULL AND v_job.scheduled_for > NOW() + INTERVAL '10 minutes' THEN
    INSERT INTO notifications (user_id, type, title, message, action_url)
    VALUES (
      p_provider_id, 'service', 'Scheduled Job Accepted',
      'You accepted a scheduled job for ' || TO_CHAR(v_job.scheduled_for AT TIME ZONE 'America/New_York', 'Mon DD at HH12:MI AM') || '. Don''t forget to start heading to the customer on time!',
      '/job/' || p_job_id::text
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'job_id', p_job_id,
    'provider_id', p_provider_id, 'status', 'accepted', 'accepted_at', NOW());
END;
$$;

-- Re-apply accept_job grants (authenticated users call it, not service_role)
REVOKE EXECUTE ON FUNCTION public.accept_job(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accept_job(UUID, UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public.accept_job(UUID, UUID) TO authenticated;


-- ============================================================
-- 8) BLOCKER 2: Disable expire_stale_jobs()
--    Match original signature: RETURNS INTEGER, param p_max_age_hours
--    Replace body with RAISE EXCEPTION, revoke from ALL roles
-- ============================================================

-- Remove cron schedule if it exists
DO $$
BEGIN
  PERFORM cron.unschedule('expire-stale-jobs');
EXCEPTION WHEN OTHERS THEN
  -- cron extension may not be available or job may not exist
  NULL;
END;
$$;

-- Replace the function body so it raises an exception if called
CREATE OR REPLACE FUNCTION public.expire_stale_jobs(p_max_age_hours INTEGER DEFAULT 2)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'DEPRECATED: expire_stale_jobs has been replaced. Use claim_expiry_eligible_jobs + finalize_expiry_refund.';
END;
$$;

-- Revoke from ALL roles including service_role
REVOKE EXECUTE ON FUNCTION public.expire_stale_jobs(INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.expire_stale_jobs(INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION public.expire_stale_jobs(INTEGER) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_stale_jobs(INTEGER) FROM service_role;

COMMENT ON FUNCTION public.expire_stale_jobs(INTEGER) IS
  'DEPRECATED (2026-08-05): Replaced by claim_expiry_eligible_jobs + finalize_expiry_refund '
  'edge function pipeline. Function body raises EXCEPTION. All EXECUTE privileges revoked.';


-- ============================================================
-- 9) Privilege assertions
-- ============================================================

-- Assert: job_expiry_refund_operations has RLS enabled
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE relname = 'job_expiry_refund_operations'
      AND relnamespace = 'public'::regnamespace
      AND relrowsecurity = true
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: RLS is not enabled on public.job_expiry_refund_operations';
  END IF;
END;
$$;

-- Assert: claim_expiry_eligible_jobs is NOT executable by authenticated
DO $$
BEGIN
  IF has_function_privilege(
    'authenticated',
    'public.claim_expiry_eligible_jobs(integer)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: authenticated role can execute claim_expiry_eligible_jobs';
  END IF;
END;
$$;

-- Assert: claim_expiry_eligible_jobs is NOT executable by anon
DO $$
BEGIN
  IF has_function_privilege(
    'anon',
    'public.claim_expiry_eligible_jobs(integer)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: anon role can execute claim_expiry_eligible_jobs';
  END IF;
END;
$$;

-- Assert: begin_expiry_refund_request is NOT executable by authenticated
DO $$
BEGIN
  IF has_function_privilege(
    'authenticated',
    'public.begin_expiry_refund_request(uuid, uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: authenticated role can execute begin_expiry_refund_request';
  END IF;
END;
$$;

-- Assert: begin_expiry_refund_request is NOT executable by anon
DO $$
BEGIN
  IF has_function_privilege(
    'anon',
    'public.begin_expiry_refund_request(uuid, uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: anon role can execute begin_expiry_refund_request';
  END IF;
END;
$$;

-- Assert: finalize_expiry_refund is NOT executable by authenticated
DO $$
BEGIN
  IF has_function_privilege(
    'authenticated',
    'public.finalize_expiry_refund(uuid, uuid, text, text, text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: authenticated role can execute finalize_expiry_refund';
  END IF;
END;
$$;

-- Assert: finalize_expiry_refund is NOT executable by anon
DO $$
BEGIN
  IF has_function_privilege(
    'anon',
    'public.finalize_expiry_refund(uuid, uuid, text, text, text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: anon role can execute finalize_expiry_refund';
  END IF;
END;
$$;

-- Assert: finalize_expiry_no_refund is NOT executable by authenticated
DO $$
BEGIN
  IF has_function_privilege(
    'authenticated',
    'public.finalize_expiry_no_refund(uuid, uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: authenticated role can execute finalize_expiry_no_refund';
  END IF;
END;
$$;

-- Assert: finalize_expiry_no_refund is NOT executable by anon
DO $$
BEGIN
  IF has_function_privilege(
    'anon',
    'public.finalize_expiry_no_refund(uuid, uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: anon role can execute finalize_expiry_no_refund';
  END IF;
END;
$$;

-- Assert: reconcile_pending_refunds is NOT executable by authenticated
DO $$
BEGIN
  IF has_function_privilege(
    'authenticated',
    'public.reconcile_pending_refunds(integer, integer)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: authenticated role can execute reconcile_pending_refunds';
  END IF;
END;
$$;

-- Assert: reconcile_pending_refunds is NOT executable by anon
DO $$
BEGIN
  IF has_function_privilege(
    'anon',
    'public.reconcile_pending_refunds(integer, integer)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: anon role can execute reconcile_pending_refunds';
  END IF;
END;
$$;

-- BLOCKER 2 assertion: service_role cannot execute expire_stale_jobs
DO $$
BEGIN
  IF has_function_privilege(
    'service_role',
    'public.expire_stale_jobs(integer)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: service_role can still execute expire_stale_jobs';
  END IF;
END;
$$;

COMMIT;
