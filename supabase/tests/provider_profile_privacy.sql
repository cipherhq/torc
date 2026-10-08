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
  ASSERT (SELECT count(*) FROM public.get_job_provider_details('50000000-0000-4000-8000-000000000002'))=0,
    'customer can call safe provider RPC for another customer job';
  ASSERT public.customer_has_active_job_with_provider(
    '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001'),
    'customer helper denied a real active job';
  ASSERT NOT public.customer_has_active_job_with_provider(
    '10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002'),
    'customer can spoof another customer identity in helper arguments';
  ASSERT NOT public.customer_has_active_job_with_provider(
    '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002'),
    'completed/cancelled provider relationship passed active-job helper';
  ASSERT (SELECT count(*) FROM public.get_job_provider_details('50000000-0000-4000-8000-000000000003'))=1,
    'customer cannot retrieve safe provider details for own completed job';
  ASSERT (SELECT phone FROM public.get_job_provider_details('50000000-0000-4000-8000-000000000003')) IS NULL,
    'completed job RPC should not return provider phone';
  ASSERT position('vehicle_plate' in pg_get_function_result('public.get_job_provider_details(uuid)'::regprocedure))=0,
    'customer RPC must not return vehicle_plate';
  ASSERT position('license_number' in pg_get_function_result('public.get_job_provider_details(uuid)'::regprocedure))=0,
    'customer RPC must not return license_number';
  ASSERT position('total_earnings' in pg_get_function_result('public.get_job_provider_details(uuid)'::regprocedure))=0,
    'customer RPC must not return total_earnings';
  ASSERT position('acceptance_rate' in pg_get_function_result('public.get_job_provider_details(uuid)'::regprocedure))=0,
    'customer RPC must not return acceptance_rate';
  -- Stage 1 compatibility: legacy apps still read the assigned row until the
  -- separate Stage 2 migration after the supported-client rollout.
  ASSERT (SELECT total_earnings FROM public.provider_profiles WHERE id='20000000-0000-4000-8000-000000000001')=12345.67,
    'Stage 1 legacy-client compatibility row is unexpectedly unavailable';
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

-- An authenticated user with no jobs cannot enumerate providers or locations.
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM public.provider_profiles)=0, 'zero-job customer can read a provider profile';
  ASSERT (SELECT count(*) FROM public.get_job_provider_details('50000000-0000-4000-8000-000000000001'))=0,
    'zero-job customer can call provider details RPC';
  ASSERT NOT public.customer_has_active_job_with_provider(
    '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001'),
    'zero-job caller can spoof a customer identity in the helper';
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

-- Simulate Stage 2 inside this transaction: old direct table reads are denied,
-- while the new scoped RPC continues returning only its safe contract.
RESET ROLE;
DROP POLICY "Customer can view assigned active provider profile" ON public.provider_profiles;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM public.provider_profiles)=0, 'Stage 2 still exposes provider rows to customers';
  ASSERT (SELECT count(*) FROM public.get_job_provider_details('50000000-0000-4000-8000-000000000001'))=1,
    'safe RPC stopped working after Stage 2 cutover';
  ASSERT (SELECT count(*) FROM public.get_job_provider_details('50000000-0000-4000-8000-000000000002'))=0,
    'safe RPC allows another customer job';
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
  ASSERT has_function_privilege('authenticated','public.get_job_provider_details(uuid)','EXECUTE'),
    'authenticated safe RPC execution is missing';
  ASSERT NOT has_function_privilege('anon','public.get_job_provider_details(uuid)','EXECUTE'),
    'anonymous safe RPC execution was not revoked';
END $$;
ROLLBACK;
