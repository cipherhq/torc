-- Canonicalize ensure_provider_setup: one overload, correct privileges.
--
-- History:
--   044: Created zero-arg overload (RETURNS void, no role check)
--   20260312000146: Replaced with 3-arg overload (RETURNS JSONB, role check)
--     but did not drop old overload or issue REVOKE/GRANT
--
-- This migration:
--   1. Ensures the canonical 3-arg version exists (CREATE OR REPLACE)
--   2. Drops the obsolete zero-arg overload if present
--   3. Restricts to authenticated only

-- 1. Ensure canonical 3-arg version exists (idempotent)
CREATE OR REPLACE FUNCTION public.ensure_provider_setup(
  p_first_name TEXT DEFAULT NULL,
  p_last_name TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_current_role TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- SECURITY: Check if user is already a different role (customer/admin)
  SELECT role INTO v_current_role FROM profiles WHERE id = v_user_id;
  IF v_current_role IS NOT NULL AND v_current_role != 'provider' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot change role. You are registered as a ' || v_current_role);
  END IF;

  -- Upsert profiles row
  INSERT INTO profiles (id, role, first_name, last_name, phone, email)
  SELECT v_user_id, 'provider',
    COALESCE(p_first_name, raw_user_meta_data->>'first_name'),
    COALESCE(p_last_name, raw_user_meta_data->>'last_name'),
    COALESCE(p_phone, raw_user_meta_data->>'phone'),
    email
  FROM auth.users WHERE id = v_user_id
  ON CONFLICT (id) DO UPDATE SET
    role = 'provider',
    first_name = COALESCE(EXCLUDED.first_name, profiles.first_name),
    last_name = COALESCE(EXCLUDED.last_name, profiles.last_name),
    phone = COALESCE(EXCLUDED.phone, profiles.phone),
    updated_at = NOW();

  -- Upsert provider_profiles row
  INSERT INTO provider_profiles (id) VALUES (v_user_id)
  ON CONFLICT (id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'user_id', v_user_id);
END;
$$;

-- 2. Drop the obsolete zero-arg overload (no role protection, RETURNS void)
DROP FUNCTION IF EXISTS public.ensure_provider_setup();

-- 3. Restrict the canonical 3-arg version
REVOKE EXECUTE ON FUNCTION public.ensure_provider_setup(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_provider_setup(TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_provider_setup(TEXT, TEXT, TEXT) TO authenticated;
