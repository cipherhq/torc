-- Normalize table ACLs for projects with broader existing/default grants.
REVOKE ALL
ON TABLE public.service_availability_rules
FROM PUBLIC;

REVOKE ALL
ON TABLE public.service_availability_rules
FROM anon;

REVOKE ALL
ON TABLE public.service_availability_rules
FROM authenticated;

GRANT SELECT
ON TABLE public.service_availability_rules
TO anon, authenticated;

GRANT INSERT, UPDATE, DELETE
ON TABLE public.service_availability_rules
TO authenticated;
