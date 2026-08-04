-- Provider payout methods and profile address columns

CREATE TABLE IF NOT EXISTS public.provider_payout_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  method_type TEXT NOT NULL,
  display_name TEXT,
  account_holder_name TEXT,
  bank_name TEXT,
  account_last4 TEXT,
  routing_last4 TEXT,
  paypal_email TEXT,
  venmo_handle TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS address_line1 TEXT,
  ADD COLUMN IF NOT EXISTS address_line2 TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT;

ALTER TABLE public.provider_payout_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers can view own payout methods"
  ON public.provider_payout_methods FOR SELECT
  USING (auth.uid() = provider_id);

CREATE POLICY "Providers can insert own payout methods"
  ON public.provider_payout_methods FOR INSERT
  WITH CHECK (auth.uid() = provider_id);

CREATE POLICY "Providers can update own payout methods"
  ON public.provider_payout_methods FOR UPDATE
  USING (auth.uid() = provider_id);

CREATE POLICY "Providers can delete own payout methods"
  ON public.provider_payout_methods FOR DELETE
  USING (auth.uid() = provider_id);
