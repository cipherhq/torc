-- Existing Supabase projects may have explicit default EXECUTE grants for anon.
-- Revoking PUBLIC alone does not remove those explicit role grants.
REVOKE EXECUTE
ON FUNCTION public.resubmit_provider_document(uuid,text,text,text,bigint,text)
FROM PUBLIC;

REVOKE EXECUTE
ON FUNCTION public.resubmit_provider_document(uuid,text,text,text,bigint,text)
FROM anon;

GRANT EXECUTE
ON FUNCTION public.resubmit_provider_document(uuid,text,text,text,bigint,text)
TO authenticated;

-- Regression guard: verify effective privileges and the raw ACL's PUBLIC entry.
DO $$
DECLARE
  v_function oid := 'public.resubmit_provider_document(uuid,text,text,text,bigint,text)'::regprocedure;
BEGIN
  IF has_function_privilege(
    'anon',
    'public.resubmit_provider_document(uuid,text,text,text,bigint,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: anon can execute resubmit_provider_document';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.resubmit_provider_document(uuid,text,text,text,bigint,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: authenticated cannot execute resubmit_provider_document';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
    WHERE p.oid = v_function
      AND acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: PUBLIC still has EXECUTE on resubmit_provider_document';
  END IF;
END;
$$;
