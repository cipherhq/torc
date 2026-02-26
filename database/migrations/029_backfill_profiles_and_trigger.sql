-- Ensure handle_new_user trigger exists so future signups always get a profile row.
-- Then backfill profiles for any auth.users that are currently missing one.

-- 1) Create or replace the trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, first_name, last_name, phone, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'customer')::user_role
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = CASE WHEN EXCLUDED.full_name != '' THEN EXCLUDED.full_name ELSE public.profiles.full_name END,
    first_name = CASE WHEN EXCLUDED.first_name != '' THEN EXCLUDED.first_name ELSE public.profiles.first_name END,
    last_name = CASE WHEN EXCLUDED.last_name != '' THEN EXCLUDED.last_name ELSE public.profiles.last_name END,
    phone = CASE WHEN EXCLUDED.phone != '' THEN EXCLUDED.phone ELSE public.profiles.phone END,
    role = CASE WHEN EXCLUDED.role != 'customer'::user_role THEN EXCLUDED.role ELSE public.profiles.role END,
    updated_at = NOW();
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'handle_new_user error: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- 2) Re-create the trigger (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 3) Backfill: insert a profile row for every auth.user that doesn't have one yet
INSERT INTO public.profiles (id, email, full_name, first_name, last_name, role, created_at)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', ''),
  COALESCE(u.raw_user_meta_data->>'first_name', ''),
  COALESCE(u.raw_user_meta_data->>'last_name', ''),
  COALESCE(u.raw_user_meta_data->>'role', 'customer')::user_role,
  u.created_at
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- 4) Sync phone from auth metadata into profiles where profiles.phone is empty
-- (The provider app falls back to user_metadata.phone, so the phone shows in the
--  app but not in admin which only reads profiles.phone)
UPDATE public.profiles p
SET phone = u.raw_user_meta_data->>'phone',
    updated_at = NOW()
FROM auth.users u
WHERE u.id = p.id
  AND (p.phone IS NULL OR p.phone = '')
  AND u.raw_user_meta_data->>'phone' IS NOT NULL
  AND u.raw_user_meta_data->>'phone' != '';

-- 5) Ensure the "Anyone can view profiles" SELECT policy exists
-- (Without this, the admin-web anon key can't read profiles at all)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Anyone can view profiles'
  ) THEN
    CREATE POLICY "Anyone can view profiles"
      ON public.profiles FOR SELECT USING (true);
  END IF;
END $$;
