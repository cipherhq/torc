import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSupabaseSecretKey } from '../_shared/supabaseKeys.ts';

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
    const serviceRoleKey = getSupabaseSecretKey();
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
    // Shared refund objects for both expiry and cancellation correlation
    const refundObjects: Array<{ id: string; status: string; payment_intent?: string }> = [];

    if (event.type === 'charge.refunded' || event.type === 'refund.updated') {
      // For charge.refunded: eventObject is the charge, refunds are in eventObject.refunds.data[]
      // For refund.updated: eventObject is the refund itself

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
              `[stripe-webhook] CRITICAL: Lookup error for expiry operation refund ${refundId}: ${lookupError.message}. ` +
              `Scheduled reconciliation will retry.`
            );
            continue;
          }

          if (!expiryOp) continue;

          // Verify payment_intent matches if present
          if (refundObj.payment_intent && expiryOp.job_id) {
            const { data: jobRecord, error: jobLookupError } = await adminClient
              .from('jobs')
              .select('payment_intent_id')
              .eq('id', expiryOp.job_id)
              .single();

            if (jobLookupError) {
              console.error(
                `[stripe-webhook] CRITICAL: Failed to look up job ${expiryOp.job_id} for PI verification: ${jobLookupError.message}. ` +
                `Scheduled reconciliation will retry.`
              );
              continue;
            }

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
            // CRITICAL: Finalization failed but event already claimed by process_stripe_webhook.
            // Do NOT throw — the scheduled reconciliation in expire-pending-jobs is the safety net.
            console.error(
              `[stripe-webhook] CRITICAL: Failed to finalize expiry refund op=${expiryOp.id}, ` +
              `refund=${refundId}, error=${finalizeError.message}. ` +
              `Event already processed — scheduled reconciliation will handle this.`
            );
          } else if (result?.success === false) {
            // Finalize RPC returned an application-level error (e.g. claim_token mismatch, already finalized)
            console.error(
              `[stripe-webhook] CRITICAL: Finalize returned failure for op=${expiryOp.id}, ` +
              `refund=${refundId}, error=${result.error}. ` +
              `Event already processed — scheduled reconciliation will handle this.`
            );
          } else {
            console.log(
              `[stripe-webhook] Finalized expiry refund: op=${expiryOp.id}, status=${refundStatus}`
            );
          }
        } catch (refundErr: any) {
          // CRITICAL: Exception during refund correlation. Event already claimed by
          // process_stripe_webhook so we can't return 500 to get Stripe to retry.
          // The scheduled reconciliation in expire-pending-jobs is the safety net.
          console.error(
            `[stripe-webhook] CRITICAL: Exception processing refund correlation: ${refundErr?.message}. ` +
            `Event already processed — scheduled reconciliation will handle this.`
          );
        }
      }
    }

    // ================================================================
    // CHECKOUT REFUND FINALIZATION (async refunds from pre-job cancellations)
    // Correlate charge.refunded/refund.updated with checkout_refund_operations
    // in refund_pending state. Same safe pattern as expiry refund correlation.
    // DB errors are logged as CRITICAL — the scheduled refund worker
    // reconciliation is the safety net (same convergence strategy as expiry).
    // ================================================================
    if (event.type === 'charge.refunded' || event.type === 'refund.updated') {
      for (const refundObj of refundObjects) {
        try {
          const { data: checkoutOp, error: lookupErr } = await adminClient
            .from('checkout_refund_operations')
            .select('id, checkout_id, payment_intent_id, status')
            .eq('stripe_refund_id', refundObj.id)
            .eq('status', 'refund_pending')
            .maybeSingle();

          if (lookupErr) {
            console.error(
              `[stripe-webhook] CRITICAL: Checkout refund lookup error for refund ${refundObj.id}: ${lookupErr.message}. ` +
              `Scheduled reconciliation will retry.`
            );
            continue;
          }

          if (!checkoutOp) continue;

          // Verify payment_intent matches
          if (refundObj.payment_intent && checkoutOp.payment_intent_id
              && refundObj.payment_intent !== checkoutOp.payment_intent_id) {
            console.error(
              `[stripe-webhook] Checkout refund PI mismatch: expected ${checkoutOp.payment_intent_id}, got ${refundObj.payment_intent}`
            );
            continue;
          }

          const refundStatus = refundObj.status;
          if (!refundStatus || (refundStatus !== 'succeeded' && refundStatus !== 'failed')) {
            continue; // Still pending — leave as refund_pending
          }

          if (refundStatus === 'succeeded') {
            const { error: updateErr } = await adminClient
              .from('checkout_refund_operations')
              .update({
                status: 'completed',
                stripe_refund_status: 'succeeded',
                completed_at: new Date().toISOString(),
              })
              .eq('id', checkoutOp.id);

            if (updateErr) {
              console.error(
                `[stripe-webhook] CRITICAL: Failed to mark checkout refund op ${checkoutOp.id} as completed: ${updateErr.message}. ` +
                `Scheduled reconciliation will handle this.`
              );
              continue;
            }

            const { error: checkoutErr } = await adminClient
              .from('checkouts')
              .update({ status: 'refunded' })
              .eq('id', checkoutOp.checkout_id);

            if (checkoutErr) {
              console.error(
                `[stripe-webhook] CRITICAL: Failed to mark checkout ${checkoutOp.checkout_id} as refunded: ${checkoutErr.message}. ` +
                `Refund op is completed but checkout status may be stale.`
              );
            }

            console.log(`[stripe-webhook] Checkout refund completed: op=${checkoutOp.id}`);
          } else if (refundStatus === 'failed') {
            const { error: failErr } = await adminClient
              .from('checkout_refund_operations')
              .update({
                status: 'manual_review',
                stripe_refund_status: 'failed',
                last_error: 'Stripe refund failed asynchronously',
              })
              .eq('id', checkoutOp.id);

            if (failErr) {
              console.error(
                `[stripe-webhook] CRITICAL: Failed to mark checkout refund op ${checkoutOp.id} as manual_review: ${failErr.message}`
              );
            }
            console.error(`[stripe-webhook] Checkout refund failed: op=${checkoutOp.id}`);
          }
        } catch (err: any) {
          console.error(
            `[stripe-webhook] CRITICAL: Checkout refund correlation exception: ${err?.message}. ` +
            `Event already processed — scheduled reconciliation will handle this.`
          );
        }
      }
    }

    // ================================================================
    // TIP PAYMENT FINALIZATION
    // When a tip PaymentIntent succeeds, finalize the tip earning.
    // ================================================================
    if (event.type === 'payment_intent.succeeded' && eventObject?.metadata?.type === 'tip') {
      const tipId = eventObject?.metadata?.tip_id;
      const tipJobId = eventObject?.metadata?.job_id;
      const tipPiId = eventObject?.id;
      const tipAmount = eventObject?.amount ? eventObject.amount / 100 : null;
      const tipCurrency = eventObject?.currency;

      if (tipId && tipJobId && tipPiId) {
        try {
          // Verify tip record exists and matches
          const { data: tip } = await adminClient
            .from('job_tips')
            .select('id, job_id, customer_id, provider_id, amount, stripe_status')
            .eq('id', tipId)
            .single();

          if (tip && tip.job_id === tipJobId && tip.stripe_status !== 'succeeded') {
            // Verify amount and currency
            if (tipAmount !== null && Math.abs(tipAmount - Number(tip.amount)) < 0.01 && tipCurrency === 'usd') {
              const { error: finalizeErr } = await adminClient.rpc('finalize_tip_payment', {
                p_tip_id: tipId,
                p_payment_intent_id: tipPiId,
                p_stripe_status: 'succeeded',
              });
              if (finalizeErr) {
                console.error(`[stripe-webhook] Tip finalization error: ${finalizeErr.message}`);
              } else {
                console.log(`[stripe-webhook] Tip finalized: tip=${tipId}, job=${tipJobId}`);
              }
            } else {
              console.error(`[stripe-webhook] Tip amount/currency mismatch: expected ${tip.amount} USD, got ${tipAmount} ${tipCurrency}`);
            }
          } else if (tip?.stripe_status === 'succeeded') {
            console.log(`[stripe-webhook] Tip already finalized: ${tipId}`);
          }
        } catch (tipErr: any) {
          console.error(`[stripe-webhook] Tip processing error: ${tipErr?.message}`);
        }
      }
    }

    // ================================================================
    // CANCELLATION REFUND CORRELATION
    // When charge.refunded for a cancellation, update the operation.
    // ================================================================
    if (event.type === 'charge.refunded' || event.type === 'refund.updated') {
      for (const refundObj of refundObjects) {
        try {
          // Check for cancellation operations in refund_pending state
          const { data: cancelOp } = await adminClient
            .from('job_cancellation_operations')
            .select('id, status')
            .eq('stripe_refund_id', refundObj.id)
            .eq('status', 'refund_pending')
            .maybeSingle();

          if (cancelOp) {
            const refundStatus = refundObj.status;
            if (refundStatus === 'succeeded') {
              // Finalize: mark completed, create provider compensation
              await adminClient
                .from('job_cancellation_operations')
                .update({ status: 'completed', stripe_refund_status: 'succeeded', completed_at: new Date().toISOString() })
                .eq('id', cancelOp.id);

              // Get operation details for compensation
              const { data: fullOp } = await adminClient
                .from('job_cancellation_operations')
                .select('*, jobs!inner(provider_id)')
                .eq('id', cancelOp.id)
                .single();

              if (fullOp?.provider_compensation > 0 && fullOp?.jobs?.provider_id) {
                await adminClient.from('provider_earnings').insert({
                  job_id: fullOp.job_id,
                  provider_id: fullOp.jobs.provider_id,
                  base_earnings: fullOp.cancellation_fee,
                  tip: 0,
                  commission_pct: fullOp.platform_fee_on_cancel > 0 ? Math.round((fullOp.platform_fee_on_cancel / fullOp.cancellation_fee) * 10000) / 100 : 15,
                  platform_fee: fullOp.platform_fee_on_cancel,
                  provider_net: fullOp.provider_compensation,
                  entry_type: 'cancellation_compensation',
                }).then(() => {});
              }

              // Update job payment_status
              await adminClient.from('jobs')
                .update({ payment_status: 'refunded', updated_at: new Date().toISOString() })
                .eq('id', fullOp.job_id);

              console.log(`[stripe-webhook] Cancellation refund completed: op=${cancelOp.id}`);
            } else if (refundStatus === 'failed') {
              await adminClient
                .from('job_cancellation_operations')
                .update({ status: 'manual_review', stripe_refund_status: 'failed', last_error: 'Stripe refund failed' })
                .eq('id', cancelOp.id);
            }
          }
        } catch (cancelErr: any) {
          console.error(`[stripe-webhook] Cancellation refund correlation error: ${cancelErr?.message}`);
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
