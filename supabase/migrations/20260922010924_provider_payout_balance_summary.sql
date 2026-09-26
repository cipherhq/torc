-- Provider-facing totals use the same provider_earnings rows and payout_id
-- assignment as the admin payout RPC. Historical payouts without ledger rows
-- remain visible in payout history but do not reduce current unpaid earnings.
CREATE OR REPLACE FUNCTION public.get_my_provider_payout_balance()
RETURNS TABLE (
  total_earned NUMERIC,
  paid_out NUMERIC,
  available_balance NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    COALESCE(SUM(pe.provider_net), 0) AS total_earned,
    COALESCE(SUM(pe.provider_net) FILTER (WHERE pe.payout_id IS NOT NULL), 0) AS paid_out,
    COALESCE(SUM(pe.provider_net) FILTER (WHERE pe.payout_id IS NULL), 0) AS available_balance
  FROM public.provider_earnings AS pe
  WHERE pe.provider_id = (SELECT auth.uid());
$$;

REVOKE ALL ON FUNCTION public.get_my_provider_payout_balance() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_provider_payout_balance() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_provider_payout_balance() TO authenticated;

CREATE INDEX IF NOT EXISTS provider_earnings_provider_balance_idx
  ON public.provider_earnings (provider_id) INCLUDE (provider_net, payout_id);
