-- Financial completion: cancellation refunds, tipping, provider compensation.
--
-- Extends the existing provider_earnings ledger to support multiple entry types:
--   service_earning, tip, cancellation_compensation
-- Adds cancellation refund operation tracking (reusing expiry refund patterns).
-- Adds cancellation policy settings.
-- Adds tip tracking.

-- ============================================================
-- 1) Extend provider_earnings for multiple entry types per job
-- ============================================================
ALTER TABLE public.provider_earnings
  ADD COLUMN IF NOT EXISTS entry_type TEXT NOT NULL DEFAULT 'service_earning';

-- Drop the unique-per-job constraint (now we can have service + tip + compensation)
ALTER TABLE public.provider_earnings
  DROP CONSTRAINT IF EXISTS provider_earnings_unique_job;

-- Replace with unique per job+entry_type
ALTER TABLE public.provider_earnings
  ADD CONSTRAINT provider_earnings_unique_job_type UNIQUE (job_id, entry_type);

-- Update the earnings completion trigger to use new constraint
CREATE OR REPLACE FUNCTION public.create_provider_earning_on_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_commission_pct NUMERIC;
  v_base NUMERIC;
  v_fee NUMERIC;
  v_net NUMERIC;
BEGIN
  IF NEW.status != 'completed' OR OLD.status = 'completed' THEN RETURN NEW; END IF;
  IF NEW.provider_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.payment_status IS DISTINCT FROM 'paid' THEN RETURN NEW; END IF;
  IF NEW.checkout_id IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM provider_earnings WHERE job_id = NEW.id AND entry_type = 'service_earning') THEN RETURN NEW; END IF;

  SELECT c.base_price INTO v_base FROM checkouts c
  WHERE c.id = NEW.checkout_id AND c.job_id = NEW.id AND c.user_id = NEW.customer_id AND c.status = 'paid';
  IF v_base IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE((value)::numeric, 15) INTO v_commission_pct FROM platform_settings WHERE key = 'platform_commission_pct';
  IF v_commission_pct IS NULL THEN v_commission_pct := 15; END IF;

  v_fee := ROUND(v_base * v_commission_pct / 100, 2);
  v_net := v_base - v_fee;

  INSERT INTO provider_earnings (job_id, provider_id, base_earnings, tip, commission_pct, platform_fee, provider_net, entry_type)
  VALUES (NEW.id, NEW.provider_id, v_base, 0, v_commission_pct, v_fee, v_net, 'service_earning')
  ON CONFLICT (job_id, entry_type) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 2) Cancellation refund operations table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.job_cancellation_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id),
  checkout_id UUID,
  payment_intent_id TEXT,
  actor_id UUID NOT NULL,
  actor_type TEXT NOT NULL,  -- 'customer' or 'provider'
  reason TEXT,
  job_status_at_cancel TEXT NOT NULL,
  -- Financial snapshot
  original_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  cancellation_fee_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  cancellation_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  refund_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  provider_compensation NUMERIC(10,2) NOT NULL DEFAULT 0,
  platform_fee_on_cancel NUMERIC(10,2) NOT NULL DEFAULT 0,
  -- Stripe refund tracking
  stripe_refund_id TEXT,
  stripe_refund_status TEXT,  -- pending, succeeded, failed
  idempotency_key TEXT NOT NULL,
  -- State machine
  status TEXT NOT NULL DEFAULT 'pending',
  -- pending → refund_requesting → refund_pending → completed | failed | no_refund_required
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT cancellation_ops_unique_job UNIQUE (job_id)
);

ALTER TABLE public.job_cancellation_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only cancellation ops" ON public.job_cancellation_operations
  FOR ALL USING (false);
-- Admin can read cancellation operations for financial visibility
CREATE POLICY "Admin can read cancellation ops" ON public.job_cancellation_operations
  FOR SELECT USING (is_admin(auth.uid()));

-- ============================================================
-- 3) Tip tracking table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.job_tips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id),
  customer_id UUID NOT NULL,
  provider_id UUID NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  payment_intent_id TEXT,
  stripe_status TEXT DEFAULT 'pending',  -- pending, succeeded, failed
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT job_tips_unique_job UNIQUE (job_id)
);

ALTER TABLE public.job_tips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customer can view own tips" ON public.job_tips
  FOR SELECT USING (customer_id = auth.uid());
CREATE POLICY "Provider can view own tips" ON public.job_tips
  FOR SELECT USING (provider_id = auth.uid());
CREATE POLICY "Admin can view all tips" ON public.job_tips
  FOR SELECT USING (is_admin(auth.uid()));
-- No INSERT/UPDATE for authenticated — only SECURITY DEFINER

