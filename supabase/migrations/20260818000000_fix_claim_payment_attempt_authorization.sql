-- Fix: claim_payment_attempt internal JWT-GUC check is incompatible with
-- modern Supabase keys (sb_secret_...) which are NOT JWTs.
--
-- The function checked:
--   current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
-- but modern keys do not set this GUC, causing "Unauthorized" on every call.
--
-- Authorization is correctly enforced by PostgreSQL EXECUTE privileges:
--   PUBLIC, anon, authenticated: REVOKED
--   service_role: GRANTED
--
-- This migration removes the redundant internal GUC check while preserving
-- all other behavior (signature, SECURITY DEFINER, idempotency, unique-violation).

CREATE OR REPLACE FUNCTION public.claim_payment_attempt(
  p_checkout_id UUID,
  p_attempt_number INTEGER
)
RETURNS TEXT -- returns the idempotency key
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key TEXT;
BEGIN
  -- Authorization enforced by EXECUTE privilege (service_role only).
  -- No internal JWT-GUC check — modern Supabase keys are not JWTs.

  v_key := p_checkout_id::text || ':' || p_attempt_number::text;

  INSERT INTO payment_attempts (checkout_id, attempt_number, stripe_idempotency_key, status)
  VALUES (p_checkout_id, p_attempt_number, v_key, 'pending');

  RETURN v_key;
EXCEPTION WHEN unique_violation THEN
  -- Concurrent retry tried the same attempt — return the key anyway
  SELECT stripe_idempotency_key INTO v_key
  FROM payment_attempts
  WHERE checkout_id = p_checkout_id AND attempt_number = p_attempt_number;
  RETURN v_key;
END;
$$;

-- Enforce privileges: service_role only
REVOKE EXECUTE ON FUNCTION public.claim_payment_attempt(UUID, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_payment_attempt(UUID, INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_payment_attempt(UUID, INTEGER) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_payment_attempt(UUID, INTEGER) TO service_role;
