-- Account Deletion Store Compliance
--
-- Architecture:
--   request_account_deletion()  — authenticated user requests deletion for SELF only
--   check_deletion_eligibility() — self or admin can check eligibility
--   _internal_process_deletion() — service-role-only finalization (no authenticated access)
--
-- Lifecycle: active → pending_deletion → deletion_processing → deleted
--
-- deletion_processing means DB anonymization complete but auth.users
-- deletion has not yet been confirmed. Only a trusted server process
-- (Edge Function / admin script via Supabase Admin API) may complete
-- the final auth deletion step and mark the profile as 'deleted'.

-- ============================================================
-- 1) Add deletion_processing to allowed profile statuses
-- ============================================================
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_status_check
  CHECK (status IN ('active', 'suspended', 'pending', 'pending_deletion', 'deletion_processing', 'deleted'));

-- ============================================================
-- 2) User-facing self-service deletion request
-- ============================================================
CREATE OR REPLACE FUNCTION public.request_account_deletion(
  p_reason TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_profile RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'PROFILE_NOT_FOUND');
  END IF;

  -- Idempotent: already requested or further along
  IF v_profile.status IN ('pending_deletion', 'deletion_processing', 'deleted') THEN
    RETURN json_build_object('success', true, 'status', v_profile.status, 'already_requested', true);
  END IF;

  -- Must be active (suspended users contact support)
  IF v_profile.status != 'active' THEN
    RETURN json_build_object('success', false, 'error', 'INVALID_STATUS',
      'message', 'Contact support to manage your account.');
  END IF;

  -- Set pending_deletion
  UPDATE profiles SET status = 'pending_deletion', deleted_at = now() WHERE id = v_user_id;

  -- Create support ticket
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'support_tickets') THEN
    INSERT INTO support_tickets (requester_id, requester_role, subject, description, priority, status)
    VALUES (v_user_id, v_profile.role, 'Account deletion request',
      'User requested account deletion.' || CASE WHEN p_reason IS NOT NULL THEN E'\nReason: ' || p_reason ELSE '' END,
      'high', 'open');
  END IF;

  RETURN json_build_object('success', true, 'status', 'pending_deletion');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_account_deletion(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.request_account_deletion(TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.request_account_deletion(TEXT) TO authenticated;

-- ============================================================
-- 3) Self/admin eligibility check with cross-user protection
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_deletion_eligibility(
  p_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_profile RECORD;
  v_active_jobs INT;
  v_pending_refunds INT;
  v_pending_payouts INT;
  v_blockers JSONB := '[]'::jsonb;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RETURN json_build_object('eligible', false, 'error', 'UNAUTHENTICATED');
  END IF;

  -- Cross-user protection: self or admin only
  IF v_caller != p_user_id AND NOT is_admin(v_caller) THEN
    RETURN json_build_object('eligible', false, 'error', 'UNAUTHORIZED');
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN json_build_object('eligible', false, 'error', 'USER_NOT_FOUND');
  END IF;

  SELECT count(*) INTO v_active_jobs FROM jobs
  WHERE (customer_id = p_user_id OR provider_id = p_user_id)
    AND status NOT IN ('completed', 'cancelled', 'expired');
  IF v_active_jobs > 0 THEN
    v_blockers := v_blockers || jsonb_build_object('type', 'active_jobs', 'count', v_active_jobs);
  END IF;

  SELECT count(*) INTO v_pending_refunds FROM job_cancellation_operations
  WHERE actor_id = p_user_id AND status IN ('pending', 'refund_requesting', 'refund_pending');
  IF v_pending_refunds > 0 THEN
    v_blockers := v_blockers || jsonb_build_object('type', 'pending_refunds', 'count', v_pending_refunds);
  END IF;

  IF v_profile.role = 'provider' THEN
    SELECT count(*) INTO v_pending_payouts FROM provider_payouts
    WHERE provider_id = p_user_id AND status IN ('pending', 'processing');
    IF v_pending_payouts > 0 THEN
      v_blockers := v_blockers || jsonb_build_object('type', 'pending_payouts', 'count', v_pending_payouts);
    END IF;
  END IF;

  RETURN json_build_object(
    'eligible', jsonb_array_length(v_blockers) = 0,
    'blockers', v_blockers,
    'status', v_profile.status
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_deletion_eligibility(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_deletion_eligibility(UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public.check_deletion_eligibility(UUID) TO authenticated;

-- ============================================================
-- 4) Internal deletion processor — SERVICE ROLE ONLY
--    No authenticated/anon/public access.
--    Called only from trusted server (Edge Function / admin script).
-- ============================================================
CREATE OR REPLACE FUNCTION public._internal_process_deletion(
  p_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile RECORD;
  v_active_jobs INT;
  v_pending_refunds INT;
  v_pending_payouts INT;
  v_anon_name TEXT;
BEGIN
  -- Lock the profile row
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'USER_NOT_FOUND');
  END IF;

  -- Must be in pending_deletion or deletion_processing (idempotent retry)
  IF v_profile.status = 'deleted' THEN
    RETURN json_build_object('success', true, 'already_deleted', true, 'stage', 'deleted');
  END IF;

  IF v_profile.status NOT IN ('pending_deletion', 'deletion_processing') THEN
    RETURN json_build_object('success', false, 'error', 'INVALID_STATUS',
      'current_status', v_profile.status);
  END IF;

  -- If already in deletion_processing, skip to return (DB work done, awaiting auth deletion)
  IF v_profile.status = 'deletion_processing' THEN
    RETURN json_build_object('success', true, 'stage', 'deletion_processing',
      'message', 'DB anonymization complete. Awaiting auth.users deletion.');
  END IF;

  -- ── Safety checks: fail closed on unresolved obligations ──

  SELECT count(*) INTO v_active_jobs FROM jobs
  WHERE (customer_id = p_user_id OR provider_id = p_user_id)
    AND status NOT IN ('completed', 'cancelled', 'expired');
  IF v_active_jobs > 0 THEN
    RETURN json_build_object('success', false, 'error', 'ACTIVE_JOBS_EXIST', 'count', v_active_jobs);
  END IF;

  SELECT count(*) INTO v_pending_refunds FROM job_cancellation_operations
  WHERE actor_id = p_user_id AND status IN ('pending', 'refund_requesting', 'refund_pending');
  IF v_pending_refunds > 0 THEN
    RETURN json_build_object('success', false, 'error', 'PENDING_REFUNDS', 'count', v_pending_refunds);
  END IF;

  IF v_profile.role = 'provider' THEN
    SELECT count(*) INTO v_pending_payouts FROM provider_payouts
    WHERE provider_id = p_user_id AND status IN ('pending', 'processing');
    IF v_pending_payouts > 0 THEN
      RETURN json_build_object('success', false, 'error', 'PENDING_PAYOUTS', 'count', v_pending_payouts);
    END IF;
  END IF;

  -- ── Category A: DELETE personal data ──

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'device_tokens') THEN
    DELETE FROM device_tokens WHERE user_id = p_user_id;
  END IF;
  DELETE FROM notifications WHERE user_id = p_user_id;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'push_notifications') THEN
    DELETE FROM push_notifications WHERE user_id = p_user_id;
  END IF;
  DELETE FROM provider_locations WHERE provider_id = p_user_id;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_methods') THEN
    DELETE FROM payment_methods WHERE user_id = p_user_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stripe_customers') THEN
    DELETE FROM stripe_customers WHERE user_id = p_user_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vehicles') THEN
    DELETE FROM vehicles WHERE user_id = p_user_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'provider_payout_methods') THEN
    DELETE FROM provider_payout_methods WHERE provider_id = p_user_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'provider_job_dismissals') THEN
    DELETE FROM provider_job_dismissals WHERE provider_id = p_user_id;
  END IF;

  -- ── Category B: ANONYMIZE retained records ──

  v_anon_name := 'Deleted User';

  -- Profile: clear personal fields, mark deletion_processing (NOT deleted yet)
  UPDATE profiles SET
    email = NULL,
    first_name = 'Deleted',
    last_name = 'User',
    phone = NULL,
    status = 'deletion_processing',
    deleted_at = COALESCE(deleted_at, now())
  WHERE id = p_user_id;

  -- Provider profile
  IF EXISTS (SELECT 1 FROM provider_profiles WHERE id = p_user_id) THEN
    UPDATE provider_profiles SET is_online = false, is_verified = false WHERE id = p_user_id;
    BEGIN
      EXECUTE 'UPDATE provider_profiles SET vehicle_make=NULL, vehicle_model=NULL, vehicle_year=NULL, vehicle_plate=NULL, license_number=NULL, avatar_url=NULL WHERE id=$1' USING p_user_id;
    EXCEPTION WHEN undefined_column THEN NULL;
    END;
  END IF;

  -- Jobs: anonymize personal fields
  BEGIN
    UPDATE jobs SET
      pickup_address = NULL, destination_address = NULL,
      requester_name = NULL, requester_phone = NULL, customer_notes = NULL
    WHERE customer_id = p_user_id OR provider_id = p_user_id;
  EXCEPTION WHEN undefined_column THEN
    UPDATE jobs SET updated_at = now() WHERE customer_id = p_user_id OR provider_id = p_user_id;
  END;

  -- Checkouts
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'checkouts') THEN
    UPDATE checkouts SET
      booking_snapshot = booking_snapshot
        - 'pickupAddress' - 'destinationAddress'
        - 'requesterName' - 'requesterPhone' - 'customerNotes'
    WHERE user_id = p_user_id AND booking_snapshot IS NOT NULL;
  END IF;

  -- Chat messages
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chat_messages') THEN
    UPDATE chat_messages SET sender_name = v_anon_name, message = '[deleted]', image_url = NULL
    WHERE sender_id = p_user_id::text;
  END IF;

  -- Support tickets
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'support_tickets') THEN
    UPDATE support_tickets SET description = '[account deleted]' WHERE requester_id = p_user_id;
    UPDATE support_tickets SET
      status = 'resolved',
      admin_note = COALESCE(admin_note, '') || ' | Account deletion processed.',
      resolved_at = COALESCE(resolved_at, now()), updated_at = now()
    WHERE requester_id = p_user_id AND subject LIKE 'Account deletion request%'
      AND status IN ('open', 'in_progress');
  END IF;

  -- Ticket replies
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ticket_replies') THEN
    UPDATE ticket_replies SET message = '[account deleted]' WHERE sender_id = p_user_id;
  END IF;

  -- ── Audit log ──
  INSERT INTO admin_audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (
    COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
    'account_deletion_processed',
    'user', p_user_id::text,
    jsonb_build_object('role', v_profile.role, 'stage', 'deletion_processing')
  );

  RETURN json_build_object('success', true, 'user_id', p_user_id,
    'stage', 'deletion_processing',
    'message', 'DB anonymization complete. Auth deletion required to finalize.');
