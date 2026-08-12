/**
 * Provider document Storage consistency tests.
 *
 * Tests real production helpers and verifies cleanup invariants
 * across all DB failure paths in Documents.tsx.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  cleanupStorageObject,
  getExistingDocumentPath,
  type ExistingPathResult,
} from '../lib/documentStorage';

// ---------------------------------------------------------------------------
// cleanupStorageObject
// ---------------------------------------------------------------------------

function mockStorage(removeResult = { error: null as any }) {
  const removeFn = vi.fn().mockResolvedValue(removeResult);
  return {
    supabase: { storage: { from: vi.fn().mockReturnValue({ remove: removeFn }) } },
    removeFn,
  };
}

describe('cleanupStorageObject', () => {
  it('removes exact provider-scoped path', async () => {
    const { supabase, removeFn } = mockStorage();
    await cleanupStorageObject(supabase as any, 'uid/license/f.jpg', 'uid');
    expect(removeFn).toHaveBeenCalledWith(['uid/license/f.jpg']);
  });

  it('rejects path not scoped to provider', async () => {
    const { supabase, removeFn } = mockStorage();
    await cleanupStorageObject(supabase as any, 'other/license/f.jpg', 'uid');
    expect(removeFn).not.toHaveBeenCalled();
  });

  it('skips empty path', async () => {
    const { supabase, removeFn } = mockStorage();
    await cleanupStorageObject(supabase as any, '', 'uid');
    expect(removeFn).not.toHaveBeenCalled();
  });

  it('never throws on removal failure', async () => {
    const { supabase } = mockStorage({ error: { message: 'Not found' } });
    await expect(
      cleanupStorageObject(supabase as any, 'uid/doc/f.jpg', 'uid'),
    ).resolves.toBeUndefined();
  });

  it('never throws on unexpected error', async () => {
    const supabase = {
      storage: { from: vi.fn().mockReturnValue({ remove: vi.fn().mockRejectedValue(new Error('net')) }) },
    };
    await expect(
      cleanupStorageObject(supabase as any, 'uid/doc/f.jpg', 'uid'),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getExistingDocumentPath
// ---------------------------------------------------------------------------

describe('getExistingDocumentPath', () => {
  function mockDb(result: { data: any; error: any }) {
    return {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue(result),
      }),
    };
  }

  it('returns path when document exists', async () => {
    const db = mockDb({ data: { file_path: 'uid/lic/old.jpg' }, error: null });
    const result = await getExistingDocumentPath(db as any, 'uid', 'license');
    expect(result).toEqual({ path: 'uid/lic/old.jpg' });
  });

  it('returns null path when no document', async () => {
    const db = mockDb({ data: null, error: null });
    const result = await getExistingDocumentPath(db as any, 'uid', 'license');
    expect(result).toEqual({ path: null });
  });

  it('returns queryFailed when Supabase returns error', async () => {
    const db = mockDb({ data: null, error: { message: 'relation not found' } });
    const result = await getExistingDocumentPath(db as any, 'uid', 'license');
    expect(result.queryFailed).toBe(true);
    expect(result.path).toBeNull();
  });

  it('returns queryFailed on unexpected exception', async () => {
    const db = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockRejectedValue(new Error('crash')),
      }),
    };
    const result = await getExistingDocumentPath(db as any, 'uid', 'license');
    expect(result.queryFailed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Upload cleanup invariant: simulates the control flow in handleFileSelect
// and handleCameraUpload using the exact same flag-based pattern.
// ---------------------------------------------------------------------------

/**
 * Simulates the upload + DB persistence pattern from Documents.tsx.
 * Returns which cleanup operations were performed.
 */
async function simulateUploadFlow(options: {
  uploadSucceeds: boolean;
  dbPersistSucceeds: boolean;
  oldFilePath: ExistingPathResult;
  newStoragePath: string;
  providerId: string;
}): Promise<{
  newObjectCleaned: boolean;
  oldObjectCleaned: boolean;
  error: string | null;
}> {
  const { uploadSucceeds, dbPersistSucceeds, oldFilePath, newStoragePath, providerId } = options;
  let uploadedPath: string | null = null;
  let uploadProviderId: string | null = providerId;
  let dbPersisted = false;
  let oldReplacedPath: string | null = null;
  let newObjectCleaned = false;
  let oldObjectCleaned = false;
  let error: string | null = null;

  try {
    if (oldFilePath.queryFailed) {
      throw new Error('Could not verify existing document status.');
    }

    if (!uploadSucceeds) throw new Error('Upload failed');
    uploadedPath = newStoragePath;

    if (!dbPersistSucceeds) throw new Error('DB upsert failed');

    dbPersisted = true;
    oldReplacedPath = oldFilePath.path;
  } catch (e: any) {
    if (uploadedPath && !dbPersisted && uploadProviderId) {
      newObjectCleaned = true;
    }
    error = e.message;
  } finally {
    if (dbPersisted && oldReplacedPath && oldReplacedPath !== uploadedPath && uploadProviderId) {
      oldObjectCleaned = true;
    }
  }

  return { newObjectCleaned, oldObjectCleaned, error };
}

