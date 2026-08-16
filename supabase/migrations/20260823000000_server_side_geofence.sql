-- =============================================================================
-- SERVER-SIDE GEOFENCE: accept_job distance validation + eligible-jobs RPC
-- =============================================================================
-- Closes the observed defect where a UK Provider could receive and accept
-- a US Customer's job via (1) global Wave 3 broadcast and (2) unrestricted
-- accept_job RPC with no geographic check.
--
-- Changes:
--   1. haversine_distance_miles() — shared helper, single source of truth
--   2. is_valid_latitude/longitude() — range validation helpers
--   3. accept_job() — adds distance, freshness, service, coordinate, and
--      online-state validation with fail-closed semantics
--   4. get_eligible_pending_jobs_for_provider() — server-authoritative
--      pending-job source for ProviderHome (replaces unrestricted polling)
--   5. get_nearby_providers() — refactored to use shared helpers
--   6. Jobs RLS — tighten "Providers can view pending jobs" to prevent bypass
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Shared haversine distance helper (miles)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.haversine_distance_miles(
  lat1 DOUBLE PRECISION, lng1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION, lng2 DOUBLE PRECISION
)
RETURNS DOUBLE PRECISION
LANGUAGE sql IMMUTABLE STRICT
AS $$
  SELECT 3958.8 * 2 * ASIN(SQRT(
    POWER(SIN(RADIANS(lat1 - lat2) / 2), 2) +
    COS(RADIANS(lat2)) * COS(RADIANS(lat1)) *
    POWER(SIN(RADIANS(lng1 - lng2) / 2), 2)
  ));
$$;

COMMENT ON FUNCTION public.haversine_distance_miles IS
  'Haversine great-circle distance in miles. Used by matching and acceptance validation.';

-- ---------------------------------------------------------------------------
-- 2. Coordinate range validation helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_valid_latitude(v DOUBLE PRECISION)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT v IS NOT NULL AND v >= -90 AND v <= 90;
$$;

CREATE OR REPLACE FUNCTION public.is_valid_longitude(v DOUBLE PRECISION)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT v IS NOT NULL AND v >= -180 AND v <= 180;
$$;

-- ---------------------------------------------------------------------------
-- 3. accept_job — with server-authoritative geographic validation
-- ---------------------------------------------------------------------------
-- Freshness interval used for BOTH immediate and scheduled jobs.
-- Scheduled jobs do not require is_online=true, but geography must be based
-- on recent location to prevent acceptance using arbitrarily stale positions
-- (e.g., provider was in US last month, now in UK, accepts a US scheduled job).
-- ---------------------------------------------------------------------------
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
  v_is_verified BOOLEAN;
  v_provider_loc RECORD;
  v_provider_profile_online BOOLEAN;
  v_max_radius DOUBLE PRECISION;
  v_distance DOUBLE PRECISION;
  v_provider_services TEXT[];
  v_freshness_interval INTERVAL := INTERVAL '5 minutes';
  v_is_immediate BOOLEAN;
