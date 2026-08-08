import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSupabaseSecretKey } from '../_shared/supabaseKeys.ts';

/**
 * expire-pending-jobs Edge Function
 *
 * Server-authoritative expiry of pending jobs with no provider.
 * Called on a schedule (e.g. every 5 minutes via cron or external trigger).
 *
 * Flow:
 *   1. Calls claim_expiry_eligible_jobs RPC to atomically claim a batch
 *   2. Transitions operation to refund_requesting state
 *   3. For each claimed job, issues a Stripe refund (or retrieves existing)
 *   4. Calls finalize_expiry_refund RPC to atomically update DB state
 *
 * Key invariants:
 *   - Idempotency key from claim RPC is immutable (used as-is for Stripe)
 *   - Error messages are NEVER passed in p_stripe_refund_id (null when unknown)
 *   - Missing payment_intent_id on a paid job -> missing_payment_intent status
 *   - Network timeouts are treated as unknown/retryable, not confirmed failures
 *   - Permanent Stripe errors are finalized as permanent_failure
 *   - If a previous attempt stored a stripe_refund_id, we GET it instead of creating
 *   - Unpaid jobs use finalize_expiry_no_refund RPC
 *   - begin_expiry_refund_request RPC is called before any Stripe call
 *
 * Authentication: CRON_SECRET via custom x-torc-cron-secret header.
 * The Supabase gateway JWT check is disabled (verify_jwt = false in config.toml);
 * this function performs its own authentication.
 *
 * GET  → authenticated health check (no side effects)
 * POST → claim/refund processing
 */

const STRIPE_TIMEOUT_MS = 15_000;

