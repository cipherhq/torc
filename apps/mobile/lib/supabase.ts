import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || 'https://apojatplmfsbimgcyjoo.supabase.co';
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFwb2phdHBsbWZzYmltZ2N5am9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NjcyMjQsImV4cCI6MjA4NjM0MzIyNH0.eWizHl9jMS-E-SZ_JMmmZooYN9nuEufxupWOXCOulv8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: undefined,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