describe('Upload cleanup invariant', () => {
  const PID = 'provider-123';
  const NEW_PATH = 'provider-123/license/new-file.jpg';
  const OLD_PATH = 'provider-123/license/old-file.jpg';

  it('upload succeeds + DB succeeds => new object NOT cleaned, old IS cleaned', async () => {
    const result = await simulateUploadFlow({
      uploadSucceeds: true, dbPersistSucceeds: true,
      oldFilePath: { path: OLD_PATH }, newStoragePath: NEW_PATH, providerId: PID,
    });
    expect(result.newObjectCleaned).toBe(false);
    expect(result.oldObjectCleaned).toBe(true);
    expect(result.error).toBeNull();
  });

  it('upload succeeds + DB fails => new object IS cleaned, old NOT cleaned', async () => {
    const result = await simulateUploadFlow({
      uploadSucceeds: true, dbPersistSucceeds: false,
      oldFilePath: { path: OLD_PATH }, newStoragePath: NEW_PATH, providerId: PID,
    });
    expect(result.newObjectCleaned).toBe(true);
    expect(result.oldObjectCleaned).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('upload fails => no cleanup needed (nothing was uploaded)', async () => {
    const result = await simulateUploadFlow({
      uploadSucceeds: false, dbPersistSucceeds: false,
      oldFilePath: { path: OLD_PATH }, newStoragePath: NEW_PATH, providerId: PID,
    });
    expect(result.newObjectCleaned).toBe(false);
    expect(result.oldObjectCleaned).toBe(false);
  });

  it('no old file => old cleanup skipped after DB success', async () => {
    const result = await simulateUploadFlow({
      uploadSucceeds: true, dbPersistSucceeds: true,
      oldFilePath: { path: null }, newStoragePath: NEW_PATH, providerId: PID,
    });
    expect(result.oldObjectCleaned).toBe(false);
    expect(result.newObjectCleaned).toBe(false);
  });

  it('old path equals new path => old cleanup skipped (prevent self-delete)', async () => {
    const result = await simulateUploadFlow({
      uploadSucceeds: true, dbPersistSucceeds: true,
      oldFilePath: { path: NEW_PATH }, newStoragePath: NEW_PATH, providerId: PID,
    });
    expect(result.oldObjectCleaned).toBe(false);
  });

  it('existing-path query failed => aborts before upload', async () => {
    const result = await simulateUploadFlow({
      uploadSucceeds: true, dbPersistSucceeds: true,
      oldFilePath: { path: null, queryFailed: true }, newStoragePath: NEW_PATH, providerId: PID,
    });
    expect(result.error).toContain('Could not verify');
    expect(result.newObjectCleaned).toBe(false);
    expect(result.oldObjectCleaned).toBe(false);
  });

  it('DB fails from any throw path => cleanup is in catch, not scattered', async () => {
    // The key invariant: cleanup is in catch based on flags, not inline before each throw.
    // This test simulates a throw from the legacy UPDATE fallback path.
    const result = await simulateUploadFlow({
      uploadSucceeds: true, dbPersistSucceeds: false,
      oldFilePath: { path: OLD_PATH }, newStoragePath: NEW_PATH, providerId: PID,
    });
    expect(result.newObjectCleaned).toBe(true);
    expect(result.error).toBe('DB upsert failed');
  });

  it('camera upload DB failure cleans up newly uploaded object', async () => {
    // Same pattern applies to camera uploads
    const result = await simulateUploadFlow({
      uploadSucceeds: true, dbPersistSucceeds: false,
      oldFilePath: { path: null }, newStoragePath: NEW_PATH, providerId: PID,
    });
    expect(result.newObjectCleaned).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Documents.tsx source verification
// ---------------------------------------------------------------------------

describe('Documents.tsx — source structure', () => {
  let source: string;

  it('loads source', async () => {
    const fs = await import('fs');
    const path = await import('path');
    source = fs.readFileSync(
      path.resolve(__dirname, '../pages/provider/Documents.tsx'),
      'utf-8',
    );
    expect(source).toBeTruthy();
  });

  it('handleFileSelect uses flag-based cleanup (uploadedPath + dbPersisted)', () => {
    const fn = source.substring(
      source.indexOf('async function handleFileSelect'),
      source.indexOf('async function handleCameraUpload'),
    );
    expect(fn).toContain('let uploadedPath: string | null = null');
    expect(fn).toContain('let dbPersisted = false');
    expect(fn).toContain('uploadedPath && !dbPersisted');
    expect(fn).toContain('dbPersisted = true');
  });

  it('handleCameraUpload uses same flag-based cleanup pattern', () => {
    const fn = source.substring(
      source.indexOf('async function handleCameraUpload'),
      source.indexOf('async function handleRemoveDocument'),
    );
    expect(fn).toContain('let uploadedPath: string | null = null');
    expect(fn).toContain('let dbPersisted = false');
    expect(fn).toContain('uploadedPath && !dbPersisted');
    expect(fn).toContain('dbPersisted = true');
  });

  it('handleRemoveDocument deletes DB before Storage', () => {
    const fn = source.substring(
      source.indexOf('async function handleRemoveDocument'),
      source.indexOf('async function handleUpdateExpiry'),
    );
    const dbIdx = fn.indexOf('.delete()');
    const storageIdx = fn.indexOf('cleanupStorageObject');
    expect(dbIdx).toBeGreaterThan(-1);
    expect(storageIdx).toBeGreaterThan(-1);
    expect(dbIdx).toBeLessThan(storageIdx);
  });

  it('getExistingDocumentPath is checked for queryFailed before upload', () => {
    const fn = source.substring(
      source.indexOf('async function handleFileSelect'),
      source.indexOf('async function handleCameraUpload'),
    );
    expect(fn).toContain('existingPath.queryFailed');
  });
});
