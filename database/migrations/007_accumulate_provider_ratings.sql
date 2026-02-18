-- Accumulate provider ratings from completed job reviews.
-- This keeps provider_profiles.rating (and profiles.rating) in sync
-- whenever a customer submits/updates a review on jobs.

CREATE OR REPLACE FUNCTION public.recalculate_provider_rating(p_provider_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_avg_rating numeric(3,2);
  v_completed_jobs integer;
BEGIN
  IF p_provider_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(ROUND(AVG(j.rating)::numeric, 2), 0),
    COUNT(*)::integer
  INTO v_avg_rating, v_completed_jobs
  FROM public.jobs j
  WHERE j.provider_id = p_provider_id
    AND j.status = 'completed'
    AND j.rating IS NOT NULL;

  UPDATE public.provider_profiles
  SET
    rating = v_avg_rating,
    total_jobs = v_completed_jobs,
    updated_at = now()
  WHERE id = p_provider_id;

  UPDATE public.profiles
  SET
    rating = v_avg_rating,
    total_jobs = v_completed_jobs
  WHERE id = p_provider_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_job_review_change_update_provider_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Recalculate for the old provider if provider assignment changed.
  IF TG_OP = 'UPDATE'
     AND OLD.provider_id IS DISTINCT FROM NEW.provider_id
     AND OLD.provider_id IS NOT NULL THEN
    PERFORM public.recalculate_provider_rating(OLD.provider_id);
  END IF;

  -- Recalculate for the current provider when review/status/provider changes.
  IF NEW.provider_id IS NOT NULL THEN
    PERFORM public.recalculate_provider_rating(NEW.provider_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_review_change_update_provider_rating ON public.jobs;

CREATE TRIGGER trg_job_review_change_update_provider_rating
AFTER INSERT OR UPDATE OF rating, status, provider_id
ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.on_job_review_change_update_provider_rating();

-- Backfill existing providers once migration is applied.
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT DISTINCT provider_id
    FROM public.jobs
    WHERE provider_id IS NOT NULL
  LOOP
    PERFORM public.recalculate_provider_rating(rec.provider_id);
  END LOOP;
END;
$$;
