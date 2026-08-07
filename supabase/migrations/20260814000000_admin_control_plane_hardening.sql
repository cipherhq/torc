-- Admin control plane hardening.
--
-- 1. Fix notification INSERT policy (currently WITH CHECK (true) = any user can spoof)
-- 2. Add provider_earnings ledger table for immutable earning records
-- 3. Add server-authoritative provider approval RPC
-- 4. Add server-authoritative payout creation RPC

-- ============================================================
-- 1) Fix notification INSERT policy
-- ============================================================
-- Current: anyone can INSERT notifications. Fix: only admin or service_role.
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

CREATE POLICY "Providers can view own earnings" ON public.provider_earnings
  FOR SELECT USING (provider_id = auth.uid());

CREATE POLICY "Admin full access earnings" ON public.provider_earnings
  FOR ALL USING (is_admin(auth.uid()));

-- No authenticated INSERT/UPDATE — only SECURITY DEFINER functions create earnings

-- ============================================================
-- 3) Auto-create earning record on job completion
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
  -- Only fire on status change TO completed
  IF NEW.status != 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  -- Must have a provider
  IF NEW.provider_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip if earning already exists (idempotent)
  IF EXISTS (SELECT 1 FROM provider_earnings WHERE job_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Get current commission rate (snapshot at completion time)
  SELECT COALESCE((value)::numeric, 15)
  INTO v_commission_pct
  FROM platform_settings
  WHERE key = 'platform_commission_pct';

  IF v_commission_pct IS NULL THEN v_commission_pct := 15; END IF;

  v_base := COALESCE(NEW.base_price, 0);
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
-- 4) Server-authoritative provider approval RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.approve_provider(
  p_provider_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_missing TEXT[];
  v_doc RECORD;
BEGIN
  -- Admin only
  IF NOT is_admin(auth.uid()) THEN
    RETURN json_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  -- Check all required active document types have approved documents
  FOR v_doc IN
    SELECT dt.id, dt.name
    FROM document_types dt
    WHERE dt.is_required = true AND dt.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM documents d
        WHERE d.provider_id = p_provider_id
          AND d.document_type = dt.id
          AND d.status = 'approved'
          AND (d.expires_at IS NULL OR d.expires_at > now())
      )
  LOOP
    v_missing := array_append(v_missing, v_doc.name);
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RETURN json_build_object('success', false, 'error', 'MISSING_DOCUMENTS',
      'missing', v_missing,
      'message', 'Required documents are missing, not approved, or expired: ' || array_to_string(v_missing, ', '));
  END IF;

  -- Set verified
  UPDATE provider_profiles SET is_verified = true WHERE id = p_provider_id;

  RETURN json_build_object('success', true, 'provider_id', p_provider_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_provider(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_provider(UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public.approve_provider(UUID) TO authenticated;


-- ============================================================
-- 5) Server-authoritative payout creation RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_provider_payout(
  p_provider_id UUID,
  p_reference_id TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_earnings NUMERIC := 0;
  v_total_tips NUMERIC := 0;
  v_total_fees NUMERIC := 0;
  v_net_payout NUMERIC := 0;
  v_payout_id UUID;
  v_unpaid_count INT;
  v_min_date DATE;
  v_max_date DATE;
BEGIN
  -- Admin only
  IF NOT is_admin(auth.uid()) THEN
    RETURN json_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  -- Duplicate reference protection
  IF p_reference_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM provider_payouts WHERE reference_id = p_reference_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'DUPLICATE_REFERENCE',
      'message', 'A payout with this reference already exists');
  END IF;

  -- Calculate unpaid balance from authoritative earnings ledger
  SELECT count(*), COALESCE(sum(base_earnings), 0), COALESCE(sum(tip), 0),
         COALESCE(sum(platform_fee), 0), COALESCE(sum(provider_net), 0),
         min(created_at)::date, max(created_at)::date
  INTO v_unpaid_count, v_total_earnings, v_total_tips, v_total_fees, v_net_payout,
       v_min_date, v_max_date
  FROM provider_earnings
  WHERE provider_id = p_provider_id AND payout_id IS NULL;

  IF v_unpaid_count = 0 OR v_net_payout <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'NO_UNPAID_EARNINGS',
      'message', 'Provider has no unpaid earnings');
  END IF;

  -- Create payout record
  INSERT INTO provider_payouts (
    provider_id, period_start, period_end,
    total_earnings, total_tips, platform_fee, net_payout,
    status, paid_at, reference_id, payment_method, notes
  ) VALUES (
    p_provider_id, v_min_date, v_max_date,
    v_total_earnings, v_total_tips, v_total_fees, v_net_payout,
    'paid', now(), p_reference_id, p_payment_method, p_notes
  ) RETURNING id INTO v_payout_id;

  -- Link earnings to this payout (prevents double-payment)
  UPDATE provider_earnings
  SET payout_id = v_payout_id
  WHERE provider_id = p_provider_id AND payout_id IS NULL;

  RETURN json_build_object('success', true, 'payout_id', v_payout_id,
    'net_payout', v_net_payout, 'earnings_count', v_unpaid_count);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_provider_payout(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_provider_payout(UUID, TEXT, TEXT, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.create_provider_payout(UUID, TEXT, TEXT, TEXT) TO authenticated;
