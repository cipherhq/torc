-- Document types: admin-configurable list of documents providers must upload.
-- Replaces the hardcoded documentConfig in the provider app.

CREATE TABLE IF NOT EXISTS public.document_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_required BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.document_types ENABLE ROW LEVEL SECURITY;

-- Anyone can read document types (providers need the list during onboarding)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'document_types'
      AND policyname = 'Anyone can read document_types'
  ) THEN
    CREATE POLICY "Anyone can read document_types"
      ON public.document_types FOR SELECT
      USING (true);
  END IF;
END $$;

-- Admins have full CRUD on document_types
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'document_types'
      AND policyname = 'Admins have full access to document_types'
  ) THEN
    CREATE POLICY "Admins have full access to document_types"
      ON public.document_types FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
      );
  END IF;
END $$;

-- Seed with existing document types
INSERT INTO public.document_types (id, name, description, is_required, is_active, display_order)
VALUES
  ('license', 'Driver''s License', 'Valid state-issued driver''s license', true, true, 1),
  ('insurance', 'Insurance Certificate', 'Proof of commercial vehicle insurance', true, true, 2),
  ('registration', 'Vehicle Registration', 'Current vehicle registration', false, true, 3),
  ('towing', 'Towing Credentials', 'Towing certification (if applicable)', false, true, 4)
ON CONFLICT (id) DO NOTHING;
