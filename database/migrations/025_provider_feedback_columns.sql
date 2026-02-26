-- Ensure provider->customer feedback fields exist separately from customer->provider rating.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS provider_rating INTEGER;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS provider_review TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_provider_rating_range_check'
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_provider_rating_range_check
      CHECK (provider_rating IS NULL OR (provider_rating >= 1 AND provider_rating <= 5));
  END IF;
END $$;
