import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Dedicated Stripe webhook handler.
 *
 * - No user auth required (webhooks come from Stripe)
 * - Cryptographic signature verification (HMAC-SHA256)
 * - Timestamp replay protection (300s window)
 * - Idempotent processing (processed_webhook_events table)
 * - Updates checkout and job records on payment success/failure/refund
 * - Correlates charge.refunded / refund.updated events with pending
 *   job_expiry_refund_operations for async refund finalization
 */

function hexEncode(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function verifyStripeSignature(
  rawBody: string, sigHeader: string, webhookSecret: string
): Promise<{ valid: boolean; error?: string }> {
  const parts = sigHeader.split(',');
  let timestamp = '';
  const signatures: string[] = [];
  for (const part of parts) {
    const [key, value] = part.split('=', 2);
    if (key === 't') timestamp = value;
    else if (key === 'v1') signatures.push(value);
  }
  if (!timestamp || signatures.length === 0) {
    return { valid: false, error: 'Missing timestamp or signature' };
  }
  const tsSeconds = parseInt(timestamp, 10);
  if (Math.abs(Math.floor(Date.now() / 1000) - tsSeconds) > 300) {
    return { valid: false, error: 'Timestamp too old (replay protection)' };
  }
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(webhookSecret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
  const expected = hexEncode(new Uint8Array(sig));
  const matched = signatures.some((s) => timingSafeEqual(expected, s));
  return matched ? { valid: true } : { valid: false, error: 'Signature mismatch' };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

    if (!supabaseUrl || !serviceRoleKey || !stripeWebhookSecret) {
      throw new Error('Missing configuration.');
    }

    const sigHeader = req.headers.get('stripe-signature') || '';
    if (!sigHeader) {
      return new Response(JSON.stringify({ error: 'Missing stripe-signature header' }), { status: 400 });
    }

    const rawBody = await req.text();
    const verification = await verifyStripeSignature(rawBody, sigHeader, stripeWebhookSecret);
    if (!verification.valid) {
      console.error('[stripe-webhook] Signature verification failed:', verification.error);
      return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 400 });
    }

    const event = JSON.parse(rawBody);
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const eventObject = event.data?.object;
    const checkoutId = eventObject?.metadata?.checkout_id || null;
    // For payment_intent events, eventObject.id IS the PI ID.
    // For charge events (e.g. charge.refunded), eventObject.payment_intent is the PI ID.
    const paymentIntentId = eventObject?.payment_intent || eventObject?.id || null;

    // Determine amount/currency from event object
    const amount = eventObject?.amount || eventObject?.amount_received || null;
    const currency = eventObject?.currency || null;
    const stripeCustomerId = eventObject?.customer || null;

    // Supported event types that we process atomically
    const supportedEvents = [
      'payment_intent.succeeded',
      'payment_intent.payment_failed',
      'charge.refunded',
    ];

    if (supportedEvents.includes(event.type)) {
      // Use atomic RPC: handles idempotency, checkout+job updates in one transaction
      const { data: result, error: rpcError } = await adminClient.rpc('process_stripe_webhook', {
        p_event_id: event.id,
        p_event_type: event.type,
        p_payment_intent_id: paymentIntentId,
        p_checkout_id: checkoutId,
        p_amount: amount,
        p_currency: currency,
        p_stripe_customer_id: stripeCustomerId,
      });

      if (rpcError) {
        console.error(`[stripe-webhook] RPC error for ${event.type}:`, rpcError.message);
        throw new Error(`Webhook RPC failed: ${rpcError.message}`);
      }

      if (result?.duplicate) {
        console.log(`[stripe-webhook] Duplicate event ${event.id}, skipping`);
      } else {
        console.log(`[stripe-webhook] ${event.type}: pi=${paymentIntentId}, checkout=${checkoutId || 'none'}`);
      }
    } else {
      console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }

    // ================================================================
    // BLOCKER 3: Check for pending expiry refund operations
    // Correlate charge.refunded and refund.updated events with
    // job_expiry_refund_operations in refund_pending state.
    //
    // Safety: Only correlates with existing refund_pending operations
    // by matching the exact stripe_refund_id. An unrelated manual
    // refund will NOT match any operation and is harmless.
    // Duplicate webhook delivery is safe because finalize_expiry_refund
    // is idempotent (claim_token check + status guard).
    // ================================================================
    if (event.type === 'charge.refunded' || event.type === 'refund.updated') {
      // For charge.refunded: eventObject is the charge, refunds are in eventObject.refunds.data[]
      // For refund.updated: eventObject is the refund itself
      const refundObjects: Array<{ id: string; status: string; payment_intent?: string }> = [];

      if (event.type === 'refund.updated') {
        // eventObject IS the refund
        if (eventObject?.id) {
          refundObjects.push({
            id: eventObject.id,
            status: eventObject.status,
            payment_intent: eventObject.payment_intent,
          });
        }
      } else if (event.type === 'charge.refunded') {
        // eventObject is the charge; refunds are nested
        const refunds = eventObject?.refunds?.data || [];
        for (const r of refunds) {
          if (r?.id) {
            refundObjects.push({
              id: r.id,
              status: r.status,
              payment_intent: eventObject?.payment_intent,
            });
          }
        }
      }

      for (const refundObj of refundObjects) {
        try {
          const refundId = refundObj.id;

          // BLOCKER 11: Correlate by exact stripe_refund_id only
          const { data: expiryOp, error: lookupError } = await adminClient
            .from('job_expiry_refund_operations')
            .select('id, claim_token, status, job_id')
            .eq('stripe_refund_id', refundId)
            .eq('status', 'refund_pending')
            .maybeSingle();

          if (lookupError) {
            console.error(
              `[stripe-webhook] Error looking up expiry operation for refund ${refundId}:`,
              lookupError.message
            );
            continue;
          }

          if (!expiryOp) continue;

          // Verify payment_intent matches if present
          if (refundObj.payment_intent && expiryOp.job_id) {
            const { data: jobRecord } = await adminClient
              .from('jobs')
              .select('payment_intent_id')
              .eq('id', expiryOp.job_id)
              .single();

            if (jobRecord?.payment_intent_id && refundObj.payment_intent !== jobRecord.payment_intent_id) {
              console.error(
                `[stripe-webhook] Payment intent mismatch for refund ${refundId}: ` +
                `expected ${jobRecord.payment_intent_id}, got ${refundObj.payment_intent}`
              );
              continue;
            }
          }

          // Only finalize when Stripe explicitly says succeeded or failed
          const refundStatus = refundObj.status;
          if (!refundStatus || (refundStatus !== 'succeeded' && refundStatus !== 'failed')) {
            console.log(
              `[stripe-webhook] Refund ${refundId} status is '${refundStatus}', not finalizing yet`
            );
            continue;
          }

          const { data: result, error: finalizeError } = await adminClient.rpc('finalize_expiry_refund', {
            p_operation_id: expiryOp.id,
            p_claim_token: expiryOp.claim_token,
            p_stripe_refund_id: refundId,
            p_stripe_refund_status: refundStatus,
          });

          // Check both RPC error and result.success
          if (finalizeError) {
            console.error(
              `[stripe-webhook] Failed to finalize expiry refund: op=${expiryOp.id}, error=${finalizeError.message}`
            );
          } else if (result?.success === false) {
            console.error(
              `[stripe-webhook] Finalize returned failure: op=${expiryOp.id}, error=${result.error}`
            );
          } else {
            console.log(
              `[stripe-webhook] Finalized expiry refund: op=${expiryOp.id}, status=${refundStatus}`
            );
          }
        } catch (refundErr: any) {
          // If finalization fails, log but don't crash (webhook must return 200)
          console.error(
            `[stripe-webhook] Exception processing refund correlation:`,
            refundErr?.message
          );
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[stripe-webhook] Error:', error?.message);
    return new Response(JSON.stringify({ error: 'Webhook processing failed' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
