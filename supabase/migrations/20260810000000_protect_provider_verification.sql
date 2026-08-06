-- PROV-001: Protect provider verification state from self-mutation.
--
-- provider_profiles.is_verified is admin-owned. A provider must not be
-- able to set it on INSERT or change it on UPDATE.
--
-- Admin authority: profiles.role = 'admin' (via is_admin function).
-- SECURITY DEFINER functions (suspend_expired_document_providers, etc.)
-- run as current_user='postgres' and bypass this guard.
--
-- profiles.is_verified does NOT exist in production schema.
-- profiles.status and profiles.suspended_at are admin-owned but are
-- a SEPARATE finding (not protected here).

CREATE OR REPLACE FUNCTION public.guard_provider_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Trusted callers: postgres (SECURITY DEFINER), supabase_admin
  IF current_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- Admin callers: check authoritative profiles.role
  IF is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- For INSERT: is_verified must be false/default
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_verified IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'Cannot set verification status on profile creation. Admin approval required.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- For UPDATE: is_verified must not change
  IF TG_OP = 'UPDATE' THEN
    IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
      RAISE EXCEPTION 'Cannot modify verification status. Only admins can approve or suspend providers.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Apply to provider_profiles
DROP TRIGGER IF EXISTS trg_guard_provider_verification ON public.provider_profiles;
CREATE TRIGGER trg_guard_provider_verification
  BEFORE INSERT OR UPDATE ON public.provider_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_provider_verification();
