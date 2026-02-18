-- Migration: cancel_job RPC
-- Purpose: Atomic job cancellation with proper actor tracking
-- Run this in Supabase SQL Editor AFTER running 002_accept_job_rpc.sql

CREATE OR REPLACE FUNCTION public.cancel_job(
  p_job_id UUID,
  p_actor_id UUID,
  p_actor_type TEXT, -- 'provider' or 'customer'
  p_reason TEXT DEFAULT NULL
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
  -- Lock the job row
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

  -- Check if job can be cancelled (not already completed or cancelled)
  IF v_job.status IN ('completed', 'cancelled') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'JOB_CANNOT_BE_CANCELLED',
      'message', 'Job has already been ' || v_job.status,
      'current_status', v_job.status
    );
  END IF;

  -- Verify actor is authorized (customer who created it, or assigned provider)
  IF p_actor_type = 'customer' AND v_job.customer_id != p_actor_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHORIZED',
      'message', 'You are not authorized to cancel this job'
    );
  END IF;

  IF p_actor_type = 'provider' AND (v_job.provider_id IS NULL OR v_job.provider_id != p_actor_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHORIZED',
      'message', 'You are not the assigned provider for this job'
    );
  END IF;

  -- Cancel the job
  UPDATE jobs
  SET
    status = 'cancelled',
    cancellation_reason = p_reason,
    cancelled_at = NOW(),
    cancelled_by = p_actor_id,
    updated_at = NOW()
  WHERE id = p_job_id;

  -- Log the event
  INSERT INTO job_events (job_id, event_type, actor_id, actor_type, metadata)
  VALUES (
    p_job_id,
    'job_cancelled',
    p_actor_id,
    p_actor_type,
    jsonb_build_object(
      'reason', p_reason,
      'previous_status', v_job.status
    )
  );

  -- Emit pg_notify for push notification worker
  PERFORM pg_notify(
    'job_cancelled',
    jsonb_build_object(
      'job_id', p_job_id,
      'cancelled_by', p_actor_id,
      'actor_type', p_actor_type,
      'customer_id', v_job.customer_id,
      'provider_id', v_job.provider_id,
      'reason', p_reason
    )::text
  );

  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'job_id', p_job_id,
    'status', 'cancelled',
    'cancelled_by', p_actor_id,
    'cancelled_at', NOW(),
    'reason', p_reason
  );
END;
$$;

COMMENT ON FUNCTION public.cancel_job IS 'Atomically cancel a job. Only the customer or assigned provider can cancel.';

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.cancel_job TO authenticated;
