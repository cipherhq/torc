import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * process-cancellation-refunds Edge Function
 *
 * Processes pending cancellation refund operations.
 * Called by the expire-pending-jobs cron or manually by admin.
 * Reuses the same Stripe refund patterns as expire-pending-jobs.
 *
 * Authentication: x-torc-cron-secret header.
 */

const STRIPE_TIMEOUT_MS = 15_000;

async function stripePost(path: string, body: URLSearchParams, secretKey: string, idempotencyKey?: string): Promise<any> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STRIPE_TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.stripe.com${path}`, {
      method: 'POST', headers, body, signal: controller.signal,
    });
    const payload = await response.json();
    if (!response.ok) {
      const error = new Error(payload?.error?.message || 'Stripe request failed');
      (error as any).stripeError = payload?.error;
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

Deno.serve(async (req) => {
  const jsonHeaders = { 'Content-Type': 'application/json' };

  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret) {
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), { status: 500, headers: jsonHeaders });
  }
  const suppliedSecret = req.headers.get('x-torc-cron-secret');
  if (!suppliedSecret || suppliedSecret !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: jsonHeaders });
  }

  if (req.method === 'GET') {
    return new Response(JSON.stringify({ ok: true, service: 'process-cancellation-refunds' }), { status: 200, headers: jsonHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: jsonHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');

    if (!supabaseUrl || !supabaseServiceRoleKey || !stripeSecretKey) {
      throw new Error('Missing required configuration.');
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Find pending cancellation operations that need Stripe refund
    const { data: ops, error: opsErr } = await adminClient
      .from('job_cancellation_operations')
      .select('*')
      .eq('status', 'pending')
      .not('payment_intent_id', 'is', null)
      .gt('refund_amount', 0)
      .order('created_at', { ascending: true })
      .limit(10);

    if (opsErr) throw new Error('Failed to fetch operations: ' + opsErr.message);

    let succeeded = 0;
    let failed = 0;
    let pending = 0;

    for (const op of (ops || [])) {
      try {
        // Mark as refund_requesting
        await adminClient
          .from('job_cancellation_operations')
          .update({ status: 'refund_requesting' })
          .eq('id', op.id)
          .eq('status', 'pending');

        // Issue Stripe partial refund
        const refundBody = new URLSearchParams();
        refundBody.append('payment_intent', op.payment_intent_id);
        refundBody.append('amount', Math.round(op.refund_amount * 100).toString());
        refundBody.append('reason', 'requested_by_customer');
        refundBody.append('metadata[job_id]', op.job_id);
        refundBody.append('metadata[type]', 'cancellation_refund');
        refundBody.append('metadata[operation_id]', op.id);

        const refund = await stripePost('/v1/refunds', refundBody, stripeSecretKey, op.idempotency_key);

        // Update operation with Stripe result
        if (refund.status === 'succeeded') {
          await adminClient
            .from('job_cancellation_operations')
            .update({
              status: 'completed',
              stripe_refund_id: refund.id,
              stripe_refund_status: 'succeeded',
              completed_at: new Date().toISOString(),
            })
            .eq('id', op.id);

          // Update job payment status
          await adminClient
            .from('jobs')
            .update({ payment_status: 'refunded', updated_at: new Date().toISOString() })
            .eq('id', op.job_id);

          // Create provider compensation earning now that refund succeeded
          if (op.provider_compensation > 0) {
            const { data: job } = await adminClient
              .from('jobs')
              .select('provider_id')
              .eq('id', op.job_id)
              .single();

            if (job?.provider_id) {
              const commissionPct = op.platform_fee_on_cancel > 0 && op.cancellation_fee > 0
                ? Math.round((op.platform_fee_on_cancel / op.cancellation_fee) * 10000) / 100
                : 15;

              await adminClient.from('provider_earnings').insert({
                job_id: op.job_id,
                provider_id: job.provider_id,
                base_earnings: op.cancellation_fee,
                tip: 0,
                commission_pct: commissionPct,
                platform_fee: op.platform_fee_on_cancel,
                provider_net: op.provider_compensation,
                entry_type: 'cancellation_compensation',
              }).then(() => {});
            }
          }

          succeeded++;
        } else if (refund.status === 'pending') {
          await adminClient
            .from('job_cancellation_operations')
            .update({
              status: 'refund_pending',
              stripe_refund_id: refund.id,
              stripe_refund_status: 'pending',
            })
            .eq('id', op.id);
          pending++;
        } else {
          await adminClient
            .from('job_cancellation_operations')
            .update({
              status: 'failed',
              stripe_refund_id: refund.id,
              stripe_refund_status: refund.status,
              last_error: 'Stripe refund status: ' + refund.status,
            })
            .eq('id', op.id);
          failed++;
        }
      } catch (err: any) {
        console.error(`[cancellation-refund] Op ${op.id} error:`, err?.message);
        await adminClient
          .from('job_cancellation_operations')
          .update({
            status: 'failed',
            last_error: err?.message || 'Unknown error',
          })
          .eq('id', op.id);
        failed++;
      }
    }

    return new Response(JSON.stringify({ processed: (ops || []).length, succeeded, pending, failed }), {
      status: 200, headers: jsonHeaders,
    });
  } catch (error: any) {
    console.error('[cancellation-refund] Fatal:', error?.message);
    return new Response(JSON.stringify({ error: error?.message || 'Processing failed' }), {
      status: 500, headers: jsonHeaders,
    });
  }
});
