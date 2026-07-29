-- Add Connect account support to BYO credentials
-- Allows businesses to connect via Paystack Connect / Stripe Connect
-- instead of manual API key entry

-- Connect account ID (from Paystack Connect or similar)
ALTER TABLE public.business_payment_credentials
  ADD COLUMN IF NOT EXISTS connect_account_id VARCHAR(100);

-- Track whether this credential was set up via manual key entry or Connect flow
ALTER TABLE public.business_payment_credentials
  ADD COLUMN IF NOT EXISTS connection_type VARCHAR(20) DEFAULT 'manual'
    CHECK (connection_type IN ('manual', 'connect'));

-- Allow secret_key to be NULL for Connect-mode credentials
ALTER TABLE public.business_payment_credentials
  ALTER COLUMN secret_key DROP NOT NULL;

-- Ensure at least one credential mode is present
ALTER TABLE public.business_payment_credentials
  ADD CONSTRAINT chk_credentials_mode
    CHECK (secret_key IS NOT NULL OR connect_account_id IS NOT NULL);