async function stripePost(
  path: string,
  body: URLSearchParams,
  secretKey: string,
  options: { idempotencyKey?: string; timeoutMs?: number } = {}
): Promise<any> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs || STRIPE_TIMEOUT_MS
  );

  try {
    const response = await fetch(`https://api.stripe.com${path}`, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });
    const payload = await response.json();
    if (!response.ok) {
      const error = new Error(payload?.error?.message || 'Stripe request failed');
      (error as any).stripeError = payload?.error;
      (error as any).isStripeError = true;
      throw error;
    }
    return payload;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      const timeoutErr = new Error('Stripe request timed out');
      (timeoutErr as any).isTimeout = true;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function stripeGet(
  path: string,
  secretKey: string,
  options: { timeoutMs?: number } = {}
): Promise<any> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
  };

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs || STRIPE_TIMEOUT_MS
  );

  try {
    const response = await fetch(`https://api.stripe.com${path}`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    const payload = await response.json();
    if (!response.ok) {
      const error = new Error(payload?.error?.message || 'Stripe GET request failed');
      (error as any).stripeError = payload?.error;
      (error as any).isStripeError = true;
      throw error;
    }
    return payload;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      const timeoutErr = new Error('Stripe GET request timed out');
      (timeoutErr as any).isTimeout = true;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function classifyStripeError(error: any): 'retryable' | 'permanent' | 'unknown' {
  const code = error?.stripeError?.code;
  const type = error?.stripeError?.type;
  const status = error?.status;

  // Network timeout or unknown
  if (error?.isTimeout || !type) return 'unknown';
  // Rate limit or server error
  if (status === 429 || (status && status >= 500)) return 'retryable';
  // Invalid request / configuration
  if (type === 'invalid_request_error') return 'permanent';
  return 'retryable';
}

interface ClaimedJob {
  job_id: string;
  payment_intent_id: string | null;
  checkout_id: string | null;
  idempotency_key: string;
  claim_token: string;
  operation_id: string;
}

Deno.serve(async (req) => {
  const jsonHeaders = { 'Content-Type': 'application/json' };

  // Authenticate via custom header — never via Authorization bearer
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret) {
    console.error('[expire-pending-jobs] CRON_SECRET not configured');
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500, headers: jsonHeaders,
    });
  }

  const suppliedSecret = req.headers.get('x-torc-cron-secret');
  if (!suppliedSecret || suppliedSecret !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: jsonHeaders,
    });
  }

  // GET = health check (no side effects)
  if (req.method === 'GET') {
    return new Response(JSON.stringify({ ok: true, service: 'expire-pending-jobs' }), {
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
    const supabaseServiceRoleKey = getSupabaseSecretKey();
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');

    if (!supabaseUrl || !supabaseServiceRoleKey || !stripeSecretKey) {
      throw new Error('Missing required configuration.');
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Step 1: Claim eligible jobs
    const { data: claimedJobs, error: claimError } = await adminClient.rpc(
      'claim_expiry_eligible_jobs',
      { p_batch_size: 10 }
    );

    if (claimError) {
      console.error('[expire-pending-jobs] claim RPC error:', claimError.message);
      throw new Error('Failed to claim eligible jobs: ' + claimError.message);
    }

    const jobs: ClaimedJob[] = claimedJobs || [];

    let succeeded = 0;
    let pending = 0;
    let failed = 0;
    let manualReview = 0;

    if (jobs.length === 0) {
      console.log('[expire-pending-jobs] No eligible jobs found.');
    } else {
      console.log(`[expire-pending-jobs] Claimed ${jobs.length} job(s) for expiry processing.`);
    }

    // Step 2: Process each claimed job
    for (const job of jobs) {
      // Look up the job's payment_status
      const { data: jobRecord } = await adminClient
        .from('jobs')
        .select('payment_status')
        .eq('id', job.job_id)
        .single();

      const paymentStatus = jobRecord?.payment_status;

      if (!job.payment_intent_id) {
        if (paymentStatus === 'paid') {
          // BLOCKER 4: paid job but missing payment_intent_id -> finalize with missing_payment_intent
          console.log(
            `[expire-pending-jobs] Job ${job.job_id}: paid but no payment_intent_id, finalizing as missing_payment_intent.`
          );

          const { data: result, error: finalizeError } = await adminClient.rpc('finalize_expiry_refund', {
            p_operation_id: job.operation_id,
            p_claim_token: job.claim_token,
            p_stripe_refund_id: null,
            p_stripe_refund_status: 'missing_payment_intent',
            p_error_message: 'Job is paid but payment_intent_id is missing',
          });

          if (finalizeError) {
            console.error(
              `[expire-pending-jobs] Job ${job.job_id}: missing_payment_intent finalize error:`,
              finalizeError.message
            );
          }

          manualReview++;
          continue;
        }

        // BLOCKER 5: Unpaid job — use finalize_expiry_no_refund RPC
        console.log(
          `[expire-pending-jobs] Job ${job.job_id}: unpaid (payment_status=${paymentStatus}), expiring without refund.`
        );

        try {
          const { data: result, error: noRefundError } = await adminClient.rpc('finalize_expiry_no_refund', {
            p_operation_id: job.operation_id,
            p_claim_token: job.claim_token,
          });

          if (noRefundError) {
            console.error(
              `[expire-pending-jobs] Job ${job.job_id}: finalize_expiry_no_refund error:`,
              noRefundError.message
            );
            failed++;
          } else if (result?.success === false) {
            console.error(
              `[expire-pending-jobs] Job ${job.job_id}: finalize_expiry_no_refund returned error:`,
              result.error
            );
            failed++;
          } else {
            succeeded++;
          }
        } catch (err: any) {
          console.error(
            `[expire-pending-jobs] Job ${job.job_id}: unpaid expiry error:`,
            err?.message
          );
          failed++;
        }
        continue;
      }

      // --- Paid job with payment_intent_id: issue Stripe refund ---

      // BLOCKER 6: Call begin_expiry_refund_request RPC before Stripe
      const { data: beginResult, error: beginErr } = await adminClient.rpc('begin_expiry_refund_request', {
        p_operation_id: job.operation_id,
        p_claim_token: job.claim_token,
      });

      if (beginErr || !beginResult?.success) {
        console.log(`[expire-pending-jobs] Job ${job.job_id}: cannot begin refund request`);
        failed++;
        continue;
      }

      // Get idempotency_key and stripe_refund_id from the RPC result
      const idempotencyKey = beginResult.idempotency_key || job.idempotency_key;
      const existingRefundId = beginResult.stripe_refund_id;

      let refundId: string | null = null;
      let refundStatus: string;
      let errorMessage: string | null = null;

      try {
        let refund: any;

        // BLOCKER 7: If existing refund ID is known, retrieve instead of creating
        if (existingRefundId) {
          console.log(
            `[expire-pending-jobs] Job ${job.job_id}: retrieving existing refund ${existingRefundId}`
          );
          refund = await stripeGet(`/v1/refunds/${existingRefundId}`, stripeSecretKey);
        } else {
          // Create new refund
          const refundBody = new URLSearchParams();
          refundBody.append('payment_intent', job.payment_intent_id);
          refundBody.append('reason', 'requested_by_customer');
          refundBody.append('metadata[job_id]', job.job_id);
          refundBody.append('metadata[reason]', 'no_provider_expiry');

          // Use idempotency_key as-is (immutable from RPC)
          refund = await stripePost('/v1/refunds', refundBody, stripeSecretKey, {
            idempotencyKey: idempotencyKey,
          });
        }

        refundId = refund.id;
        refundStatus = refund.status; // 'succeeded' | 'pending' | 'failed' | etc.
        console.log(
          `[expire-pending-jobs] Job ${job.job_id}: Stripe refund ${refundId} status=${refundStatus}`
        );
      } catch (err: any) {
        // BLOCKER 10: Classify Stripe errors
        const errorClass = classifyStripeError(err);

        if (errorClass === 'permanent') {
          // Permanent Stripe error — finalize as permanent_failure
          console.error(
            `[expire-pending-jobs] Job ${job.job_id}: permanent Stripe error: ${err?.message}`
          );

          const { error: finalizeError } = await adminClient.rpc('finalize_expiry_refund', {
            p_operation_id: job.operation_id,
            p_claim_token: job.claim_token,
            p_stripe_refund_id: null,
            p_stripe_refund_status: 'permanent_failure',
            p_error_message: err?.message || 'Permanent Stripe error',
          });

          if (finalizeError) {
            console.error(
              `[expire-pending-jobs] Job ${job.job_id}: permanent_failure finalize error:`,
              finalizeError.message
            );
          }
          failed++;
          continue;
        }

        // Retryable or unknown — leave in refund_requesting for reclaim
        console.error(
          `[expire-pending-jobs] Job ${job.job_id}: ${errorClass} Stripe error (will retry): ${err?.message}`
        );

        await adminClient
          .from('job_expiry_refund_operations')
          .update({
            last_error: err?.message || 'Stripe request failed — will retry',
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.operation_id)
          .eq('claim_token', job.claim_token);

        failed++;
        continue;
      }

      // Step 3: Finalize in database
      try {
        const { data: result, error: finalizeError } = await adminClient.rpc(
          'finalize_expiry_refund',
          {
            p_operation_id: job.operation_id,
            p_claim_token: job.claim_token,
            p_stripe_refund_id: refundId,
            p_stripe_refund_status: refundStatus!,
          }
        );

        if (finalizeError) {
          console.error(
            `[expire-pending-jobs] Job ${job.job_id}: finalize RPC error:`,
            finalizeError.message
          );
          failed++;
          continue;
        }

        if (result?.success === false) {
          console.error(
            `[expire-pending-jobs] Job ${job.job_id}: finalize returned error:`,
            result.error
          );
          failed++;
          continue;
        }

        if (refundStatus! === 'succeeded') {
          succeeded++;
        } else if (refundStatus! === 'pending') {
          pending++;
        } else {
          failed++;
        }
      } catch (err: any) {
        console.error(
          `[expire-pending-jobs] Job ${job.job_id}: finalize exception:`,
          err?.message
        );
        failed++;
      }
    }

    // Phase 2: Reconcile pending refunds (webhook missed)
    const { data: pendingOps, error: pendingErr } = await adminClient.rpc(
      'reconcile_pending_refunds',
      { p_batch_size: 10, p_stale_minutes: 30 }
    );

    if (pendingErr) {
      console.error('[expire-pending-jobs] Reconciliation RPC error:', pendingErr.message);
    } else if (pendingOps?.length > 0) {
      console.log(`[expire-pending-jobs] Reconciling ${pendingOps.length} pending refund(s).`);

      for (const op of pendingOps) {
        try {
          // Must retrieve, never create — refund ID is already known
          const refund = await stripeGet(`/v1/refunds/${op.stripe_refund_id}`, stripeSecretKey);

          const { data: result, error: finalizeErr } = await adminClient.rpc('finalize_expiry_refund', {
            p_operation_id: op.operation_id,
            p_claim_token: op.claim_token,
            p_stripe_refund_id: refund.id,
            p_stripe_refund_status: refund.status,
            p_error_message: refund.status === 'failed' ? 'Refund failed (reconciliation check)' : null,
          });

          if (finalizeErr || result?.success === false) {
            console.error(`[expire-pending-jobs] Reconciliation finalize failed for op ${op.operation_id}:`,
              finalizeErr?.message || result?.error);
          } else {
            console.log(`[expire-pending-jobs] Reconciled op ${op.operation_id}: ${refund.status}`);
            if (refund.status === 'succeeded') succeeded++;
            else if (refund.status === 'pending') pending++;
          }
        } catch (err: any) {
          console.error(`[expire-pending-jobs] Reconciliation error for op ${op.operation_id}:`, err?.message);
        }
      }
    }

    const summary = {
      processed: jobs.length,
      succeeded,
      pending,
      failed,
      manual_review: manualReview,
      reconciled: (pendingOps?.length || 0),
    };

    console.log('[expire-pending-jobs] Summary:', JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[expire-pending-jobs] Fatal error:', error?.message);
    return new Response(
      JSON.stringify({ error: error?.message || 'Expiry processing failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
