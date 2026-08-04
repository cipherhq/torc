import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl ?? '';
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey ?? '';
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[TORC] Missing Supabase configuration in app.config / expo config.');
}

let _supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    _supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
    return _supabase;
  } catch (e) {
    console.error('Supabase init failed:', e);
    throw e;
  }
}

// Lazy init - create client on first use to avoid import-time crashes
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getSupabase() as any)[prop];
  },
});
