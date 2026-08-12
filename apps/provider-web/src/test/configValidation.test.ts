/**
 * Config validation tests — verifies that missing env vars are detected
 * and production mode rejects unsafe configuration.
 *
 * Provider app requires VITE_GOOGLE_MAPS_API_KEY in production
 * but does NOT require VITE_STRIPE_PUBLISHABLE_KEY (no client Stripe usage).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateConfig } from '../lib/configValidation';

// Base env with all required vars present (non-production mode)
const devEnv = {
  VITE_SUPABASE_URL: 'https://abc.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiJ9.test',
};

// Valid production env with all required production keys (provider — no Stripe)
const validProductionEnv = {
  VITE_APP_ENV: 'production',
  VITE_APP_URL: 'https://provider.torcapp.com',
  VITE_SUPABASE_URL: 'https://prod.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiJ9.prod',
  VITE_GOOGLE_MAPS_API_KEY: 'AIzaSy_real_production_key',
};

describe('validateConfig — base required vars', () => {
  it('returns valid when all required vars are present', () => {
    const result = validateConfig(devEnv);
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('detects missing VITE_SUPABASE_URL', () => {
    const result = validateConfig({ ...devEnv, VITE_SUPABASE_URL: undefined });
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('VITE_SUPABASE_URL');
  });

  it('detects missing VITE_SUPABASE_ANON_KEY', () => {
    const result = validateConfig({ ...devEnv, VITE_SUPABASE_ANON_KEY: undefined });
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('VITE_SUPABASE_ANON_KEY');
  });

  it('treats empty string as missing', () => {
    const result = validateConfig({ ...devEnv, VITE_SUPABASE_URL: '' });
    expect(result.valid).toBe(false);
  });
});

describe('validateConfig — production mode required vars', () => {
  it('valid production config passes', () => {
    const result = validateConfig(validProductionEnv);
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('rejects missing VITE_GOOGLE_MAPS_API_KEY in production', () => {
    const env = { ...validProductionEnv, VITE_GOOGLE_MAPS_API_KEY: undefined };
    const result = validateConfig(env);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('VITE_GOOGLE_MAPS_API_KEY (required in production)');
  });

  it('rejects blank VITE_GOOGLE_MAPS_API_KEY in production', () => {
    const env = { ...validProductionEnv, VITE_GOOGLE_MAPS_API_KEY: '' };
    const result = validateConfig(env);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('VITE_GOOGLE_MAPS_API_KEY (required in production)');
  });

  it('rejects whitespace-only VITE_GOOGLE_MAPS_API_KEY in production', () => {
    const env = { ...validProductionEnv, VITE_GOOGLE_MAPS_API_KEY: '  ' };
    const result = validateConfig(env);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('VITE_GOOGLE_MAPS_API_KEY (required in production)');
  });

  it('rejects missing VITE_APP_URL in production', () => {
    const env = { ...validProductionEnv, VITE_APP_URL: undefined };
    const result = validateConfig(env);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('VITE_APP_URL (required in production)');
  });

  it('does NOT require Stripe publishable key (provider has no client Stripe)', () => {
    // validProductionEnv has no VITE_STRIPE_PUBLISHABLE_KEY — this must pass
    const result = validateConfig(validProductionEnv);
    expect(result.valid).toBe(true);
  });

  it('does NOT require Maps key in development mode', () => {
    const result = validateConfig(devEnv);
    expect(result.valid).toBe(true);
  });

  it('does NOT require Maps key in internal mode', () => {
    const env = { ...devEnv, VITE_APP_ENV: 'internal' };
    const result = validateConfig(env);
    expect(result.valid).toBe(true);
  });
});

describe('validateConfig — production prohibited values', () => {
  it('rejects localhost in VITE_APP_URL', () => {
    const env = { ...validProductionEnv, VITE_APP_URL: 'http://localhost:3000' };
    const result = validateConfig(env);
    expect(result.valid).toBe(false);
    expect(result.missing.some(m => m.includes('localhost'))).toBe(true);
  });

  it('rejects 127.0.0.1 in config', () => {
    const env = { ...validProductionEnv, VITE_APP_URL: 'http://127.0.0.1:3000' };
    const result = validateConfig(env);
    expect(result.valid).toBe(false);
    expect(result.missing.some(m => m.includes('127.0.0.1'))).toBe(true);
  });

  it('rejects .vercel.app preview host', () => {
    const env = { ...validProductionEnv, VITE_APP_URL: 'https://my-app.vercel.app' };
    const result = validateConfig(env);
    expect(result.valid).toBe(false);
    expect(result.missing.some(m => m.includes('Vercel'))).toBe(true);
  });

  it('rejects pk_test_ Stripe key in production', () => {
    const env = { ...validProductionEnv, VITE_STRIPE_PUBLISHABLE_KEY: 'pk_test_abc123' };
    const result = validateConfig(env);
    expect(result.valid).toBe(false);
    expect(result.missing.some(m => m.includes('Stripe test'))).toBe(true);
  });

  it('does NOT reject prohibited values in development mode', () => {
    const env = {
      ...devEnv,
      VITE_APP_ENV: 'development',
      VITE_APP_URL: 'http://localhost:3000',
    };
    const result = validateConfig(env);
    expect(result.valid).toBe(true);
  });
});
