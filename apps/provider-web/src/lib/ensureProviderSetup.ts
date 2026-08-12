import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Call the server-authoritative ensure_provider_setup RPC.
 *
 * The canonical RPC is public.ensure_provider_setup(TEXT, TEXT, TEXT)
 * (all defaults NULL). It returns JSONB { success, error?, user_id? }.
 *
 * After the zero-arg overload was dropped (migration 20260817), calling
 * supabase.rpc('ensure_provider_setup') with no arguments resolves to
 * the 3-arg version using its defaults — this is unambiguous.
 *
 * Throws a user-friendly Error on transport or business failure.
 * Never exposes raw DB/RPC error text to the caller.
 */
export async function ensureProviderSetup(
  supabase: Pick<SupabaseClient, 'rpc'>,
): Promise<void> {
  const { data, error } = await supabase.rpc('ensure_provider_setup');

  if (error) {
    console.warn('ensure_provider_setup transport error:', error.message);
    throw new Error(
      'Your provider account could not be prepared. Please try again or contact support.',
    );
  }

  if (!data?.success) {
    console.warn('ensure_provider_setup business failure:', data?.error);
    throw new Error(
      'Your provider account could not be prepared. Please try again or contact support.',
    );
  }
}
