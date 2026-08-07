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
-- Only SECURITY DEFINER functions access this table

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

  -- Get original amount from checkout or job
  v_original_amount := 0;
  IF v_job.checkout_id IS NOT NULL THEN
    SELECT total_amount INTO v_original_amount FROM checkouts WHERE id = v_job.checkout_id AND status = 'paid';
  END IF;
  IF v_original_amount IS NULL OR v_original_amount = 0 THEN
    v_original_amount := COALESCE(v_job.total_amount, v_job.base_price, 0);
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

  -- Get original paid amount
  v_original_amount := 0;
  IF v_job.checkout_id IS NOT NULL THEN
    SELECT total_amount INTO v_original_amount FROM checkouts WHERE id = v_job.checkout_id AND status = 'paid';
  END IF;
  IF v_original_amount IS NULL OR v_original_amount = 0 THEN
    v_original_amount := COALESCE(v_job.total_amount, v_job.base_price, 0);
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

    -- Provider compensation earning (if applicable)
    IF v_provider_comp > 0 AND v_job.provider_id IS NOT NULL THEN
      INSERT INTO provider_earnings (job_id, provider_id, base_earnings, tip, commission_pct, platform_fee, provider_net, entry_type)
      VALUES (p_job_id, v_job.provider_id, v_fee, 0, v_commission_pct, v_platform_fee, v_provider_comp, 'cancellation_compensation')
      ON CONFLICT (job_id, entry_type) DO NOTHING;
    END IF;

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

  -- One tip per job
  IF EXISTS (SELECT 1 FROM job_tips WHERE job_id = p_job_id) THEN
    RETURN json_build_object('success', false, 'error', 'TIP_ALREADY_EXISTS');
  END IF;

  v_tip_id := gen_random_uuid();
  v_idem_key := 'torc:tip:' || v_tip_id::text;

  -- Create tip record (pending — will be completed by Stripe webhook)
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
-- 8) Cancellation policy settings (defaults)
-- ============================================================
INSERT INTO platform_settings (key, value) VALUES
  ('cancel_fee_accepted_pct', '25'),
  ('cancel_fee_arrived_pct', '50'),
  ('tipping_enabled', 'true'),
  ('tip_presets', '[10, 15, 20]')
ON CONFLICT (key) DO NOTHING;
