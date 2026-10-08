const ACTIVE_JOB_STATUSES = new Set([
  'accepted', 'enroute', 'en_route', 'arrived', 'inprogress', 'in_progress',
]);

const SAFE_PROVIDER_COLUMNS = [
  'id', 'services', 'vehicle_make', 'vehicle_model', 'vehicle_year',
  'is_verified', 'rating', 'total_jobs',
].join(', ');

const SAFE_PROFILE_COLUMNS = 'full_name, first_name, last_name, phone, avatar_url';
const SAFE_COMPLETED_PROFILE_COLUMNS = 'full_name, first_name, last_name, avatar_url';

function isMissingProviderDetailsRpc(error) {
  return error?.code === 'PGRST202' || error?.code === '42883';
}

/**
 * Fetch the customer-safe provider contract. The allowlisted direct-query path
 * exists only to bridge app-first deployment while the RPC is not deployed or
 * PostgREST has not refreshed its schema cache. It never selects private fields.
 */
export async function getJobProviderDetails(supabase, job) {
  if (!job?.id || !job?.provider_id) return null;

  const { data, error } = await supabase.rpc('get_job_provider_details', {
    p_job_id: job.id,
  });

  if (!error) return data?.[0] || null;
  if (!isMissingProviderDetailsRpc(error)) {
    console.warn('Could not load safe provider details:', error.message);
    return null;
  }

  const { data: provider, error: providerError } = await supabase
    .from('provider_profiles')
    .select(SAFE_PROVIDER_COLUMNS)
    .eq('id', job.provider_id)
    .maybeSingle();

  if (providerError) {
    console.warn('Provider details RPC is not deployed and safe fallback failed:', providerError.message);
    return null;
  }
  if (!provider) return null;

  const activeJob = ACTIVE_JOB_STATUSES.has(job.status);
  const { data: profile } = await supabase
    .from('profiles')
    .select(activeJob ? SAFE_PROFILE_COLUMNS : SAFE_COMPLETED_PROFILE_COLUMNS)
    .eq('id', job.provider_id)
    .maybeSingle();

  return {
    ...provider,
    ...(profile || {}),
    phone: activeJob ? profile?.phone || null : null,
  };
}

export const providerDetailsFallbackColumns = {
  provider: SAFE_PROVIDER_COLUMNS,
  profile: SAFE_PROFILE_COLUMNS,
};
