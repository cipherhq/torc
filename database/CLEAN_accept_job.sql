-- Clean version of accept_job function
-- Copy this entire file into Supabase SQL Editor

DROP FUNCTION IF EXISTS public.accept_job(UUID, UUID);

CREATE FUNCTION public.accept_job(
  p_job_id UUID,
  p_provider_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_job RECORD;
BEGIN
  SELECT * INTO v_job
  FROM jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'JOB_NOT_FOUND',
      'message', 'Job does not exist'
    );
  END IF;

  IF v_job.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'JOB_ALREADY_ACCEPTED',
      'message', 'Job has already been accepted by another provider',
      'current_status', v_job.status,
      'current_provider_id', v_job.provider_id
    );
  END IF;

  UPDATE jobs
  SET
    provider_id = p_provider_id,
    status = 'accepted',
    accepted_at = NOW(),
    updated_at = NOW()
  WHERE id = p_job_id;

  INSERT INTO job_events (job_id, event_type, actor_id, actor_type, metadata)
  VALUES (
    p_job_id,
    'job_accepted',
    p_provider_id,
    'provider',
    jsonb_build_object('previous_status', v_job.status)
  );

  PERFORM pg_notify(
    'job_accepted',
    jsonb_build_object(
      'job_id', p_job_id,
      'provider_id', p_provider_id,
      'customer_id', v_job.customer_id
    )::text
  );

  RETURN jsonb_build_object(
    'success', true,
    'job_id', p_job_id,
    'provider_id', p_provider_id,
    'status', 'accepted',
    'accepted_at', NOW()
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.accept_job TO authenticated;