END;
$$;

-- SERVICE ROLE ONLY — no authenticated, no anon, no public
REVOKE EXECUTE ON FUNCTION public._internal_process_deletion(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._internal_process_deletion(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public._internal_process_deletion(UUID) FROM authenticated;

-- ============================================================
-- 5) Mark auth deletion complete — SERVICE ROLE ONLY
--    Called by trusted server after Supabase Admin API deletes auth.users
-- ============================================================
CREATE OR REPLACE FUNCTION public._internal_finalize_deletion(
  p_user_id UUID,
  p_auth_deleted BOOLEAN DEFAULT false
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile RECORD;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'USER_NOT_FOUND');
  END IF;

  IF v_profile.status = 'deleted' THEN
    RETURN json_build_object('success', true, 'already_deleted', true);
  END IF;

  IF v_profile.status != 'deletion_processing' THEN
    RETURN json_build_object('success', false, 'error', 'INVALID_STATUS',
      'current_status', v_profile.status);
  END IF;

  IF NOT p_auth_deleted THEN
    RETURN json_build_object('success', false, 'error', 'AUTH_NOT_DELETED',
      'message', 'Auth user must be deleted before finalizing.');
  END IF;

  UPDATE profiles SET status = 'deleted' WHERE id = p_user_id;

  INSERT INTO admin_audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (
    COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
    'account_deletion_finalized',
    'user', p_user_id::text,
    jsonb_build_object('auth_deleted', true)
  );

  RETURN json_build_object('success', true, 'user_id', p_user_id, 'status', 'deleted');
END;
$$;

REVOKE EXECUTE ON FUNCTION public._internal_finalize_deletion(UUID, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._internal_finalize_deletion(UUID, BOOLEAN) FROM anon;
REVOKE EXECUTE ON FUNCTION public._internal_finalize_deletion(UUID, BOOLEAN) FROM authenticated;

-- ============================================================
-- 6) Drop old process_account_deletion if it exists
-- ============================================================
DROP FUNCTION IF EXISTS public.process_account_deletion(UUID);
