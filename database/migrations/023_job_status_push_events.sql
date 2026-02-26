-- Emit push-worker pg_notify events for status updates that currently
-- happen through direct job status updates in app code.
-- This complements accept_job/cancel_job RPC notifications without duplicating them.

CREATE OR REPLACE FUNCTION public.notify_job_status_push_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Customer should be notified when provider arrives.
  IF NEW.status = 'arrived' THEN
    PERFORM pg_notify(
      'provider_arrived',
      jsonb_build_object(
        'job_id', NEW.id,
        'customer_id', NEW.customer_id,
        'provider_id', NEW.provider_id
      )::text
    );
  END IF;

  -- Customer should be notified when provider completes the job.
  IF NEW.status = 'completed' THEN
    PERFORM pg_notify(
      'job_completed',
      jsonb_build_object(
        'job_id', NEW.id,
        'customer_id', NEW.customer_id,
        'provider_id', NEW.provider_id
      )::text
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_jobs_notify_status_push_events ON public.jobs;

CREATE TRIGGER trg_jobs_notify_status_push_events
AFTER UPDATE OF status ON public.jobs
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.notify_job_status_push_events();

COMMENT ON FUNCTION public.notify_job_status_push_events IS
'Emits provider_arrived/job_completed pg_notify events for push worker when job status changes.';
