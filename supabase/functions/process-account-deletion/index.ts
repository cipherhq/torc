import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSupabaseSecretKey } from '../_shared/supabaseKeys.ts';

/**
 * process-account-deletion Edge Function
 *
 * Trusted server-side account deletion finalizer.
 * Called by admin or cron with x-torc-cron-secret.
 *
 * Lifecycle:
 *   1. _internal_process_deletion(user_id) — DB anonymization → deletion_processing
 *   2. Supabase Admin Auth DELETE — remove auth identity
 *   3. _internal_finalize_deletion(user_id) — mark deleted (verifies auth absent)
 *
 * On auth deletion failure: stays deletion_processing, retryable.
 * On already-absent auth user: treats as success, proceeds to finalize.
 */

const jsonHeaders = { 'Content-Type': 'application/json' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200 });
  }

  // Authenticate via cron secret (same pattern as expire-pending-jobs)
  const cronSecret = Deno.env.get('CRON_SECRET');
  const providedSecret = req.headers.get('x-torc-cron-secret') || '';
  if (!cronSecret || providedSecret !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: jsonHeaders,
    });
  }

  if (req.method === 'GET') {
    return new Response(JSON.stringify({ ok: true, service: 'process-account-deletion' }), {
      status: 200, headers: jsonHeaders,
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: jsonHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseSecretKey = getSupabaseSecretKey();

    if (!supabaseUrl || !supabaseSecretKey) {
      throw new Error('Missing required configuration.');
    }

    const adminClient = createClient(supabaseUrl, supabaseSecretKey);

    const body = await req.json().catch(() => ({}));
    const userId = body.user_id;

    if (!userId) {
      return new Response(JSON.stringify({ error: 'user_id is required' }), {
        status: 400, headers: jsonHeaders,
      });
    }

    // Step 1: DB anonymization
    const { data: processResult, error: processError } = await adminClient.rpc(
      '_internal_process_deletion',
      { p_user_id: userId }
    );

    if (processError) {
      console.error('[process-account-deletion] RPC error:', processError.message);
      return new Response(JSON.stringify({ error: processError.message }), {
        status: 500, headers: jsonHeaders,
      });
    }

    if (!processResult?.success) {
      // Already deleted or stage already complete
      if (processResult?.already_deleted) {
        return new Response(JSON.stringify({ success: true, already_deleted: true }), {
          status: 200, headers: jsonHeaders,
        });
      }
      if (processResult?.stage === 'deletion_processing') {
        // DB work done, proceed to auth deletion
      } else {
        return new Response(JSON.stringify(processResult), {
          status: 400, headers: jsonHeaders,
        });
      }
    }

    // Step 2: Delete auth user via Supabase Admin Auth API
    let authDeleted = false;
    try {
      const authResponse = await fetch(
        `${supabaseUrl}/auth/v1/admin/users/${userId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${supabaseSecretKey}`,
            'apikey': supabaseSecretKey,
          },
        }
      );

      if (authResponse.ok) {
        authDeleted = true;
      } else if (authResponse.status === 404) {
        // Auth user already absent — treat as success
        authDeleted = true;
      } else {
        const authErr = await authResponse.text().catch(() => 'Unknown auth error');
        console.error(`[process-account-deletion] Auth deletion failed (${authResponse.status}):`, authErr);
        // Leave in deletion_processing for retry
        return new Response(JSON.stringify({
          success: false,
          error: 'AUTH_DELETION_FAILED',
          stage: 'deletion_processing',
          message: 'Auth deletion failed. Will retry.',
          retryable: true,
        }), { status: 502, headers: jsonHeaders });
      }
    } catch (authErr: any) {
      // Network/timeout error — leave in deletion_processing
      console.error('[process-account-deletion] Auth deletion network error:', authErr?.message);
      return new Response(JSON.stringify({
        success: false,
        error: 'AUTH_DELETION_TIMEOUT',
        stage: 'deletion_processing',
        message: 'Auth deletion timed out. Will retry.',
        retryable: true,
      }), { status: 502, headers: jsonHeaders });
    }

    // Step 3: Finalize — verify auth absent and mark deleted
    if (authDeleted) {
      const { data: finalResult, error: finalError } = await adminClient.rpc(
        '_internal_finalize_deletion',
        { p_user_id: userId }
      );

      if (finalError) {
        console.error('[process-account-deletion] Finalize error:', finalError.message);
        return new Response(JSON.stringify({
          success: false,
          error: 'FINALIZE_FAILED',
          stage: 'deletion_processing',
          message: finalError.message,
        }), { status: 500, headers: jsonHeaders });
      }

      return new Response(JSON.stringify(finalResult), {
        status: 200, headers: jsonHeaders,
      });
    }

    return new Response(JSON.stringify({
      success: false,
      stage: 'deletion_processing',
    }), { status: 500, headers: jsonHeaders });

  } catch (error: any) {
    console.error('[process-account-deletion] Error:', error?.message);
    return new Response(
      JSON.stringify({ error: error?.message || 'Internal error' }),
      { status: 500, headers: jsonHeaders }
    );
  }
});
