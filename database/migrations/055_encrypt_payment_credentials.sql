-- Tighten RLS on business_payment_credentials
-- The secret_key column now stores AES-256-GCM encrypted values.
-- Only service_role should read/write this table; application code
-- handles encryption/decryption and enforces business-owner auth checks.

-- Drop the overly permissive owner policy that let business owners
-- read raw secret_key values via the client SDK.
DROP POLICY IF EXISTS "owner_crud" ON public.business_payment_credentials;

-- Drop existing service policy so we can recreate with full CRUD
DROP POLICY IF EXISTS "service_read" ON public.business_payment_credentials;

-- Service role: full CRUD (all access goes through API with auth checks)
CREATE POLICY "service_role_all" ON public.business_payment_credentials
  FOR ALL USING (auth.role() = 'service_role');

-- Add a comment documenting the encryption scheme
COMMENT ON COLUMN public.business_payment_credentials.secret_key IS
  'AES-256-GCM encrypted. Format: iv:ciphertext:authTag (hex). Decrypt via lib/encryption.ts';

COMMENT ON COLUMN public.business_payment_credentials.public_key IS
  'AES-256-GCM encrypted when present. Format: iv:ciphertext:authTag (hex).';
