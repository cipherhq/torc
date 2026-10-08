\set ON_ERROR_STOP on
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TYPE public.user_role AS ENUM ('customer','provider','admin','support');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  role public.user_role NOT NULL,
  full_name text,
  first_name text,
  last_name text,
  phone text,
  avatar_url text
);
CREATE TABLE public.provider_profiles (
  id uuid PRIMARY KEY REFERENCES public.profiles(id),
  services text[], vehicle_make text, vehicle_model text, vehicle_year integer,
  vehicle_plate text, license_number text, is_verified boolean, is_online boolean,
  rating numeric(3,2), total_jobs integer, total_earnings numeric(10,2),
  acceptance_rate numeric(5,2), created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.jobs (
  id uuid PRIMARY KEY, customer_id uuid NOT NULL, provider_id uuid,
  status text NOT NULL
);
CREATE TABLE public.documents (
  id uuid PRIMARY KEY, provider_id uuid NOT NULL, document_type text NOT NULL,
  storage_path text NOT NULL
);

CREATE FUNCTION public.is_support_or_admin(actor_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id=actor_id AND role IN ('admin','support'))
$$;
CREATE FUNCTION public.is_admin(actor_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id=actor_id AND role='admin')
$$;

ALTER TABLE public.provider_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Provider can view own profile" ON public.provider_profiles FOR SELECT
  USING (auth.uid() = id);
CREATE POLICY "Provider can update own profile" ON public.provider_profiles FOR UPDATE
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Provider can insert own profile" ON public.provider_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);
CREATE POLICY "Authenticated users can view providers" ON public.provider_profiles FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "Support can view provider profiles" ON public.provider_profiles FOR SELECT TO authenticated
  USING (public.is_support_or_admin(auth.uid()));
CREATE POLICY admin_full_access_provider_profiles ON public.provider_profiles FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_profiles TO anon, authenticated;
GRANT SELECT ON public.jobs, public.profiles TO authenticated;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Provider can view own documents" ON public.documents FOR SELECT TO authenticated
  USING (provider_id = auth.uid());
CREATE POLICY "Support and admins can view document metadata" ON public.documents FOR SELECT TO authenticated
  USING (public.is_support_or_admin(auth.uid()));
GRANT SELECT ON public.documents TO authenticated;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;

INSERT INTO public.profiles(id,role,full_name,first_name,last_name,phone,avatar_url) VALUES
  ('10000000-0000-4000-8000-000000000001','customer','Customer One','Customer','One','555-1001',NULL),
  ('10000000-0000-4000-8000-000000000002','customer','Customer Two','Customer','Two','555-1002',NULL),
  ('20000000-0000-4000-8000-000000000001','provider','Provider One','Provider','One','555-2001','provider-one.jpg'),
  ('20000000-0000-4000-8000-000000000002','provider','Provider Two','Provider','Two','555-2002','provider-two.jpg'),
  ('30000000-0000-4000-8000-000000000001','admin','Admin One','Admin','One','555-3001',NULL),
  ('40000000-0000-4000-8000-000000000001','support','Support One','Support','One','555-4001',NULL);
INSERT INTO public.provider_profiles(id,services,vehicle_make,vehicle_model,vehicle_year,vehicle_plate,license_number,is_verified,is_online,rating,total_jobs,total_earnings,acceptance_rate) VALUES
  ('20000000-0000-4000-8000-000000000001',ARRAY['towing'],'Toyota','Tacoma',2024,'PRIVATE-PLATE-1','PRIVATE-LICENSE-1',true,true,4.90,45,12345.67,82.5),
  ('20000000-0000-4000-8000-000000000002',ARRAY['jumpstart'],'Ford','F-150',2023,'PRIVATE-PLATE-2','PRIVATE-LICENSE-2',true,true,4.70,32,9876.54,70.0);
INSERT INTO public.jobs(id,customer_id,provider_id,status) VALUES
  ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','accepted'),
  ('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','accepted'),
  ('50000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','completed');
INSERT INTO public.documents(id,provider_id,document_type,storage_path) VALUES
  ('60000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','license','provider-one/license.pdf');
