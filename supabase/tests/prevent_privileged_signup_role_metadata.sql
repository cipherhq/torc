\set ON_ERROR_STOP on

BEGIN;

-- Create the trigger as the migration/database owner after the migration has
-- revoked API-role EXECUTE. The inserts below verify the existing trigger
-- mechanism continues to work without exposing the function as an RPC.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- A protected resource gives the test a real RLS authorization boundary.
CREATE TABLE public.lane_a_admin_probe (
  id integer PRIMARY KEY,
  secret text NOT NULL
);
ALTER TABLE public.lane_a_admin_probe ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.lane_a_admin_probe TO authenticated;
CREATE POLICY lane_a_admin_only ON public.lane_a_admin_probe
  FOR SELECT TO authenticated
  USING (public.is_admin((SELECT auth.uid())));
INSERT INTO public.lane_a_admin_probe VALUES (1, 'not-visible-to-public-signups');

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'lane-a-admin@example.invalid',
   '{"role":"admin","first_name":"Attempted Admin"}'::jsonb),
  ('a0000000-0000-0000-0000-000000000002', 'lane-a-support@example.invalid',
   '{"role":"support","first_name":"Attempted Support"}'::jsonb),
  ('a0000000-0000-0000-0000-000000000003', 'lane-a-customer@example.invalid',
   '{"role":"customer","first_name":"Customer"}'::jsonb),
  ('a0000000-0000-0000-0000-000000000004', 'lane-a-provider@example.invalid',
   '{"role":"provider","first_name":"Provider"}'::jsonb),
  ('a0000000-0000-0000-0000-000000000005', 'lane-a-invalid@example.invalid',
   '{"role":"superuser"}'::jsonb),
  ('a0000000-0000-0000-0000-000000000006', 'lane-a-no-role@example.invalid',
   '{}'::jsonb);

DO $$
BEGIN
  IF (SELECT role::text FROM public.profiles WHERE id='a0000000-0000-0000-0000-000000000001') <> 'customer' THEN
    RAISE EXCEPTION 'admin metadata created a privileged profile';
  END IF;
  IF (SELECT role::text FROM public.profiles WHERE id='a0000000-0000-0000-0000-000000000002') <> 'customer' THEN
    RAISE EXCEPTION 'support metadata created a privileged profile';
  END IF;
  IF (SELECT role::text FROM public.profiles WHERE id='a0000000-0000-0000-0000-000000000003') <> 'customer' THEN
    RAISE EXCEPTION 'customer onboarding role was not preserved';
  END IF;
  IF (SELECT role::text FROM public.profiles WHERE id='a0000000-0000-0000-0000-000000000004') <> 'provider' THEN
    RAISE EXCEPTION 'provider onboarding role was not preserved';
  END IF;
  IF (SELECT role::text FROM public.profiles WHERE id='a0000000-0000-0000-0000-000000000005') <> 'customer' THEN
    RAISE EXCEPTION 'invalid role metadata did not safely default to customer';
  END IF;
  IF (SELECT role::text FROM public.profiles WHERE id='a0000000-0000-0000-0000-000000000006') <> 'customer' THEN
    RAISE EXCEPTION 'missing role metadata did not safely default to customer';
  END IF;
  IF public.is_admin('a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'admin metadata passed authoritative is_admin check';
  END IF;
  IF public.is_admin('a0000000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'support metadata passed authoritative is_admin check';
  END IF;
  IF has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE') THEN
    RAISE EXCEPTION 'trigger function remains exposed as an RPC';
  END IF;
END;
$$;

-- A trigger retry/upsert must preserve roles assigned by trusted server-side
-- workflows, even if incoming metadata claims a different role.
UPDATE public.profiles SET role='admin'
WHERE id='a0000000-0000-0000-0000-000000000003';
UPDATE public.profiles SET role='support'
WHERE id='a0000000-0000-0000-0000-000000000004';
CREATE TABLE auth.users_trigger_retry (
  id uuid,
  email text,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TRIGGER on_auth_user_retry
  AFTER INSERT ON auth.users_trigger_retry
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
INSERT INTO auth.users_trigger_retry VALUES
  ('a0000000-0000-0000-0000-000000000003', 'retry-admin@example.invalid', '{"role":"customer"}'),
  ('a0000000-0000-0000-0000-000000000004', 'retry-support@example.invalid', '{"role":"admin"}');
DO $$
BEGIN
  IF (SELECT role::text FROM public.profiles WHERE id='a0000000-0000-0000-0000-000000000003') <> 'admin' THEN
    RAISE EXCEPTION 'existing admin role changed during trigger conflict';
  END IF;
  IF (SELECT role::text FROM public.profiles WHERE id='a0000000-0000-0000-0000-000000000004') <> 'support' THEN
    RAISE EXCEPTION 'existing support role changed during trigger conflict';
  END IF;
END;
$$;

-- If profile creation fails, the Auth insert must fail atomically (not leave
-- a valid Auth identity without the profile used for authorization).
ALTER TABLE public.profiles ADD CONSTRAINT lane_a_force_profile_failure
  CHECK (id <> 'a0000000-0000-0000-0000-000000000099'::uuid);
DO $$
BEGIN
  BEGIN
    INSERT INTO auth.users VALUES
      ('a0000000-0000-0000-0000-000000000099', 'profile-failure@example.invalid', '{}');
    RAISE EXCEPTION 'Auth signup succeeded despite profile creation failure';
  EXCEPTION WHEN check_violation THEN
    NULL; -- expected; the exception must escape the trigger and roll back Auth
  END;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id='a0000000-0000-0000-0000-000000000099') THEN
    RAISE EXCEPTION 'failed signup left an Auth identity without a profile';
  END IF;
END;
$$;

-- Simulate the JWT subject issued for the attempted admin signup. The caller's
-- user_metadata still says admin, but database authorization must use profiles.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.lane_a_admin_probe) <> 0 THEN
    RAISE EXCEPTION 'attempted admin signup crossed the admin-only RLS boundary';
  END IF;
END;
$$;
RESET ROLE;

ROLLBACK;
