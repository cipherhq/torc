-- Soft-delete support for profiles lifecycle management

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

UPDATE public.profiles
SET status = 'active'
WHERE status IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_status_check'
  ) THEN
    ALTER TABLE public.profiles
      DROP CONSTRAINT profiles_status_check;
  END IF;

  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_status_check
    CHECK (status IN ('active', 'suspended', 'pending', 'deleted'));
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at ON public.profiles(deleted_at);
