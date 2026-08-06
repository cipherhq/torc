-- CANCEL-AUTH-001: Harden cancel_job actor-type authorization.
--
-- The previous cancel_job only checked customer/provider participant
-- authorization via independent IF blocks. An unsupported p_actor_type
-- (e.g. 'admin', 'system', NULL, empty string) bypassed both checks
-- and reached the cancellation UPDATE.
--
-- Also fixes NULL p_actor_id bypass: the previous != comparison used
-- three-valued SQL logic where NULL != value evaluates to NULL (not TRUE),
-- allowing NULL actor IDs to pass the identity check.

CREATE OR REPLACE FUNCTION public.cancel_job(
  p_job_id UUID,
  p_actor_id UUID,
  p_actor_type TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job RECORD;
BEGIN
  -- Validate actor type: only 'customer' and 'provider' are supported
  IF p_actor_type IS NULL OR p_actor_type NOT IN ('customer', 'provider') THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED',
      'message', 'Invalid actor type');
  END IF;

  -- SECURITY: Verify caller identity (NULL-safe)
  IF p_actor_id IS NULL OR auth.uid() IS NULL OR p_actor_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED',
      'message', 'Identity mismatch');
  END IF;

  SELECT * INTO v_job FROM jobs WHERE id = p_job_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'JOB_NOT_FOUND',
      'message', 'Job does not exist');
  END IF;

  IF v_job.status IN ('completed', 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'JOB_CANNOT_BE_CANCELLED',
      'message', 'Job has already been ' || v_job.status, 'current_status', v_job.status);
  END IF;

  -- Participant authorization
  IF p_actor_type = 'customer' AND v_job.customer_id != p_actor_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED',
      'message', 'You are not authorized to cancel this job');
  END IF;

  IF p_actor_type = 'provider' AND (v_job.provider_id IS NULL OR v_job.provider_id != p_actor_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED',
      'message', 'You are not the assigned provider for this job');
  END IF;

  UPDATE jobs
  SET status = 'cancelled', cancellation_reason = p_reason,
      cancelled_at = NOW(), cancelled_by = p_actor_id, updated_at = NOW()
  WHERE id = p_job_id;

  INSERT INTO job_events (job_id, event_type, actor_id, actor_type, metadata)
  VALUES (p_job_id, 'job_cancelled', p_actor_id, p_actor_type,
    jsonb_build_object('reason', p_reason, 'previous_status', v_job.status));

  PERFORM pg_notify('job_cancelled', jsonb_build_object(
    'job_id', p_job_id, 'cancelled_by', p_actor_id, 'actor_type', p_actor_type,
    'customer_id', v_job.customer_id, 'provider_id', v_job.provider_id, 'reason', p_reason
  )::text);

  RETURN jsonb_build_object('success', true, 'job_id', p_job_id, 'status', 'cancelled',
    'cancelled_by', p_actor_id, 'cancelled_at', NOW(), 'reason', p_reason);
END;
$$;

-- Preserve existing grants
REVOKE EXECUTE ON FUNCTION public.cancel_job(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_job(UUID, UUID, TEXT, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.cancel_job(UUID, UUID, TEXT, TEXT) TO authenticated;
