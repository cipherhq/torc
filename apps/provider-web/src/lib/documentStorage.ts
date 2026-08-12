import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Safely remove a single Storage object owned by a provider.
 * Never throws — cleanup failure is logged but does not propagate.
 */
export async function cleanupStorageObject(
  supabase: Pick<SupabaseClient, 'storage'>,
  path: string,
  providerId: string,
): Promise<void> {
  if (!path) return;

  // Safety: only remove paths scoped to this provider
  if (!path.startsWith(`${providerId}/`)) {
    console.warn('cleanupStorageObject: path does not belong to provider, skipping', {
      path,
      providerId,
    });
    return;
  }

  try {
    const { error } = await supabase.storage
      .from('provider-documents')
      .remove([path]);
    if (error) {
      console.warn('cleanupStorageObject: removal failed (non-fatal)', {
        path,
        error: error.message,
      });
    }
  } catch (err) {
    console.warn('cleanupStorageObject: unexpected error (non-fatal)', err);
  }
}

/**
 * Result of looking up an existing document's Storage path.
 *
 * - `{ path: string }` — a previous file_path was positively identified
 * - `{ path: null }` — no document exists (safe to proceed with upload)
 * - `{ path: null, queryFailed: true }` — the lookup itself failed; the
 *   caller cannot safely determine whether an old object exists
 */
export interface ExistingPathResult {
  path: string | null;
  queryFailed?: boolean;
}

/**
 * Look up the current file_path for an existing document row.
 *
 * Returns `queryFailed: true` when the Supabase query itself errors,
 * so the caller can decide whether to proceed (risking a stale object)
 * or abort (safest for sensitive documents).
 */
export async function getExistingDocumentPath(
  supabase: Pick<SupabaseClient, 'from'>,
  providerId: string,
  docType: string,
): Promise<ExistingPathResult> {
  try {
    const { data, error } = await supabase
      .from('documents')
      .select('file_path')
      .eq('provider_id', providerId)
      .eq('type', docType)
      .maybeSingle();

    if (error) {
      console.warn('getExistingDocumentPath: query error', error.message);
      return { path: null, queryFailed: true };
    }

    return { path: data?.file_path || null };
  } catch (err) {
    console.warn('getExistingDocumentPath: unexpected error', err);
    return { path: null, queryFailed: true };
  }
}
