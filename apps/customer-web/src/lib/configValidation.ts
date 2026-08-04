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

  // In production, reject Stripe test keys
  if (import.meta.env.PROD) {
    const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';
    if (stripeKey && stripeKey.startsWith('pk_test_')) {
      errors.push({ variable: 'VITE_STRIPE_PUBLISHABLE_KEY', message: 'Stripe test key detected in production build' });
    }
  }

  return errors;
}
