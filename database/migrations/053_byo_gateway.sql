-- BYO (Bring Your Own) Payment Gateway
-- Allows businesses to use their own Paystack/Flutterwave/Stripe accounts
-- Platform takes commission via reversed split (platform subaccount on business account)

CREATE TABLE IF NOT EXISTS public.business_payment_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  gateway VARCHAR(20) NOT NULL CHECK (gateway IN ('paystack', 'flutterwave', 'stripe')),
  secret_key TEXT NOT NULL,
  public_key TEXT,
  platform_subaccount_code VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Only one active credential per gateway per business
CREATE UNIQUE INDEX idx_bpc_active
  ON public.business_payment_credentials(business_id, gateway)
  WHERE is_active = true;

ALTER TABLE public.business_payment_credentials ENABLE ROW LEVEL SECURITY;

-- Business owners can manage their own credentials
CREATE POLICY "owner_crud" ON public.business_payment_credentials
  FOR ALL USING (
    business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())
  );

-- Service role can read all (for webhook processing, payment initialization)
CREATE POLICY "service_read" ON public.business_payment_credentials
  FOR SELECT USING (auth.role() = 'service_role');
