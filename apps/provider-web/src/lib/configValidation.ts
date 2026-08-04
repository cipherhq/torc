export interface ConfigError {
  variable: string;
  message: string;
}

export function validateConfig(): ConfigError[] {
  const errors: ConfigError[] = [];

  if (!import.meta.env.VITE_SUPABASE_URL) {
    errors.push({ variable: 'VITE_SUPABASE_URL', message: 'Supabase URL is required' });
  }
  if (!import.meta.env.VITE_SUPABASE_ANON_KEY) {
    errors.push({ variable: 'VITE_SUPABASE_ANON_KEY', message: 'Supabase anon key is required' });
  }

  return errors;
}
