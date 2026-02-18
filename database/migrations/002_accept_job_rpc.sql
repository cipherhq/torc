-- Migration: accept_job RPC
-- Purpose: Atomic job acceptance with race protection
-- Run this in Supabase SQL Editor AFTER running 001_job_events_table.sql

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
  v_result JSONB;
BEGIN
  -- Lock the job row to prevent race conditions
  SELECT * INTO v_job
  FROM jobs
  WHERE id = p_job_id
  FOR UPDATE;

  -- Check if job exists
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'JOB_NOT_FOUND',
      'message', 'Job does not exist'
    );
  END IF;

  -- Check if job is still pending
  IF v_job.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'JOB_ALREADY_ACCEPTED',
      'message', 'Job has already been accepted by another provider',
      'current_status', v_job.status,
      'current_provider_id', v_job.provider_id
    );
  END IF;

  -- Claim the job
  UPDATE jobs
  SET
    provider_id = p_provider_id,
    status = 'accepted',
    accepted_at = NOW(),
    updated_at = NOW()
  WHERE id = p_job_id;

  -- Log the event
  INSERT INTO job_events (job_id, event_type, actor_id, actor_type, metadata)
  VALUES (
    p_job_id,
    'job_accepted',
    p_provider_id,
    'provider',
    jsonb_build_object('previous_status', v_job.status)
  );

  -- Emit pg_notify for push notification worker
  PERFORM pg_notify(
    'job_accepted',
    jsonb_build_object(
      'job_id', p_job_id,
      'provider_id', p_provider_id,
      'customer_id', v_job.customer_id
    )::text
  );

  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'job_id', p_job_id,
    'provider_id', p_provider_id,
    'status', 'accepted',
    'accepted_at', NOW()
  );
END;
$$;

COMMENT ON FUNCTION public.accept_job IS 'Atomically accept a job with race protection. Returns success or error if job already accepted.';

-- Grant execute to authenticated users (providers)
GRANT EXECUTE ON FUNCTION public.accept_job TO authenticated;
