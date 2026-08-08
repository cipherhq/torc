import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validation is handled by configValidation.ts at mount time.
// Do NOT throw here -- throwing at import time causes a blank white screen
// with no actionable error message.

// When running inside native wrappers, the native side owns auth hand-off/refresh.
const isCapacitor = Capacitor.isNativePlatform();
const isNative = typeof window !== 'undefined' && (window.__TORC_NATIVE__ === true || isCapacitor);

const capacitorStorage = {
  getItem: async (key) => {
    const { value } = await Preferences.get({ key });
    return value;
  },
  setItem: async (key, value) => {
    await Preferences.set({ key, value });
  },
  removeItem: async (key) => {
    await Preferences.remove({ key });
  },
};

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: !isNative,
    persistSession: true,
    detectSessionInUrl: !isNative,
    ...(isCapacitor ? { storage: capacitorStorage } : {}),
  }
});

// Helper function to check connection
export async function testConnection() {
  try {
    const { data, error } = await supabase.from('services').select('count');
    if (error) throw error;
    console.log('✅ Supabase connected successfully!');
    return true;
  } catch (error) {
    console.error('❌ Supabase connection failed:', error.message);
    return false;
  }
}

// Export for use in other files
export default supabase;
