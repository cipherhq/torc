-- ============================================================
-- 052: Security Hardening — RPC identity validation, function access control,
--      and anonymous data exposure fixes
-- ============================================================
-- Must be run AFTER migration 051.

-- ============================================================
-- A. accept_job: Validate p_provider_id matches auth.uid()
-- Prevents provider impersonation (any user claiming jobs as another provider)
-- ============================================================

CREATE OR REPLACE FUNCTION public.accept_job(
  p_job_id UUID,
  p_provider_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job RECORD;
  v_provider_name TEXT;
BEGIN
  -- SECURITY: Verify caller is the provider they claim to be
  IF p_provider_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED', 'message', 'You can only accept jobs as yourself');
  END IF;

  SELECT * INTO v_job FROM jobs WHERE id = p_job_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'JOB_NOT_FOUND', 'message', 'Job does not exist');
  END IF;

  IF v_job.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'JOB_ALREADY_ACCEPTED',
      'message', 'Job has already been accepted by another provider',
      'current_status', v_job.status, 'current_provider_id', v_job.provider_id);
  END IF;

  UPDATE jobs SET provider_id = p_provider_id, status = 'accepted', accepted_at = NOW(), updated_at = NOW()
  WHERE id = p_job_id;

  INSERT INTO job_events (job_id, event_type, actor_id, actor_type, metadata)
  VALUES (p_job_id, 'job_accepted', p_provider_id, 'provider', jsonb_build_object('previous_status', v_job.status));

  PERFORM pg_notify('job_accepted', jsonb_build_object(
    'job_id', p_job_id, 'provider_id', p_provider_id, 'customer_id', v_job.customer_id
  )::text);

  -- Get provider display name
  SELECT COALESCE(
    NULLIF(TRIM(first_name), '') || COALESCE(' ' || LEFT(last_name, 1) || '.', ''),
    'A provider'
  ) INTO v_provider_name FROM profiles WHERE id = p_provider_id;

  -- Notify customer: provider accepted
  INSERT INTO notifications (user_id, type, title, message, action_url)
  VALUES (
    v_job.customer_id, 'service', 'Provider Accepted',
    v_provider_name || ' has accepted your service request.',
    '/tracking/' || p_job_id::text
  );

  -- If scheduled job, also send reminder notification to provider
  IF v_job.scheduled_for IS NOT NULL AND v_job.scheduled_for > NOW() + INTERVAL '10 minutes' THEN
    INSERT INTO notifications (user_id, type, title, message, action_url)
    VALUES (
      p_provider_id, 'service', 'Scheduled Job Accepted',
      'You accepted a scheduled job for ' || TO_CHAR(v_job.scheduled_for AT TIME ZONE 'America/New_York', 'Mon DD at HH12:MI AM') || '. Don''t forget to start heading to the customer on time!',
      '/job/' || p_job_id::text
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'job_id', p_job_id, 'provider_id', p_provider_id, 'status', 'accepted', 'accepted_at', NOW());
END;
$$;

-- ============================================================
-- B. cancel_job: Validate p_actor_id matches auth.uid()
-- Prevents impersonation (cancelling jobs as another user)
-- ============================================================

