import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Do not throw at module import time — this crashes before React can mount
// and show a helpful error screen. Config validation in main.jsx will catch this.
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[TORC] Missing Supabase environment variables. The app will show a configuration error screen.');
}

/** Whether the Supabase config is valid and the client is usable */
export const supabaseConfigValid = Boolean(supabaseUrl && supabaseAnonKey);

const isNative = Capacitor.isNativePlatform();

const customStorage = {
  getItem: async (key) => (await Preferences.get({ key })).value,
  setItem: async (key, value) => await Preferences.set({ key, value }),
  removeItem: async (key) => await Preferences.remove({ key }),
};

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: !isNative,
    storage: isNative ? customStorage : window.localStorage,
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
