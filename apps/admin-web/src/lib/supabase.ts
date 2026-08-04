import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[TORC] Missing Supabase environment variables. The app will show a configuration error screen.');
}

// Create Supabase client (uses empty strings as fallback so module loads without throwing;
// main.jsx validates config before any Supabase calls are made)
export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder');

/** Whether the Supabase config is valid and the client is usable */
export const supabaseConfigValid = Boolean(supabaseUrl && supabaseAnonKey);
