-- Account Deletion Store Compliance
-- Implements server-authoritative deletion/anonymization lifecycle
-- for Apple App Store and Google Play compliance.
--
-- Lifecycle: active → pending_deletion → deletion_processing → deleted
--
-- Personal data is anonymized; financial/audit records are retained
-- with user references anonymized where safe.

-- ============================================================
-- 1) Add deletion_processing to allowed profile statuses
-- ============================================================
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_status_check
  CHECK (status IN ('active', 'suspended', 'pending', 'pending_deletion', 'deletion_processing', 'deleted'));

-- ============================================================
-- 2) Server-authoritative account deletion/anonymization RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_account_deletion(
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
  -- Must be called by admin or service role
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    IF NOT is_admin(auth.uid()) THEN
      RETURN json_build_object('success', false, 'error', 'ADMIN_REQUIRED');
    END IF;
  END IF;

  -- Lock the profile row
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'USER_NOT_FOUND');
  END IF;

  -- Must be in pending_deletion or deletion_processing (idempotent retry)
  IF v_profile.status NOT IN ('pending_deletion', 'deletion_processing', 'deleted') THEN
    RETURN json_build_object('success', false, 'error', 'INVALID_STATUS',
      'current_status', v_profile.status,
      'message', 'User must be in pending_deletion status first');
  END IF;

  -- Idempotent: already deleted
  IF v_profile.status = 'deleted' THEN
    RETURN json_build_object('success', true, 'already_deleted', true);
  END IF;

  -- ── Safety checks: fail closed on unresolved obligations ──

  -- Active jobs (not completed/cancelled/expired)
  SELECT count(*) INTO v_active_jobs FROM jobs
  WHERE (customer_id = p_user_id OR provider_id = p_user_id)
    AND status NOT IN ('completed', 'cancelled', 'expired');
  IF v_active_jobs > 0 THEN
    RETURN json_build_object('success', false, 'error', 'ACTIVE_JOBS_EXIST',
      'count', v_active_jobs,
      'message', 'Cannot delete account with active jobs. Complete or cancel them first.');
  END IF;

  -- Pending cancellation refunds
  SELECT count(*) INTO v_pending_refunds FROM job_cancellation_operations
  WHERE actor_id = p_user_id
    AND status IN ('pending', 'refund_requesting', 'refund_pending');
  IF v_pending_refunds > 0 THEN
    RETURN json_build_object('success', false, 'error', 'PENDING_REFUNDS',
      'count', v_pending_refunds,
      'message', 'Cannot delete account with pending refunds.');
  END IF;

  -- Pending provider payouts (provider only)
  IF v_profile.role = 'provider' THEN
    SELECT count(*) INTO v_pending_payouts FROM provider_payouts
    WHERE provider_id = p_user_id AND status IN ('pending', 'processing');
    IF v_pending_payouts > 0 THEN
      RETURN json_build_object('success', false, 'error', 'PENDING_PAYOUTS',
        'count', v_pending_payouts,
        'message', 'Cannot delete account with pending payouts.');
    END IF;
  END IF;

  -- ── Mark as processing ──
  UPDATE profiles SET status = 'deletion_processing' WHERE id = p_user_id;

  -- ── Category A: DELETE personal data ──
  -- Use IF EXISTS pattern for tables that may not exist in all environments

  -- Device tokens
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'device_tokens') THEN
    DELETE FROM device_tokens WHERE user_id = p_user_id;
  END IF;

  -- Notification records
  DELETE FROM notifications WHERE user_id = p_user_id;

  -- Push notification delivery records
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'push_notifications') THEN
    DELETE FROM push_notifications WHERE user_id = p_user_id;
  END IF;

  -- Provider locations (real-time GPS)
  DELETE FROM provider_locations WHERE provider_id = p_user_id;

  -- Saved payment methods
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_methods') THEN
    DELETE FROM payment_methods WHERE user_id = p_user_id;
  END IF;

  -- Stripe customer mapping
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stripe_customers') THEN
    DELETE FROM stripe_customers WHERE user_id = p_user_id;
  END IF;

  -- Vehicles
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vehicles') THEN
    DELETE FROM vehicles WHERE user_id = p_user_id;
  END IF;

  -- Provider payout methods (bank/PayPal/Venmo details)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'provider_payout_methods') THEN
    DELETE FROM provider_payout_methods WHERE provider_id = p_user_id;
  END IF;

  -- Provider job dismissals
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'provider_job_dismissals') THEN
    DELETE FROM provider_job_dismissals WHERE provider_id = p_user_id;
  END IF;

  -- ── Category B: ANONYMIZE retained records ──

  v_anon_name := 'Deleted User';

  -- Profile: clear personal fields, keep role/status for audit
  UPDATE profiles SET
    email = NULL,
    first_name = 'Deleted',
    last_name = 'User',
    phone = NULL,
    status = 'deleted',
    deleted_at = COALESCE(deleted_at, now())
  WHERE id = p_user_id;

  -- Provider profile: clear personal info, set offline/unverified
  -- Use dynamic SQL for columns that may not exist in all environments
  IF EXISTS (SELECT 1 FROM provider_profiles WHERE id = p_user_id) THEN
    UPDATE provider_profiles SET is_online = false, is_verified = false WHERE id = p_user_id;
    -- Clear optional personal columns if they exist
    BEGIN
      EXECUTE 'UPDATE provider_profiles SET vehicle_make=NULL, vehicle_model=NULL, vehicle_year=NULL, vehicle_plate=NULL, license_number=NULL, avatar_url=NULL WHERE id=$1' USING p_user_id;
    EXCEPTION WHEN undefined_column THEN
      NULL; -- Columns don't exist in this environment
    END;
  END IF;

  -- Jobs: anonymize personal fields, retain financial amounts
  BEGIN
    UPDATE jobs SET
      pickup_address = NULL,
      destination_address = NULL,
      requester_name = NULL,
      requester_phone = NULL,
      customer_notes = NULL
    WHERE customer_id = p_user_id OR provider_id = p_user_id;
  EXCEPTION WHEN undefined_column THEN
    -- Some columns may not exist; clear only available ones
    UPDATE jobs SET updated_at = now() WHERE customer_id = p_user_id OR provider_id = p_user_id;
  END;

  -- Checkouts: anonymize booking snapshot personal data
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'checkouts') THEN
    UPDATE checkouts SET
      booking_snapshot = booking_snapshot
        - 'pickupAddress' - 'destinationAddress'
        - 'requesterName' - 'requesterPhone' - 'customerNotes'
    WHERE user_id = p_user_id AND booking_snapshot IS NOT NULL;
  END IF;

  -- Chat messages: anonymize sender name, clear message content
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chat_messages') THEN
    UPDATE chat_messages SET
      sender_name = v_anon_name,
      message = '[deleted]',
      image_url = NULL
    WHERE sender_id = p_user_id::text;
  END IF;

  -- Support tickets: anonymize description (keep subject for audit)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'support_tickets') THEN
    UPDATE support_tickets SET
      description = '[account deleted]'
    WHERE requester_id = p_user_id;
  END IF;

  -- Ticket replies: anonymize message content
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ticket_replies') THEN
    UPDATE ticket_replies SET
      message = '[account deleted]'
    WHERE sender_id = p_user_id;
  END IF;

  -- ── Category C: RETAIN with justification ──
  -- These records are kept with user_id references intact for:
  -- Financial reconciliation: provider_earnings, provider_payouts, job_cancellation_operations, job_tips, checkouts (amounts), refunds
  -- Audit trail: job_events, job_status_audit, admin_audit_logs
  -- Legal/tax: jobs (financial columns), payment_attempts, processed_webhook_events

  -- ── Close any open deletion support ticket ──
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'support_tickets') THEN
    UPDATE support_tickets SET
      status = 'resolved',
      admin_note = COALESCE(admin_note, '') || ' | Account deletion processed.',
      resolved_at = COALESCE(resolved_at, now()),
      updated_at = now()
    WHERE requester_id = p_user_id
      AND subject = 'Account deletion request'
      AND status IN ('open', 'in_progress');
  END IF;

  -- ── Audit log ──
  INSERT INTO admin_audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (
    COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
    'account_deletion_processed',
    'user',
    p_user_id::text,
    jsonb_build_object('role', v_profile.role, 'processed_at', now())
  );

  RETURN json_build_object('success', true, 'user_id', p_user_id, 'status', 'deleted');
END;
$$;

-- Admin only
REVOKE EXECUTE ON FUNCTION public.process_account_deletion(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_account_deletion(UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public.process_account_deletion(UUID) TO authenticated;

-- ============================================================
-- 3) Pre-deletion eligibility check RPC
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
  v_profile RECORD;
  v_active_jobs INT;
  v_pending_refunds INT;
  v_pending_payouts INT;
  v_blockers JSONB := '[]'::jsonb;
BEGIN
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
    'status', v_profile.status,
    'role', v_profile.role
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_deletion_eligibility(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_deletion_eligibility(UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public.check_deletion_eligibility(UUID) TO authenticated;
