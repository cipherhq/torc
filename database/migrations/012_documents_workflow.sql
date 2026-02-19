-- Provider document upload + admin review workflow.

CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  file_name TEXT,
  file_path TEXT NOT NULL,
  file_url TEXT,
  mime_type TEXT,
  file_size BIGINT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider_id, type)
);

CREATE INDEX IF NOT EXISTS idx_documents_provider_id ON public.documents(provider_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON public.documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON public.documents(created_at DESC);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Provider can view own documents" ON public.documents;
CREATE POLICY "Provider can view own documents"
  ON public.documents
  FOR SELECT
  USING (auth.uid() = provider_id);

DROP POLICY IF EXISTS "Provider can upsert own documents" ON public.documents;
CREATE POLICY "Provider can upsert own documents"
  ON public.documents
  FOR INSERT
  WITH CHECK (auth.uid() = provider_id);

DROP POLICY IF EXISTS "Provider can update own pending documents" ON public.documents;
CREATE POLICY "Provider can update own pending documents"
  ON public.documents
  FOR UPDATE
  USING (auth.uid() = provider_id)
  WITH CHECK (auth.uid() = provider_id);

DROP POLICY IF EXISTS "Provider can delete own documents" ON public.documents;
CREATE POLICY "Provider can delete own documents"
  ON public.documents
  FOR DELETE
  USING (auth.uid() = provider_id);

DROP POLICY IF EXISTS "Admins can manage documents" ON public.documents;
CREATE POLICY "Admins can manage documents"
  ON public.documents
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE OR REPLACE FUNCTION public.set_documents_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_documents_updated_at ON public.documents;
CREATE TRIGGER trg_documents_updated_at
BEFORE UPDATE ON public.documents
FOR EACH ROW
EXECUTE FUNCTION public.set_documents_updated_at();

-- Storage bucket for provider documents.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'provider-documents',
  'provider-documents',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Providers can manage files under their own folder only.
DROP POLICY IF EXISTS "Provider upload own documents" ON storage.objects;
CREATE POLICY "Provider upload own documents"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'provider-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Provider view own documents" ON storage.objects;
CREATE POLICY "Provider view own documents"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'provider-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Provider update own documents" ON storage.objects;
CREATE POLICY "Provider update own documents"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'provider-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'provider-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Provider delete own documents" ON storage.objects;
CREATE POLICY "Provider delete own documents"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'provider-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Admin visibility + moderation access.
DROP POLICY IF EXISTS "Admin read provider documents bucket" ON storage.objects;
CREATE POLICY "Admin read provider documents bucket"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'provider-documents'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admin delete provider documents bucket" ON storage.objects;
CREATE POLICY "Admin delete provider documents bucket"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'provider-documents'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );
