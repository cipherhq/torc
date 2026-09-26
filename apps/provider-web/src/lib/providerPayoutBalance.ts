import { supabase } from './supabase';

export interface ProviderPayoutBalance {
  totalEarned: number;
  paidOut: number;
  availableBalance: number;
}

export async function loadProviderPayoutBalance(): Promise<ProviderPayoutBalance> {
  const { data, error } = await supabase.rpc('get_my_provider_payout_balance');
  if (error) throw error;

  const row = data?.[0];
  if (!row) throw new Error('Provider payout balance was unavailable');

  return {
    totalEarned: Number(row.total_earned),
    paidOut: Number(row.paid_out),
    availableBalance: Number(row.available_balance),
  };
}
