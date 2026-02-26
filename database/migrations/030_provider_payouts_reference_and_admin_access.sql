-- Add reference_id, payment_method, and notes columns to provider_payouts
-- so admins can record external payment details when completing payouts.

ALTER TABLE public.provider_payouts
  ADD COLUMN IF NOT EXISTS reference_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Index for looking up payouts by reference
CREATE INDEX IF NOT EXISTS idx_provider_payouts_reference
  ON public.provider_payouts(reference_id)
  WHERE reference_id IS NOT NULL;

-- Allow public read access to provider_payout_methods so the admin-web
-- (which currently uses the anon key) can display provider bank accounts.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'provider_payout_methods'
      AND policyname = 'Anyone can read payout methods'
  ) THEN
    CREATE POLICY "Anyone can read payout methods"
      ON public.provider_payout_methods
      FOR SELECT USING (true);
  END IF;
END $$;

-- Allow public insert/update on provider_payouts so admin-web can record payouts.
-- (Until admin auth is added, the anon key needs write access.)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'provider_payouts'
      AND policyname = 'Anyone can insert payouts'
  ) THEN
    CREATE POLICY "Anyone can insert payouts"
      ON public.provider_payouts
      FOR INSERT WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'provider_payouts'
      AND policyname = 'Anyone can update payouts'
  ) THEN
    CREATE POLICY "Anyone can update payouts"
      ON public.provider_payouts
      FOR UPDATE USING (true);
  END IF;
END $$;
