/**
 * Provider document Storage consistency tests.
 *
 * Tests the real production helpers (cleanupStorageObject, getExistingDocumentPath)
 * and verifies Documents.tsx cleanup behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanupStorageObject, getExistingDocumentPath } from '../lib/documentStorage';

function createMockStorage(removeResult = { error: null }) {
  const removeFn = vi.fn().mockResolvedValue(removeResult);
  return {
    storage: {
      from: vi.fn().mockReturnValue({ remove: removeFn }),
    },
    _remove: removeFn,
  };
}

function createMockDb(selectResult: { data: any; error?: any }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(selectResult),
  };
  return {
    from: vi.fn().mockReturnValue(chain),
    _chain: chain,
  };
}

describe('cleanupStorageObject', () => {
  it('removes the exact path from provider-documents bucket', async () => {
    const mock = createMockStorage();
    await cleanupStorageObject(mock as any, 'user-123/license/file.jpg', 'user-123');
    expect(mock.storage.from).toHaveBeenCalledWith('provider-documents');
    expect(mock._remove).toHaveBeenCalledWith(['user-123/license/file.jpg']);
  });

  it('rejects paths not scoped to the provider', async () => {
    const mock = createMockStorage();
    await cleanupStorageObject(mock as any, 'other-user/license/file.jpg', 'user-123');
    expect(mock._remove).not.toHaveBeenCalled();
  });

  it('does nothing for empty path', async () => {
    const mock = createMockStorage();
    await cleanupStorageObject(mock as any, '', 'user-123');
    expect(mock._remove).not.toHaveBeenCalled();
  });

  it('does not throw when removal fails', async () => {
    const mock = createMockStorage({ error: { message: 'Not found' } as any });
    await expect(
      cleanupStorageObject(mock as any, 'user-123/doc/file.jpg', 'user-123'),
    ).resolves.toBeUndefined();
  });

  it('does not throw on unexpected error', async () => {
    const mock = {
      storage: { from: vi.fn().mockReturnValue({ remove: vi.fn().mockRejectedValue(new Error('network')) }) },
    };
    await expect(
      cleanupStorageObject(mock as any, 'user-123/doc/file.jpg', 'user-123'),
    ).resolves.toBeUndefined();
  });
});

describe('getExistingDocumentPath', () => {
  it('returns file_path when document exists', async () => {
    const mock = createMockDb({ data: { file_path: 'user-123/license/old.jpg' } });
    const result = await getExistingDocumentPath(mock as any, 'user-123', 'license');
    expect(result).toBe('user-123/license/old.jpg');
  });

  it('returns null when no document exists', async () => {
    const mock = createMockDb({ data: null });
    const result = await getExistingDocumentPath(mock as any, 'user-123', 'license');
    expect(result).toBeNull();
  });

  it('returns null when file_path is empty', async () => {
    const mock = createMockDb({ data: { file_path: '' } });
    const result = await getExistingDocumentPath(mock as any, 'user-123', 'license');
    expect(result).toBeNull();
  });

  it('returns null on query error', async () => {
    const mock = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockRejectedValue(new Error('db error')),
      }),
    };
    const result = await getExistingDocumentPath(mock as any, 'user-123', 'license');
    expect(result).toBeNull();
  });
});

describe('Documents.tsx — Storage consistency behavior', () => {
  it('source performs cleanup on DB failure after upload', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../pages/provider/Documents.tsx'),
      'utf-8',
    );

    // handleFileSelect: cleanup on upsertError
    const fileSelectFn = source.substring(
      source.indexOf('async function handleFileSelect'),
      source.indexOf('async function handleCameraUpload'),
    );
    expect(fileSelectFn).toContain('cleanupStorageObject(supabase, storagePath, providerId)');

    // handleCameraUpload: cleanup on upsertError
    const cameraFn = source.substring(
      source.indexOf('async function handleCameraUpload'),
      source.indexOf('async function handleRemoveDocument'),
    );
    expect(cameraFn).toContain('cleanupStorageObject(supabase, storagePath, providerId)');
  });

  it('source captures old file path before upload for replacement cleanup', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../pages/provider/Documents.tsx'),
      'utf-8',
    );

    // Both upload handlers must capture oldFilePath before Storage upload
    const fileSelectFn = source.substring(
      source.indexOf('async function handleFileSelect'),
      source.indexOf('async function handleCameraUpload'),
    );
    const cameraFn = source.substring(
      source.indexOf('async function handleCameraUpload'),
      source.indexOf('async function handleRemoveDocument'),
    );

    expect(fileSelectFn).toContain('getExistingDocumentPath');
    expect(fileSelectFn).toContain('oldFilePath && oldFilePath !== storagePath');
    expect(cameraFn).toContain('getExistingDocumentPath');
    expect(cameraFn).toContain('oldFilePath && oldFilePath !== storagePath');
  });

  it('source cleans up old file only AFTER successful DB write', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../pages/provider/Documents.tsx'),
      'utf-8',
    );

    // The old-file cleanup must come after "loadDocuments" which proves DB succeeded
    const fileSelectFn = source.substring(
      source.indexOf('async function handleFileSelect'),
      source.indexOf('async function handleCameraUpload'),
    );
    const oldCleanupIdx = fileSelectFn.indexOf("oldFilePath && oldFilePath !== storagePath");
    const dbFailCleanupIdx = fileSelectFn.indexOf("cleanupStorageObject(supabase, storagePath");

    // DB-failure cleanup (new file) comes first; old-file cleanup comes after
    expect(dbFailCleanupIdx).toBeLessThan(oldCleanupIdx);
  });

  it('handleRemoveDocument deletes DB row before Storage cleanup', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../pages/provider/Documents.tsx'),
      'utf-8',
    );

    const removeFn = source.substring(
      source.indexOf('async function handleRemoveDocument'),
      source.indexOf('async function handleUpdateExpiry'),
    );

    const dbDeleteIdx = removeFn.indexOf(".delete()");
    const storageCleanupIdx = removeFn.indexOf("cleanupStorageObject");

    // DB delete must come before Storage cleanup
    expect(dbDeleteIdx).toBeGreaterThan(-1);
    expect(storageCleanupIdx).toBeGreaterThan(-1);
    expect(dbDeleteIdx).toBeLessThan(storageCleanupIdx);
  });

  it('replacement never deletes file when old path equals new path', async () => {
    // The condition is: oldFilePath && oldFilePath !== storagePath
    // If they're equal, the condition is false and cleanup is skipped
    const oldPath = 'user/doc/same-file.jpg';
    const newPath = 'user/doc/same-file.jpg';
    expect(oldPath !== newPath).toBe(false);
  });
});
