import { describe, expect, it, vi } from 'vitest';
import { getJobProviderDetails, providerDetailsFallbackColumns } from '../services/providerDetails.service';

function queryResult(data) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
  };
  return query;
}

describe('getJobProviderDetails rollout compatibility', () => {
  it('uses the narrow RPC response when available', async () => {
    const rpc = vi.fn(async () => ({ data: [{ id: 'provider-1', vehicle_make: 'Ford' }], error: null }));
    const from = vi.fn();

    await expect(getJobProviderDetails({ rpc, from }, {
      id: 'job-1', provider_id: 'provider-1', status: 'accepted',
    })).resolves.toEqual({ id: 'provider-1', vehicle_make: 'Ford' });
    expect(from).not.toHaveBeenCalled();
  });

  it('uses only allowlisted columns if the app arrives before the RPC', async () => {
    const providerQuery = queryResult({ id: 'provider-1', vehicle_make: 'Ford' });
    const profileQuery = queryResult({ full_name: 'Provider One', phone: '555-0100' });
    const supabase = {
      rpc: vi.fn(async () => ({ data: null, error: { code: 'PGRST202', message: 'function not in schema cache' } })),
      from: vi.fn((table) => table === 'provider_profiles' ? providerQuery : profileQuery),
    };

    const result = await getJobProviderDetails(supabase, {
      id: 'job-1', provider_id: 'provider-1', status: 'accepted',
    });

    expect(result.phone).toBe('555-0100');
    expect(providerQuery.select).toHaveBeenCalledWith(providerDetailsFallbackColumns.provider);
    expect(profileQuery.select).toHaveBeenCalledWith(providerDetailsFallbackColumns.profile);
    for (const column of ['license_number', 'vehicle_plate', 'total_earnings', 'acceptance_rate']) {
      expect(providerDetailsFallbackColumns.provider).not.toContain(column);
      expect(providerDetailsFallbackColumns.profile).not.toContain(column);
    }
  });

  it('suppresses phone for completed jobs on the pre-RPC fallback', async () => {
    const providerQuery = queryResult({ id: 'provider-1', vehicle_make: 'Ford' });
    const profileQuery = queryResult({ full_name: 'Provider One', phone: '555-0100' });
    const supabase = {
      rpc: vi.fn(async () => ({ data: null, error: { code: 'PGRST202', message: 'function missing' } })),
      from: vi.fn((table) => table === 'provider_profiles' ? providerQuery : profileQuery),
    };

    const result = await getJobProviderDetails(supabase, {
      id: 'job-1', provider_id: 'provider-1', status: 'completed',
    });

    expect(result.full_name).toBe('Provider One');
    expect(result.phone).toBeNull();
    expect(profileQuery.select).toHaveBeenCalledWith('full_name, first_name, last_name, avatar_url');
  });
});
