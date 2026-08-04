import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validation is handled by configValidation.ts at mount time.
// Do NOT throw here -- throwing at import time causes a blank white screen
// with no actionable error message.

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
