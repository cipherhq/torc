-- Central legal/help content + acceptance tracking.
-- This makes Terms/Help editable in admin and consumable by website/mobile.

-- 1) Track terms acceptance on profiles for reporting/audit.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms_version TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_terms_accepted_at
  ON public.profiles(terms_accepted_at DESC);

-- 2) Ensure new signups persist terms acceptance metadata to profiles.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role user_role;
  v_terms_accepted_at timestamptz;
  v_terms_version text;
BEGIN
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'customer')::user_role;
  v_terms_version := NULLIF(NEW.raw_user_meta_data->>'terms_version', '');
  v_terms_accepted_at := CASE
    WHEN COALESCE(NEW.raw_user_meta_data->>'accepted_terms', 'false') = 'true' THEN now()
    ELSE NULL
  END;

  INSERT INTO public.profiles (
    id, email, full_name, first_name, last_name, phone, role, terms_accepted_at, terms_version
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    v_role,
    v_terms_accepted_at,
    v_terms_version
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = CASE WHEN EXCLUDED.full_name <> '' THEN EXCLUDED.full_name ELSE public.profiles.full_name END,
    first_name = CASE WHEN EXCLUDED.first_name <> '' THEN EXCLUDED.first_name ELSE public.profiles.first_name END,
    last_name = CASE WHEN EXCLUDED.last_name <> '' THEN EXCLUDED.last_name ELSE public.profiles.last_name END,
    phone = CASE WHEN EXCLUDED.phone <> '' THEN EXCLUDED.phone ELSE public.profiles.phone END,
    role = CASE WHEN EXCLUDED.role <> 'customer'::user_role THEN EXCLUDED.role ELSE public.profiles.role END,
    terms_accepted_at = COALESCE(public.profiles.terms_accepted_at, EXCLUDED.terms_accepted_at),
    terms_version = COALESCE(EXCLUDED.terms_version, public.profiles.terms_version),
    updated_at = now();

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'handle_new_user error: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- 3) Backfill acceptance fields when metadata already captured acceptance.
UPDATE public.profiles p
SET
  terms_accepted_at = COALESCE(p.terms_accepted_at, u.created_at),
  terms_version = COALESCE(p.terms_version, NULLIF(u.raw_user_meta_data->>'terms_version', ''))
FROM auth.users u
WHERE u.id = p.id
  AND COALESCE(u.raw_user_meta_data->>'accepted_terms', 'false') = 'true';

-- 4) Seed editable website/app legal/help templates in platform_settings.
INSERT INTO public.platform_settings (key, value, updated_at)
VALUES
  (
    'terms_version',
    to_jsonb('v1.0.0'::text),
    now()
  ),
  (
    'terms_last_updated',
    to_jsonb('2026-02-26'::text),
    now()
  ),
  (
    'terms_customer_text',
    to_jsonb($$TORC CUSTOMER TERMS OF SERVICE
Last updated: 2026-02-26

1. Eligibility
You must be 18 years or older to request service through TORC.

2. Service Requests
You agree that request details, location data, and contact information are accurate.

3. Pricing and Payment
Pricing is shown before confirmation. Payment is processed in-app when service is completed or per cancellation rules.

4. Safety and Conduct
Harassment, abuse, fraud, or illegal activity is prohibited and may lead to suspension.

5. Cancellations and Refunds
Cancellation fees and refund handling follow TORC platform policy at the time of request.

6. Liability
TORC is a platform connecting customers with independent service providers.
$$::text),
    now()
  ),
  (
    'terms_provider_text',
    to_jsonb($$TORC PROVIDER TERMS OF SERVICE
Last updated: 2026-02-26

1. Eligibility and Compliance
You must maintain valid licensing, insurance, and any required credentials.

2. Service Standards
You agree to provide timely, professional, and safe roadside assistance.

3. Payouts and Platform Fees
Provider payouts are calculated from completed services minus platform fee plus tips.

4. Documentation and Verification
You must keep uploaded documents current and accurate.

5. Conduct and Account Actions
Fraud, misrepresentation, unsafe behavior, or repeated policy violations may result in suspension or removal.

6. Independent Contractor Status
Providers are independent service operators and not employees of TORC.
$$::text),
    now()
  ),
  (
    'help_customer_text',
    to_jsonb($$CUSTOMER HELP CENTER

Getting Started
- Create your account and verify your email.
- Choose the service you need and confirm your location.

Requesting Service
- Review pricing before confirming.
- Track provider ETA in real time.

After Service
- Complete payment in app.
- Rate your provider and leave feedback.

Support
- Open Help Center in-app to submit support requests.
$$::text),
    now()
  ),
  (
    'help_provider_text',
    to_jsonb($$PROVIDER HELP CENTER

Getting Started
- Create provider account and complete onboarding.
- Upload required documents for verification.

Job Flow
- Accept nearby jobs promptly.
- Update job status accurately (arrived, in progress, completed).

Earnings and Payouts
- Review earnings in app.
- Payouts are tracked in weekly cycles.

Support
- Use in-app support for onboarding, payout, or account issues.
$$::text),
    now()
  )
ON CONFLICT (key) DO NOTHING;

-- 5) Allow public website reads for legal/help keys only.
DROP POLICY IF EXISTS "Public can read website legal/help settings" ON public.platform_settings;
CREATE POLICY "Public can read website legal/help settings"
  ON public.platform_settings
  FOR SELECT
  USING (
    auth.role() = 'anon'
    AND key IN (
      'terms_version',
      'terms_last_updated',
      'terms_customer_text',
      'terms_provider_text',
      'help_customer_text',
      'help_provider_text'
    )
  );