CREATE OR REPLACE FUNCTION public.cancel_job(
  p_job_id UUID,
  p_actor_id UUID,
  p_actor_type TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job RECORD;
BEGIN
  -- SECURITY: Verify caller is the actor they claim to be
  IF p_actor_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED', 'message', 'Identity mismatch');
  END IF;

  SELECT * INTO v_job FROM jobs WHERE id = p_job_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'JOB_NOT_FOUND', 'message', 'Job does not exist');
  END IF;

  IF v_job.status IN ('completed', 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'JOB_CANNOT_BE_CANCELLED',
      'message', 'Job has already been ' || v_job.status, 'current_status', v_job.status);
  END IF;

  IF p_actor_type = 'customer' AND v_job.customer_id != p_actor_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED', 'message', 'You are not authorized to cancel this job');
  END IF;

  IF p_actor_type = 'provider' AND (v_job.provider_id IS NULL OR v_job.provider_id != p_actor_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED', 'message', 'You are not the assigned provider for this job');
  END IF;

  UPDATE jobs
  SET status = 'cancelled', cancellation_reason = p_reason,
      cancelled_at = NOW(), cancelled_by = p_actor_id, updated_at = NOW()
  WHERE id = p_job_id;

  INSERT INTO job_events (job_id, event_type, actor_id, actor_type, metadata)
  VALUES (p_job_id, 'job_cancelled', p_actor_id, p_actor_type,
    jsonb_build_object('reason', p_reason, 'previous_status', v_job.status));

  PERFORM pg_notify('job_cancelled', jsonb_build_object(
    'job_id', p_job_id, 'cancelled_by', p_actor_id, 'actor_type', p_actor_type,
    'customer_id', v_job.customer_id, 'provider_id', v_job.provider_id, 'reason', p_reason
  )::text);

  RETURN jsonb_build_object('success', true, 'job_id', p_job_id, 'status', 'cancelled',
    'cancelled_by', p_actor_id, 'cancelled_at', NOW(), 'reason', p_reason);
END;
$$;

-- ============================================================
-- C. upsert_device_token: Validate p_user_id matches auth.uid()
-- Prevents push notification token injection for other users
-- ============================================================

CREATE OR REPLACE FUNCTION public.upsert_device_token(
  p_user_id UUID,
  p_platform TEXT,
  p_push_token TEXT,
  p_device_id TEXT DEFAULT NULL,
  p_device_name TEXT DEFAULT NULL,
  p_app_version TEXT DEFAULT NULL,
  p_app_build TEXT DEFAULT NULL,
  p_os_version TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_id UUID;
BEGIN
  -- SECURITY: Only allow users to register their own tokens
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: cannot register tokens for other users';
  END IF;

  INSERT INTO device_tokens (
    user_id, platform, push_token, device_id, device_name,
    app_version, app_build, os_version, is_active, last_used_at
  )
  VALUES (
    p_user_id, p_platform, p_push_token, p_device_id, p_device_name,
    p_app_version, p_app_build, p_os_version, true, NOW()
  )
  ON CONFLICT (user_id, push_token)
  DO UPDATE SET
    is_active = true, last_used_at = NOW(),
    device_name = COALESCE(EXCLUDED.device_name, device_tokens.device_name),
    app_version = COALESCE(EXCLUDED.app_version, device_tokens.app_version),
    app_build = COALESCE(EXCLUDED.app_build, device_tokens.app_build),
    os_version = COALESCE(EXCLUDED.os_version, device_tokens.os_version),
    updated_at = NOW()
  RETURNING id INTO v_token_id;

  RETURN v_token_id;
END;
$$;

-- ============================================================
-- D. Revoke PUBLIC access to SECURITY DEFINER functions
-- PostgreSQL grants EXECUTE to PUBLIC by default on functions.
-- These should only be callable by the intended roles.
-- ============================================================

-- Must SET ROLE to postgres (function owner) to modify grants
SET ROLE postgres;

-- suspend_expired_document_providers: should only be called by pg_cron / service_role
REVOKE EXECUTE ON FUNCTION public.suspend_expired_document_providers() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.suspend_expired_document_providers() FROM anon;
GRANT EXECUTE ON FUNCTION public.suspend_expired_document_providers() TO service_role;

-- send_scheduled_job_reminders: should only be called by pg_cron / service_role
REVOKE EXECUTE ON FUNCTION public.send_scheduled_job_reminders() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.send_scheduled_job_reminders() FROM anon;
GRANT EXECUTE ON FUNCTION public.send_scheduled_job_reminders() TO service_role;

-- recalculate_customer_rating: should only be called by triggers / service_role
REVOKE EXECUTE ON FUNCTION public.recalculate_customer_rating(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recalculate_customer_rating(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.recalculate_customer_rating(uuid) TO service_role;

-- send_broadcast_notification: has internal admin check but restrict to authenticated
REVOKE EXECUTE ON FUNCTION public.send_broadcast_notification(text, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.send_broadcast_notification(text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.send_broadcast_notification(text, text, text, text, text) TO authenticated;

-- accept_job and cancel_job: already granted to authenticated, revoke from anon/public
REVOKE EXECUTE ON FUNCTION public.accept_job(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accept_job(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_job(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.cancel_job(uuid, uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_job(uuid, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_job(uuid, uuid, text, text) TO authenticated;

-- upsert_device_token: already granted to authenticated, revoke from public
REVOKE EXECUTE ON FUNCTION public.upsert_device_token(uuid, text, text, text, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_device_token(uuid, text, text, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.upsert_device_token(uuid, text, text, text, text, text, text, text) TO authenticated;

-- Reset role back to default
RESET ROLE;

-- ============================================================
-- E. provider_locations: restrict to authenticated users only
-- Was: "Anyone can view online provider locations" USING (true)
-- Fix: require authentication to see provider GPS data
-- ============================================================

DROP POLICY IF EXISTS "Anyone can view online provider locations" ON public.provider_locations;
CREATE POLICY "Authenticated users can view online provider locations"
  ON public.provider_locations
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- F. document_types: restrict to authenticated users only
-- Was: "Anyone can read document_types" USING (true)
-- ============================================================

DROP POLICY IF EXISTS "Anyone can read document_types" ON public.document_types;
CREATE POLICY "Authenticated users can read document_types"
  ON public.document_types
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- G. services: keep public read (needed for marketing/landing pages)
-- But ensure only admins can modify
-- ============================================================

-- Services catalog is intentionally public for the website.
-- No change needed for SELECT.

-- ============================================================
-- H. admin_audit_logs: ensure append-only (no update/delete by non-service-role)
-- ============================================================

ALTER TABLE IF EXISTS public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Admins can insert audit logs
DROP POLICY IF EXISTS "Admins can insert audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins can insert audit logs"
  ON public.admin_audit_logs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can read audit logs
DROP POLICY IF EXISTS "Admins can read audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins can read audit logs"
  ON public.admin_audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- No UPDATE or DELETE policies = append-only for authenticated users
-- Service role can still manage via bypass

-- ============================================================
-- I. ensure_provider_setup: add role validation
-- Prevents customers from calling this to change their role
-- ============================================================

CREATE OR REPLACE FUNCTION public.ensure_provider_setup(
  p_first_name TEXT DEFAULT NULL,
  p_last_name TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_current_role TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- SECURITY: Check if user is already a different role (customer/admin)
  -- Only allow if user has no profile yet OR is already a provider
  SELECT role INTO v_current_role FROM profiles WHERE id = v_user_id;
  IF v_current_role IS NOT NULL AND v_current_role != 'provider' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot change role. You are registered as a ' || v_current_role);
  END IF;

  -- Upsert profiles row
  INSERT INTO profiles (id, role, first_name, last_name, phone, email)
  SELECT v_user_id, 'provider',
    COALESCE(p_first_name, raw_user_meta_data->>'first_name'),
    COALESCE(p_last_name, raw_user_meta_data->>'last_name'),
    COALESCE(p_phone, raw_user_meta_data->>'phone'),
    email
  FROM auth.users WHERE id = v_user_id
  ON CONFLICT (id) DO UPDATE SET
    role = 'provider',
    first_name = COALESCE(EXCLUDED.first_name, profiles.first_name),
    last_name = COALESCE(EXCLUDED.last_name, profiles.last_name),
    phone = COALESCE(EXCLUDED.phone, profiles.phone),
    updated_at = NOW();

  -- Upsert provider_profiles row
  INSERT INTO provider_profiles (id) VALUES (v_user_id)
  ON CONFLICT (id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'user_id', v_user_id);
END;
$$;
