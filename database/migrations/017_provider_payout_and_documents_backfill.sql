-- Backfill provider payout + documents schema compatibility.

-- 1) Ensure provider_payout_methods exists with columns used by app.
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

ALTER TABLE public.provider_payout_methods
  ADD COLUMN IF NOT EXISTS method_type TEXT,
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS account_holder_name TEXT,
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  ADD COLUMN IF NOT EXISTS account_last4 TEXT,
  ADD COLUMN IF NOT EXISTS routing_last4 TEXT,
  ADD COLUMN IF NOT EXISTS paypal_email TEXT,
  ADD COLUMN IF NOT EXISTS venmo_handle TEXT,
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_provider_payout_methods_provider_id ON public.provider_payout_methods(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_payout_methods_default ON public.provider_payout_methods(provider_id, is_default);

ALTER TABLE public.provider_payout_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Provider can read own payout methods" ON public.provider_payout_methods;
CREATE POLICY "Provider can read own payout methods"
  ON public.provider_payout_methods
  FOR SELECT
  USING (auth.uid() = provider_id);

DROP POLICY IF EXISTS "Provider can manage own payout methods" ON public.provider_payout_methods;
CREATE POLICY "Provider can manage own payout methods"
  ON public.provider_payout_methods
  FOR ALL
  USING (auth.uid() = provider_id)
  WITH CHECK (auth.uid() = provider_id);

DROP POLICY IF EXISTS "Admins can read payout methods" ON public.provider_payout_methods;
CREATE POLICY "Admins can read payout methods"
  ON public.provider_payout_methods
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

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

-- 2) Documents table compatibility (older DBs may miss these columns).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'documents'
  ) THEN
    ALTER TABLE public.documents
      ADD COLUMN IF NOT EXISTS file_path TEXT,
      ADD COLUMN IF NOT EXISTS file_url TEXT,
      ADD COLUMN IF NOT EXISTS mime_type TEXT,
      ADD COLUMN IF NOT EXISTS file_size BIGINT,
      ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
      ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
  END IF;
END $$;
