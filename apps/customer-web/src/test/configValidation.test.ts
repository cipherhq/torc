import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to test validateConfig which reads import.meta.env.
// We'll re-import the module with different env values for each test.

describe('Config Validation', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns errors when VITE_SUPABASE_URL missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'some-key');

    const { validateConfig } = await import('../lib/configValidation');
    const errors = validateConfig();
    expect(errors.some(e => e.variable === 'VITE_SUPABASE_URL')).toBe(true);
  });

  it('returns errors when VITE_SUPABASE_ANON_KEY missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

    const { validateConfig } = await import('../lib/configValidation');
    const errors = validateConfig();
    expect(errors.some(e => e.variable === 'VITE_SUPABASE_ANON_KEY')).toBe(true);
  });

  it('returns no errors when all vars present', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'eyJ-valid-key');

    const { validateConfig } = await import('../lib/configValidation');
    const errors = validateConfig();
    // Filter to only supabase-related errors (Stripe test might not apply in dev)
    const supabaseErrors = errors.filter(e =>
      e.variable === 'VITE_SUPABASE_URL' || e.variable === 'VITE_SUPABASE_ANON_KEY'
    );
    expect(supabaseErrors).toHaveLength(0);
  });

  it('rejects Stripe test key in production mode', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'eyJ-valid-key');
    vi.stubEnv('VITE_STRIPE_PUBLISHABLE_KEY', 'pk_test_abc123');
    vi.stubEnv('PROD', 'true');

    // For import.meta.env.PROD we need to set it directly
    const origProd = import.meta.env.PROD;
    import.meta.env.PROD = true;

    try {
      const { validateConfig } = await import('../lib/configValidation');
      const errors = validateConfig();
      expect(errors.some(e => e.variable === 'VITE_STRIPE_PUBLISHABLE_KEY')).toBe(true);
    } finally {
      import.meta.env.PROD = origProd;
    }
  });
});
