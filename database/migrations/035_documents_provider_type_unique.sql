-- Ensure documents upsert key exists for provider uploads.
-- Some legacy environments are missing UNIQUE(provider_id, type),
-- which causes ON CONFLICT(provider_id,type) to fail.

-- 1) Deduplicate rows (keep latest per provider/type).
-- Some environments do not have documents.updated_at, so we branch.
DO $$
DECLARE
  has_updated_at boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'documents'
      AND column_name = 'updated_at'
  )
  INTO has_updated_at;

  IF has_updated_at THEN
    EXECUTE $sql$
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY provider_id, type
            ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
          ) AS rn
        FROM public.documents
      )
      DELETE FROM public.documents d
      USING ranked r
      WHERE d.id = r.id
        AND r.rn > 1;
    $sql$;
  ELSE
    EXECUTE $sql$
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY provider_id, type
            ORDER BY created_at DESC NULLS LAST, id DESC
          ) AS rn
        FROM public.documents
      )
      DELETE FROM public.documents d
      USING ranked r
      WHERE d.id = r.id
        AND r.rn > 1;
    $sql$;
  END IF;
END $$;

-- 2) Add unique constraint if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.documents'::regclass
      AND conname = 'documents_provider_id_type_key'
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_provider_id_type_key UNIQUE (provider_id, type);
  END IF;
END $$;
