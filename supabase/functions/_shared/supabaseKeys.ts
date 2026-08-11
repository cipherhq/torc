/**
 * Supabase modern key resolution for Edge Functions.
 *
 * Supabase's modern hosting exposes:
 *   SUPABASE_SECRET_KEYS   — JSON dict, modern secret key under "default"
 *   SUPABASE_PUBLISHABLE_KEYS — JSON dict, modern publishable key under "default"
 *
 * Legacy hosting exposes:
 *   SERVICE_ROLE_KEY / SUPABASE_SERVICE_ROLE_KEY — JWT-format service role key
 *   SUPABASE_ANON_KEY — JWT-format anon key
 *
 * These helpers prefer the modern key and fall back to legacy during migration.
 *
 * IMPORTANT: Modern sb_secret_... keys are NOT JWTs. They work with
 * createClient() (which sends them via the apikey header), but must NOT
 * be used as Authorization: Bearer tokens to PostgREST directly.
 * All current Edge Functions only use the Supabase key via createClient(),
 * so modern keys are safe.
 */

/**
 * Resolve the Supabase secret (service-role) key.
 *
 * Priority:
 *   1. SUPABASE_SECRET_KEYS JSON → .default
 *   2. SERVICE_ROLE_KEY (legacy custom name)
 *   3. SUPABASE_SERVICE_ROLE_KEY (legacy Supabase-injected name)
 */
export function getSupabaseSecretKey(): string | undefined {
  // Modern: JSON dictionary with "default" key
  const secretKeysJson = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (secretKeysJson) {
    try {
      const parsed = JSON.parse(secretKeysJson);
      if (parsed?.default) return parsed.default;
    } catch {
      // Malformed JSON — fall through to legacy
    }
  }

  // Legacy fallback
  return Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
}

/**
 * Resolve the Supabase publishable (anon) key.
 *
 * Priority:
 *   1. SUPABASE_PUBLISHABLE_KEYS JSON → .default
 *   2. SUPABASE_ANON_KEY (legacy Supabase-injected name)
 */
export function getSupabasePublishableKey(): string | undefined {
  const pubKeysJson = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (pubKeysJson) {
    try {
      const parsed = JSON.parse(pubKeysJson);
      if (parsed?.default) return parsed.default;
    } catch {
      // Malformed JSON — fall through to legacy
    }
  }

  return Deno.env.get('SUPABASE_ANON_KEY');
}
