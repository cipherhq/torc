-- Providers may upload and replace documents, but cannot self-approve them.
-- Approval/rejection remains an admin-only operation.

CREATE OR REPLACE FUNCTION public.guard_provider_document_review()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Trusted server/admin paths may review documents.
  IF current_user IN ('postgres', 'supabase_admin', 'service_role')
     OR COALESCE(public.is_admin(auth.uid()), false) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'pending' OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Provider documents must start in pending review';
    END IF;
  ELSE
    IF NEW.provider_id IS DISTINCT FROM OLD.provider_id
       OR NEW.status IS DISTINCT FROM 'pending'
       OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
       OR (OLD.rejection_reason IS NULL AND NEW.rejection_reason IS NOT NULL) THEN
      RAISE EXCEPTION 'Providers cannot change document ownership or review status';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_provider_document_review ON public.documents;
CREATE TRIGGER trg_guard_provider_document_review
  BEFORE INSERT OR UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_provider_document_review();

DROP POLICY IF EXISTS "Provider can upsert own documents" ON public.documents;
CREATE POLICY "Provider can insert own pending documents"
  ON public.documents FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = provider_id
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
  );

DROP POLICY IF EXISTS "Provider can update own pending documents" ON public.documents;
CREATE POLICY "Provider can update own pending documents"
  ON public.documents FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = provider_id)
  WITH CHECK (
    (SELECT auth.uid()) = provider_id
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
  );

REVOKE ALL ON FUNCTION public.guard_provider_document_review() FROM PUBLIC;
