-- Stripe payment support for real-time customer checkout

-- 1) Persist payment lifecycle on jobs
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'requires_action', 'paid', 'failed', 'refunded')),
  ADD COLUMN IF NOT EXISTS payment_currency TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_charge_id TEXT;

CREATE INDEX IF NOT EXISTS idx_jobs_payment_intent_id ON public.jobs(payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_jobs_payment_status ON public.jobs(payment_status);

-- 2) Stripe customer mapping per authenticated user
CREATE TABLE IF NOT EXISTS public.stripe_customers (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_customers_customer_id ON public.stripe_customers(stripe_customer_id);

ALTER TABLE public.stripe_customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own stripe customer mapping" ON public.stripe_customers;
CREATE POLICY "Users can view own stripe customer mapping"
  ON public.stripe_customers
  FOR SELECT
  USING (auth.uid() = user_id);

-- 3) Ensure payment methods can reference real Stripe payment method ids
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_methods_stripe_pm_unique
  ON public.payment_methods(stripe_payment_method_id)
  WHERE stripe_payment_method_id IS NOT NULL;

-- 4) Keep stripe_customers.updated_at fresh
CREATE OR REPLACE FUNCTION public.set_stripe_customers_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stripe_customers_updated_at ON public.stripe_customers;
CREATE TRIGGER trg_stripe_customers_updated_at
  BEFORE UPDATE ON public.stripe_customers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_stripe_customers_updated_at();

