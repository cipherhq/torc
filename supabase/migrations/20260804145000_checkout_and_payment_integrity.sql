-- Payment integrity: server-authoritative checkout, webhook idempotency,
-- duplicate prevention constraints, durable rate limits, and job status audit trail.
--
-- CTO security hardening applied:
--   - No UPDATE RLS policy on checkouts (service_role bypasses RLS)
--   - SECURITY DEFINER functions hardened with search_path, REVOKE/GRANT
--   - expire_stale_jobs captures original status before UPDATE
--   - payment_attempts table for retry idempotency
--   - Atomic rate limiting via claim_rate_limit_slot()
--   - RLS/privilege assertion queries at the end

BEGIN;

-- ============================================================
-- 1) Checkout records
-- ============================================================
CREATE TABLE IF NOT EXISTS public.checkouts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id      UUID NOT NULL,
  vehicle_id      UUID,
  is_hazardous    BOOLEAN NOT NULL DEFAULT false,
  scheduled_for   TIMESTAMPTZ,
  base_price      NUMERIC(10,2) NOT NULL,
  hazard_fee      NUMERIC(10,2) NOT NULL DEFAULT 0,
  scheduling_fee  NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax             NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount    NUMERIC(10,2) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'USD',
  payment_intent_id  TEXT,
  payment_method_id  TEXT,
  stripe_customer_id TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','payment_processing','paid','failed','expired','refunded')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at         TIMESTAMPTZ,
  job_id          UUID UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_checkouts_user_id ON public.checkouts(user_id);
CREATE INDEX IF NOT EXISTS idx_checkouts_payment_intent_id ON public.checkouts(payment_intent_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_checkouts_payment_intent_unique
  ON public.checkouts(payment_intent_id) WHERE payment_intent_id IS NOT NULL;

ALTER TABLE public.checkouts ENABLE ROW LEVEL SECURITY;

-- Users can only SELECT their own checkouts.
-- No INSERT/UPDATE policy — service_role (edge functions) creates checkouts, not clients.
CREATE POLICY "Users can view own checkouts"
  ON public.checkouts FOR SELECT
  USING (auth.uid() = user_id);

-- Drop unsafe policies if they exist from a prior run
DROP POLICY IF EXISTS "Users can insert own checkouts" ON public.checkouts;
DROP POLICY IF EXISTS "Service role can update checkouts" ON public.checkouts;

-- ============================================================
-- 1b) Payment attempts — retry idempotency per checkout
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payment_attempts (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_id            UUID NOT NULL REFERENCES public.checkouts(id) ON DELETE CASCADE,
  attempt_number         INTEGER NOT NULL DEFAULT 1,
  stripe_idempotency_key TEXT NOT NULL UNIQUE,
  payment_intent_id      TEXT,
  status                 TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','succeeded','failed')),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_checkout_id ON public.payment_attempts(checkout_id);

ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;

-- Service role handles writes (via edge functions); users can read their own via checkout
CREATE POLICY "Service role only writes payment_attempts"
  ON public.payment_attempts FOR ALL
  USING (false);

CREATE POLICY "Users can view own payment attempts"
  ON public.payment_attempts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.checkouts
      WHERE checkouts.id = payment_attempts.checkout_id
        AND checkouts.user_id = auth.uid()
    )
  );

-- ============================================================
-- 2) Processed webhook events — idempotency for Stripe webhooks
-- ============================================================
CREATE TABLE IF NOT EXISTS public.processed_webhook_events (
  event_id     TEXT PRIMARY KEY,
  gateway      TEXT NOT NULL DEFAULT 'stripe',
  event_type   TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.processed_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only for webhook events"
  ON public.processed_webhook_events FOR ALL
  USING (false);

-- ============================================================
-- 3) Add checkout_id to jobs
-- ============================================================
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS checkout_id UUID;
CREATE INDEX IF NOT EXISTS idx_jobs_checkout_id ON public.jobs(checkout_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_checkout_unique
  ON public.jobs(checkout_id) WHERE checkout_id IS NOT NULL;

-- ============================================================
-- 4) Job status audit trail
-- ============================================================
CREATE TABLE IF NOT EXISTS public.job_status_audit (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID NOT NULL,
  previous_status TEXT,
  new_status      TEXT NOT NULL,
  actor_id        UUID,
  actor_type      TEXT NOT NULL DEFAULT 'system'
    CHECK (actor_type IN ('customer','provider','admin','system','webhook')),
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_status_audit_job_id ON public.job_status_audit(job_id);

ALTER TABLE public.job_status_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit trail"
  ON public.job_status_audit FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- ============================================================
-- 5) Durable rate limit log
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rate_limit_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key        TEXT NOT NULL,
  action     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_log_key_created
  ON public.rate_limit_log(key, created_at);

ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only for rate limits"
  ON public.rate_limit_log FOR ALL
  USING (false);

