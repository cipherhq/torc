-- Rejected documents may be resubmitted only through this server-authoritative RPC.
-- Providers cannot clear reviewer metadata with a direct Data API UPDATE.
CREATE OR REPLACE FUNCTION public.resubmit_provider_document(
  p_document_id uuid,
  p_file_path text,
  p_file_name text,
  p_mime_type text,
  p_file_size bigint,
  p_file_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_document public.documents%ROWTYPE;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  SELECT * INTO v_document
  FROM public.documents
  WHERE id = p_document_id AND provider_id = v_actor
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'DOCUMENT_NOT_FOUND');
  END IF;
  IF v_document.status <> 'rejected' THEN
    RETURN jsonb_build_object('success', false, 'error', 'ONLY_REJECTED_DOCUMENTS_CAN_BE_RESUBMITTED');
  END IF;
  -- Storage objects are namespaced by provider and document type. Never trust
  -- a client-supplied path to point at another provider's object.
  IF split_part(p_file_path, '/', 1) <> v_actor::text
     OR split_part(p_file_path, '/', 2) <> v_document.type
     OR p_file_path LIKE '/%'
     OR p_file_path LIKE '%//%'
     OR p_file_path ~ '(^|/)\.\.?(/|$)' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_STORAGE_PATH');
  END IF;
  IF p_file_path IS NULL OR length(trim(p_file_path)) = 0
     OR p_file_name IS NULL OR length(trim(p_file_name)) = 0
     OR p_file_size IS NULL OR p_file_size < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_DOCUMENT');
  END IF;

  UPDATE public.documents
  SET file_path = p_file_path,
      file_name = p_file_name,
      file_url = NULL,
      mime_type = p_mime_type,
      file_size = p_file_size,
      status = 'pending',
      rejection_reason = NULL,
      reviewed_by = NULL,
      reviewed_at = NULL,
      expires_at = NULL,
      updated_at = now()
  WHERE id = p_document_id AND provider_id = v_actor;

  RETURN jsonb_build_object('success', true, 'document_id', p_document_id, 'status', 'pending');
END;
$$;

REVOKE ALL ON FUNCTION public.resubmit_provider_document(uuid,text,text,text,bigint,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resubmit_provider_document(uuid,text,text,text,bigint,text) TO authenticated;

-- Keep direct provider UPDATEs review-safe. The RPC above is the only path that
-- can move a rejected row back to clean pending state.
CREATE OR REPLACE FUNCTION public.guard_provider_document_review()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
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
  FOR EACH ROW EXECUTE FUNCTION public.guard_provider_document_review();

REVOKE ALL ON FUNCTION public.guard_provider_document_review() FROM PUBLIC;