-- ============================================================
-- 4) Cancellation quote RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_cancellation_quote(
  p_job_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job RECORD;
  v_checkout RECORD;
  v_fee_pct NUMERIC;
  v_original_amount NUMERIC;
  v_fee NUMERIC;
  v_refund NUMERIC;
  v_provider_comp NUMERIC;
  v_platform_fee NUMERIC;
  v_commission_pct NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  SELECT * INTO v_job FROM jobs WHERE id = p_job_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'JOB_NOT_FOUND');
  END IF;

  -- Must be the customer
  IF v_job.customer_id != auth.uid() THEN
    RETURN json_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  -- Must be cancellable
  IF v_job.status IN ('completed', 'cancelled', 'expired') THEN
    RETURN json_build_object('success', false, 'error', 'NOT_CANCELLABLE',
      'current_status', v_job.status);
  END IF;

  -- In-progress: customer self-cancel disabled
  IF v_job.status IN ('inprogress', 'in_progress') THEN
    RETURN json_build_object('success', false, 'error', 'IN_PROGRESS_NOT_CANCELLABLE',
      'message', 'Cannot self-cancel during active service. Contact support.');
  END IF;

  -- Determine fee percentage by status
  IF v_job.status IN ('pending', 'matching') THEN
    v_fee_pct := 0;
  ELSIF v_job.status IN ('accepted', 'enroute', 'en_route') THEN
    v_fee_pct := COALESCE(
      (SELECT (value)::numeric FROM platform_settings WHERE key = 'cancel_fee_accepted_pct'),
      25
    );
  ELSIF v_job.status = 'arrived' THEN
    v_fee_pct := COALESCE(
      (SELECT (value)::numeric FROM platform_settings WHERE key = 'cancel_fee_arrived_pct'),
      50
    );
  ELSE
    v_fee_pct := 0;
  END IF;

  -- Get original amount from authoritative checkout only — fail closed for paid jobs
  v_original_amount := 0;
  IF v_job.payment_status = 'paid' THEN
    IF v_job.checkout_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'CHECKOUT_LINKAGE_MISSING',
        'message', 'Paid job is missing checkout linkage. Contact support.');
    END IF;
    SELECT c.total_amount INTO v_original_amount FROM checkouts c
    WHERE c.id = v_job.checkout_id AND c.job_id = v_job.id
      AND c.user_id = v_job.customer_id AND c.status = 'paid';
    IF v_original_amount IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'CHECKOUT_VERIFICATION_FAILED',
        'message', 'Could not verify payment for this job. Contact support.');
    END IF;
  END IF;

  v_fee := ROUND(v_original_amount * v_fee_pct / 100, 2);
  v_refund := v_original_amount - v_fee;

  -- Provider compensation from fee (minus platform commission)
  v_commission_pct := COALESCE(
    (SELECT (value)::numeric FROM platform_settings WHERE key = 'platform_commission_pct'),
    15
  );
  v_platform_fee := ROUND(v_fee * v_commission_pct / 100, 2);
  v_provider_comp := v_fee - v_platform_fee;

  RETURN json_build_object(
    'success', true,
    'job_id', p_job_id,
    'job_status', v_job.status,
    'original_amount', v_original_amount,
    'cancellation_fee_pct', v_fee_pct,
    'cancellation_fee', v_fee,
    'refund_amount', v_refund,
    'provider_compensation', v_provider_comp,
    'platform_fee', v_platform_fee,
    'has_provider', v_job.provider_id IS NOT NULL,
    'is_paid', v_job.payment_status = 'paid'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_cancellation_quote(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_cancellation_quote(UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_cancellation_quote(UUID) TO authenticated;

-- ============================================================
-- 5) Server-authoritative cancel with refund RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.cancel_job_with_refund(
  p_job_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job RECORD;
  v_checkout RECORD;
  v_fee_pct NUMERIC;
  v_original_amount NUMERIC;
  v_fee NUMERIC;
  v_refund NUMERIC;
  v_provider_comp NUMERIC;
  v_platform_fee NUMERIC;
  v_commission_pct NUMERIC;
  v_op_id UUID;
  v_idem_key TEXT;
  v_actor_type TEXT;
  v_provider_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  SELECT * INTO v_job FROM jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'JOB_NOT_FOUND');
  END IF;

  -- Determine actor
  IF auth.uid() = v_job.customer_id THEN
    v_actor_type := 'customer';
  ELSIF auth.uid() = v_job.provider_id THEN
    v_actor_type := 'provider';
  ELSE
    RETURN json_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  -- Must be cancellable
  IF v_job.status IN ('completed', 'cancelled', 'expired') THEN
    RETURN json_build_object('success', false, 'error', 'NOT_CANCELLABLE');
  END IF;

  -- In-progress: customer self-cancel disabled
  IF v_actor_type = 'customer' AND v_job.status IN ('inprogress', 'in_progress') THEN
    RETURN json_build_object('success', false, 'error', 'IN_PROGRESS_NOT_CANCELLABLE');
  END IF;

  -- Idempotent: already has a cancellation operation
  IF EXISTS (SELECT 1 FROM job_cancellation_operations WHERE job_id = p_job_id) THEN
    RETURN json_build_object('success', false, 'error', 'CANCELLATION_IN_PROGRESS');
  END IF;

  -- Calculate fee based on actor and status
  IF v_actor_type = 'provider' THEN
    v_fee_pct := 0;  -- Provider cancel = full refund to customer
  ELSIF v_job.status IN ('pending', 'matching') THEN
    v_fee_pct := 0;
  ELSIF v_job.status IN ('accepted', 'enroute', 'en_route') THEN
    v_fee_pct := COALESCE((SELECT (value)::numeric FROM platform_settings WHERE key = 'cancel_fee_accepted_pct'), 25);
  ELSIF v_job.status = 'arrived' THEN
    v_fee_pct := COALESCE((SELECT (value)::numeric FROM platform_settings WHERE key = 'cancel_fee_arrived_pct'), 50);
  ELSE
    v_fee_pct := 0;
  END IF;

  -- Get original paid amount from authoritative checkout only — fail closed for paid jobs
  v_original_amount := 0;
  IF v_job.payment_status = 'paid' THEN
    IF v_job.checkout_id IS NULL THEN
      -- Fail closed: paid job with no checkout linkage -> manual_review
      v_op_id := gen_random_uuid();
      v_idem_key := 'torc:cancellation:' || v_op_id::text;
      UPDATE jobs SET status = 'cancelled', cancellation_reason = p_reason,
        cancelled_at = NOW(), cancelled_by = auth.uid(), updated_at = NOW()
      WHERE id = p_job_id;
      INSERT INTO job_cancellation_operations (id, job_id, actor_id, actor_type, reason, job_status_at_cancel,
        original_amount, idempotency_key, status, last_error)
      VALUES (v_op_id, p_job_id, auth.uid(), v_actor_type, p_reason, v_job.status,
        0, v_idem_key, 'manual_review', 'Paid job with NULL checkout_id');
      RETURN json_build_object('success', true, 'job_id', p_job_id, 'status', 'cancelled',
        'refund_status', 'manual_review', 'message', 'Checkout linkage missing. Support will process refund.');
    END IF;
    SELECT c.total_amount INTO v_original_amount
    FROM checkouts c
    WHERE c.id = v_job.checkout_id
      AND c.job_id = v_job.id
      AND c.user_id = v_job.customer_id
      AND c.status = 'paid';
    IF v_original_amount IS NULL THEN
      -- Paid job but checkout mismatch — fail closed to manual_review
      v_op_id := gen_random_uuid();
      v_idem_key := 'torc:cancellation:' || v_op_id::text;
      UPDATE jobs SET status = 'cancelled', cancellation_reason = p_reason,
        cancelled_at = NOW(), cancelled_by = auth.uid(), updated_at = NOW()
      WHERE id = p_job_id;
      INSERT INTO job_cancellation_operations (id, job_id, actor_id, actor_type, reason, job_status_at_cancel,
        original_amount, idempotency_key, status, last_error)
      VALUES (v_op_id, p_job_id, auth.uid(), v_actor_type, p_reason, v_job.status,
        0, v_idem_key, 'manual_review', 'Paid job but authoritative checkout linkage failed');
      RETURN json_build_object('success', true, 'job_id', p_job_id, 'status', 'cancelled',
        'refund_status', 'manual_review', 'message', 'Checkout verification failed. Support will process refund.');
    END IF;
  END IF;

  v_fee := ROUND(v_original_amount * v_fee_pct / 100, 2);
  v_refund := v_original_amount - v_fee;
  v_commission_pct := COALESCE((SELECT (value)::numeric FROM platform_settings WHERE key = 'platform_commission_pct'), 15);
  v_platform_fee := ROUND(v_fee * v_commission_pct / 100, 2);
  v_provider_comp := v_fee - v_platform_fee;

  -- Generate operation
  v_op_id := gen_random_uuid();
  v_idem_key := 'torc:cancellation:' || v_op_id::text;

  -- Cancel the job
  UPDATE jobs
  SET status = 'cancelled', cancellation_reason = p_reason,
      cancelled_at = NOW(), cancelled_by = auth.uid(),
      cancellation_fee = v_fee, cancellation_fee_pct = v_fee_pct,
      updated_at = NOW()
  WHERE id = p_job_id;

  -- Log event
  INSERT INTO job_events (job_id, event_type, actor_id, actor_type, metadata)
  VALUES (p_job_id, 'job_cancelled', auth.uid(), v_actor_type,
    jsonb_build_object('reason', p_reason, 'previous_status', v_job.status,
      'cancellation_fee', v_fee, 'refund_amount', v_refund));

  PERFORM pg_notify('job_cancelled', jsonb_build_object(
    'job_id', p_job_id, 'cancelled_by', auth.uid(), 'actor_type', v_actor_type,
    'customer_id', v_job.customer_id, 'provider_id', v_job.provider_id
  )::text);

  -- Create cancellation operation for refund tracking
  IF v_job.payment_status = 'paid' AND v_refund > 0 THEN
    INSERT INTO job_cancellation_operations (
      id, job_id, checkout_id, payment_intent_id,
      actor_id, actor_type, reason, job_status_at_cancel,
      original_amount, cancellation_fee_pct, cancellation_fee,
      refund_amount, provider_compensation, platform_fee_on_cancel,
      stripe_refund_status, idempotency_key, status
    ) VALUES (
      v_op_id, p_job_id, v_job.checkout_id, v_job.payment_intent_id,
      auth.uid(), v_actor_type, p_reason, v_job.status,
      v_original_amount, v_fee_pct, v_fee,
      v_refund, v_provider_comp, v_platform_fee,
      NULL, v_idem_key, 'pending'
    );

    -- Provider compensation created ONLY after refund succeeds (by process-cancellation-refunds)

    RETURN json_build_object('success', true, 'job_id', p_job_id, 'status', 'cancelled',
      'refund_status', 'pending', 'refund_amount', v_refund,
      'cancellation_fee', v_fee, 'operation_id', v_op_id);
  ELSIF v_job.payment_status != 'paid' THEN
    -- Unpaid job — just cancel, no refund needed
    INSERT INTO job_cancellation_operations (
      id, job_id, actor_id, actor_type, reason, job_status_at_cancel,
      original_amount, cancellation_fee_pct, cancellation_fee,
      refund_amount, provider_compensation, platform_fee_on_cancel,
      idempotency_key, status, completed_at
    ) VALUES (
      v_op_id, p_job_id, auth.uid(), v_actor_type, p_reason, v_job.status,
      0, 0, 0, 0, 0, 0,
      v_idem_key, 'no_refund_required', now()
    );
    RETURN json_build_object('success', true, 'job_id', p_job_id, 'status', 'cancelled',
      'refund_status', 'no_refund_required');
  ELSE
    -- Paid but full fee (no refund)
    INSERT INTO job_cancellation_operations (
      id, job_id, checkout_id, payment_intent_id,
      actor_id, actor_type, reason, job_status_at_cancel,
      original_amount, cancellation_fee_pct, cancellation_fee,
      refund_amount, provider_compensation, platform_fee_on_cancel,
      idempotency_key, status, completed_at
    ) VALUES (
      v_op_id, p_job_id, v_job.checkout_id, v_job.payment_intent_id,
      auth.uid(), v_actor_type, p_reason, v_job.status,
      v_original_amount, v_fee_pct, v_fee,
      0, v_provider_comp, v_platform_fee,
      v_idem_key, 'no_refund_required', now()
    );

    IF v_provider_comp > 0 AND v_job.provider_id IS NOT NULL THEN
      INSERT INTO provider_earnings (job_id, provider_id, base_earnings, tip, commission_pct, platform_fee, provider_net, entry_type)
      VALUES (p_job_id, v_job.provider_id, v_fee, 0, v_commission_pct, v_platform_fee, v_provider_comp, 'cancellation_compensation')
      ON CONFLICT (job_id, entry_type) DO NOTHING;
    END IF;

    RETURN json_build_object('success', true, 'job_id', p_job_id, 'status', 'cancelled',
      'refund_status', 'no_refund_required', 'cancellation_fee', v_fee);
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_job_with_refund(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_job_with_refund(UUID, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.cancel_job_with_refund(UUID, TEXT) TO authenticated;

-- ============================================================
-- 6) Tip request RPC (creates PaymentIntent for tip)
-- ============================================================
CREATE OR REPLACE FUNCTION public.request_tip_payment(
  p_job_id UUID,
  p_amount NUMERIC
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job RECORD;
  v_existing_tip RECORD;
  v_idem_key TEXT;
  v_tip_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  SELECT * INTO v_job FROM jobs WHERE id = p_job_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'JOB_NOT_FOUND');
  END IF;

  -- Must be the customer
  IF v_job.customer_id != auth.uid() THEN
    RETURN json_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  -- Job must be completed and paid
  IF v_job.status != 'completed' THEN
    RETURN json_build_object('success', false, 'error', 'JOB_NOT_COMPLETED');
  END IF;
  IF v_job.payment_status != 'paid' THEN
    RETURN json_build_object('success', false, 'error', 'JOB_NOT_PAID');
  END IF;
  IF v_job.provider_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'NO_PROVIDER');
  END IF;

  -- Validate amount
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 500 THEN
    RETURN json_build_object('success', false, 'error', 'INVALID_AMOUNT');
  END IF;

  -- Idempotent continuation: if tip exists, return for retry or reject if completed
  SELECT * INTO v_existing_tip FROM job_tips WHERE job_id = p_job_id;
  IF FOUND THEN
    IF v_existing_tip.stripe_status = 'succeeded' THEN
      RETURN json_build_object('success', false, 'error', 'TIP_ALREADY_COMPLETED');
    END IF;
    IF v_existing_tip.customer_id != auth.uid() THEN
      RETURN json_build_object('success', false, 'error', 'UNAUTHORIZED');
    END IF;
    -- Pending/failed tip: allow amount update if no PI yet
    IF v_existing_tip.payment_intent_id IS NULL AND v_existing_tip.amount != p_amount THEN
      UPDATE job_tips SET amount = p_amount WHERE id = v_existing_tip.id;
    END IF;
    RETURN json_build_object('success', true,
      'tip_id', v_existing_tip.id,
      'amount', CASE WHEN v_existing_tip.payment_intent_id IS NULL THEN p_amount ELSE v_existing_tip.amount END,
      'idempotency_key', v_existing_tip.idempotency_key,
      'provider_id', v_existing_tip.provider_id,
      'job_id', p_job_id,
      'existing', true);
  END IF;

  v_tip_id := gen_random_uuid();
  v_idem_key := 'torc:tip:' || v_tip_id::text;

  INSERT INTO job_tips (id, job_id, customer_id, provider_id, amount, idempotency_key, stripe_status)
  VALUES (v_tip_id, p_job_id, auth.uid(), v_job.provider_id, p_amount, v_idem_key, 'pending');

  RETURN json_build_object('success', true,
    'tip_id', v_tip_id,
    'amount', p_amount,
    'idempotency_key', v_idem_key,
    'provider_id', v_job.provider_id,
    'job_id', p_job_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_tip_payment(UUID, NUMERIC) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.request_tip_payment(UUID, NUMERIC) FROM anon;
GRANT  EXECUTE ON FUNCTION public.request_tip_payment(UUID, NUMERIC) TO authenticated;

-- ============================================================
-- 7) Finalize tip from Stripe confirmation
-- ============================================================
CREATE OR REPLACE FUNCTION public.finalize_tip_payment(
  p_tip_id UUID,
  p_payment_intent_id TEXT,
  p_stripe_status TEXT  -- 'succeeded' or 'failed'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tip RECORD;
BEGIN
  SELECT * INTO v_tip FROM job_tips WHERE id = p_tip_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'TIP_NOT_FOUND');
  END IF;

  -- Idempotent
  IF v_tip.stripe_status = 'succeeded' THEN
    RETURN json_build_object('success', true, 'already_completed', true);
  END IF;

  -- Verify PaymentIntent matches if already stored
  IF v_tip.payment_intent_id IS NOT NULL AND v_tip.payment_intent_id != p_payment_intent_id THEN
    RETURN json_build_object('success', false, 'error', 'PAYMENT_INTENT_MISMATCH');
  END IF;

  UPDATE job_tips
  SET payment_intent_id = p_payment_intent_id,
      stripe_status = p_stripe_status,
      completed_at = CASE WHEN p_stripe_status = 'succeeded' THEN now() ELSE NULL END
  WHERE id = p_tip_id;

  -- If succeeded, create provider earning for the tip
  IF p_stripe_status = 'succeeded' THEN
    INSERT INTO provider_earnings (job_id, provider_id, base_earnings, tip, commission_pct, platform_fee, provider_net, entry_type)
    VALUES (v_tip.job_id, v_tip.provider_id, 0, v_tip.amount, 0, 0, v_tip.amount, 'tip')
    ON CONFLICT (job_id, entry_type) DO NOTHING;

    -- Update jobs.tip for display purposes
    UPDATE jobs SET tip = v_tip.amount WHERE id = v_tip.job_id;
  END IF;

  RETURN json_build_object('success', true, 'status', p_stripe_status);
END;
$$;

-- Service role only (called from webhook/Edge Function)
REVOKE EXECUTE ON FUNCTION public.finalize_tip_payment(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finalize_tip_payment(UUID, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.finalize_tip_payment(UUID, TEXT, TEXT) FROM authenticated;

-- ============================================================
-- 7b) Atomic idempotency key rotation for dead tip PI retry
-- ============================================================
CREATE OR REPLACE FUNCTION public.rotate_tip_idempotency_key(
  p_tip_id UUID,
  p_old_payment_intent_id TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tip RECORD;
  v_new_key TEXT;
BEGIN
  -- SELECT FOR UPDATE to serialize concurrent callers
  SELECT * INTO v_tip FROM job_tips WHERE id = p_tip_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'TIP_NOT_FOUND');
  END IF;
  -- Only rotate if the PI still matches the expected dead one
  IF v_tip.payment_intent_id IS DISTINCT FROM p_old_payment_intent_id THEN
    RETURN json_build_object('success', false, 'error', 'ALREADY_ROTATED');
  END IF;
  IF v_tip.stripe_status = 'succeeded' THEN
    RETURN json_build_object('success', false, 'error', 'TIP_ALREADY_COMPLETED');
  END IF;
  v_new_key := 'torc:tip:retry:' || gen_random_uuid()::text;
  UPDATE job_tips SET payment_intent_id = NULL, stripe_status = 'pending', idempotency_key = v_new_key
  WHERE id = p_tip_id;
  RETURN json_build_object('success', true, 'new_idempotency_key', v_new_key);
END;
$$;

-- Service role only (called from Edge Function)
REVOKE EXECUTE ON FUNCTION public.rotate_tip_idempotency_key(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rotate_tip_idempotency_key(UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rotate_tip_idempotency_key(UUID, TEXT) FROM authenticated;

-- ============================================================
-- 8) Cancellation policy settings (defaults)
-- ============================================================
INSERT INTO platform_settings (key, value) VALUES
  ('cancel_fee_accepted_pct', '25'),
  ('cancel_fee_arrived_pct', '50'),
  ('tipping_enabled', 'true'),
  ('tip_presets', '[10, 15, 20]')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 9) Schedule cancellation refund processing (reuse existing cron pattern)
-- ============================================================
-- Uses the same Vault secret and pg_net pattern as expire-pending-jobs
DO $$
BEGIN
  -- Only create if cron extension is available
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'process-cancellation-refunds',
      '*/5 * * * *',
      $cron$
      SELECT net.http_post(
        current_setting('app.settings.supabase_url', true) || '/functions/v1/process-cancellation-refunds',
        '{}'::jsonb,
        '{}'::jsonb,
        jsonb_build_object(
          'Content-Type', 'application/json',
          'x-torc-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'expire_pending_jobs_cron_secret')
        ),
        25000
      );
      $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Cron may not be available in all environments
  RAISE NOTICE 'Cron scheduling skipped: %', SQLERRM;
END $$;

-- ============================================================
-- 10) Extend job guard to protect financial fields
-- ============================================================
-- Redefine the guard to also protect cancellation_fee, cancellation_fee_pct
CREATE OR REPLACE FUNCTION public.guard_job_lifecycle_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION 'New jobs must have status pending.' USING ERRCODE = '42501';
    END IF;
    IF NEW.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'Cannot set accepted_at on creation.' USING ERRCODE = '42501'; END IF;
    IF NEW.started_at IS NOT NULL THEN RAISE EXCEPTION 'Cannot set started_at on creation.' USING ERRCODE = '42501'; END IF;
    IF NEW.completed_at IS NOT NULL THEN RAISE EXCEPTION 'Cannot set completed_at on creation.' USING ERRCODE = '42501'; END IF;
    IF NEW.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'Cannot set cancelled_at on creation.' USING ERRCODE = '42501'; END IF;
    IF NEW.customer_completed_at IS NOT NULL THEN RAISE EXCEPTION 'Cannot set customer_completed_at on creation.' USING ERRCODE = '42501'; END IF;
    IF NEW.tip IS NOT NULL AND NEW.tip != 0 THEN RAISE EXCEPTION 'Cannot set tip on creation.' USING ERRCODE = '42501'; END IF;
    IF NEW.cancellation_fee IS NOT NULL AND NEW.cancellation_fee != 0 THEN RAISE EXCEPTION 'Cannot set cancellation_fee on creation.' USING ERRCODE = '42501'; END IF;
    IF NEW.cancellation_fee_pct IS NOT NULL AND NEW.cancellation_fee_pct != 0 THEN RAISE EXCEPTION 'Cannot set cancellation_fee_pct on creation.' USING ERRCODE = '42501'; END IF;
    RETURN NEW;
  END IF;

  -- UPDATE guard
  IF NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'Direct status mutation not allowed.' USING ERRCODE = '42501'; END IF;
  IF NEW.accepted_at IS DISTINCT FROM OLD.accepted_at THEN RAISE EXCEPTION 'Direct accepted_at mutation not allowed.' USING ERRCODE = '42501'; END IF;
  IF NEW.started_at IS DISTINCT FROM OLD.started_at THEN RAISE EXCEPTION 'Direct started_at mutation not allowed.' USING ERRCODE = '42501'; END IF;
  IF NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN RAISE EXCEPTION 'Direct completed_at mutation not allowed.' USING ERRCODE = '42501'; END IF;
  IF NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at THEN RAISE EXCEPTION 'Direct cancelled_at mutation not allowed.' USING ERRCODE = '42501'; END IF;
  IF NEW.customer_completed_at IS DISTINCT FROM OLD.customer_completed_at THEN RAISE EXCEPTION 'Direct customer_completed_at mutation not allowed.' USING ERRCODE = '42501'; END IF;
  IF NEW.tip IS DISTINCT FROM OLD.tip THEN RAISE EXCEPTION 'Direct tip mutation not allowed.' USING ERRCODE = '42501'; END IF;
  IF NEW.cancellation_fee IS DISTINCT FROM OLD.cancellation_fee THEN RAISE EXCEPTION 'Direct cancellation_fee mutation not allowed.' USING ERRCODE = '42501'; END IF;
  IF NEW.cancellation_fee_pct IS DISTINCT FROM OLD.cancellation_fee_pct THEN RAISE EXCEPTION 'Direct cancellation_fee_pct mutation not allowed.' USING ERRCODE = '42501'; END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 11) PROV-002: Only verified providers in matching and acceptance
-- ============================================================

-- Update get_nearby_providers to require is_verified
CREATE OR REPLACE FUNCTION public.get_nearby_providers(
  p_pickup_lat DOUBLE PRECISION, p_pickup_lng DOUBLE PRECISION,
  p_radius_miles DOUBLE PRECISION, p_service_id TEXT DEFAULT NULL
)
RETURNS TABLE(provider_id UUID, latitude DOUBLE PRECISION, longitude DOUBLE PRECISION, distance_miles DOUBLE PRECISION)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_max_radius DOUBLE PRECISION; v_effective_radius DOUBLE PRECISION;
BEGIN
  SELECT COALESCE((value)::numeric, 50) INTO v_max_radius
  FROM platform_settings WHERE key = 'max_job_radius';
  IF v_max_radius IS NULL THEN v_max_radius := 50; END IF;
  v_effective_radius := LEAST(p_radius_miles, v_max_radius);

  RETURN QUERY
  SELECT pl.provider_id, pl.latitude, pl.longitude,
    (3958.8 * 2 * ASIN(SQRT(
      POWER(SIN(RADIANS(p_pickup_lat - pl.latitude) / 2), 2) +
      COS(RADIANS(pl.latitude)) * COS(RADIANS(p_pickup_lat)) *
      POWER(SIN(RADIANS(p_pickup_lng - pl.longitude) / 2), 2)
    ))) AS distance_miles
  FROM provider_locations pl
  INNER JOIN provider_profiles pp ON pp.id = pl.provider_id
  WHERE pl.is_online = true AND pp.is_online = true
    AND pp.is_verified = true  -- PROV-002: only verified providers
    AND pl.updated_at > NOW() - INTERVAL '5 minutes'
    AND (p_service_id IS NULL OR p_service_id = ANY(pp.services))
    AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.provider_id = pl.provider_id
        AND j.status IN ('accepted','en_route','enroute','arrived','in_progress','inprogress'))
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = pl.provider_id AND p.status = 'active')
    AND (3958.8 * 2 * ASIN(SQRT(
      POWER(SIN(RADIANS(p_pickup_lat - pl.latitude) / 2), 2) +
      COS(RADIANS(pl.latitude)) * COS(RADIANS(p_pickup_lat)) *
      POWER(SIN(RADIANS(p_pickup_lng - pl.longitude) / 2), 2)
    ))) <= v_effective_radius
  ORDER BY distance_miles ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_nearby_providers(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_nearby_providers(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_nearby_providers(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) TO authenticated;

-- Update accept_job to require is_verified
CREATE OR REPLACE FUNCTION public.accept_job(p_job_id UUID, p_provider_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_job RECORD; v_active_job RECORD; v_provider_name TEXT;
  v_lock_key BIGINT; v_provider_status TEXT; v_is_verified BOOLEAN;
BEGIN
  IF p_provider_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  -- Require active status — fail closed on any non-active state
  SELECT status INTO v_provider_status FROM profiles WHERE id = p_provider_id;
  IF v_provider_status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('success', false, 'error',
      CASE
        WHEN v_provider_status = 'suspended' THEN 'PROVIDER_SUSPENDED'
        WHEN v_provider_status = 'pending_deletion' THEN 'ACCOUNT_PENDING_DELETION'
        WHEN v_provider_status IS NULL THEN 'PROVIDER_NOT_FOUND'
        ELSE 'PROVIDER_INACTIVE'
      END,
      'message', 'Provider account is not in active status');
  END IF;

  -- PROV-002: Check verification
  SELECT is_verified INTO v_is_verified FROM provider_profiles WHERE id = p_provider_id;
  IF v_is_verified IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'PROVIDER_NOT_VERIFIED',
      'message', 'Your provider account must be verified to accept jobs');
  END IF;

  -- Provider serialization
  v_lock_key := ('x' || left(replace(p_provider_id::text, '-', ''), 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT id, status INTO v_active_job FROM jobs
  WHERE provider_id = p_provider_id
    AND status IN ('accepted','en_route','enroute','arrived','in_progress','inprogress')
    AND id != p_job_id LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'PROVIDER_BUSY',
      'active_job_id', v_active_job.id, 'active_job_status', v_active_job.status);
  END IF;

  SELECT * INTO v_job FROM jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'JOB_NOT_FOUND');
  END IF;

  IF v_job.status = 'accepted' AND v_job.provider_id = p_provider_id THEN
    RETURN jsonb_build_object('success', true, 'job_id', p_job_id, 'provider_id', p_provider_id,
      'status', 'accepted', 'already_accepted', true, 'accepted_at', v_job.accepted_at);
  END IF;

  IF v_job.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'JOB_ALREADY_ACCEPTED',
      'current_status', v_job.status);
  END IF;

  IF EXISTS (SELECT 1 FROM job_expiry_refund_operations WHERE job_id = p_job_id AND status != 'abandoned_before_refund') THEN
    RETURN jsonb_build_object('success', false, 'error', 'JOB_EXPIRY_IN_PROGRESS');
  END IF;

  UPDATE jobs SET provider_id = p_provider_id, status = 'accepted',
    accepted_at = NOW(), updated_at = NOW() WHERE id = p_job_id;

  INSERT INTO job_events (job_id, event_type, actor_id, actor_type, metadata)
  VALUES (p_job_id, 'job_accepted', p_provider_id, 'provider',
    jsonb_build_object('previous_status', v_job.status));

  PERFORM pg_notify('job_accepted', jsonb_build_object(
    'job_id', p_job_id, 'provider_id', p_provider_id, 'customer_id', v_job.customer_id)::text);

  SELECT COALESCE(NULLIF(TRIM(first_name), '') || COALESCE(' ' || LEFT(last_name, 1) || '.', ''), 'A provider')
  INTO v_provider_name FROM profiles WHERE id = p_provider_id;

  INSERT INTO notifications (user_id, type, title, message, action_url)
  VALUES (v_job.customer_id, 'service', 'Provider Accepted',
    v_provider_name || ' has accepted your service request.', '/tracking/' || p_job_id::text);

  IF v_job.scheduled_for IS NOT NULL AND v_job.scheduled_for > NOW() + INTERVAL '10 minutes' THEN
    INSERT INTO notifications (user_id, type, title, message, action_url)
    VALUES (p_provider_id, 'service', 'Scheduled Job Accepted',
      'You accepted a scheduled job for ' || TO_CHAR(v_job.scheduled_for AT TIME ZONE 'America/New_York', 'Mon DD at HH12:MI AM'),
      '/job/' || p_job_id::text);
  END IF;

  RETURN jsonb_build_object('success', true, 'job_id', p_job_id,
    'provider_id', p_provider_id, 'status', 'accepted', 'accepted_at', NOW());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_job(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accept_job(UUID, UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public.accept_job(UUID, UUID) TO authenticated;

-- Block pending_deletion users from creating jobs
-- (extend the INSERT guard for status check)

-- Block pending_deletion users from creating jobs
CREATE OR REPLACE FUNCTION public.check_user_not_pending_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE v_status TEXT;
BEGIN
  IF current_user IN ('postgres', 'supabase_admin') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT status INTO v_status FROM profiles WHERE id = NEW.customer_id;
    IF v_status = 'pending_deletion' THEN
      RAISE EXCEPTION 'Account is pending deletion. Cannot create new requests.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_deletion_on_job_create ON public.jobs;
CREATE TRIGGER trg_check_deletion_on_job_create
  BEFORE INSERT ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.check_user_not_pending_deletion();