-- ============================================================
-- 6) cleanup_rate_limit_log — SECURITY DEFINER, hardened
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_rate_limit_log()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Authorization: only service_role may call this.
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: only service_role may call cleanup_rate_limit_log';
  END IF;

  DELETE FROM public.rate_limit_log
  WHERE created_at < now() - interval '24 hours';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_rate_limit_log() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_rate_limit_log() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.cleanup_rate_limit_log() TO service_role;

-- ============================================================
-- 6b) claim_rate_limit_slot — atomic COUNT+INSERT with advisory lock
-- ============================================================
CREATE OR REPLACE FUNCTION public.claim_rate_limit_slot(
  p_key TEXT,
  p_max_count INTEGER,
  p_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_current_count INTEGER;
BEGIN
  v_window_start := now() - (p_window_seconds || ' seconds')::interval;

  -- Lock the key to prevent concurrent races
  PERFORM pg_advisory_xact_lock(hashtext(p_key));

  SELECT count(*) INTO v_current_count
  FROM public.rate_limit_log
  WHERE key = p_key AND created_at >= v_window_start;

  IF v_current_count >= p_max_count THEN
    RETURN false;
  END IF;

  INSERT INTO public.rate_limit_log (key, action, created_at)
  VALUES (p_key, 'claim', now());

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_rate_limit_slot(TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_rate_limit_slot(TEXT, INTEGER, INTEGER) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_rate_limit_slot(TEXT, INTEGER, INTEGER) TO service_role;

-- ============================================================
-- 7) transition_job_status — SECURITY DEFINER, hardened
-- ============================================================
CREATE OR REPLACE FUNCTION public.transition_job_status(
  p_job_id     UUID,
  p_new_status TEXT,
  p_actor_id   UUID    DEFAULT NULL,
  p_actor_type TEXT    DEFAULT 'system',
  p_reason     TEXT    DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job               RECORD;
  v_valid_transitions JSONB;
BEGIN
  -- Authorization: only service_role may call this.
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: only service_role may call transition_job_status';
  END IF;

  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Job not found');
  END IF;

  v_valid_transitions := '{
    "pending":     ["accepted","cancelled","expired"],
    "accepted":    ["enroute","cancelled","expired"],
    "enroute":     ["arrived","cancelled"],
    "arrived":     ["in_progress","inprogress","cancelled"],
    "in_progress": ["completed","cancelled"],
    "inprogress":  ["completed","cancelled"],
    "scheduled":   ["pending","cancelled","expired"]
  }'::jsonb;

  IF v_job.status IS NOT NULL
     AND NOT (v_valid_transitions -> v_job.status ? p_new_status) THEN
    RETURN json_build_object(
      'success', false,
      'message', format('Invalid transition from %s to %s', v_job.status, p_new_status)
    );
  END IF;

  UPDATE public.jobs
  SET status       = p_new_status,
      accepted_at  = CASE WHEN p_new_status = 'accepted'                       THEN now() ELSE accepted_at  END,
      started_at   = CASE WHEN p_new_status IN ('in_progress','inprogress')    THEN now() ELSE started_at   END,
      completed_at = CASE WHEN p_new_status = 'completed'                      THEN now() ELSE completed_at END,
      cancelled_at = CASE WHEN p_new_status = 'cancelled'                      THEN now() ELSE cancelled_at END
  WHERE id = p_job_id;

  INSERT INTO public.job_status_audit
    (job_id, previous_status, new_status, actor_id, actor_type, reason)
  VALUES
    (p_job_id, v_job.status, p_new_status, p_actor_id, p_actor_type, p_reason);

  RETURN json_build_object(
    'success', true,
    'previous_status', v_job.status,
    'new_status', p_new_status
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.transition_job_status(UUID, TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.transition_job_status(UUID, TEXT, UUID, TEXT, TEXT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.transition_job_status(UUID, TEXT, UUID, TEXT, TEXT) TO service_role;

-- ============================================================
-- 8) expire_stale_jobs — SECURITY DEFINER, hardened,
--    captures original status BEFORE the UPDATE
-- ============================================================
CREATE OR REPLACE FUNCTION public.expire_stale_jobs(
  p_max_age_hours INTEGER DEFAULT 2
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
  v_rec   RECORD;
BEGIN
  -- Authorization: only service_role may call this.
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: only service_role may call expire_stale_jobs';
  END IF;

  v_count := 0;

  -- Iterate so we can capture the original status before updating
  FOR v_rec IN
    SELECT id, status AS original_status
    FROM public.jobs
    WHERE status IN ('pending','scheduled')
      AND created_at < now() - (p_max_age_hours || ' hours')::interval
    FOR UPDATE
  LOOP
    UPDATE public.jobs SET status = 'expired' WHERE id = v_rec.id;

    INSERT INTO public.job_status_audit
      (job_id, previous_status, new_status, actor_type, reason)
    VALUES
      (v_rec.id, v_rec.original_status, 'expired', 'system',
       'Auto-expired after ' || p_max_age_hours || 'h');

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expire_stale_jobs(INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.expire_stale_jobs(INTEGER) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.expire_stale_jobs(INTEGER) TO service_role;

-- ============================================================
-- 9) Prevent client-side payment_status = paid
-- ============================================================
CREATE OR REPLACE FUNCTION public.prevent_client_payment_status_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_status = 'paid'
     AND (OLD.payment_status IS NULL OR OLD.payment_status != 'paid') THEN
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

-- ============================================================
-- 10) Checkouts updated_at trigger
-- ============================================================
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

-- ============================================================
-- 11) RLS and privilege assertion queries
--     Each DO block raises an exception if the assertion fails,
--     which aborts the transaction so a bad migration never commits.
-- ============================================================

-- Assert: checkouts has RLS enabled
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE relname = 'checkouts'
      AND relnamespace = 'public'::regnamespace
      AND relrowsecurity = true
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: RLS is not enabled on public.checkouts';
  END IF;
END;
$$;

-- Assert: No UPDATE policy on checkouts for authenticated users
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'checkouts'
      AND cmd        = 'UPDATE'
      AND (roles @> ARRAY['authenticated'] OR roles @> ARRAY['public'])
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: An UPDATE policy exists on public.checkouts for authenticated/public role';
  END IF;
END;
$$;

-- Assert: transition_job_status is NOT executable by authenticated
DO $$
BEGIN
  IF has_function_privilege(
    'authenticated',
    'public.transition_job_status(uuid, text, uuid, text, text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: authenticated role can execute transition_job_status';
  END IF;
END;
$$;

-- Assert: expire_stale_jobs is NOT executable by authenticated
DO $$
BEGIN
  IF has_function_privilege(
    'authenticated',
    'public.expire_stale_jobs(integer)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: authenticated role can execute expire_stale_jobs';
  END IF;
END;
$$;

-- Assert: cleanup_rate_limit_log is NOT executable by authenticated
DO $$
BEGIN
  IF has_function_privilege(
    'authenticated',
    'public.cleanup_rate_limit_log()',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: authenticated role can execute cleanup_rate_limit_log';
  END IF;
END;
$$;

-- Assert: claim_rate_limit_slot is NOT executable by authenticated
DO $$
BEGIN
  IF has_function_privilege(
    'authenticated',
    'public.claim_rate_limit_slot(text, integer, integer)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: authenticated role can execute claim_rate_limit_slot';
  END IF;
END;
$$;

-- Assert: No INSERT policy on checkouts for authenticated users
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'checkouts'
      AND cmd        = 'INSERT'
      AND (roles @> ARRAY['authenticated'] OR roles @> ARRAY['public'])
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: An INSERT policy exists on public.checkouts for authenticated/public role';
  END IF;
END;
$$;

COMMIT;
