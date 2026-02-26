-- Lifecycle metrics + status history collection for jobs.
-- Ensures service start/completion tracking is consistently captured.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.job_status_history (
  id BIGSERIAL PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_job_status_history_job_id ON public.job_status_history(job_id);
CREATE INDEX IF NOT EXISTS idx_job_status_history_changed_at ON public.job_status_history(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_status_history_new_status ON public.job_status_history(new_status);

ALTER TABLE public.job_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read job status history" ON public.job_status_history;
CREATE POLICY "Admins can read job status history"
  ON public.job_status_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Users can read own job status history" ON public.job_status_history;
CREATE POLICY "Users can read own job status history"
  ON public.job_status_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.jobs j
      WHERE j.id = job_status_history.job_id
        AND (j.customer_id = auth.uid() OR j.provider_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Service role inserts job status history" ON public.job_status_history;
CREATE POLICY "Service role inserts job status history"
  ON public.job_status_history
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.apply_job_status_timestamps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'accepted' AND NEW.accepted_at IS NULL THEN
      NEW.accepted_at = COALESCE(OLD.accepted_at, now());
    END IF;

    IF NEW.status IN ('in_progress', 'inprogress') AND NEW.started_at IS NULL THEN
      NEW.started_at = COALESCE(OLD.started_at, now());
    END IF;

    IF NEW.status = 'completed' THEN
      IF NEW.started_at IS NULL THEN
        NEW.started_at = COALESCE(OLD.started_at, OLD.accepted_at, OLD.created_at, NEW.created_at, now());
      END IF;
      IF NEW.completed_at IS NULL THEN
        NEW.completed_at = COALESCE(OLD.completed_at, now());
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_job_status_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_actor_type text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_actor_id := COALESCE(auth.uid(), NEW.provider_id, NEW.customer_id);
  v_actor_type := CASE
    WHEN auth.uid() = NEW.provider_id THEN 'provider'
    WHEN auth.uid() = NEW.customer_id THEN 'customer'
    ELSE 'system'
  END;

  INSERT INTO public.job_status_history (
    job_id,
    old_status,
    new_status,
    changed_at,
    actor_id,
    metadata
  )
  VALUES (
    NEW.id,
    OLD.status,
    NEW.status,
    now(),
    v_actor_id,
    jsonb_build_object(
      'accepted_at', NEW.accepted_at,
      'started_at', NEW.started_at,
      'completed_at', NEW.completed_at
    )
  );

  -- Keep job_events in sync for downstream analytics/audit subscribers.
  IF to_regclass('public.job_events') IS NOT NULL THEN
    INSERT INTO public.job_events (
      job_id,
      event_type,
      actor_id,
      actor_type,
      metadata
    )
    VALUES (
      NEW.id,
      CONCAT('job_status_', NEW.status),
      v_actor_id,
      v_actor_type,
      jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_jobs_apply_status_timestamps ON public.jobs;
CREATE TRIGGER trg_jobs_apply_status_timestamps
BEFORE UPDATE OF status ON public.jobs
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.apply_job_status_timestamps();

DROP TRIGGER IF EXISTS trg_jobs_log_status_history ON public.jobs;
CREATE TRIGGER trg_jobs_log_status_history
AFTER UPDATE OF status ON public.jobs
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.log_job_status_history();

CREATE OR REPLACE VIEW public.v_job_lifecycle_metrics AS
SELECT
  j.id AS job_id,
  j.customer_id,
  j.provider_id,
  j.status,
  j.created_at,
  j.accepted_at,
  j.started_at,
  j.completed_at,
  CASE
    WHEN j.started_at IS NOT NULL THEN EXTRACT(EPOCH FROM (j.started_at - j.created_at)) / 60.0
    ELSE NULL
  END AS start_delay_minutes,
  CASE
    WHEN j.completed_at IS NOT NULL AND j.started_at IS NOT NULL THEN EXTRACT(EPOCH FROM (j.completed_at - j.started_at)) / 60.0
    ELSE NULL
  END AS service_duration_minutes
FROM public.jobs j;

GRANT SELECT ON public.v_job_lifecycle_metrics TO authenticated;
GRANT SELECT ON public.v_job_lifecycle_metrics TO service_role;
