-- Payout records are ledger events, not bank transfers. Keep corrections
-- append-only in the audit trail and restore earnings only after an admin
-- confirms the external payment was never sent or was returned.
ALTER TABLE public.provider_payouts
  DROP CONSTRAINT IF EXISTS provider_payouts_status_check;
ALTER TABLE public.provider_payouts
  ADD CONSTRAINT provider_payouts_status_check
  CHECK (status IN ('pending', 'processing', 'paid', 'failed', 'voided'));

ALTER TABLE public.provider_payouts
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS void_reason TEXT,
  ADD COLUMN IF NOT EXISTS reversal_reference_id TEXT;

CREATE OR REPLACE FUNCTION public.create_provider_payout(
  p_provider_id UUID, p_reference_id TEXT,
  p_payment_method TEXT DEFAULT NULL, p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total_earnings NUMERIC; v_total_tips NUMERIC;
  v_total_fees NUMERIC; v_net_payout NUMERIC;
  v_payout_id UUID; v_unpaid_count INT; v_claimed_count INT;
  v_min_date DATE; v_max_date DATE;
  v_lock_key BIGINT; v_trimmed_ref TEXT; v_actor UUID;
BEGIN
  v_actor := auth.uid();
  IF COALESCE(public.is_admin(v_actor), false) IS NOT TRUE THEN
    RETURN json_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  v_trimmed_ref := NULLIF(TRIM(COALESCE(p_reference_id, '')), '');
  IF v_trimmed_ref IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'REFERENCE_REQUIRED');
  END IF;

  v_lock_key := ('x' || left(replace(p_provider_id::text, '-', ''), 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT count(*), COALESCE(sum(base_earnings), 0), COALESCE(sum(tip), 0),
         COALESCE(sum(platform_fee), 0), COALESCE(sum(provider_net), 0),
         min(created_at)::date, max(created_at)::date
  INTO v_unpaid_count, v_total_earnings, v_total_tips, v_total_fees,
       v_net_payout, v_min_date, v_max_date
  FROM public.provider_earnings
  WHERE provider_id = p_provider_id AND payout_id IS NULL;

  IF v_unpaid_count = 0 OR v_net_payout <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'NO_UNPAID_EARNINGS');
  END IF;

  BEGIN
    INSERT INTO public.provider_payouts (
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

  UPDATE public.provider_earnings SET payout_id = v_payout_id
  WHERE provider_id = p_provider_id AND payout_id IS NULL;
  GET DIAGNOSTICS v_claimed_count = ROW_COUNT;
  IF v_claimed_count != v_unpaid_count THEN
    RAISE EXCEPTION 'Claim mismatch: expected %, got %', v_unpaid_count, v_claimed_count;
  END IF;

  -- Audit is in the same transaction: no payout is recorded if this fails.
  INSERT INTO public.admin_audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (v_actor, 'process_payout', 'provider_payout', v_payout_id,
    jsonb_build_object('provider_id', p_provider_id, 'amount', v_net_payout,
      'reference_id', v_trimmed_ref, 'payment_method', p_payment_method,
      'earnings_count', v_claimed_count));

  RETURN json_build_object('success', true, 'payout_id', v_payout_id,
    'net_payout', v_net_payout, 'earnings_count', v_claimed_count);
END;
$$;

REVOKE ALL ON FUNCTION public.create_provider_payout(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_provider_payout(UUID, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.void_provider_payout(
  p_payout_id UUID, p_reason TEXT, p_confirmation TEXT,
  p_reversal_reference_id TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor UUID; v_payout public.provider_payouts%ROWTYPE;
  v_lock_key BIGINT; v_linked_count INT; v_released_count INT;
  v_linked_amount NUMERIC; v_reason TEXT;
BEGIN
  v_actor := auth.uid();
  IF COALESCE(public.is_admin(v_actor), false) IS NOT TRUE THEN
    RETURN json_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;
  IF p_confirmation IS DISTINCT FROM 'FUNDS_NOT_SENT_OR_RETURNED' THEN
    RETURN json_build_object('success', false, 'error', 'CONFIRMATION_REQUIRED');
  END IF;
  v_reason := NULLIF(TRIM(COALESCE(p_reason, '')), '');
  IF v_reason IS NULL OR length(v_reason) < 20 THEN
    RETURN json_build_object('success', false, 'error', 'REASON_REQUIRED');
  END IF;

  SELECT * INTO v_payout FROM public.provider_payouts WHERE id = p_payout_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'PAYOUT_NOT_FOUND');
  END IF;

  v_lock_key := ('x' || left(replace(v_payout.provider_id::text, '-', ''), 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);
  SELECT * INTO v_payout FROM public.provider_payouts WHERE id = p_payout_id FOR UPDATE;
  IF v_payout.status <> 'paid' THEN
    RETURN json_build_object('success', false, 'error', 'PAYOUT_NOT_PAID');
  END IF;

  SELECT count(*), COALESCE(sum(provider_net), 0)
  INTO v_linked_count, v_linked_amount
  FROM public.provider_earnings WHERE payout_id = p_payout_id;
  IF v_linked_count = 0 OR v_linked_amount IS DISTINCT FROM v_payout.net_payout THEN
    RETURN json_build_object('success', false, 'error', 'LEDGER_MISMATCH_OR_LEGACY_PAYOUT');
  END IF;

  UPDATE public.provider_earnings SET payout_id = NULL WHERE payout_id = p_payout_id;
  GET DIAGNOSTICS v_released_count = ROW_COUNT;
  IF v_released_count != v_linked_count THEN
    RAISE EXCEPTION 'Release mismatch: expected %, got %', v_linked_count, v_released_count;
  END IF;

  UPDATE public.provider_payouts SET
    status = 'voided', voided_at = now(), voided_by = v_actor,
    void_reason = v_reason,
    reversal_reference_id = NULLIF(TRIM(COALESCE(p_reversal_reference_id, '')), '')
  WHERE id = p_payout_id;

  INSERT INTO public.admin_audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (v_actor, 'void_payout', 'provider_payout', p_payout_id,
    jsonb_build_object('provider_id', v_payout.provider_id,
      'amount_restored', v_linked_amount, 'earnings_count', v_linked_count,
      'original_reference_id', v_payout.reference_id, 'reason', v_reason,
      'external_reversal_reference_id', NULLIF(TRIM(COALESCE(p_reversal_reference_id, '')), ''),
      'funds_confirmed_not_sent_or_returned', true));

  RETURN json_build_object('success', true, 'payout_id', p_payout_id,
    'amount_restored', v_linked_amount, 'earnings_count', v_linked_count);
END;
$$;

REVOKE ALL ON FUNCTION public.void_provider_payout(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_provider_payout(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- Finance cards use one aggregate over the same earnings rows as payouts.
CREATE OR REPLACE FUNCTION public.get_platform_payout_totals()
RETURNS TABLE (
  total_provider_net NUMERIC,
  paid_provider_net NUMERIC,
  unpaid_provider_net NUMERIC,
  platform_fees NUMERIC,
  tips NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(public.is_admin(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(pe.provider_net), 0),
    COALESCE(SUM(pe.provider_net) FILTER (WHERE pe.payout_id IS NOT NULL), 0),
    COALESCE(SUM(pe.provider_net) FILTER (WHERE pe.payout_id IS NULL), 0),
    COALESCE(SUM(pe.platform_fee), 0),
    COALESCE(SUM(pe.tip), 0)
  FROM public.provider_earnings pe;
END;
$$;

REVOKE ALL ON FUNCTION public.get_platform_payout_totals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_platform_payout_totals() TO authenticated;
