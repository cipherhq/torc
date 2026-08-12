import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Safely remove a single Storage object owned by a provider.
 * Never throws — cleanup failure is logged but does not propagate.
 *
 * @param supabase - Supabase client
 * @param path - exact storage path to remove
 * @param providerId - the authenticated provider's UUID (for validation)
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
 * Look up the current file_path for an existing document row.
 * Returns null if no document exists or no file_path is stored.
 */
export async function getExistingDocumentPath(
  supabase: Pick<SupabaseClient, 'from'>,
  providerId: string,
  docType: string,
): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('documents')
      .select('file_path')
      .eq('provider_id', providerId)
      .eq('type', docType)
      .maybeSingle();
    return data?.file_path || null;
  } catch {
    return null;
  }
}
