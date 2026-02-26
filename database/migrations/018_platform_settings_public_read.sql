-- Allow all authenticated users to read platform settings
-- (needed for customer/provider apps to fetch fee percentages)

DROP POLICY IF EXISTS "Authenticated users can read platform settings" ON public.platform_settings;
CREATE POLICY "Authenticated users can read platform settings"
  ON public.platform_settings
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Add cancellation_fee and cancellation_fee_pct columns to jobs table
-- for tracking cancellation penalties
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS cancellation_fee NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS cancellation_fee_pct NUMERIC(5,2) DEFAULT 0;
