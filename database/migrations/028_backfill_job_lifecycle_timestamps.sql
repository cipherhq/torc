-- Backfill lifecycle timestamps for jobs completed before migration 027.
-- This makes historical dashboard/reporting metrics usable.

-- Ensure accepted_at exists for progressed lifecycle states.
UPDATE public.jobs
SET accepted_at = COALESCE(accepted_at, created_at)
WHERE accepted_at IS NULL
  AND status IN ('accepted', 'en_route', 'enroute', 'arrived', 'in_progress', 'inprogress', 'completed');

-- Ensure started_at exists for in-progress and completed jobs.
UPDATE public.jobs
SET started_at = COALESCE(started_at, accepted_at, created_at)
WHERE started_at IS NULL
  AND status IN ('in_progress', 'inprogress', 'completed');

-- Ensure completed_at exists for completed jobs.
UPDATE public.jobs
SET completed_at = COALESCE(completed_at, started_at, accepted_at, created_at)
WHERE completed_at IS NULL
  AND status = 'completed';

-- Guard against invalid ordering if any legacy rows were inconsistent.
UPDATE public.jobs
SET completed_at = started_at
WHERE status = 'completed'
  AND started_at IS NOT NULL
  AND completed_at IS NOT NULL
  AND completed_at < started_at;

