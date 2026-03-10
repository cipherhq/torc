-- Migration 049: Notifications for job acceptance and provider en-route
-- 1. Modifies accept_job RPC to insert in-app notification for customer
-- 2. Adds trigger to notify customer when provider starts heading (enroute)
-- 3. Adds trigger to send provider reminder 30 min before scheduled time

-- ============================================================
-- 1. Updated accept_job RPC with customer notification
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

COMMENT ON FUNCTION public.accept_job IS 'Atomically accept a job with race protection. Inserts notifications for customer and provider.';
GRANT EXECUTE ON FUNCTION public.accept_job TO authenticated;

-- ============================================================
-- 2. Trigger: notify customer when provider starts heading (enroute)
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_customer_provider_enroute()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider_name TEXT;
BEGIN
  -- Only fire when status changes TO enroute
  IF OLD.status IS DISTINCT FROM NEW.status
     AND NEW.status IN ('enroute', 'en_route')
     AND NEW.provider_id IS NOT NULL
     AND NEW.customer_id IS NOT NULL
  THEN
    SELECT COALESCE(
      NULLIF(TRIM(first_name), '') || COALESCE(' ' || LEFT(last_name, 1) || '.', ''),
      'Your provider'
    ) INTO v_provider_name FROM profiles WHERE id = NEW.provider_id;

    INSERT INTO notifications (user_id, type, title, message, action_url)
    VALUES (
      NEW.customer_id, 'service', 'Provider On The Way',
      v_provider_name || ' is heading to your location now.',
      '/tracking/' || NEW.id::text
    );

    -- Also emit pg_notify for push notification
    PERFORM pg_notify('provider_enroute', jsonb_build_object(
      'job_id', NEW.id, 'provider_id', NEW.provider_id, 'customer_id', NEW.customer_id
    )::text);
  END IF;

  RETURN NEW;
END;
$$;

-- Drop if exists then create trigger
DROP TRIGGER IF EXISTS trg_notify_customer_provider_enroute ON jobs;
CREATE TRIGGER trg_notify_customer_provider_enroute
  AFTER UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION notify_customer_provider_enroute();

-- ============================================================
-- 3. Function: send reminder to provider before scheduled time
--    Called by pg_cron or application-level scheduler
-- ============================================================
CREATE OR REPLACE FUNCTION public.send_scheduled_job_reminders()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job RECORD;
  v_count INTEGER := 0;
BEGIN
  -- Find accepted scheduled jobs where scheduled_for is 30-35 minutes from now
  -- (5-minute window to avoid duplicate sends on repeated cron runs)
  FOR v_job IN
    SELECT j.id, j.provider_id, j.customer_id, j.scheduled_for, j.pickup_address,
           s.name AS service_name
    FROM jobs j
    LEFT JOIN services s ON s.id = j.service_id
    WHERE j.status = 'accepted'
      AND j.scheduled_for IS NOT NULL
      AND j.scheduled_for BETWEEN NOW() + INTERVAL '25 minutes' AND NOW() + INTERVAL '35 minutes'
      AND j.provider_id IS NOT NULL
  LOOP
    -- Reminder to provider
    INSERT INTO notifications (user_id, type, title, message, action_url)
    VALUES (
      v_job.provider_id, 'alert', 'Upcoming Job Reminder',
      'Your scheduled ' || COALESCE(v_job.service_name, 'service') || ' job is in about 30 minutes. Start heading to ' || COALESCE(LEFT(v_job.pickup_address, 50), 'the customer') || ' soon!',
      '/job/' || v_job.id::text
    );

    -- Reminder to customer
    INSERT INTO notifications (user_id, type, title, message, action_url)
    VALUES (
      v_job.customer_id, 'alert', 'Service Reminder',
      'Your scheduled ' || COALESCE(v_job.service_name, 'service') || ' is in about 30 minutes.',
      '/tracking/' || v_job.id::text
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.send_scheduled_job_reminders IS 'Send reminder notifications 30 minutes before scheduled jobs. Call via pg_cron every 5 minutes.';
GRANT EXECUTE ON FUNCTION public.send_scheduled_job_reminders TO service_role;
