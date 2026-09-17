DROP POLICY IF EXISTS "Anyone can view pending unassigned jobs" ON public.jobs;
DROP POLICY IF EXISTS "Providers can claim pending jobs" ON public.jobs;

REVOKE ALL ON public.jobs FROM anon;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.jobs FROM authenticated;

CREATE OR REPLACE FUNCTION public.guard_job_lifecycle_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION 'New jobs must have status pending.' USING ERRCODE = '42501';
    END IF;
    IF NEW.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'Cannot set accepted_at on creation.' USING ERRCODE = '42501'; END IF;
    IF NEW.started_at IS NOT NULL THEN RAISE EXCEPTION 'Cannot set started_at on creation.' USING ERRCODE = '42501'; END IF;
    IF NEW.completed_at IS NOT NULL THEN RAISE EXCEPTION 'Cannot set completed_at on creation.' USING ERRCODE = '42501'; END IF;
    IF NEW.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'Cannot set cancelled_at on creation.' USING ERRCODE = '42501'; END IF;
    IF NEW.customer_completed_at IS NOT NULL THEN RAISE EXCEPTION 'Cannot set customer_completed_at on creation.' USING ERRCODE = '42501'; END IF;
    IF NEW.tip IS NOT NULL AND NEW.tip != 0 THEN RAISE EXCEPTION 'Cannot set tip on creation.' USING ERRCODE = '42501'; END IF;
    IF NEW.cancellation_fee IS NOT NULL AND NEW.cancellation_fee != 0 THEN RAISE EXCEPTION 'Cannot set cancellation_fee on creation.' USING ERRCODE = '42501'; END IF;
    IF NEW.cancellation_fee_pct IS NOT NULL AND NEW.cancellation_fee_pct != 0 THEN RAISE EXCEPTION 'Cannot set cancellation_fee_pct on creation.' USING ERRCODE = '42501'; END IF;
    RETURN NEW;
  END IF;

  -- UPDATE guard
  IF NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'Direct status mutation not allowed.' USING ERRCODE = '42501'; END IF;
  IF NEW.accepted_at IS DISTINCT FROM OLD.accepted_at THEN RAISE EXCEPTION 'Direct accepted_at mutation not allowed.' USING ERRCODE = '42501'; END IF;
  IF NEW.started_at IS DISTINCT FROM OLD.started_at THEN RAISE EXCEPTION 'Direct started_at mutation not allowed.' USING ERRCODE = '42501'; END IF;
  IF NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN RAISE EXCEPTION 'Direct completed_at mutation not allowed.' USING ERRCODE = '42501'; END IF;
  IF NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at THEN RAISE EXCEPTION 'Direct cancelled_at mutation not allowed.' USING ERRCODE = '42501'; END IF;
  IF NEW.customer_completed_at IS DISTINCT FROM OLD.customer_completed_at THEN RAISE EXCEPTION 'Direct customer_completed_at mutation not allowed.' USING ERRCODE = '42501'; END IF;
  IF NEW.tip IS DISTINCT FROM OLD.tip THEN RAISE EXCEPTION 'Direct tip mutation not allowed.' USING ERRCODE = '42501'; END IF;
  IF NEW.cancellation_fee IS DISTINCT FROM OLD.cancellation_fee THEN RAISE EXCEPTION 'Direct cancellation_fee mutation not allowed.' USING ERRCODE = '42501'; END IF;
  IF NEW.cancellation_fee_pct IS DISTINCT FROM OLD.cancellation_fee_pct THEN RAISE EXCEPTION 'Direct cancellation_fee_pct mutation not allowed.' USING ERRCODE = '42501'; END IF;

  IF NOT is_admin(auth.uid())
     AND current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    IF NEW.base_price IS DISTINCT FROM OLD.base_price THEN RAISE EXCEPTION 'Direct base_price mutation not allowed.' USING ERRCODE = '42501'; END IF;
    IF NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN RAISE EXCEPTION 'Direct total_amount mutation not allowed.' USING ERRCODE = '42501'; END IF;
    IF NEW.tax IS DISTINCT FROM OLD.tax THEN RAISE EXCEPTION 'Direct tax mutation not allowed.' USING ERRCODE = '42501'; END IF;
    IF NEW.service_fee IS DISTINCT FROM OLD.service_fee THEN RAISE EXCEPTION 'Direct service_fee mutation not allowed.' USING ERRCODE = '42501'; END IF;
    IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN RAISE EXCEPTION 'Direct payment_status mutation not allowed.' USING ERRCODE = '42501'; END IF;
    IF NEW.payment_intent_id IS DISTINCT FROM OLD.payment_intent_id THEN RAISE EXCEPTION 'Direct payment_intent_id mutation not allowed.' USING ERRCODE = '42501'; END IF;
    IF NEW.stripe_charge_id IS DISTINCT FROM OLD.stripe_charge_id THEN RAISE EXCEPTION 'Direct stripe_charge_id mutation not allowed.' USING ERRCODE = '42501'; END IF;
    IF NEW.checkout_id IS DISTINCT FROM OLD.checkout_id THEN RAISE EXCEPTION 'Direct checkout_id mutation not allowed.' USING ERRCODE = '42501'; END IF;
    IF NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN RAISE EXCEPTION 'Direct customer_id mutation not allowed.' USING ERRCODE = '42501'; END IF;
    IF NEW.provider_id IS DISTINCT FROM OLD.provider_id THEN RAISE EXCEPTION 'Direct provider_id mutation not allowed.' USING ERRCODE = '42501'; END IF;
    IF NEW.service_id IS DISTINCT FROM OLD.service_id THEN RAISE EXCEPTION 'Direct service_id mutation not allowed.' USING ERRCODE = '42501'; END IF;
  END IF;

  RETURN NEW;
END;
$$;
