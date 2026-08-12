/**
 * Provider Documents page bootstrap tests.
 *
 * Tests the real ensureProviderSetup helper (imported from production code)
 * and verifies migration/privilege correctness.
 */
import { describe, it, expect, vi } from 'vitest';
import { ensureProviderSetup } from '../lib/ensureProviderSetup';

// ---------------------------------------------------------------------------
// Exercise the REAL production ensureProviderSetup with mock Supabase clients
// ---------------------------------------------------------------------------

describe('ensureProviderSetup — transport + business failure handling', () => {
  it('transport error throws controlled error', async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'function does not exist' },
      }),
    };
    await expect(ensureProviderSetup(supabase as any)).rejects.toThrow(
      'Your provider account could not be prepared',
    );
  });

  it('business failure (success: false, role conflict) throws controlled error', async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: { success: false, error: 'Cannot change role. You are registered as a customer' },
        error: null,
      }),
    };
    await expect(ensureProviderSetup(supabase as any)).rejects.toThrow(
      'Your provider account could not be prepared',
    );
  });

  it('business failure (not authenticated) throws controlled error', async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: { success: false, error: 'Not authenticated' },
        error: null,
      }),
    };
    await expect(ensureProviderSetup(supabase as any)).rejects.toThrow(
      'Your provider account could not be prepared',
    );
  });

  it('null data (unexpected) throws controlled error', async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    await expect(ensureProviderSetup(supabase as any)).rejects.toThrow(
      'Your provider account could not be prepared',
    );
  });

  it('successful RPC (success: true) resolves without error', async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: { success: true, user_id: 'abc-123' },
        error: null,
      }),
    };
    await expect(ensureProviderSetup(supabase as any)).resolves.toBeUndefined();
  });

  it('raw DB/RPC error is never exposed in thrown message', async () => {
    const rawMsg = 'function ensure_provider_setup() does not exist';
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: rawMsg } }),
    };
    try {
      await ensureProviderSetup(supabase as any);
    } catch (e: any) {
      expect(e.message).not.toContain(rawMsg);
      expect(e.message).not.toContain('ensure_provider_setup');
      expect(e.message).toContain('provider account');
    }
  });
});

describe('Documents.tsx — source safety', () => {
  it('source code has no .catch() on query builder results', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../pages/provider/Documents.tsx'),
      'utf-8',
    );
    const catchOnQueryBuilder = /\.(?:upsert|insert|update|delete|select)\([^)]*\)\s*\.catch\(/;
    expect(catchOnQueryBuilder.test(source)).toBe(false);
  });

  it('Documents.tsx imports ensureProviderSetup from lib', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../pages/provider/Documents.tsx'),
      'utf-8',
    );
    expect(source).toContain("from '../../lib/ensureProviderSetup'");
  });

  it('loadDocuments does not call storage.upload', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../pages/provider/Documents.tsx'),
      'utf-8',
    );
    const loadDocsFn = source.substring(
      source.indexOf('async function loadDocuments'),
      source.indexOf('async function handleFileSelect'),
    );
    expect(loadDocsFn).not.toContain('.storage.');
    expect(loadDocsFn).not.toContain('.upload(');
  });
});

describe('ensure_provider_setup — migration security', () => {
  it('canonical RPC uses auth.uid() and prevents role escalation', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const migration = fs.readFileSync(
      path.resolve(
        __dirname,
        '../../../../supabase/migrations/20260312000146_security_hardening_rpc_functions.sql',
      ),
      'utf-8',
    );
    const fnStart = migration.indexOf('ensure_provider_setup');
    const fnEnd = migration.indexOf('$$;', fnStart);
    const fnBody = migration.substring(fnStart, fnEnd);
    expect(fnBody).toContain('auth.uid()');
    expect(fnBody).toContain('SECURITY DEFINER');
    expect(fnBody).toContain("v_current_role != 'provider'");
  });

  it('privilege migration drops zero-arg overload', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const migration = fs.readFileSync(
      path.resolve(
        __dirname,
        '../../../../supabase/migrations/20260817000000_ensure_provider_setup_privileges.sql',
      ),
      'utf-8',
    );
    expect(migration).toContain('DROP FUNCTION IF EXISTS public.ensure_provider_setup()');
  });

  it('privilege migration restricts 3-arg version to authenticated only', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const migration = fs.readFileSync(
      path.resolve(
        __dirname,
        '../../../../supabase/migrations/20260817000000_ensure_provider_setup_privileges.sql',
      ),
      'utf-8',
    );
    expect(migration).toContain(
      'REVOKE EXECUTE ON FUNCTION public.ensure_provider_setup(TEXT, TEXT, TEXT) FROM PUBLIC',
    );
    expect(migration).toContain(
      'REVOKE EXECUTE ON FUNCTION public.ensure_provider_setup(TEXT, TEXT, TEXT) FROM anon',
    );
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.ensure_provider_setup(TEXT, TEXT, TEXT) TO authenticated',
    );
    // Must NOT grant to zero-arg (it's dropped)
    expect(migration).not.toContain('GRANT EXECUTE ON FUNCTION public.ensure_provider_setup() TO');
  });
});
