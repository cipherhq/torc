\set ON_ERROR_STOP on

BEGIN;

-- The CI auth.users stub does not install Supabase's production trigger.
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
   '{"role":"provider","first_name":"Provider"}'::jsonb);

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
