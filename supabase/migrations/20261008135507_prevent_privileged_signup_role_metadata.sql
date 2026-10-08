-- Public Auth sign-up metadata is controlled by the caller. It may select the
-- two public onboarding audiences, but it must never create a privileged role.
-- Admin and support membership is managed by trusted server-side workflows.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.user_role;
  v_terms_accepted_at timestamptz;
  v_terms_version text;
BEGIN
  v_role := CASE lower(btrim(COALESCE(NEW.raw_user_meta_data->>'role', '')))
    WHEN 'provider' THEN 'provider'::public.user_role
    ELSE 'customer'::public.user_role
  END;

  v_terms_version := NULLIF(NEW.raw_user_meta_data->>'terms_version', '');
  v_terms_accepted_at := CASE
    WHEN COALESCE(NEW.raw_user_meta_data->>'accepted_terms', 'false') = 'true' THEN now()
    ELSE NULL
  END;

  INSERT INTO public.profiles (
    id, email, full_name, first_name, last_name, phone, role,
    terms_accepted_at, terms_version
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    v_role,
    v_terms_accepted_at,
    v_terms_version
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = CASE WHEN EXCLUDED.full_name <> '' THEN EXCLUDED.full_name ELSE public.profiles.full_name END,
    first_name = CASE WHEN EXCLUDED.first_name <> '' THEN EXCLUDED.first_name ELSE public.profiles.first_name END,
    last_name = CASE WHEN EXCLUDED.last_name <> '' THEN EXCLUDED.last_name ELSE public.profiles.last_name END,
    phone = CASE WHEN EXCLUDED.phone <> '' THEN EXCLUDED.phone ELSE public.profiles.phone END,
    -- Trigger retries and user metadata updates must never mutate authorization.
    role = public.profiles.role,
    terms_accepted_at = COALESCE(public.profiles.terms_accepted_at, EXCLUDED.terms_accepted_at),
    terms_version = COALESCE(EXCLUDED.terms_version, public.profiles.terms_version),
    updated_at = now();

  -- Fail closed: auth.users and its profile are one transaction. If profile
  -- creation fails, abort signup instead of leaving an authenticated user
  -- without the profile row required by application authorization.
  RETURN NEW;
END;
$$;

-- This function is invoked only by the auth.users trigger. Do not expose the
-- SECURITY DEFINER function as a Data API RPC.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;
