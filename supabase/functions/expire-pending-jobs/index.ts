import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * expire-pending-jobs Edge Function
 *
 * Server-authoritative expiry of pending jobs with no provider.
 * Called on a schedule (e.g. every 5 minutes via cron or external trigger).
 *
 * Flow:
 *   1. Calls claim_expiry_eligible_jobs RPC to atomically claim a batch
 *   2. For each claimed job, issues a Stripe refund
 *   3. Calls finalize_expiry_refund RPC to atomically update DB state
 *
 * Authentication: service-role key or shared secret via Authorization header.
 */

async function stripeRequest(
  path: string,
  body: URLSearchParams,
  secretKey: string,
  options: { idempotencyKey?: string } = {}
) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }
  const response = await fetch(`https://api.stripe.com${path}`, {
    method: 'POST',
    headers,
    body,
  });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload?.error?.message || 'Stripe request failed');
    (error as any).stripeError = payload?.error;
    throw error;
  }
  return payload;
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
        JSON.stringify({ processed: 0, succeeded: 0, pending: 0, failed: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[expire-pending-jobs] Claimed ${jobs.length} job(s) for expiry processing.`);

    let succeeded = 0;
    let pending = 0;
    let failed = 0;

    // Step 2: Process each claimed job
    for (const job of jobs) {
      let refundId: string | null = null;
      let refundStatus: string;
      let errorMessage: string | null = null;

      if (!job.payment_intent_id) {
        // No payment to refund — finalize as succeeded (free job or missing PI)
        console.log(
          `[expire-pending-jobs] Job ${job.job_id}: no payment_intent_id, finalizing without refund.`
        );
        refundStatus = 'succeeded';
        refundId = 'none';
      } else {
        // Issue Stripe refund
        try {
          const refundBody = new URLSearchParams();
          refundBody.append('payment_intent', job.payment_intent_id);
          refundBody.append('reason', 'requested_by_customer');
          refundBody.append('metadata[job_id]', job.job_id);
          refundBody.append('metadata[reason]', 'no_provider_expiry');

          const refund = await stripeRequest('/v1/refunds', refundBody, stripeSecretKey, {
            idempotencyKey: job.idempotency_key,
          });

          refundId = refund.id;
          refundStatus = refund.status; // 'succeeded' | 'pending' | 'failed' | etc.
          console.log(
            `[expire-pending-jobs] Job ${job.job_id}: Stripe refund ${refundId} status=${refundStatus}`
          );
        } catch (err: any) {
          refundStatus = 'failed';
          errorMessage = err?.message || 'Stripe refund request failed';
          console.error(
            `[expire-pending-jobs] Job ${job.job_id}: Stripe refund error:`,
            errorMessage
          );
        }
      }

      // Step 3: Finalize in database
      try {
        const { data: result, error: finalizeError } = await adminClient.rpc(
          'finalize_expiry_refund',
          {
            p_operation_id: job.operation_id,
            p_claim_token: job.claim_token,
            p_stripe_refund_id: refundId || errorMessage || 'error',
            p_stripe_refund_status: refundStatus,
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

        if (refundStatus === 'succeeded') {
          succeeded++;
        } else if (refundStatus === 'pending') {
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
