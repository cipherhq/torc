-- Allow customer to mark service as complete independently of provider.
-- This timestamp records when the customer confirmed completion, while the
-- actual job status remains controlled by the provider's completion flow.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS customer_completed_at TIMESTAMPTZ;
