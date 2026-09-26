-- External provider payouts are a two-step workflow:
--   pending/processing = earnings reserved for a transfer, not paid
--   paid              = transfer explicitly confirmed by an administrator
-- Failed/voided payouts release their linked earnings back to the payable balance.

CREATE OR REPLACE FUNCTION public.get_my_provider_payout_balance()
RETURNS TABLE (total_earned NUMERIC, paid_out NUMERIC, available_balance NUMERIC)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT
    COALESCE(SUM(pe.provider_net), 0) AS total_earned,
    COALESCE(SUM(pe.provider_net) FILTER (WHERE pp.status = 'paid'), 0) AS paid_out,
    COALESCE(SUM(pe.provider_net) FILTER (
      WHERE pe.payout_id IS NULL OR pp.status IN ('failed', 'voided')
    ), 0) AS available_balance
  FROM public.provider_earnings AS pe
  LEFT JOIN public.provider_payouts AS pp ON pp.id = pe.payout_id
  WHERE pe.provider_id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.get_provider_payout_balances()
RETURNS TABLE(
  provider_id uuid, provider_name text, unpaid_count bigint,
  total_base numeric, total_tips numeric, platform_fee numeric,
  net_unpaid numeric, earliest_earning timestamptz, latest_earning timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT pe.provider_id,
    COALESCE(p.first_name || ' ' || COALESCE(LEFT(p.last_name, 1) || '.', ''), 'Provider'),
    count(*), COALESCE(sum(pe.base_earnings), 0), COALESCE(sum(pe.tip), 0),
    COALESCE(sum(pe.platform_fee), 0), COALESCE(sum(pe.provider_net), 0),
    min(pe.created_at), max(pe.created_at)
  FROM public.provider_earnings pe
  LEFT JOIN public.profiles p ON p.id = pe.provider_id
  LEFT JOIN public.provider_payouts pp ON pp.id = pe.payout_id
  WHERE pe.payout_id IS NULL OR pp.status IN ('failed', 'voided')
  GROUP BY pe.provider_id, p.first_name, p.last_name
  HAVING sum(pe.provider_net) > 0
  ORDER BY sum(pe.provider_net) DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_provider_payout(
  p_provider_id UUID, p_reference_id TEXT,
  p_payment_method TEXT DEFAULT NULL, p_notes TEXT DEFAULT NULL
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_total_earnings NUMERIC; v_total_tips NUMERIC; v_total_fees NUMERIC; v_net_payout NUMERIC;
  v_payout_id UUID; v_unpaid_count INT; v_claimed_count INT;
  v_min_date DATE; v_max_date DATE; v_lock_key BIGINT; v_trimmed_ref TEXT; v_actor UUID;
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
      provider_id, period_start, period_end, total_earnings, total_tips,
      platform_fee, net_payout, status, paid_at, reference_id, payment_method, notes
    ) VALUES (
      p_provider_id, v_min_date, v_max_date, v_total_earnings, v_total_tips,
      v_total_fees, v_net_payout, 'pending', NULL, v_trimmed_ref, p_payment_method, p_notes
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

  INSERT INTO public.admin_audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (v_actor, 'queue_payout', 'provider_payout', v_payout_id,
    jsonb_build_object('provider_id', p_provider_id, 'amount', v_net_payout,
      'reference_id', v_trimmed_ref, 'payment_method', p_payment_method,
      'earnings_count', v_claimed_count, 'status', 'pending'));

  RETURN json_build_object('success', true, 'status', 'pending', 'payout_id', v_payout_id,
    'net_payout', v_net_payout, 'earnings_count', v_claimed_count,
    'message', 'Payout queued. Confirm it after the external transfer succeeds.');
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_provider_payout(
  p_payout_id UUID, p_external_reference_id TEXT DEFAULT NULL
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_actor UUID; v_payout public.provider_payouts%ROWTYPE; v_ref TEXT;
BEGIN
  v_actor := auth.uid();
  IF NOT public.is_admin(v_actor) THEN RETURN json_build_object('success', false, 'error', 'UNAUTHORIZED'); END IF;
  SELECT * INTO v_payout FROM public.provider_payouts WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'PAYOUT_NOT_FOUND'); END IF;
  IF v_payout.status NOT IN ('pending', 'processing') THEN
    RETURN json_build_object('success', false, 'error', 'PAYOUT_NOT_CONFIRMABLE');
  END IF;
  v_ref := COALESCE(NULLIF(TRIM(COALESCE(p_external_reference_id, '')), ''), v_payout.reference_id);
  IF v_ref IS NULL THEN RETURN json_build_object('success', false, 'error', 'REFERENCE_REQUIRED'); END IF;
  UPDATE public.provider_payouts SET status = 'paid', paid_at = now(), reference_id = v_ref WHERE id = p_payout_id;
  INSERT INTO public.admin_audit_logs(actor_id, action, entity_type, entity_id, details)
  VALUES(v_actor, 'confirm_payout', 'provider_payout', p_payout_id,
    jsonb_build_object('provider_id', v_payout.provider_id, 'amount', v_payout.net_payout,
      'reference_id', v_ref, 'previous_status', v_payout.status));
  RETURN json_build_object('success', true, 'status', 'paid', 'payout_id', p_payout_id,
    'net_payout', v_payout.net_payout);
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_provider_payout(p_payout_id UUID, p_reason TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_actor UUID; v_payout public.provider_payouts%ROWTYPE; v_reason TEXT; v_released INT;
BEGIN
  v_actor := auth.uid();
  IF NOT public.is_admin(v_actor) THEN RETURN json_build_object('success', false, 'error', 'UNAUTHORIZED'); END IF;
  v_reason := NULLIF(TRIM(COALESCE(p_reason, '')), '');
  IF v_reason IS NULL OR length(v_reason) < 10 THEN RETURN json_build_object('success', false, 'error', 'REASON_REQUIRED'); END IF;
  SELECT * INTO v_payout FROM public.provider_payouts WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'PAYOUT_NOT_FOUND'); END IF;
  IF v_payout.status NOT IN ('pending', 'processing') THEN RETURN json_build_object('success', false, 'error', 'PAYOUT_NOT_FAILABLE'); END IF;
  UPDATE public.provider_earnings SET payout_id = NULL WHERE payout_id = p_payout_id;
  GET DIAGNOSTICS v_released = ROW_COUNT;
  UPDATE public.provider_payouts SET status = 'failed', notes = concat_ws(E'\n', notes, 'Failure: ' || v_reason) WHERE id = p_payout_id;
  INSERT INTO public.admin_audit_logs(actor_id, action, entity_type, entity_id, details)
  VALUES(v_actor, 'fail_payout', 'provider_payout', p_payout_id,
    jsonb_build_object('provider_id', v_payout.provider_id, 'amount_restored', v_payout.net_payout,
      'earnings_count', v_released, 'reason', v_reason));
  RETURN json_build_object('success', true, 'status', 'failed', 'payout_id', p_payout_id,
    'amount_restored', v_payout.net_payout, 'earnings_count', v_released);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_platform_payout_totals()
RETURNS TABLE(total_provider_net numeric, paid_provider_net numeric, unpaid_provider_net numeric, platform_fees numeric, tips numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT COALESCE(sum(pe.provider_net),0),
    COALESCE(sum(pe.provider_net) FILTER (WHERE pp.status = 'paid'),0),
    COALESCE(sum(pe.provider_net) FILTER (WHERE pe.payout_id IS NULL OR pp.status <> 'paid'),0),
    COALESCE(sum(pe.platform_fee),0), COALESCE(sum(pe.tip),0)
  FROM public.provider_earnings pe LEFT JOIN public.provider_payouts pp ON pp.id = pe.payout_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_provider_payout(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_provider_payout(UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.fail_provider_payout(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fail_provider_payout(UUID, TEXT) TO authenticated;