BEGIN
  -- SECURITY: Verify caller is the provider they claim to be
  IF p_provider_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED',
      'message', 'You can only accept jobs as yourself');
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

  -- PROV-002: Check verification + load services
  SELECT is_verified, services, is_online
  INTO v_is_verified, v_provider_services, v_provider_profile_online
  FROM provider_profiles WHERE id = p_provider_id;

  IF v_is_verified IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'PROVIDER_NOT_VERIFIED',
      'message', 'Your provider account must be verified to accept jobs');
  END IF;

  -- Provider serialization (MATCH-001)
  v_lock_key := ('x' || left(replace(p_provider_id::text, '-', ''), 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Check for existing active assignments
  SELECT id, status INTO v_active_job FROM jobs
  WHERE provider_id = p_provider_id
    AND status IN ('accepted','en_route','enroute','arrived','in_progress','inprogress')
    AND id != p_job_id LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'PROVIDER_BUSY',
      'active_job_id', v_active_job.id, 'active_job_status', v_active_job.status);
  END IF;

  -- Lock and validate the requested job
  SELECT * INTO v_job FROM jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'JOB_NOT_FOUND');
  END IF;

  -- Idempotent retry
  IF v_job.status = 'accepted' AND v_job.provider_id = p_provider_id THEN
    RETURN jsonb_build_object('success', true, 'job_id', p_job_id,
      'provider_id', p_provider_id, 'status', 'accepted',
      'already_accepted', true, 'accepted_at', v_job.accepted_at);
  END IF;

  IF v_job.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'JOB_ALREADY_ACCEPTED',
      'current_status', v_job.status);
  END IF;

  -- Block acceptance when expiry operation exists
  IF EXISTS (
    SELECT 1 FROM job_expiry_refund_operations
    WHERE job_id = p_job_id AND status != 'abandoned_before_refund'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'JOB_EXPIRY_IN_PROGRESS');
  END IF;

  -- ===================================================================
  -- SERVER-AUTHORITATIVE GEOGRAPHIC + SERVICE VALIDATION
  -- ===================================================================

  -- Validate job pickup coordinates (real lat/lng ranges)
  IF NOT is_valid_latitude(v_job.pickup_latitude)
     OR NOT is_valid_longitude(v_job.pickup_longitude) THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_PICKUP_COORDINATES',
      'message', 'Job has missing or invalid pickup location');
  END IF;

  -- Service eligibility: fail closed — job must have an authoritative service
  IF v_job.service_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'JOB_SERVICE_MISSING',
      'message', 'Job has no authoritative requested service');
  END IF;
  IF v_provider_services IS NULL OR array_length(v_provider_services, 1) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'SERVICE_NOT_OFFERED',
      'message', 'Your service configuration is incomplete');
  END IF;
  IF NOT (v_job.service_id = ANY(v_provider_services)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'SERVICE_NOT_OFFERED',
      'message', 'You do not offer the requested service');
  END IF;

  -- Load provider location
  SELECT latitude, longitude, is_online, updated_at
  INTO v_provider_loc
  FROM provider_locations
  WHERE provider_id = p_provider_id;

  -- Determine if immediate or scheduled
  v_is_immediate := (v_job.scheduled_for IS NULL OR v_job.scheduled_for <= NOW() + INTERVAL '10 minutes');

  -- Provider location must exist for ALL job types
  IF v_provider_loc IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'PROVIDER_LOCATION_MISSING',
      'message', 'Your location is not available. Please ensure location services are enabled.');
  END IF;

  -- Validate coordinates are real lat/lng ranges
  IF NOT is_valid_latitude(v_provider_loc.latitude)
     OR NOT is_valid_longitude(v_provider_loc.longitude) THEN
    RETURN jsonb_build_object('success', false, 'error', 'PROVIDER_LOCATION_INVALID',
      'message', 'Your location coordinates are invalid');
  END IF;

  -- Location freshness required for BOTH immediate and scheduled jobs.
  -- Scheduled jobs don't require is_online, but geography must use recent data
  -- to prevent acceptance using arbitrarily stale location from another country.
  IF v_provider_loc.updated_at < NOW() - v_freshness_interval THEN
    RETURN jsonb_build_object('success', false, 'error', 'PROVIDER_LOCATION_STALE',
      'message', 'Your location has not been updated recently. Please go online to refresh.');
  END IF;

  -- IMMEDIATE JOBS: require consistent online state across both tables
  IF v_is_immediate THEN
    IF v_provider_loc.is_online IS NOT TRUE THEN
      RETURN jsonb_build_object('success', false, 'error', 'PROVIDER_NOT_ONLINE',
        'message', 'You must be online to accept immediate jobs');
    END IF;
    IF v_provider_profile_online IS NOT TRUE THEN
      RETURN jsonb_build_object('success', false, 'error', 'PROVIDER_NOT_ONLINE',
        'message', 'You must be online to accept immediate jobs');
    END IF;
  END IF;
  -- SCHEDULED JOBS: no is_online requirement (provider may accept while offline)

  -- Load authoritative max radius
  SELECT COALESCE((value)::numeric, 50) INTO v_max_radius
  FROM platform_settings WHERE key = 'max_job_radius';
  IF v_max_radius IS NULL THEN v_max_radius := 50; END IF;

  -- Calculate distance
  v_distance := haversine_distance_miles(
    v_provider_loc.latitude, v_provider_loc.longitude,
    v_job.pickup_latitude, v_job.pickup_longitude
  );

  IF v_distance > v_max_radius THEN
    RETURN jsonb_build_object('success', false, 'error', 'PROVIDER_OUT_OF_RANGE',
      'message', 'This job is outside your service area',
      'distance_miles', ROUND(v_distance::numeric, 1),
      'max_radius_miles', v_max_radius);
  END IF;

  -- ===================================================================
  -- ALL VALIDATIONS PASSED — Atomically assign provider
  -- ===================================================================
  UPDATE jobs SET provider_id = p_provider_id, status = 'accepted',
    accepted_at = NOW(), updated_at = NOW() WHERE id = p_job_id;

  INSERT INTO job_events (job_id, event_type, actor_id, actor_type, metadata)
  VALUES (p_job_id, 'job_accepted', p_provider_id, 'provider',
    jsonb_build_object('previous_status', v_job.status,
      'distance_miles', ROUND(v_distance::numeric, 1)));

  PERFORM pg_notify('job_accepted', jsonb_build_object(
    'job_id', p_job_id, 'provider_id', p_provider_id,
    'customer_id', v_job.customer_id)::text);

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
    'provider_id', p_provider_id, 'status', 'accepted', 'accepted_at', NOW(),
    'distance_miles', ROUND(v_distance::numeric, 1));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_job(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accept_job(UUID, UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public.accept_job(UUID, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. get_eligible_pending_jobs_for_provider — replaces unrestricted polling
-- ---------------------------------------------------------------------------
-- Provider identity comes from auth.uid(), NOT a caller-supplied parameter.
-- Returns only jobs the provider is genuinely eligible to receive.
-- Requires: active, verified, online, fresh location, not busy, valid coords,
--           service match (fail closed on null/empty services), distance check.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_eligible_pending_jobs_for_provider()
RETURNS TABLE(
  id UUID,
  service_id TEXT,
  pickup_address TEXT,
  pickup_latitude DOUBLE PRECISION,
  pickup_longitude DOUBLE PRECISION,
  total_amount NUMERIC,
  base_price NUMERIC,
  created_at TIMESTAMPTZ,
  scheduled_for TIMESTAMPTZ,
  distance_miles DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider_id UUID;
  v_provider_loc RECORD;
  v_provider_profile_online BOOLEAN;
  v_max_radius DOUBLE PRECISION;
  v_provider_services TEXT[];
  v_is_verified BOOLEAN;
  v_provider_status TEXT;
BEGIN
  v_provider_id := auth.uid();
  IF v_provider_id IS NULL THEN
    RETURN;  -- unauthenticated: return empty
  END IF;

  -- Check provider is active
  SELECT p.status INTO v_provider_status FROM profiles p WHERE p.id = v_provider_id;
  IF v_provider_status IS DISTINCT FROM 'active' THEN
    RETURN;
  END IF;

  -- Check provider is verified + load services and profile online state
  SELECT pp.is_verified, pp.services, pp.is_online
  INTO v_is_verified, v_provider_services, v_provider_profile_online
  FROM provider_profiles pp WHERE pp.id = v_provider_id;

  IF v_is_verified IS NOT TRUE THEN
    RETURN;
  END IF;

  -- Fail closed: provider must have non-null/non-empty services
  IF v_provider_services IS NULL OR array_length(v_provider_services, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Load provider location (must be online and fresh)
  SELECT pl.latitude, pl.longitude, pl.is_online, pl.updated_at
  INTO v_provider_loc
  FROM provider_locations pl WHERE pl.provider_id = v_provider_id;

  -- Validate location: exists, valid ranges, online (both tables), fresh
  IF v_provider_loc IS NULL
     OR NOT is_valid_latitude(v_provider_loc.latitude)
     OR NOT is_valid_longitude(v_provider_loc.longitude)
     OR v_provider_loc.is_online IS NOT TRUE
     OR v_provider_profile_online IS NOT TRUE
     OR v_provider_loc.updated_at < NOW() - INTERVAL '5 minutes' THEN
    RETURN;  -- no valid fresh online location: no eligible jobs
  END IF;

  -- Check provider is not busy
  IF EXISTS (
    SELECT 1 FROM jobs j
    WHERE j.provider_id = v_provider_id
      AND j.status IN ('accepted','en_route','enroute','arrived','in_progress','inprogress')
  ) THEN
    RETURN;
  END IF;

  -- Load max radius
  SELECT COALESCE((value)::numeric, 50) INTO v_max_radius
  FROM platform_settings WHERE key = 'max_job_radius';
  IF v_max_radius IS NULL THEN v_max_radius := 50; END IF;

  RETURN QUERY
  SELECT
    j.id, j.service_id, j.pickup_address,
    j.pickup_latitude, j.pickup_longitude,
    j.total_amount, j.base_price,
    j.created_at, j.scheduled_for,
    haversine_distance_miles(
      v_provider_loc.latitude, v_provider_loc.longitude,
      j.pickup_latitude, j.pickup_longitude
    ) AS distance_miles
  FROM jobs j
  WHERE j.status = 'pending'
    AND j.provider_id IS NULL
    AND j.created_at > NOW() - INTERVAL '2 hours'
    -- Valid pickup coordinates (real ranges)
    AND is_valid_latitude(j.pickup_latitude)
    AND is_valid_longitude(j.pickup_longitude)
    -- Service eligibility: fail closed — job must have a service in provider's list
    AND j.service_id IS NOT NULL
    AND j.service_id = ANY(v_provider_services)
    -- Distance within max radius
    AND haversine_distance_miles(
          v_provider_loc.latitude, v_provider_loc.longitude,
          j.pickup_latitude, j.pickup_longitude
        ) <= v_max_radius
  ORDER BY distance_miles ASC
  LIMIT 10;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_eligible_pending_jobs_for_provider() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_eligible_pending_jobs_for_provider() FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_eligible_pending_jobs_for_provider() TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Update get_nearby_providers to use shared helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_nearby_providers(
  p_pickup_lat DOUBLE PRECISION, p_pickup_lng DOUBLE PRECISION,
  p_radius_miles DOUBLE PRECISION, p_service_id TEXT DEFAULT NULL
)
RETURNS TABLE(provider_id UUID, latitude DOUBLE PRECISION, longitude DOUBLE PRECISION, distance_miles DOUBLE PRECISION)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_max_radius DOUBLE PRECISION; v_effective_radius DOUBLE PRECISION;
BEGIN
  -- Fail closed: invalid pickup coordinates → return no providers
  IF NOT is_valid_latitude(p_pickup_lat) OR NOT is_valid_longitude(p_pickup_lng) THEN
    RETURN;
  END IF;

  SELECT COALESCE((value)::numeric, 50) INTO v_max_radius
  FROM platform_settings WHERE key = 'max_job_radius';
  IF v_max_radius IS NULL THEN v_max_radius := 50; END IF;
  v_effective_radius := LEAST(p_radius_miles, v_max_radius);

  RETURN QUERY
  SELECT pl.provider_id, pl.latitude, pl.longitude,
    haversine_distance_miles(p_pickup_lat, p_pickup_lng, pl.latitude, pl.longitude) AS distance_miles
  FROM provider_locations pl
  INNER JOIN provider_profiles pp ON pp.id = pl.provider_id
  WHERE pl.is_online = true AND pp.is_online = true
    AND pp.is_verified = true
    AND pl.updated_at > NOW() - INTERVAL '5 minutes'
    -- Exclude providers with invalid coordinates
    AND is_valid_latitude(pl.latitude)
    AND is_valid_longitude(pl.longitude)
    AND (p_service_id IS NULL OR p_service_id = ANY(pp.services))
    AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.provider_id = pl.provider_id
        AND j.status IN ('accepted','en_route','enroute','arrived','in_progress','inprogress'))
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = pl.provider_id AND p.status = 'active')
    AND haversine_distance_miles(p_pickup_lat, p_pickup_lng, pl.latitude, pl.longitude) <= v_effective_radius
  ORDER BY distance_miles ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_nearby_providers(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_nearby_providers(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_nearby_providers(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Tighten jobs RLS — remove blanket "Providers can view pending jobs"
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Providers can view pending jobs" ON public.jobs;

CREATE POLICY "Providers can view assigned or own jobs"
  ON public.jobs
  FOR SELECT
  USING (
    auth.uid() = provider_id
    OR auth.uid() = customer_id
  );
