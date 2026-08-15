-- Fix missing service_role GRANT on tip RPCs called by Edge Functions.
-- finalize_tip_payment is called by stripe-webhook (service_role).
-- rotate_tip_idempotency_key is called by create-tip-intent (service_role).
-- Without these grants, the webhook silently fails to finalize tip payments.

GRANT EXECUTE ON FUNCTION public.finalize_tip_payment(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.rotate_tip_idempotency_key(UUID, TEXT) TO service_role;
