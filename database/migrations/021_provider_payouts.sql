-- Provider Payouts table for tracking weekly payments to providers
-- Torc pays providers weekly; this table records each payout.

CREATE TABLE IF NOT EXISTS public.provider_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_earnings NUMERIC(10,2) DEFAULT 0,
  total_tips NUMERIC(10,2) DEFAULT 0,
  platform_fee NUMERIC(10,2) DEFAULT 0,
  net_payout NUMERIC(10,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paid', 'failed')),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for quick lookups by provider and period
CREATE INDEX IF NOT EXISTS idx_provider_payouts_provider ON public.provider_payouts(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_payouts_period ON public.provider_payouts(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_provider_payouts_status ON public.provider_payouts(status);

-- RLS policies
ALTER TABLE public.provider_payouts ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "admin_full_access_payouts" ON public.provider_payouts
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Providers can view their own payouts
CREATE POLICY "providers_view_own_payouts" ON public.provider_payouts
  FOR SELECT
  USING (provider_id = auth.uid());
