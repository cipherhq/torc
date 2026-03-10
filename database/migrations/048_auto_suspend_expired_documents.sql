-- Migration 048: Auto-suspend providers with expired documents.
-- Creates a function that checks for expired required documents and
-- sets provider_profiles.is_verified = false when any required document
-- has passed its expires_at date without being replaced.
-- Uses pg_cron to run daily at 3:00 AM UTC.

-- 1) Function: suspend providers whose required documents have expired
CREATE OR REPLACE FUNCTION public.suspend_expired_document_providers()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Find providers with at least one required, approved document that has expired
  -- and who are currently verified.  Set is_verified = false.
  UPDATE public.provider_profiles pp
  SET is_verified = false,
      updated_at = now()
  WHERE pp.is_verified = true
    AND EXISTS (
      SELECT 1
      FROM public.documents d
      JOIN public.document_types dt ON dt.id = d.type
      WHERE d.provider_id = pp.id
        AND dt.is_required = true
        AND dt.is_active = true
        AND d.status = 'approved'
        AND d.expires_at IS NOT NULL
        AND d.expires_at < CURRENT_DATE
    );

  -- Also mark the expired documents themselves as 'rejected' with a reason
  UPDATE public.documents d
  SET status = 'rejected',
      rejection_reason = 'Document expired on ' || d.expires_at::text || '. Please upload a valid replacement.',
      updated_at = now()
  FROM public.document_types dt
  WHERE dt.id = d.type
    AND dt.is_required = true
    AND dt.is_active = true
    AND d.status = 'approved'
    AND d.expires_at IS NOT NULL
    AND d.expires_at < CURRENT_DATE;
END;
$$;

-- 2) Schedule with pg_cron: run daily at 3:00 AM UTC
-- pg_cron is enabled by default on Supabase paid plans.
-- If pg_cron is not available, this will fail silently — the function
-- can still be called manually or via an edge function.
DO $$
BEGIN
  -- Remove existing job if any
  PERFORM cron.unschedule('suspend-expired-documents');
EXCEPTION WHEN OTHERS THEN
  -- cron extension may not be available
  NULL;
END;
$$;

DO $$
BEGIN
  PERFORM cron.schedule(
    'suspend-expired-documents',
    '0 3 * * *',
    'SELECT public.suspend_expired_document_providers()'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available — schedule the function manually or via an edge function.';
END;
$$;
