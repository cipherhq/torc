-- SUSP-001: Enforce provider suspension authority.
--
-- 1. Guard trigger on profiles: prevents self-mutation of status/suspended_at
-- 2. get_nearby_providers: excludes suspended providers
-- 3. accept_job: rejects suspended providers

-- ============================================================
-- 1) Guard profiles suspension fields
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_profiles_suspension()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Trusted callers bypass
  IF current_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- Admin callers bypass
  IF is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Block self-mutation of admin-owned suspension fields
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Cannot modify account status. Contact support.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.suspended_at IS DISTINCT FROM OLD.suspended_at THEN
      RAISE EXCEPTION 'Cannot modify suspension timestamp. Contact support.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profiles_suspension ON public.profiles;
CREATE TRIGGER trg_guard_profiles_suspension
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profiles_suspension();


-- ============================================================
-- 2) get_nearby_providers: exclude suspended providers
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_nearby_providers(
  p_pickup_lat DOUBLE PRECISION,
  p_pickup_lng DOUBLE PRECISION,
  p_radius_miles DOUBLE PRECISION,
  p_service_id TEXT DEFAULT NULL
)
RETURNS TABLE(
  provider_id UUID,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  distance_miles DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pl.provider_id,
    pl.latitude,
    pl.longitude,
    (3958.8 * 2 * ASIN(SQRT(
      POWER(SIN(RADIANS(p_pickup_lat - pl.latitude) / 2), 2) +
      COS(RADIANS(pl.latitude)) * COS(RADIANS(p_pickup_lat)) *
      POWER(SIN(RADIANS(p_pickup_lng - pl.longitude) / 2), 2)
    ))) AS distance_miles
  FROM provider_locations pl
  INNER JOIN provider_profiles pp ON pp.id = pl.provider_id
  WHERE
    pl.is_online = true
    AND pp.is_online = true
    AND pl.updated_at > NOW() - INTERVAL '5 minutes'
    AND (p_service_id IS NULL OR p_service_id = ANY(pp.services))
    AND NOT EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.provider_id = pl.provider_id
        AND j.status IN ('accepted', 'en_route', 'enroute', 'arrived', 'in_progress', 'inprogress')
    )
    -- SUSP-001: Exclude suspended providers
    AND NOT EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = pl.provider_id
        AND p.status = 'suspended'
    )
    AND (3958.8 * 2 * ASIN(SQRT(
      POWER(SIN(RADIANS(p_pickup_lat - pl.latitude) / 2), 2) +
      COS(RADIANS(pl.latitude)) * COS(RADIANS(p_pickup_lat)) *
      POWER(SIN(RADIANS(p_pickup_lng - pl.longitude) / 2), 2)
    ))) <= p_radius_miles
  ORDER BY distance_miles ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_nearby_providers(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_nearby_providers(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_nearby_providers(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) TO authenticated;


-- ============================================================
-- 3) accept_job: reject suspended providers
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
  v_active_job RECORD;
  v_provider_name TEXT;
  v_lock_key BIGINT;
  v_provider_status TEXT;
BEGIN
  -- SECURITY: Verify caller is the provider they claim to be
  IF p_provider_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED',
      'message', 'You can only accept jobs as yourself');
  END IF;

  -- SUSP-001: Check provider suspension status
  SELECT status INTO v_provider_status FROM profiles WHERE id = p_provider_id;
  IF v_provider_status = 'suspended' THEN
    RETURN jsonb_build_object('success', false, 'error', 'PROVIDER_SUSPENDED',
      'message', 'Your provider account is suspended');
  END IF;

  -- MATCH-001: Provider-level serialization
  v_lock_key := ('x' || left(replace(p_provider_id::text, '-', ''), 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- While holding the provider lock, check for existing active assignments
  SELECT id, status INTO v_active_job
  FROM jobs
  WHERE provider_id = p_provider_id
    AND status IN ('accepted', 'en_route', 'enroute', 'arrived', 'in_progress', 'inprogress')
    AND id != p_job_id
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

  -- Idempotent retry
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

  -- Block acceptance when expiry operation exists
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

  SELECT COALESCE(
    NULLIF(TRIM(first_name), '') || COALESCE(' ' || LEFT(last_name, 1) || '.', ''),
    'A provider'
  ) INTO v_provider_name FROM profiles WHERE id = p_provider_id;

  INSERT INTO notifications (user_id, type, title, message, action_url)
  VALUES (
    v_job.customer_id, 'service', 'Provider Accepted',
    v_provider_name || ' has accepted your service request.',
    '/tracking/' || p_job_id::text
  );

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

REVOKE EXECUTE ON FUNCTION public.accept_job(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accept_job(UUID, UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public.accept_job(UUID, UUID) TO authenticated;
