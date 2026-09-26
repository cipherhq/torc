import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase: { rpc } }));

import { loadProviderPayoutBalance } from '../lib/providerPayoutBalance';

describe('provider payout balance', () => {
  beforeEach(() => rpc.mockReset());

  it('uses the server ledger totals without subtracting payout history again', async () => {
    rpc.mockResolvedValue({
      data: [{ total_earned: '125.00', paid_out: '50.00', available_balance: '75.00' }],
      error: null,
    });

    await expect(loadProviderPayoutBalance()).resolves.toEqual({
      totalEarned: 125,
      paidOut: 50,
      availableBalance: 75,
    });
    expect(rpc).toHaveBeenCalledWith('get_my_provider_payout_balance');
  });

  it('fails closed when the ledger summary cannot be read', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('RPC unavailable') });
    await expect(loadProviderPayoutBalance()).rejects.toThrow('RPC unavailable');
  });
});
