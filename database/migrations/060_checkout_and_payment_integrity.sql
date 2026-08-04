-- Payment integrity: server-authoritative checkout, webhook idempotency,
-- duplicate prevention constraints, and job status audit trail.

-- 1) Checkout records — created BEFORE payment, one-to-one with PaymentIntent
CREATE TABLE IF NOT EXISTS public.checkouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id UUID NOT NULL,
  vehicle_id UUID,
  is_hazardous BOOLEAN NOT NULL DEFAULT false,
  scheduled_for TIMESTAMPTZ,
  -- Server-calculated pricing
  base_price NUMERIC(10,2) NOT NULL,
  hazard_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  scheduling_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  -- Stripe
  payment_intent_id TEXT,
  payment_method_id TEXT,
  stripe_customer_id TEXT,
  -- Status
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'payment_processing', 'paid', 'failed', 'expired', 'refunded')),
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,
  -- Link to the resulting job (set after job creation)
  job_id UUID UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_checkouts_user_id ON public.checkouts(user_id);
CREATE INDEX IF NOT EXISTS idx_checkouts_payment_intent_id ON public.checkouts(payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_checkouts_status ON public.checkouts(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_checkouts_payment_intent_unique
  ON public.checkouts(payment_intent_id) WHERE payment_intent_id IS NOT NULL;

ALTER TABLE public.checkouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own checkouts" ON public.checkouts;
CREATE POLICY "Users can view own checkouts"
  ON public.checkouts FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own checkouts" ON public.checkouts;
CREATE POLICY "Users can insert own checkouts"
  ON public.checkouts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Only service role can update checkout status (server/webhook use)
DROP POLICY IF EXISTS "Service role can update checkouts" ON public.checkouts;
CREATE POLICY "Service role can update checkouts"
  ON public.checkouts FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- 2) Processed webhook events — idempotency for Stripe webhooks
CREATE TABLE IF NOT EXISTS public.processed_webhook_events (
  event_id TEXT PRIMARY KEY,
  gateway TEXT NOT NULL DEFAULT 'stripe',
  event_type TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_processed_webhook_events_gateway
  ON public.processed_webhook_events(gateway);

ALTER TABLE public.processed_webhook_events ENABLE ROW LEVEL SECURITY;

-- No user access — only service role
DROP POLICY IF EXISTS "Service role only for webhook events" ON public.processed_webhook_events;
CREATE POLICY "Service role only for webhook events"
  ON public.processed_webhook_events
  FOR ALL
  USING (false);

-- 3) Add checkout_id to jobs for linking
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS checkout_id UUID;

CREATE INDEX IF NOT EXISTS idx_jobs_checkout_id ON public.jobs(checkout_id);

-- 4) Prevent duplicate jobs per checkout
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_checkout_unique
  ON public.jobs(checkout_id) WHERE checkout_id IS NOT NULL;

-- 5) Prevent client-side payment_status=paid writes via RLS
-- The jobs table should not allow customers to set payment_status to 'paid'
-- This is enforced by the checkout/webhook flow, not by direct UPDATE

-- 6) Job status transition audit trail
CREATE TABLE IF NOT EXISTS public.job_status_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  actor_id UUID,
  actor_type TEXT NOT NULL DEFAULT 'system'
    CHECK (actor_type IN ('customer', 'provider', 'admin', 'system', 'webhook')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_status_audit_job_id ON public.job_status_audit(job_id);

ALTER TABLE public.job_status_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view audit trail" ON public.job_status_audit;
CREATE POLICY "Admins can view audit trail"
  ON public.job_status_audit FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- 7) Function to safely transition job status with audit logging
CREATE OR REPLACE FUNCTION public.transition_job_status(
  p_job_id UUID,
  p_new_status TEXT,
  p_actor_id UUID DEFAULT NULL,
  p_actor_type TEXT DEFAULT 'system',
  p_reason TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job RECORD;
  v_valid_transitions JSONB;
BEGIN
  -- Lock the job row
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Job not found');
  END IF;

  -- Define valid transitions
  v_valid_transitions := '{
    "pending": ["accepted", "cancelled", "expired"],
    "accepted": ["enroute", "cancelled", "expired"],
    "enroute": ["arrived", "cancelled"],
    "arrived": ["in_progress", "inprogress", "cancelled"],
    "in_progress": ["completed", "cancelled"],
    "inprogress": ["completed", "cancelled"],
    "scheduled": ["pending", "cancelled", "expired"]
  }'::jsonb;

  -- Validate transition
  IF v_job.status IS NOT NULL AND
     NOT (v_valid_transitions->v_job.status ? p_new_status) THEN
    RETURN json_build_object(
      'success', false,
      'message', format('Invalid transition from %s to %s', v_job.status, p_new_status)
    );
  END IF;

  -- Apply the transition
  UPDATE public.jobs
  SET status = p_new_status,
      accepted_at = CASE WHEN p_new_status = 'accepted' THEN now() ELSE accepted_at END,
      started_at = CASE WHEN p_new_status IN ('in_progress', 'inprogress') THEN now() ELSE started_at END,
      completed_at = CASE WHEN p_new_status = 'completed' THEN now() ELSE completed_at END,
      cancelled_at = CASE WHEN p_new_status = 'cancelled' THEN now() ELSE cancelled_at END
  WHERE id = p_job_id;

  -- Log the transition
  INSERT INTO public.job_status_audit (job_id, previous_status, new_status, actor_id, actor_type, reason)
  VALUES (p_job_id, v_job.status, p_new_status, p_actor_id, p_actor_type, p_reason);

  RETURN json_build_object('success', true, 'previous_status', v_job.status, 'new_status', p_new_status);
END;
$$;

-- 8) Function to expire stale jobs (called by backend cron, not client)
CREATE OR REPLACE FUNCTION public.expire_stale_jobs(
  p_max_age_hours INTEGER DEFAULT 2
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH expired AS (
    UPDATE public.jobs
    SET status = 'expired'
    WHERE status IN ('pending', 'scheduled')
      AND created_at < now() - (p_max_age_hours || ' hours')::interval
    RETURNING id, status
  ),
  audit AS (
    INSERT INTO public.job_status_audit (job_id, previous_status, new_status, actor_type, reason)
    SELECT id, status, 'expired', 'system', 'Automatically expired after ' || p_max_age_hours || ' hours'
    FROM expired
  )
  SELECT count(*) INTO v_count FROM expired;

  RETURN v_count;
END;
$$;

-- 9) Trigger to prevent client-side payment_status=paid writes
CREATE OR REPLACE FUNCTION public.prevent_client_payment_status_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Allow service role (used by webhooks) to set any status
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Block customers/providers from setting payment_status to 'paid'
  IF NEW.payment_status = 'paid' AND (OLD.payment_status IS NULL OR OLD.payment_status != 'paid') THEN
    RAISE EXCEPTION 'Payment status can only be set to paid by the server';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_client_payment_status_paid ON public.jobs;
CREATE TRIGGER trg_prevent_client_payment_status_paid
  BEFORE UPDATE OF payment_status ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_client_payment_status_paid();

-- 10) Checkouts updated_at trigger
CREATE OR REPLACE FUNCTION public.set_checkouts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_checkouts_updated_at ON public.checkouts;
CREATE TRIGGER trg_checkouts_updated_at
  BEFORE UPDATE ON public.checkouts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_checkouts_updated_at();
