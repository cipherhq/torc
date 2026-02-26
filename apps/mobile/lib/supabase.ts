import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl ?? 'https://apojatplmfsbimgcyjoo.supabase.co';
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFwb2phdHBsbWZzYmltZ2N5am9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NjcyMjQsImV4cCI6MjA4NjM0MzIyNH0.eWizHl9jMS-E-SZ_JMmmZooYN9nuEufxupWOXCOulv8';

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
