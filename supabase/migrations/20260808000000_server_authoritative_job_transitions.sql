-- CROSS-001: Server-authoritative job lifecycle transitions.
--
-- This migration:
-- 1. Creates a guard trigger that prevents authenticated clients from
--    directly writing lifecycle fields (status, accepted_at, started_at,
--    completed_at, cancelled_at, customer_completed_at).
-- 2. Creates transition_job_status_by_participant() RPC for normal lifecycle.
-- 3. Creates confirm_customer_job_completion() RPC for customer confirmation.
--
-- SECURITY DEFINER functions (accept_job, cancel_job, transition_job_status,
-- expiry RPCs) run as current_user='postgres' and bypass the guard.
-- Direct client UPDATEs through PostgREST run as current_user='authenticated'
-- and are blocked from modifying protected fields.

-- ============================================================
-- 1) Guard trigger: block raw lifecycle mutations from non-trusted callers
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_job_lifecycle_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Trusted callers: postgres (SECURITY DEFINER functions), supabase_admin, service_role
  -- These can modify any field. Client UPDATEs/INSERTs via PostgREST run as 'authenticated'.
  IF current_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- === INSERT guard ===
  -- Authenticated client-created jobs must start as 'pending' with no lifecycle timestamps.
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION 'New jobs must have status pending. Use the appropriate RPC for other states.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.accepted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot set accepted_at on job creation.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.started_at IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot set started_at on job creation.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot set completed_at on job creation.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.cancelled_at IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot set cancelled_at on job creation.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.customer_completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot set customer_completed_at on job creation.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- === UPDATE guard ===
  -- Block changes to protected lifecycle fields from non-trusted callers.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Direct job status mutation is not allowed. Use the appropriate RPC.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.accepted_at IS DISTINCT FROM OLD.accepted_at THEN
    RAISE EXCEPTION 'Direct accepted_at mutation is not allowed.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.started_at IS DISTINCT FROM OLD.started_at THEN
    RAISE EXCEPTION 'Direct started_at mutation is not allowed.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
    RAISE EXCEPTION 'Direct completed_at mutation is not allowed.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at THEN
    RAISE EXCEPTION 'Direct cancelled_at mutation is not allowed.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.customer_completed_at IS DISTINCT FROM OLD.customer_completed_at THEN
    RAISE EXCEPTION 'Direct customer_completed_at mutation is not allowed.'
      USING ERRCODE = '42501';
  END IF;

  -- Non-lifecycle fields (rating, review, tip, photos, etc.) pass through
  RETURN NEW;
END;
$$;

-- Fire BEFORE INSERT OR UPDATE, before the existing apply_job_status_timestamps trigger
DROP TRIGGER IF EXISTS trg_guard_job_lifecycle ON public.jobs;
CREATE TRIGGER trg_guard_job_lifecycle
  BEFORE INSERT OR UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_job_lifecycle_fields();

-- ============================================================
-- 2) Participant-facing lifecycle transition RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.transition_job_status_by_participant(
  p_job_id       UUID,
  p_target_status TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job   RECORD;
  v_caller UUID;
  v_role   TEXT;  -- 'customer' or 'provider'
  v_valid_provider_transitions JSONB;
  v_valid_customer_transitions JSONB;
  v_valid JSONB;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  -- Disallow statuses that have their own RPCs
  IF p_target_status IN ('accepted', 'cancelled', 'expired', 'pending', 'matching') THEN
    RETURN json_build_object('success', false, 'error', 'USE_DEDICATED_RPC',
      'message', 'Use accept_job, cancel_job, or the expiry system for this transition');
  END IF;

  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'JOB_NOT_FOUND');
  END IF;

  -- Determine caller role
  IF v_caller = v_job.customer_id THEN
    v_role := 'customer';
  ELSIF v_caller = v_job.provider_id THEN
    v_role := 'provider';
  ELSE
    RETURN json_build_object('success', false, 'error', 'UNAUTHORIZED',
      'message', 'You are not a participant in this job');
  END IF;

  -- Define valid transitions per role
  v_valid_provider_transitions := '{
    "accepted":    ["enroute", "arrived"],
    "enroute":     ["arrived"],
    "arrived":     ["inprogress"],
    "inprogress":  ["completed"]
  }'::jsonb;

  v_valid_customer_transitions := '{
    "arrived":     ["inprogress"]
  }'::jsonb;

  IF v_role = 'provider' THEN
    v_valid := v_valid_provider_transitions;
  ELSE
    v_valid := v_valid_customer_transitions;
  END IF;

  -- Validate transition
  IF v_job.status IS NULL
     OR NOT (v_valid ? v_job.status)
     OR NOT (v_valid -> v_job.status ? p_target_status) THEN
    RETURN json_build_object('success', false, 'error', 'INVALID_TRANSITION',
      'message', format('%s cannot transition from %s to %s', v_role, v_job.status, p_target_status),
      'current_status', v_job.status, 'target_status', p_target_status);
  END IF;

  -- Perform the transition — timestamps are set by apply_job_status_timestamps trigger
  UPDATE public.jobs
  SET status = p_target_status,
      updated_at = now()
  WHERE id = p_job_id;

  -- Log the event
  INSERT INTO public.job_events (job_id, event_type, actor_id, actor_type, metadata)
  VALUES (p_job_id, 'status_changed', v_caller, v_role,
    jsonb_build_object('previous_status', v_job.status, 'new_status', p_target_status));

  RETURN json_build_object('success', true,
    'previous_status', v_job.status, 'new_status', p_target_status,
    'job_id', p_job_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.transition_job_status_by_participant(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.transition_job_status_by_participant(UUID, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.transition_job_status_by_participant(UUID, TEXT) TO authenticated;


-- ============================================================
-- 3) Customer completion confirmation RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.confirm_customer_job_completion(
  p_job_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'JOB_NOT_FOUND');
  END IF;

  IF v_job.customer_id != auth.uid() THEN
    RETURN json_build_object('success', false, 'error', 'UNAUTHORIZED',
      'message', 'Only the customer can confirm completion');
  END IF;

  -- Allow confirmation during inprogress or completed (for retry/recovery)
  IF v_job.status NOT IN ('inprogress', 'completed') THEN
    RETURN json_build_object('success', false, 'error', 'INVALID_STATE',
      'message', 'Job must be in progress or completed for customer confirmation',
      'current_status', v_job.status);
  END IF;

  -- Idempotent: if already confirmed, return success
  IF v_job.customer_completed_at IS NOT NULL THEN
    RETURN json_build_object('success', true, 'already_confirmed', true,
      'customer_completed_at', v_job.customer_completed_at);
  END IF;

  UPDATE public.jobs
  SET customer_completed_at = now(), updated_at = now()
  WHERE id = p_job_id;

  RETURN json_build_object('success', true, 'job_id', p_job_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_customer_job_completion(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.confirm_customer_job_completion(UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public.confirm_customer_job_completion(UUID) TO authenticated;
