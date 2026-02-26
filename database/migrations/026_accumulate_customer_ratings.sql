-- Accumulate customer ratings from completed provider feedback.
-- This keeps profiles.rating in sync for customer accounts.

CREATE OR REPLACE FUNCTION public.recalculate_customer_rating(p_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_avg_rating numeric(3,2);
BEGIN
  IF p_customer_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(ROUND(AVG(j.provider_rating)::numeric, 2), 0)
  INTO v_avg_rating
  FROM public.jobs j
  WHERE j.customer_id = p_customer_id
    AND j.status = 'completed'
    AND j.provider_rating IS NOT NULL;

  UPDATE public.profiles
  SET rating = v_avg_rating
  WHERE id = p_customer_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_provider_feedback_change_update_customer_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.customer_id IS DISTINCT FROM NEW.customer_id
     AND OLD.customer_id IS NOT NULL THEN
    PERFORM public.recalculate_customer_rating(OLD.customer_id);
  END IF;

  IF NEW.customer_id IS NOT NULL THEN
    PERFORM public.recalculate_customer_rating(NEW.customer_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_provider_feedback_change_update_customer_rating ON public.jobs;

CREATE TRIGGER trg_provider_feedback_change_update_customer_rating
AFTER INSERT OR UPDATE OF provider_rating, status, customer_id
ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.on_provider_feedback_change_update_customer_rating();

GRANT EXECUTE ON FUNCTION public.recalculate_customer_rating(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_customer_rating(uuid) TO service_role;

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT DISTINCT customer_id
    FROM public.jobs
    WHERE customer_id IS NOT NULL
      AND provider_rating IS NOT NULL
  LOOP
    PERFORM public.recalculate_customer_rating(rec.customer_id);
  END LOOP;
END $$;
