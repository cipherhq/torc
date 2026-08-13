import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSupabaseSecretKey } from '../_shared/supabaseKeys.ts';

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

async function stripeGet(path: string, secretKey: string): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STRIPE_TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.stripe.com${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${secretKey}` },
      signal: controller.signal,
    });
    const payload = await response.json();
    if (!response.ok) {
      const error = new Error(payload?.error?.message || 'Stripe GET request failed');
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
    const supabaseServiceRoleKey = getSupabaseSecretKey();
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
        const isTimeout = err?.isTimeout === true;
        const isNetworkError = !err?.stripeError;

        if (isTimeout || isNetworkError) {
          // Unknown outcome — do NOT mark as definitive failed.
          // Revert to pending for retry with same idempotency key.
          console.error(`[cancellation-refund] Op ${op.id} timeout/network error (will retry): ${err?.message}`);
          await adminClient
            .from('job_cancellation_operations')
            .update({
              status: 'pending',
              last_error: err?.message || 'Stripe timeout — will retry',
            })
            .eq('id', op.id);
          pending++;
        } else {
          // Definitive Stripe error — mark as manual_review
          console.error(`[cancellation-refund] Op ${op.id} Stripe error: ${err?.message}`);
          await adminClient
            .from('job_cancellation_operations')
            .update({
              status: 'manual_review',
              last_error: err?.message || 'Stripe error',
            })
            .eq('id', op.id);
          failed++;
        }
      }
    }

    // --- Phase A: Process pending checkout refund operations (issue Stripe refund) ---
    const { data: checkoutOps, error: checkoutOpsErr } = await adminClient
      .from('checkout_refund_operations')
      .select('*')
      .eq('status', 'pending')
      .not('payment_intent_id', 'is', null)
      .gt('refund_amount', 0)
      .order('created_at', { ascending: true })
      .limit(10);

    if (checkoutOpsErr) console.error('[checkout-refund] Fetch error:', checkoutOpsErr.message);

    for (const op of (checkoutOps || [])) {
      try {
        // Atomic claim: only proceed if this worker actually claimed the row
        const { data: claimed, error: claimErr } = await adminClient
          .from('checkout_refund_operations')
          .update({ status: 'refund_requesting' })
          .eq('id', op.id)
          .eq('status', 'pending')
          .select('id');

        if (claimErr || !claimed || claimed.length === 0) {
          console.log(`[checkout-refund] Op ${op.id}: not claimed (already taken or error)`);
          continue;
        }

        const refundBody = new URLSearchParams();
        refundBody.append('payment_intent', op.payment_intent_id);
        refundBody.append('amount', Math.round(op.refund_amount * 100).toString());
        refundBody.append('reason', 'requested_by_customer');
        refundBody.append('metadata[checkout_id]', op.checkout_id);
        refundBody.append('metadata[type]', 'checkout_cancellation_refund');
        refundBody.append('metadata[operation_id]', op.id);

        const refund = await stripePost('/v1/refunds', refundBody, stripeSecretKey, op.idempotency_key);

        // Use atomic finalizer for succeeded — both op and checkout in one transaction
        const { data: finResult, error: finErr } = await adminClient.rpc('finalize_checkout_refund', {
          p_operation_id: op.id,
          p_stripe_refund_id: refund.id,
          p_stripe_refund_status: refund.status,
          p_error_message: refund.status === 'failed' ? 'Stripe refund failed' : null,
        });

        if (finErr) {
          console.error(`[checkout-refund] Op ${op.id}: finalizer error: ${finErr.message}`);
          failed++;
        } else if (finResult?.status === 'completed') {
          succeeded++;
        } else if (finResult?.status === 'refund_pending') {
          pending++;
        } else if (finResult?.status === 'manual_review') {
          failed++;
        }
      } catch (err: any) {
        const isTimeout = err?.isTimeout === true;
        const isNetworkError = !err?.stripeError;

        if (isTimeout || isNetworkError) {
          console.error(`[checkout-refund] Op ${op.id} timeout/network (will retry): ${err?.message}`);
          await adminClient
            .from('checkout_refund_operations')
            .update({ status: 'pending', last_error: err?.message || 'Stripe timeout — will retry' })
            .eq('id', op.id);
          pending++;
        } else {
          console.error(`[checkout-refund] Op ${op.id} Stripe error: ${err?.message}`);
          await adminClient
            .from('checkout_refund_operations')
            .update({ status: 'manual_review', last_error: err?.message || 'Stripe error' })
            .eq('id', op.id);
          failed++;
        }
      }
    }

    // --- Phase B: Reconcile refund_pending checkout operations ---
    // For operations where Stripe refund was issued but webhook finalization may have failed.
    const { data: pendingCheckoutOps, error: pendingCheckoutErr } = await adminClient
      .from('checkout_refund_operations')
      .select('id, checkout_id, payment_intent_id, stripe_refund_id, refund_amount, currency')
      .eq('status', 'refund_pending')
      .not('stripe_refund_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(10);

    if (pendingCheckoutErr) {
      console.error('[checkout-refund] Reconciliation fetch error:', pendingCheckoutErr.message);
    }

    let reconciled = 0;
    for (const op of (pendingCheckoutOps || [])) {
      try {
        // Retrieve existing refund from Stripe — NEVER create a new one
        const refund = await stripeGet(`/v1/refunds/${op.stripe_refund_id}`, stripeSecretKey);

        // Validate refund belongs to the expected payment
        if (refund.id !== op.stripe_refund_id) {
          console.error(`[checkout-refund] Reconciliation: refund ID mismatch for op ${op.id}`);
          await adminClient.from('checkout_refund_operations')
            .update({ status: 'manual_review', last_error: 'Stripe refund ID mismatch during reconciliation' })
            .eq('id', op.id);
          failed++;
          continue;
        }
        if (refund.payment_intent && op.payment_intent_id && refund.payment_intent !== op.payment_intent_id) {
          console.error(`[checkout-refund] Reconciliation: PI mismatch for op ${op.id}`);
          await adminClient.from('checkout_refund_operations')
            .update({ status: 'manual_review', last_error: 'Payment intent mismatch during reconciliation' })
            .eq('id', op.id);
          failed++;
          continue;
        }
        // Validate amount
        const expectedCents = Math.round(Number(op.refund_amount) * 100);
        if (refund.amount && refund.amount !== expectedCents) {
          console.error(`[checkout-refund] Reconciliation: amount mismatch for op ${op.id}: expected ${expectedCents}, got ${refund.amount}`);
          await adminClient.from('checkout_refund_operations')
            .update({ status: 'manual_review', last_error: `Refund amount mismatch: expected ${expectedCents}, got ${refund.amount}` })
            .eq('id', op.id);
          failed++;
          continue;
        }

        // Use atomic finalizer — same path as webhook
        const { data: finResult, error: finErr } = await adminClient.rpc('finalize_checkout_refund', {
          p_operation_id: op.id,
          p_stripe_refund_id: refund.id,
          p_stripe_refund_status: refund.status,
          p_error_message: refund.status === 'failed' ? 'Refund failed (reconciliation)' : null,
        });

        if (finErr) {
          console.error(`[checkout-refund] Reconciliation finalize error for op ${op.id}: ${finErr.message}`);
        } else {
          console.log(`[checkout-refund] Reconciled op ${op.id}: ${refund.status}`);
          if (refund.status === 'succeeded') succeeded++;
          else if (refund.status === 'pending') pending++;
          reconciled++;
        }
      } catch (err: any) {
        // Timeout/network: leave as refund_pending for next run
        console.error(`[checkout-refund] Reconciliation error for op ${op.id}: ${err?.message}`);
      }
    }

    const totalProcessed = (ops || []).length + (checkoutOps || []).length + (pendingCheckoutOps || []).length;
    return new Response(JSON.stringify({ processed: totalProcessed, succeeded, pending, failed }), {
      status: 200, headers: jsonHeaders,
    });
  } catch (error: any) {
    console.error('[cancellation-refund] Fatal:', error?.message);
    return new Response(JSON.stringify({ error: error?.message || 'Processing failed' }), {
      status: 500, headers: jsonHeaders,
    });
  }
});
