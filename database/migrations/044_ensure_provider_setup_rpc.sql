-- Migration 044: Create a SECURITY DEFINER RPC to ensure provider profile rows exist.
-- This bypasses RLS so the client doesn't silently fail when upserting profiles/provider_profiles.
-- Called before document uploads to guarantee FK targets exist.

CREATE OR REPLACE FUNCTION public.ensure_provider_setup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_email text;
  v_first_name text;
  v_last_name text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Pull metadata from auth.users
  SELECT
    u.email,
    COALESCE(u.raw_user_meta_data->>'first_name', ''),
    COALESCE(u.raw_user_meta_data->>'last_name', '')
  INTO v_email, v_first_name, v_last_name
  FROM auth.users u
  WHERE u.id = v_uid;

  -- Ensure profiles row exists
  INSERT INTO public.profiles (id, email, role, first_name, last_name)
  VALUES (v_uid, v_email, 'provider', v_first_name, v_last_name)
  ON CONFLICT (id) DO UPDATE SET
    role = 'provider',
    email = COALESCE(EXCLUDED.email, profiles.email);

  -- Ensure provider_profiles row exists
  INSERT INTO public.provider_profiles (id)
  VALUES (v_uid)
  ON CONFLICT (id) DO NOTHING;
END;
$$;

-- Allow any authenticated user to call this function
GRANT EXECUTE ON FUNCTION public.ensure_provider_setup() TO authenticated;
