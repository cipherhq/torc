-- Admin control plane hardening.

-- ============================================================
-- 1) Fix notification INSERT policy
-- ============================================================
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
CREATE POLICY "Admins and system can insert notifications"
  ON public.notifications
  FOR INSERT
  WITH CHECK (
    current_user IN ('postgres', 'supabase_admin')
    OR is_admin(auth.uid())
  );

-- ============================================================
-- 2) Provider earnings ledger — immutable per-job earning record
-- ============================================================
CREATE TABLE IF NOT EXISTS public.provider_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id),
  provider_id UUID NOT NULL,
  base_earnings NUMERIC(10,2) NOT NULL,
  tip NUMERIC(10,2) NOT NULL DEFAULT 0,
  commission_pct NUMERIC(5,2) NOT NULL,
  platform_fee NUMERIC(10,2) NOT NULL,
  provider_net NUMERIC(10,2) NOT NULL,
  payout_id UUID REFERENCES public.provider_payouts(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT provider_earnings_unique_job UNIQUE (job_id)
);

ALTER TABLE public.provider_earnings ENABLE ROW LEVEL SECURITY;

-- Providers and admins can READ only
CREATE POLICY "Providers can view own earnings" ON public.provider_earnings
  FOR SELECT USING (provider_id = auth.uid());
CREATE POLICY "Admin can read all earnings" ON public.provider_earnings
  FOR SELECT USING (is_admin(auth.uid()));
-- No INSERT/UPDATE/DELETE for authenticated — only SECURITY DEFINER functions

-- ============================================================
-- 3) Lock down provider_payouts — admin SELECT only, no direct DML
-- ============================================================
DROP POLICY IF EXISTS "admin_full_access_payouts" ON public.provider_payouts;
DROP POLICY IF EXISTS "Anyone can insert payouts" ON public.provider_payouts;
DROP POLICY IF EXISTS "Anyone can update payouts" ON public.provider_payouts;
CREATE POLICY "Admin can read all payouts" ON public.provider_payouts
  FOR SELECT USING (is_admin(auth.uid()));
-- Provider SELECT-own preserved (already exists as providers_view_own_payouts)

-- Reference uniqueness for non-null/non-empty references
CREATE UNIQUE INDEX IF NOT EXISTS provider_payouts_reference_id_unique
  ON public.provider_payouts (reference_id) WHERE reference_id IS NOT NULL AND reference_id != '';

-- ============================================================
-- 4) Auto-create earning record on job completion
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_provider_earning_on_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_commission_pct NUMERIC;
  v_base NUMERIC;
  v_tip NUMERIC;
  v_fee NUMERIC;
  v_net NUMERIC;
