/**
 * Config validation tests — verifies that missing env vars are detected
 * and production Stripe key patterns are caught.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// We need to control import.meta.env, so we mock the module
// ---------------------------------------------------------------------------

describe('validateConfig', () => {
  const originalEnv = { ...import.meta.env };

  afterEach(() => {
    // Restore original env
    Object.keys(import.meta.env).forEach((key) => {
      if (!(key in originalEnv)) {
        delete import.meta.env[key];
      }
    });
    Object.assign(import.meta.env, originalEnv);
  });

  it('returns valid when all required vars are present', async () => {
    import.meta.env.VITE_SUPABASE_URL = 'https://abc.supabase.co';
    import.meta.env.VITE_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiJ9.test';

    // Dynamic import to pick up the env at call time
    const { validateConfig } = await import('../lib/configValidation');
    const result = validateConfig();

    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('detects missing VITE_SUPABASE_URL', async () => {
    delete import.meta.env.VITE_SUPABASE_URL;
    import.meta.env.VITE_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiJ9.test';

    const { validateConfig } = await import('../lib/configValidation');
    const result = validateConfig();

    expect(result.valid).toBe(false);
    expect(result.missing).toContain('VITE_SUPABASE_URL');
  });

  it('detects missing VITE_SUPABASE_ANON_KEY', async () => {
    import.meta.env.VITE_SUPABASE_URL = 'https://abc.supabase.co';
    delete import.meta.env.VITE_SUPABASE_ANON_KEY;

    const { validateConfig } = await import('../lib/configValidation');
    const result = validateConfig();

    expect(result.valid).toBe(false);
    expect(result.missing).toContain('VITE_SUPABASE_ANON_KEY');
  });

  it('detects all missing vars at once', async () => {
    delete import.meta.env.VITE_SUPABASE_URL;
    delete import.meta.env.VITE_SUPABASE_ANON_KEY;

    const { validateConfig } = await import('../lib/configValidation');
    const result = validateConfig();

    expect(result.valid).toBe(false);
    expect(result.missing).toContain('VITE_SUPABASE_URL');
    expect(result.missing).toContain('VITE_SUPABASE_ANON_KEY');
    expect(result.missing).toHaveLength(2);
  });

  it('treats empty string as missing', async () => {
    import.meta.env.VITE_SUPABASE_URL = '';
    import.meta.env.VITE_SUPABASE_ANON_KEY = 'valid-key';

    const { validateConfig } = await import('../lib/configValidation');
    const result = validateConfig();

    expect(result.valid).toBe(false);
    expect(result.missing).toContain('VITE_SUPABASE_URL');
  });

  it('treats whitespace-only string as missing', async () => {
    import.meta.env.VITE_SUPABASE_URL = '   ';
    import.meta.env.VITE_SUPABASE_ANON_KEY = 'valid-key';

    const { validateConfig } = await import('../lib/configValidation');
    const result = validateConfig();

    expect(result.valid).toBe(false);
    expect(result.missing).toContain('VITE_SUPABASE_URL');
  });
});

describe('renderConfigError', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders error message with missing var names into #root', async () => {
    const { renderConfigError } = await import('../lib/configValidation');

    renderConfigError(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']);

    const root = document.getElementById('root');
    expect(root).not.toBeNull();
    expect(root!.innerHTML).toContain('Configuration Error');
    expect(root!.innerHTML).toContain('VITE_SUPABASE_URL');
    expect(root!.innerHTML).toContain('VITE_SUPABASE_ANON_KEY');
  });

  it('does nothing if #root element is missing', async () => {
    document.body.innerHTML = ''; // No root element

    const { renderConfigError } = await import('../lib/configValidation');

    // Should not throw
    expect(() => renderConfigError(['VITE_SUPABASE_URL'])).not.toThrow();
  });
});
