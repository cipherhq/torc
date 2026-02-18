-- Add mutual confirmation fields to jobs table
-- This allows both provider and customer to confirm key milestones

ALTER TABLE public.jobs 
ADD COLUMN IF NOT EXISTS provider_arrived_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS customer_confirmed_arrival_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS provider_started_service_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS provider_marked_completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS customer_confirmed_completion_at TIMESTAMPTZ;

-- Add comments
COMMENT ON COLUMN public.jobs.provider_arrived_at IS 'When provider clicked "I have arrived"';
COMMENT ON COLUMN public.jobs.customer_confirmed_arrival_at IS 'When customer confirmed provider arrival';
COMMENT ON COLUMN public.jobs.provider_started_service_at IS 'When provider clicked "Start Service"';
COMMENT ON COLUMN public.jobs.provider_marked_completed_at IS 'When provider marked job as complete';
COMMENT ON COLUMN public.jobs.customer_confirmed_completion_at IS 'When customer confirmed job completion';

-- Create function for provider to mark arrival
CREATE OR REPLACE FUNCTION mark_provider_arrived(job_id UUID)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job jobs%ROWTYPE;
  v_provider_id UUID;
BEGIN
  -- Get current user
  v_provider_id := auth.uid();
  
  IF v_provider_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Update job with FOR UPDATE lock
  UPDATE jobs
  SET 
    provider_arrived_at = now(),
    status = CASE 
      WHEN status = 'enroute' THEN 'arrived'
      ELSE status
    END,
    updated_at = now()
  WHERE id = job_id
    AND provider_id = v_provider_id
    AND status IN ('enroute', 'accepted')
  RETURNING * INTO v_job;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found or invalid status';
  END IF;

  -- Log event
  INSERT INTO job_events (job_id, event_type, actor_id, details)
  VALUES (job_id, 'provider_arrived', v_provider_id, 
    json_build_object('arrived_at', v_job.provider_arrived_at));

  -- Trigger notification
  PERFORM pg_notify('job_updates', json_build_object(
    'job_id', job_id,
    'event', 'provider_arrived',
    'provider_id', v_provider_id,
    'customer_id', v_job.customer_id
  )::text);

  RETURN json_build_object('success', true, 'job', row_to_json(v_job));
END;
$$;

-- Create function for customer to confirm arrival
CREATE OR REPLACE FUNCTION confirm_provider_arrival(job_id UUID)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job jobs%ROWTYPE;
  v_customer_id UUID;
BEGIN
  v_customer_id := auth.uid();
  
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE jobs
  SET 
    customer_confirmed_arrival_at = now(),
    updated_at = now()
  WHERE id = job_id
    AND customer_id = v_customer_id
    AND status = 'arrived'
    AND provider_arrived_at IS NOT NULL
  RETURNING * INTO v_job;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found or provider has not arrived yet';
  END IF;

  INSERT INTO job_events (job_id, event_type, actor_id, details)
  VALUES (job_id, 'customer_confirmed_arrival', v_customer_id,
    json_build_object('confirmed_at', v_job.customer_confirmed_arrival_at));

  PERFORM pg_notify('job_updates', json_build_object(
    'job_id', job_id,
    'event', 'customer_confirmed_arrival',
    'customer_id', v_customer_id,
    'provider_id', v_job.provider_id
  )::text);

  RETURN json_build_object('success', true, 'job', row_to_json(v_job));
END;
$$;

-- Create function for provider to start service
CREATE OR REPLACE FUNCTION start_service(job_id UUID)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job jobs%ROWTYPE;
  v_provider_id UUID;
BEGIN
  v_provider_id := auth.uid();
  
  IF v_provider_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE jobs
  SET 
    provider_started_service_at = now(),
    status = 'inprogress',
    started_at = COALESCE(started_at, now()),
    updated_at = now()
  WHERE id = job_id
    AND provider_id = v_provider_id
    AND status = 'arrived'
  RETURNING * INTO v_job;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found or invalid status';
  END IF;

  INSERT INTO job_events (job_id, event_type, actor_id, details)
  VALUES (job_id, 'service_started', v_provider_id,
    json_build_object('started_at', v_job.provider_started_service_at));

  PERFORM pg_notify('job_updates', json_build_object(
    'job_id', job_id,
    'event', 'service_started',
    'provider_id', v_provider_id,
    'customer_id', v_job.customer_id
  )::text);

  RETURN json_build_object('success', true, 'job', row_to_json(v_job));
END;
$$;

-- Create function for provider to mark completed
CREATE OR REPLACE FUNCTION mark_job_completed(job_id UUID)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job jobs%ROWTYPE;
  v_provider_id UUID;
BEGIN
  v_provider_id := auth.uid();
  
  IF v_provider_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE jobs
  SET 
    provider_marked_completed_at = now(),
    updated_at = now()
  WHERE id = job_id
    AND provider_id = v_provider_id
    AND status = 'inprogress'
  RETURNING * INTO v_job;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found or invalid status';
  END IF;

  INSERT INTO job_events (job_id, event_type, actor_id, details)
  VALUES (job_id, 'provider_marked_completed', v_provider_id,
    json_build_object('marked_at', v_job.provider_marked_completed_at));

  PERFORM pg_notify('job_updates', json_build_object(
    'job_id', job_id,
    'event', 'provider_marked_completed',
    'provider_id', v_provider_id,
    'customer_id', v_job.customer_id
  )::text);

  RETURN json_build_object('success', true, 'job', row_to_json(v_job));
END;
$$;

-- Create function for customer to confirm completion
CREATE OR REPLACE FUNCTION confirm_job_completion(job_id UUID)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job jobs%ROWTYPE;
  v_customer_id UUID;
BEGIN
  v_customer_id := auth.uid();
  
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE jobs
  SET 
    customer_confirmed_completion_at = now(),
    status = 'completed',
    completed_at = now(),
    updated_at = now()
  WHERE id = job_id
    AND customer_id = v_customer_id
    AND status = 'inprogress'
    AND provider_marked_completed_at IS NOT NULL
  RETURNING * INTO v_job;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found or provider has not marked as completed';
  END IF;

  INSERT INTO job_events (job_id, event_type, actor_id, details)
  VALUES (job_id, 'customer_confirmed_completion', v_customer_id,
    json_build_object('confirmed_at', v_job.customer_confirmed_completion_at));

  PERFORM pg_notify('job_updates', json_build_object(
    'job_id', job_id,
    'event', 'job_completed',
    'customer_id', v_customer_id,
    'provider_id', v_job.provider_id
  )::text);

  RETURN json_build_object('success', true, 'job', row_to_json(v_job));
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION mark_provider_arrived(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION confirm_provider_arrival(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION start_service(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_job_completed(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION confirm_job_completion(UUID) TO authenticated;
