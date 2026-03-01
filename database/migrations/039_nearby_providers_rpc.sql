-- Tiered Radius Dispatch: find eligible providers within a given radius
-- Used by customer Matching.tsx to send jobs to nearby providers first

CREATE OR REPLACE FUNCTION public.get_nearby_providers(
  p_pickup_lat DOUBLE PRECISION,
  p_pickup_lng DOUBLE PRECISION,
  p_radius_miles DOUBLE PRECISION,
  p_service_id TEXT DEFAULT NULL
)
RETURNS TABLE (
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
    -- Haversine formula (miles)
    (3958.8 * 2 * ASIN(SQRT(
      POWER(SIN(RADIANS(p_pickup_lat - pl.latitude) / 2), 2) +
      COS(RADIANS(pl.latitude)) * COS(RADIANS(p_pickup_lat)) *
      POWER(SIN(RADIANS(p_pickup_lng - pl.longitude) / 2), 2)
    ))) AS distance_miles
  FROM provider_locations pl
  INNER JOIN provider_profiles pp ON pp.id = pl.provider_id
  WHERE
    -- Must be online in both tables
    pl.is_online = true
    AND pp.is_online = true
    -- Location must be recent (stale > 5 min = effectively offline)
    AND pl.updated_at > NOW() - INTERVAL '5 minutes'
    -- Service type filter (skip if NULL)
    AND (p_service_id IS NULL OR p_service_id = ANY(pp.services))
    -- Active job cap: skip providers with an active job
    AND NOT EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.provider_id = pl.provider_id
        AND j.status IN ('accepted', 'en_route', 'enroute', 'arrived', 'in_progress', 'inprogress')
    )
    -- Distance filter
    AND (3958.8 * 2 * ASIN(SQRT(
      POWER(SIN(RADIANS(p_pickup_lat - pl.latitude) / 2), 2) +
      COS(RADIANS(pl.latitude)) * COS(RADIANS(p_pickup_lat)) *
      POWER(SIN(RADIANS(p_pickup_lng - pl.longitude) / 2), 2)
    ))) <= p_radius_miles
  ORDER BY distance_miles ASC;
END;
$$;

-- Grant access to authenticated users (customers calling from the app)
GRANT EXECUTE ON FUNCTION public.get_nearby_providers TO authenticated;
