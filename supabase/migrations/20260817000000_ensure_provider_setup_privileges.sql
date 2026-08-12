-- Fix: ensure_provider_setup privilege + overload cleanup.
--
-- Migration 044 created a zero-argument overload (RETURNS void, no role check).
-- Migration 20260312000146 replaced it with a 3-arg overload (RETURNS JSONB,
-- role-escalation protection) but:
--   a) did not drop the old overload — both remain callable
--   b) did not REVOKE/GRANT for the new signature — PUBLIC can execute
--
-- This migration:
--   1. Drops the obsolete zero-arg overload (no role protection, no callers)
--   2. Restricts the canonical 3-arg overload to authenticated only

-- 1. Drop the obsolete zero-arg overload
DROP FUNCTION IF EXISTS public.ensure_provider_setup();

-- 2. Restrict the canonical 3-arg version
REVOKE EXECUTE ON FUNCTION public.ensure_provider_setup(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_provider_setup(TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_provider_setup(TEXT, TEXT, TEXT) TO authenticated;
