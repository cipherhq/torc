-- No-provider expiry with Stripe refund: server-authoritative job expiry
-- when no provider accepts within the time window.
--
-- This migration:
--   1. Creates job_expiry_refund_operations table (claim-based state machine)
--   2. Creates claim_expiry_eligible_jobs() RPC (batch claim with locking)
--   3. Creates finalize_expiry_refund() RPC (atomic finalization)
--   4. Updates accept_job() to reject jobs with active expiry claims
--   5. Deprecates expire_stale_jobs() (removes cron, keeps function)
--   6. REVOKE/GRANT + privilege assertions

BEGIN;

-- ============================================================
-- 1) job_expiry_refund_operations — claim-based state machine
-- ============================================================
CREATE TABLE IF NOT EXISTS public.job_expiry_refund_operations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              UUID NOT NULL,
  checkout_id         UUID,
  payment_intent_id   TEXT,
  reason              TEXT NOT NULL DEFAULT 'no_provider',
  status              TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'refund_requested', 'refund_succeeded',
      'refund_pending', 'refund_failed', 'finalized', 'abandoned'
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
-- 2) claim_expiry_eligible_jobs(p_batch_size) — batch claim RPC
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
  v_checkout      RECORD;
  v_lease_until   TIMESTAMPTZ;
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
      -- Exclude jobs that already have an active, unexpired claim
      AND NOT EXISTS (
        SELECT 1 FROM public.job_expiry_refund_operations op
        WHERE op.job_id = j.id
          AND op.status NOT IN ('abandoned', 'refund_failed')
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
    v_attempt := 1;

    -- Look up checkout for payment_intent_id if not on job
    v_checkout := NULL;
    IF v_job.checkout_id IS NOT NULL THEN
      SELECT id, payment_intent_id INTO v_checkout
      FROM public.checkouts
      WHERE id = v_job.checkout_id;
    END IF;

    v_idempotency := 'expiry:' || v_job.job_id::text || ':' || v_attempt::text;

    BEGIN
      INSERT INTO public.job_expiry_refund_operations (
        job_id, checkout_id, payment_intent_id, reason, status,
        idempotency_key, claim_token, lease_expires_at, attempt_count
      ) VALUES (
        v_job.job_id,
        COALESCE(v_job.checkout_id, v_checkout.id),
        COALESCE(v_job.payment_intent_id, v_checkout.payment_intent_id),
        'no_provider', 'pending',
        v_idempotency, v_claim_token, v_lease_until, v_attempt
      )
      RETURNING id INTO v_op_id;
    EXCEPTION WHEN unique_violation THEN
      -- Job already has an operation — check if we can reclaim
      SELECT id, attempt_count, status, lease_expires_at
      INTO v_op_id, v_attempt, v_job.status, v_lease_until
      FROM public.job_expiry_refund_operations
      WHERE job_id = v_job.job_id
      FOR UPDATE;

      -- Only reclaim if failed or lease expired on pending
      IF v_job.status = 'refund_failed'
         OR (v_job.status = 'pending' AND (v_lease_until IS NOT NULL AND v_lease_until <= now()))
      THEN
        v_attempt := v_attempt + 1;
        v_claim_token := gen_random_uuid();
        v_idempotency := 'expiry:' || v_job.job_id::text || ':' || v_attempt::text;

        UPDATE public.job_expiry_refund_operations
        SET status = 'pending',
            claim_token = v_claim_token,
            lease_expires_at = now() + interval '5 minutes',
            attempt_count = v_attempt,
            idempotency_key = v_idempotency,
            last_error = NULL,
            stripe_refund_id = NULL,
            stripe_refund_status = NULL,
            completed_at = NULL
        WHERE id = v_op_id;
      ELSE
        -- Cannot reclaim — skip
        CONTINUE;
      END IF;
    END;

    -- Re-read the operation to get final checkout/PI values
    SELECT checkout_id, payment_intent_id INTO v_checkout
    FROM public.job_expiry_refund_operations WHERE id = v_op_id;

    v_results := v_results || json_build_object(
      'job_id', v_job.job_id,
      'payment_intent_id', v_checkout.payment_intent_id,
      'checkout_id', v_checkout.checkout_id,
      'idempotency_key', v_idempotency,
      'claim_token', v_claim_token,
      'operation_id', v_op_id
    )::json;
  END LOOP;

  RETURN array_to_json(v_results);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_expiry_eligible_jobs(INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_expiry_eligible_jobs(INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_expiry_eligible_jobs(INTEGER) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_expiry_eligible_jobs(INTEGER) TO service_role;


-- ============================================================
-- 3) finalize_expiry_refund — atomic finalization RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.finalize_expiry_refund(
  p_operation_id        UUID,
  p_claim_token         UUID,
  p_stripe_refund_id    TEXT,
  p_stripe_refund_status TEXT
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

  IF v_op.claim_token IS DISTINCT FROM p_claim_token THEN
    RETURN json_build_object('success', false, 'error', 'CLAIM_TOKEN_MISMATCH');
  END IF;

  -- Verify the job is still eligible (pending, no provider)
  SELECT * INTO v_job
  FROM public.jobs
  WHERE id = v_op.job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    UPDATE public.job_expiry_refund_operations
    SET status = 'abandoned', last_error = 'Job not found'
    WHERE id = p_operation_id;
    RETURN json_build_object('success', false, 'error', 'JOB_NOT_FOUND');
  END IF;

  -- ================================================================
  -- Refund SUCCEEDED
  -- ================================================================
  IF p_stripe_refund_status = 'succeeded' THEN

    -- Only finalize if job is still pending with no provider
    IF v_job.status != 'pending' OR v_job.provider_id IS NOT NULL THEN
      UPDATE public.job_expiry_refund_operations
      SET status = 'abandoned',
          last_error = 'Job no longer eligible: status=' || v_job.status
                       || ', provider_id=' || COALESCE(v_job.provider_id::text, 'null'),
          stripe_refund_id = p_stripe_refund_id,
          stripe_refund_status = p_stripe_refund_status
      WHERE id = p_operation_id;
      RETURN json_build_object('success', false, 'error', 'JOB_NO_LONGER_ELIGIBLE',
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
        stripe_refund_id = p_stripe_refund_id,
        stripe_refund_status = p_stripe_refund_status,
        completed_at = now()
    WHERE id = p_operation_id;

    -- Insert job_status_audit record
    INSERT INTO public.job_status_audit
      (job_id, previous_status, new_status, actor_type, reason)
    VALUES
      (v_op.job_id, v_job.status, 'expired', 'system',
       'No provider available. Payment refunded (refund: ' || p_stripe_refund_id || ')');

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
        stripe_refund_id = p_stripe_refund_id,
        stripe_refund_status = p_stripe_refund_status
    WHERE id = p_operation_id;

    RETURN json_build_object('success', true, 'status', 'refund_pending',
      'job_id', v_op.job_id, 'refund_id', p_stripe_refund_id);

  -- ================================================================
  -- Refund FAILED
  -- ================================================================
  ELSE

    UPDATE public.job_expiry_refund_operations
    SET status = 'refund_failed',
        stripe_refund_id = p_stripe_refund_id,
        stripe_refund_status = p_stripe_refund_status,
        last_error = COALESCE(p_stripe_refund_status, 'unknown_error')
    WHERE id = p_operation_id;

    -- Do NOT change job status on failure
    RETURN json_build_object('success', false, 'status', 'refund_failed',
      'job_id', v_op.job_id, 'error', p_stripe_refund_status);

  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finalize_expiry_refund(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finalize_expiry_refund(UUID, UUID, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.finalize_expiry_refund(UUID, UUID, TEXT, TEXT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.finalize_expiry_refund(UUID, UUID, TEXT, TEXT) TO service_role;


-- ============================================================
-- 4) Update accept_job() to reject jobs with active expiry claims
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

  -- Check for active expiry claim (new guard)
  IF EXISTS (
    SELECT 1 FROM job_expiry_refund_operations
    WHERE job_id = p_job_id
      AND status NOT IN ('abandoned', 'refund_failed')
      AND (lease_expires_at IS NULL OR lease_expires_at > now())
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
-- 5) Deprecate expire_stale_jobs()
--    Drop any cron schedule, but keep the function for backward compat.
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

-- Mark deprecated via comment (function is NOT dropped)
COMMENT ON FUNCTION public.expire_stale_jobs(INTEGER) IS
  'DEPRECATED (2026-08-05): Replaced by claim_expiry_eligible_jobs + finalize_expiry_refund '
  'edge function pipeline. This function does NOT issue refunds and should not be called. '
  'Kept for backward compatibility only.';


-- ============================================================
-- 6) Privilege assertions
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

-- Assert: finalize_expiry_refund is NOT executable by authenticated
DO $$
BEGIN
  IF has_function_privilege(
    'authenticated',
    'public.finalize_expiry_refund(uuid, uuid, text, text)',
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
    'public.finalize_expiry_refund(uuid, uuid, text, text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: anon role can execute finalize_expiry_refund';
  END IF;
END;
$$;

COMMIT;
