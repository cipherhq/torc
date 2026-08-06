-- MATCH-001: Serialize provider job acceptance.
--
-- Prevents a provider from holding more than one active job by:
-- 1. Acquiring a transaction-scoped advisory lock per provider
-- 2. Checking for existing active assignments while holding the lock
-- 3. Only then locking and validating the requested job
--
-- The advisory lock ensures two concurrent accept_job calls for the
-- same provider serialize at the database level, even when targeting
-- different job rows (whose FOR UPDATE locks would not conflict).

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
  v_active_job RECORD;
  v_provider_name TEXT;
  v_lock_key BIGINT;
BEGIN
  -- SECURITY: Verify caller is the provider they claim to be
  IF p_provider_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED',
      'message', 'You can only accept jobs as yourself');
  END IF;

  -- ============================================================
  -- MATCH-001: Provider-level serialization
  -- Derive a deterministic lock key from the provider UUID.
  -- pg_advisory_xact_lock is transaction-scoped and auto-releases on commit/rollback.
  -- ============================================================
  v_lock_key := ('x' || left(replace(p_provider_id::text, '-', ''), 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- While holding the provider lock, check for existing active assignments
  SELECT id, status INTO v_active_job
  FROM jobs
  WHERE provider_id = p_provider_id
    AND status IN ('accepted', 'en_route', 'enroute', 'arrived', 'in_progress', 'inprogress')
    AND id != p_job_id  -- exclude the target job for idempotent retry
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'PROVIDER_BUSY',
      'message', 'You already have an active job',
      'active_job_id', v_active_job.id,
      'active_job_status', v_active_job.status);
  END IF;

  -- Now lock and validate the requested job
  SELECT * INTO v_job FROM jobs WHERE id = p_job_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'JOB_NOT_FOUND',
      'message', 'Job does not exist');
  END IF;

  -- Idempotent retry: if this provider already accepted this specific job, return success
  IF v_job.status = 'accepted' AND v_job.provider_id = p_provider_id THEN
    RETURN jsonb_build_object('success', true, 'job_id', p_job_id,
      'provider_id', p_provider_id, 'status', 'accepted',
      'already_accepted', true, 'accepted_at', v_job.accepted_at);
  END IF;

  IF v_job.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'JOB_ALREADY_ACCEPTED',
      'message', 'Job has already been accepted by another provider',
      'current_status', v_job.status, 'current_provider_id', v_job.provider_id);
  END IF;

  -- Block acceptance when ANY expiry operation exists
  IF EXISTS (
    SELECT 1 FROM job_expiry_refund_operations
    WHERE job_id = p_job_id
      AND status != 'abandoned_before_refund'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'JOB_EXPIRY_IN_PROGRESS',
      'message', 'This job is being expired due to no provider availability');
  END IF;

  -- Atomically assign provider
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

-- Preserve existing grants
REVOKE EXECUTE ON FUNCTION public.accept_job(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accept_job(UUID, UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public.accept_job(UUID, UUID) TO authenticated;
