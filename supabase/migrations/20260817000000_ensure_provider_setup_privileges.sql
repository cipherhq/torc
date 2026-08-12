-- Fix: ensure_provider_setup was replaced with a 3-arg signature in
-- 20260312000146 but no REVOKE/GRANT was issued for the new signature.
-- This left the function executable by PUBLIC (including anon).
--
-- Restrict to authenticated only, matching the original 044 migration intent.

-- Revoke from PUBLIC and anon for all overloaded signatures
REVOKE EXECUTE ON FUNCTION public.ensure_provider_setup() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_provider_setup() FROM anon;
REVOKE EXECUTE ON FUNCTION public.ensure_provider_setup(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_provider_setup(TEXT, TEXT, TEXT) FROM anon;

-- Grant to authenticated only
GRANT EXECUTE ON FUNCTION public.ensure_provider_setup() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_provider_setup(TEXT, TEXT, TEXT) TO authenticated;

-- service_role retains implicit superuser access; no explicit grant needed.
