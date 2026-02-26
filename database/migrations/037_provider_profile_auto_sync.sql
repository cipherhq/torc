-- Ensure provider records stay in sync for admin reporting and provider workflows.
-- This guarantees every profile with role='provider' also has a provider_profiles row.

DO $$
DECLARE
  has_created_at boolean;
  has_updated_at boolean;
  insert_sql text;
BEGIN
  IF to_regclass('public.provider_profiles') IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'provider_profiles'
      AND column_name = 'created_at'
  )
  INTO has_created_at;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'provider_profiles'
      AND column_name = 'updated_at'
  )
  INTO has_updated_at;

  insert_sql := 'INSERT INTO public.provider_profiles (id';

  IF has_created_at THEN
    insert_sql := insert_sql || ', created_at';
  END IF;
  IF has_updated_at THEN
    insert_sql := insert_sql || ', updated_at';
  END IF;

  insert_sql := insert_sql || ') SELECT p.id';

  IF has_created_at THEN
    insert_sql := insert_sql || ', COALESCE(p.created_at, now())';
  END IF;
  IF has_updated_at THEN
    insert_sql := insert_sql || ', now()';
  END IF;

  insert_sql := insert_sql || '
    FROM public.profiles p
    WHERE p.role = ''provider''
      AND NOT EXISTS (
        SELECT 1
        FROM public.provider_profiles pp
        WHERE pp.id = p.id
      )
    ON CONFLICT (id) DO NOTHING';

  EXECUTE insert_sql;
END $$;

CREATE OR REPLACE FUNCTION public.ensure_provider_profile_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_created_at boolean;
  has_updated_at boolean;
BEGIN
  IF NEW.role <> 'provider' THEN
    RETURN NEW;
  END IF;

  IF to_regclass('public.provider_profiles') IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'provider_profiles'
      AND column_name = 'created_at'
  )
  INTO has_created_at;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'provider_profiles'
      AND column_name = 'updated_at'
  )
  INTO has_updated_at;

  IF has_created_at AND has_updated_at THEN
    EXECUTE '
      INSERT INTO public.provider_profiles (id, created_at, updated_at)
      VALUES ($1, now(), now())
      ON CONFLICT (id) DO NOTHING
    '
    USING NEW.id;
  ELSIF has_created_at THEN
    EXECUTE '
      INSERT INTO public.provider_profiles (id, created_at)
      VALUES ($1, now())
      ON CONFLICT (id) DO NOTHING
    '
    USING NEW.id;
  ELSE
    EXECUTE '
      INSERT INTO public.provider_profiles (id)
      VALUES ($1)
      ON CONFLICT (id) DO NOTHING
    '
    USING NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_ensure_provider_profile_row ON public.profiles;
CREATE TRIGGER trg_profiles_ensure_provider_profile_row
AFTER INSERT OR UPDATE OF role ON public.profiles
FOR EACH ROW
WHEN (
  NEW.role = 'provider'
  AND (
    TG_OP = 'INSERT'
    OR OLD.role IS DISTINCT FROM NEW.role
  )
)
EXECUTE FUNCTION public.ensure_provider_profile_row();
