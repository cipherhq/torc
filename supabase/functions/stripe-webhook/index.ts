import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Dedicated Stripe webhook handler.
 *
 * - No user auth required (webhooks come from Stripe)
 * - Cryptographic signature verification (HMAC-SHA256)
 * - Timestamp replay protection (300s window)
 * - Idempotent processing (processed_webhook_events table)
 * - Updates checkout and job records on payment success/failure/refund
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

    // Idempotency check
    const { data: existing } = await adminClient
      .from('processed_webhook_events')
      .select('event_id')
      .eq('event_id', event.id)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    const eventObject = event.data?.object;
    const checkoutId = eventObject?.metadata?.checkout_id;

    switch (event.type) {
      case 'payment_intent.succeeded': {
        if (checkoutId) {
          await adminClient.from('checkouts').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', checkoutId);
          await adminClient.from('jobs').update({ payment_status: 'paid', paid_at: new Date().toISOString() }).eq('checkout_id', checkoutId);
        }
        // Also update by payment_intent_id for backward compatibility
        if (eventObject?.id) {
          await adminClient.from('jobs').update({ payment_status: 'paid', paid_at: new Date().toISOString() }).eq('payment_intent_id', eventObject.id);
        }
        console.log(`[stripe-webhook] payment_intent.succeeded: pi=${eventObject?.id}, checkout=${checkoutId || 'none'}`);
        break;
      }
      case 'payment_intent.payment_failed': {
        if (checkoutId) {
          await adminClient.from('checkouts').update({ status: 'failed' }).eq('id', checkoutId);
          await adminClient.from('jobs').update({ payment_status: 'failed' }).eq('checkout_id', checkoutId);
        }
        console.log(`[stripe-webhook] payment_intent.payment_failed: pi=${eventObject?.id}`);
        break;
      }
      case 'charge.refunded': {
        const piId = eventObject?.payment_intent;
        if (piId) {
          await adminClient.from('checkouts').update({ status: 'refunded' }).eq('payment_intent_id', piId);
          await adminClient.from('jobs').update({ payment_status: 'refunded' }).eq('payment_intent_id', piId);
        }
        console.log(`[stripe-webhook] charge.refunded: pi=${piId || 'none'}`);
        break;
      }
      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }

    await adminClient.from('processed_webhook_events').insert({
      event_id: event.id, event_type: event.type, processed_at: new Date().toISOString(),
    });

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