BEGIN
  IF NEW.status != 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;
  IF NEW.provider_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- Only create earning for paid jobs
  IF NEW.payment_status IS DISTINCT FROM 'paid' THEN
    RETURN NEW;
  END IF;
  -- Idempotent
  IF EXISTS (SELECT 1 FROM provider_earnings WHERE job_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Derive base from authoritative checkout if available
  IF NEW.checkout_id IS NOT NULL THEN
    SELECT COALESCE(c.base_price, NEW.base_price, 0)
    INTO v_base
    FROM checkouts c WHERE c.id = NEW.checkout_id;
    IF v_base IS NULL THEN v_base := COALESCE(NEW.base_price, 0); END IF;
  ELSE
    v_base := COALESCE(NEW.base_price, 0);
  END IF;

  -- Snapshot commission
  SELECT COALESCE((value)::numeric, 15) INTO v_commission_pct
  FROM platform_settings WHERE key = 'platform_commission_pct';
  IF v_commission_pct IS NULL THEN v_commission_pct := 15; END IF;

  v_tip := COALESCE(NEW.tip, 0);
  v_fee := ROUND(v_base * v_commission_pct / 100, 2);
  v_net := v_base - v_fee + v_tip;

  INSERT INTO provider_earnings (job_id, provider_id, base_earnings, tip, commission_pct, platform_fee, provider_net)
  VALUES (NEW.id, NEW.provider_id, v_base, v_tip, v_commission_pct, v_fee, v_net)
  ON CONFLICT (job_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_provider_earning ON public.jobs;
CREATE TRIGGER trg_create_provider_earning
  AFTER UPDATE OF status ON public.jobs
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION public.create_provider_earning_on_completion();

-- ============================================================
-- 5) Server-authoritative provider approval RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.approve_provider(p_provider_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_missing TEXT[];
  v_doc RECORD;
  v_pp RECORD;
  v_profile RECORD;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RETURN json_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  -- Verify profiles row exists and is a provider
  SELECT * INTO v_profile FROM profiles WHERE id = p_provider_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'PROFILE_NOT_FOUND');
  END IF;
  IF v_profile.role != 'provider' THEN
    RETURN json_build_object('success', false, 'error', 'NOT_A_PROVIDER',
      'message', 'Target must have role=provider');
  END IF;

  -- Verify provider_profiles exists
  SELECT * INTO v_pp FROM provider_profiles WHERE id = p_provider_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'PROVIDER_NOT_FOUND');
  END IF;

  -- Idempotent
  IF v_pp.is_verified = true THEN
    RETURN json_build_object('success', true, 'already_verified', true, 'provider_id', p_provider_id);
  END IF;

  -- Check required active document types
  FOR v_doc IN
    SELECT dt.id, dt.name
    FROM document_types dt
    WHERE dt.is_required = true AND dt.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM documents d
        WHERE d.provider_id = p_provider_id
          AND d.type = dt.id
          AND d.status = 'approved'
          AND (d.expires_at IS NULL OR d.expires_at >= CURRENT_DATE)
      )
  LOOP
    v_missing := array_append(v_missing, v_doc.name);
  END LOOP;

  IF v_missing IS NOT NULL AND array_length(v_missing, 1) > 0 THEN
    RETURN json_build_object('success', false, 'error', 'MISSING_DOCUMENTS',
      'missing', v_missing,
      'message', 'Required documents missing/not approved/expired: ' || array_to_string(v_missing, ', '));
  END IF;

  UPDATE provider_profiles SET is_verified = true WHERE id = p_provider_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'UPDATE_FAILED');
  END IF;

  RETURN json_build_object('success', true, 'provider_id', p_provider_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_provider(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_provider(UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public.approve_provider(UUID) TO authenticated;

-- ============================================================
-- 6) Server-authoritative payout creation RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_provider_payout(
  p_provider_id UUID, p_reference_id TEXT,
  p_payment_method TEXT DEFAULT NULL, p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_earnings NUMERIC; v_total_tips NUMERIC;
  v_total_fees NUMERIC; v_net_payout NUMERIC;
  v_payout_id UUID; v_unpaid_count INT; v_claimed_count INT;
  v_min_date DATE; v_max_date DATE;
  v_lock_key BIGINT; v_trimmed_ref TEXT;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RETURN json_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  v_trimmed_ref := NULLIF(TRIM(COALESCE(p_reference_id, '')), '');
  IF v_trimmed_ref IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'REFERENCE_REQUIRED');
  END IF;

  -- Serialize per provider
  v_lock_key := ('x' || left(replace(p_provider_id::text, '-', ''), 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT count(*), COALESCE(sum(base_earnings), 0), COALESCE(sum(tip), 0),
         COALESCE(sum(platform_fee), 0), COALESCE(sum(provider_net), 0),
         min(created_at)::date, max(created_at)::date
  INTO v_unpaid_count, v_total_earnings, v_total_tips, v_total_fees, v_net_payout,
       v_min_date, v_max_date
  FROM provider_earnings
  WHERE provider_id = p_provider_id AND payout_id IS NULL;

  IF v_unpaid_count = 0 OR v_net_payout <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'NO_UNPAID_EARNINGS');
  END IF;

  BEGIN
    INSERT INTO provider_payouts (
      provider_id, period_start, period_end,
      total_earnings, total_tips, platform_fee, net_payout,
      status, paid_at, reference_id, payment_method, notes
    ) VALUES (
      p_provider_id, v_min_date, v_max_date,
      v_total_earnings, v_total_tips, v_total_fees, v_net_payout,
      'paid', now(), v_trimmed_ref, p_payment_method, p_notes
    ) RETURNING id INTO v_payout_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN json_build_object('success', false, 'error', 'DUPLICATE_REFERENCE');
  END;

  UPDATE provider_earnings SET payout_id = v_payout_id
  WHERE provider_id = p_provider_id AND payout_id IS NULL;
  GET DIAGNOSTICS v_claimed_count = ROW_COUNT;

  IF v_claimed_count != v_unpaid_count THEN
    RAISE EXCEPTION 'Claim mismatch: expected %, got %', v_unpaid_count, v_claimed_count;
  END IF;

  RETURN json_build_object('success', true, 'payout_id', v_payout_id,
    'net_payout', v_net_payout, 'earnings_count', v_claimed_count);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_provider_payout(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_provider_payout(UUID, TEXT, TEXT, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.create_provider_payout(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- ============================================================
-- 7) Authoritative payout balance read RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_provider_payout_balances()
RETURNS TABLE(
  provider_id UUID,
  provider_name TEXT,
  unpaid_count BIGINT,
  total_base NUMERIC,
  total_tips NUMERIC,
  platform_fee NUMERIC,
  net_unpaid NUMERIC,
  earliest_earning TIMESTAMPTZ,
  latest_earning TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    pe.provider_id,
    COALESCE(p.first_name || ' ' || COALESCE(LEFT(p.last_name, 1) || '.', ''), 'Provider') as provider_name,
    count(*) as unpaid_count,
    COALESCE(sum(pe.base_earnings), 0) as total_base,
    COALESCE(sum(pe.tip), 0) as total_tips,
    COALESCE(sum(pe.platform_fee), 0) as platform_fee,
    COALESCE(sum(pe.provider_net), 0) as net_unpaid,
    min(pe.created_at) as earliest_earning,
    max(pe.created_at) as latest_earning
  FROM provider_earnings pe
  LEFT JOIN profiles p ON p.id = pe.provider_id
  WHERE pe.payout_id IS NULL
  GROUP BY pe.provider_id, p.first_name, p.last_name
  HAVING sum(pe.provider_net) > 0
  ORDER BY sum(pe.provider_net) DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_provider_payout_balances() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_provider_payout_balances() FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_provider_payout_balances() TO authenticated;

-- ============================================================
-- 8) Settings validation trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_platform_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE v_num NUMERIC;
BEGIN
  -- Only validate active authoritative settings
  IF NEW.key = 'platform_commission_pct' THEN
    v_num := (NEW.value)::numeric;
    IF v_num < 0 OR v_num > 100 THEN
      RAISE EXCEPTION 'platform_commission_pct must be 0-100' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.key = 'tax_rate_pct' THEN
    v_num := (NEW.value)::numeric;
    IF v_num < 0 OR v_num > 50 THEN
      RAISE EXCEPTION 'tax_rate_pct must be 0-50' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.key = 'hazard_fee' THEN
    v_num := (NEW.value)::numeric;
    IF v_num < 0 THEN
      RAISE EXCEPTION 'hazard_fee must be non-negative' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.key = 'scheduling_fee' THEN
    v_num := (NEW.value)::numeric;
    IF v_num < 0 THEN
      RAISE EXCEPTION 'scheduling_fee must be non-negative' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.key = 'max_job_radius' THEN
    v_num := (NEW.value)::numeric;
    IF v_num <= 0 OR v_num > 500 THEN
      RAISE EXCEPTION 'max_job_radius must be 1-500' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN invalid_text_representation THEN
  RAISE EXCEPTION 'Invalid numeric value for setting %', NEW.key USING ERRCODE = '23514';
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_platform_settings ON public.platform_settings;
CREATE TRIGGER trg_validate_platform_settings
  BEFORE INSERT OR UPDATE ON public.platform_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_platform_settings();

-- ============================================================
-- 9) Max job radius enforcement in get_nearby_providers
-- ============================================================
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
    AND pl.updated_at > NOW() - INTERVAL '5 minutes'
    AND (p_service_id IS NULL OR p_service_id = ANY(pp.services))
    AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.provider_id = pl.provider_id
        AND j.status IN ('accepted','en_route','enroute','arrived','in_progress','inprogress'))
    AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = pl.provider_id AND p.status = 'suspended')
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
