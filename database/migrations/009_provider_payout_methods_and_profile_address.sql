-- Add provider payout methods and profile address fields.

CREATE TABLE IF NOT EXISTS public.provider_payout_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  method_type TEXT NOT NULL CHECK (method_type IN ('bank', 'paypal', 'venmo')),
  display_name TEXT,
  account_holder_name TEXT,
  bank_name TEXT,
  account_last4 TEXT,
  routing_last4 TEXT,
  paypal_email TEXT,
  venmo_handle TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_payout_methods_provider_id
  ON public.provider_payout_methods(provider_id);

ALTER TABLE public.provider_payout_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Providers can manage own payout methods" ON public.provider_payout_methods;
CREATE POLICY "Providers can manage own payout methods"
  ON public.provider_payout_methods
  FOR ALL
  USING (auth.uid() = provider_id)
  WITH CHECK (auth.uid() = provider_id);

-- Keep updated_at current.
CREATE OR REPLACE FUNCTION public.set_provider_payout_methods_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_provider_payout_methods_updated_at ON public.provider_payout_methods;
CREATE TRIGGER trg_provider_payout_methods_updated_at
BEFORE UPDATE ON public.provider_payout_methods
FOR EACH ROW
EXECUTE FUNCTION public.set_provider_payout_methods_updated_at();

-- Allow provider profile address editing from app.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address_line1 TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address_line2 TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country TEXT;
