\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;

-- Customer 1 may read only their provider for the active job. The broad
-- policy is gone; their completed job does not authorize the old provider.
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM public.provider_profiles)=1, 'customer can enumerate unrelated provider profiles';
  ASSERT (SELECT count(*) FROM public.provider_profiles WHERE id='20000000-0000-4000-8000-000000000001')=1,
    'active-job customer cannot read assigned provider';
  ASSERT (SELECT count(*) FROM public.provider_profiles WHERE id='20000000-0000-4000-8000-000000000002')=0,
    'completed-job customer can read former provider';
  -- Active-job customers intentionally retain the full row required by
  -- currently released native clients; see the PR risk note on earnings data.
  ASSERT (SELECT total_earnings FROM public.provider_profiles WHERE id='20000000-0000-4000-8000-000000000001')=12345.67,
    'active-job compatibility contract changed';
  ASSERT (SELECT count(*) FROM public.documents)=0, 'customer can read provider verification documents';
END $$;

-- Another signed-in customer with a different active provider sees only that
-- provider, proving the policy follows ownership rather than role alone.
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM public.provider_profiles)=1, 'second customer can enumerate unrelated providers';
  ASSERT (SELECT count(*) FROM public.provider_profiles WHERE id='20000000-0000-4000-8000-000000000002')=1,
    'second customer cannot read own assigned provider';
  ASSERT (SELECT count(*) FROM public.provider_profiles WHERE id='20000000-0000-4000-8000-000000000001')=0,
    'second customer can read first customer provider';
  ASSERT (SELECT count(*) FROM public.documents)=0, 'unrelated customer can read provider verification documents';
END $$;

-- Providers retain owner access but cannot read another provider.
SELECT set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM public.provider_profiles)=1, 'provider cannot read own profile';
  ASSERT (SELECT count(*) FROM public.provider_profiles WHERE id='20000000-0000-4000-8000-000000000001' AND vehicle_plate='PRIVATE-PLATE-1')=1,
    'provider lost own vehicle/license details';
  ASSERT (SELECT count(*) FROM public.provider_profiles WHERE id='20000000-0000-4000-8000-000000000002')=0,
    'provider can read another provider';
  ASSERT (SELECT count(*) FROM public.documents)=1, 'provider lost own verification document metadata';
END $$;

-- Support is denied provider-profile rows; administrators preserve full access.
SELECT set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000001',true);
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM public.provider_profiles)=0, 'support can directly read provider profiles';
  ASSERT (SELECT count(*) FROM public.documents)=1, 'support lost authorized document metadata access';
END $$;
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000001',true);
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM public.provider_profiles)=2, 'admin lost provider profile access';
  ASSERT (SELECT count(*) FROM public.documents)=1, 'admin lost document metadata access';
  ASSERT NOT has_table_privilege('anon','public.provider_profiles','SELECT'), 'anonymous SELECT grant was not revoked';
  ASSERT NOT has_function_privilege('anon','public.customer_has_active_job_with_provider(uuid,uuid)','EXECUTE'),
    'anonymous helper execution was not revoked';
  ASSERT has_function_privilege('authenticated','public.customer_has_active_job_with_provider(uuid,uuid)','EXECUTE'),
    'authenticated helper execution is missing';
END $$;
ROLLBACK;
