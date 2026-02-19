-- Admin refunds table for payment operations and audit trail.

CREATE TABLE IF NOT EXISTS public.refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  provider_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  processed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refunds_job_id ON public.refunds(job_id);
CREATE INDEX IF NOT EXISTS idx_refunds_customer_id ON public.refunds(customer_id);
CREATE INDEX IF NOT EXISTS idx_refunds_provider_id ON public.refunds(provider_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON public.refunds(status);
CREATE INDEX IF NOT EXISTS idx_refunds_created_at ON public.refunds(created_at DESC);

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own refunds" ON public.refunds;
CREATE POLICY "Users can view own refunds"
  ON public.refunds
  FOR SELECT
  USING (auth.uid() = customer_id OR auth.uid() = provider_id);

DROP POLICY IF EXISTS "Authenticated users can create refunds" ON public.refunds;
CREATE POLICY "Authenticated users can create refunds"
  ON public.refunds
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can update refunds" ON public.refunds;
CREATE POLICY "Authenticated users can update refunds"
  ON public.refunds
  FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION public.set_refunds_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refunds_updated_at ON public.refunds;
CREATE TRIGGER trg_refunds_updated_at
BEFORE UPDATE ON public.refunds
FOR EACH ROW
EXECUTE FUNCTION public.set_refunds_updated_at();
