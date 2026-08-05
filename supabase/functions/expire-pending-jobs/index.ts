import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
 *   - Error messages are NEVER passed in p_stripe_refund_id
 *   - Missing payment_intent_id on a paid job -> manual_review (not succeeded)
 *   - Network timeouts are treated as unknown/retryable, not confirmed failures
 *   - If a previous attempt stored a stripe_refund_id, we GET it instead of creating
 *
 * Authentication: service-role key or shared CRON_SECRET via Authorization header.
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

interface ClaimedJob {
  job_id: string;
  payment_intent_id: string | null;
  checkout_id: string | null;
  idempotency_key: string;
  claim_token: string;
  operation_id: string;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey =
      Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    const cronSecret = Deno.env.get('CRON_SECRET');

    if (!supabaseUrl || !supabaseServiceRoleKey || !stripeSecretKey) {
      throw new Error('Missing required configuration.');
    }

    // Authenticate: accept service-role key or shared CRON_SECRET
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const isServiceRole = token === supabaseServiceRoleKey;
    const isCronAuth = cronSecret && token === cronSecret;

    if (!isServiceRole && !isCronAuth) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
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

    if (jobs.length === 0) {
      console.log('[expire-pending-jobs] No eligible jobs found.');
      return new Response(
        JSON.stringify({ processed: 0, succeeded: 0, pending: 0, failed: 0, manual_review: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[expire-pending-jobs] Claimed ${jobs.length} job(s) for expiry processing.`);

    let succeeded = 0;
    let pending = 0;
    let failed = 0;
    let manualReview = 0;

    // Step 2: Process each claimed job
    for (const job of jobs) {
      let refundId: string | null = null;
      let refundStatus: string;
      let errorMessage: string | null = null;

      // Look up the job's payment_status and check for existing stripe_refund_id
      const { data: jobRecord } = await adminClient
        .from('jobs')
        .select('payment_status')
        .eq('id', job.job_id)
        .single();

      const { data: existingOp } = await adminClient
        .from('job_expiry_refund_operations')
        .select('stripe_refund_id')
        .eq('id', job.operation_id)
        .single();

      const paymentStatus = jobRecord?.payment_status;
      const existingRefundId = existingOp?.stripe_refund_id;

      if (!job.payment_intent_id) {
        if (paymentStatus === 'paid') {
          // BLOCKER 4: paid job but missing payment_intent_id -> manual_review
          console.log(
            `[expire-pending-jobs] Job ${job.job_id}: paid but no payment_intent_id, routing to manual_review.`
          );
          errorMessage = 'Paid job missing payment_intent_id — requires manual review';

          // Update operation with error context
          await adminClient
            .from('job_expiry_refund_operations')
            .update({
              status: 'refund_failed',
              last_error: errorMessage,
              updated_at: new Date().toISOString(),
            })
            .eq('id', job.operation_id)
            .eq('claim_token', job.claim_token);

          // Finalize as manual_review (not succeeded)
          const { error: finalizeError } = await adminClient.rpc('finalize_expiry_refund', {
            p_operation_id: job.operation_id,
            p_claim_token: job.claim_token,
            p_stripe_refund_id: 'manual_review',
            p_stripe_refund_status: 'manual_review',
          });

          if (finalizeError) {
            console.error(
              `[expire-pending-jobs] Job ${job.job_id}: manual_review finalize error:`,
              finalizeError.message
            );
          }

          manualReview++;
          continue;
        }

        // Unpaid job (payment_status != 'paid') — safe to expire without refund
        console.log(
          `[expire-pending-jobs] Job ${job.job_id}: unpaid (payment_status=${paymentStatus}), expiring without refund.`
        );

        try {
          // For unpaid jobs, finalize as succeeded with no refund needed
          // We set the job to expired directly since no money to refund
          await adminClient
            .from('jobs')
            .update({ status: 'expired', updated_at: new Date().toISOString() })
            .eq('id', job.job_id);

          await adminClient
            .from('job_expiry_refund_operations')
            .update({
              status: 'finalized',
              stripe_refund_status: 'not_required',
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', job.operation_id)
            .eq('claim_token', job.claim_token);

          // Audit trail
          await adminClient.from('job_status_audit').insert({
            job_id: job.job_id,
            previous_status: 'pending',
            new_status: 'expired',
            actor_type: 'system',
            reason: 'No provider available. No payment to refund.',
          });

          await adminClient.from('job_events').insert({
            job_id: job.job_id,
            event_type: 'job_expired_no_provider',
            actor_type: 'system',
            metadata: {
              reason: 'no_provider',
              previous_status: 'pending',
              payment_status: paymentStatus || 'none',
              operation_id: job.operation_id,
            },
          });

          succeeded++;
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

      // BLOCKER 2: Transition to refund_requesting before calling Stripe
      await adminClient
        .from('job_expiry_refund_operations')
        .update({
          status: 'refund_requesting',
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.operation_id)
        .eq('claim_token', job.claim_token);

      try {
        let refund: any;

        if (existingRefundId && existingRefundId !== 'manual_review') {
          // Previous attempt stored a refund ID — retrieve it instead of creating
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

          // BLOCKER 1: Use idempotency_key as-is (immutable from claim RPC)
          refund = await stripePost('/v1/refunds', refundBody, stripeSecretKey, {
            idempotencyKey: job.idempotency_key,
          });
        }

        refundId = refund.id;
        refundStatus = refund.status; // 'succeeded' | 'pending' | 'failed' | etc.
        console.log(
          `[expire-pending-jobs] Job ${job.job_id}: Stripe refund ${refundId} status=${refundStatus}`
        );
      } catch (err: any) {
        // Handle network timeouts as unknown/retryable, not confirmed failures
        if (err.isTimeout) {
          console.error(
            `[expire-pending-jobs] Job ${job.job_id}: Stripe request timed out (retryable)`
          );
          errorMessage = 'Stripe request timed out — will retry on next run';

          // Leave operation in refund_requesting state so it can be reclaimed
          // after lease expiry. Store error for visibility.
          await adminClient
            .from('job_expiry_refund_operations')
            .update({
              last_error: errorMessage,
              updated_at: new Date().toISOString(),
            })
            .eq('id', job.operation_id)
            .eq('claim_token', job.claim_token);

          failed++;
          continue;
        }

        refundStatus = 'failed';
        errorMessage = err?.message || 'Stripe refund request failed';
        console.error(
          `[expire-pending-jobs] Job ${job.job_id}: Stripe refund error:`,
          errorMessage
        );
      }

      // Step 3: Finalize in database
      try {
        // BLOCKER 7: Never pass error messages in p_stripe_refund_id.
        // Pass proper refund ID or null-safe value. Error context goes via
        // direct update to last_error on the operation row.
        const finalRefundId = refundId || 'none';

        if (errorMessage) {
          // Store error message in last_error via direct update (not in p_stripe_refund_id)
          await adminClient
            .from('job_expiry_refund_operations')
            .update({
              last_error: errorMessage,
              updated_at: new Date().toISOString(),
            })
            .eq('id', job.operation_id)
            .eq('claim_token', job.claim_token);
        }

        const { data: result, error: finalizeError } = await adminClient.rpc(
          'finalize_expiry_refund',
          {
            p_operation_id: job.operation_id,
            p_claim_token: job.claim_token,
            p_stripe_refund_id: finalRefundId,
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

    const summary = {
      processed: jobs.length,
      succeeded,
      pending,
      failed,
      manual_review: manualReview,
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
