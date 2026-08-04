import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// --- Helpers ---

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

// --- Stripe signature verification ---

async function verifyStripeSignature(
  rawBody: string,
  sigHeader: string,
  webhookSecret: string
): Promise<{ valid: boolean; error?: string }> {
  // Parse stripe-signature header: t=timestamp,v1=signature[,v1=signature...]
  const parts = sigHeader.split(',');
  let timestamp = '';
  const signatures: string[] = [];

  for (const part of parts) {
    const [key, value] = part.split('=', 2);
    if (key === 't') {
      timestamp = value;
    } else if (key === 'v1') {
      signatures.push(value);
    }
  }

  if (!timestamp || signatures.length === 0) {
    return { valid: false, error: 'Missing timestamp or signature in header' };
  }

  // Reject timestamps older than 5 minutes (replay protection)
  const timestampSeconds = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestampSeconds) > 300) {
    return { valid: false, error: 'Webhook timestamp too old (possible replay attack)' };
  }

  // Compute expected signature: HMAC-SHA256 of "timestamp.rawBody"
  const signedPayload = `${timestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(webhookSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const expectedSignature = hexEncode(new Uint8Array(sig));

  // Check if any of the v1 signatures match
  const matched = signatures.some((s) => timingSafeEqual(expectedSignature, s));
  if (!matched) {
    return { valid: false, error: 'Signature mismatch' };
  }

  return { valid: true };
}

Deno.serve(async (req) => {
  // Only accept POST requests (webhooks from Stripe)
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey =
      Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing Supabase configuration.');
    }
    if (!stripeWebhookSecret) {
      throw new Error('Missing STRIPE_WEBHOOK_SECRET configuration.');
    }

    const sigHeader = req.headers.get('stripe-signature') || '';
    if (!sigHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing stripe-signature header' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const rawBody = await req.text();

    // --- Cryptographic signature verification ---
    const verification = await verifyStripeSignature(rawBody, sigHeader, stripeWebhookSecret);
    if (!verification.valid) {
      console.error('Stripe webhook signature verification failed:', verification.error);
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const event = JSON.parse(rawBody);

    // Use admin client (no user auth on webhook endpoints)
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // --- Idempotency: check if this event has already been processed ---
    const { data: existing } = await adminClient
      .from('processed_webhook_events')
      .select('event_id')
      .eq('event_id', event.id)
      .maybeSingle();

    if (existing) {
      console.log(`Stripe webhook event ${event.id} already processed, skipping.`);
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // --- Handle events ---
    const eventObject = event.data?.object;
    const checkoutId = eventObject?.metadata?.checkout_id;

    switch (event.type) {
      case 'payment_intent.succeeded': {
        if (checkoutId) {
          // Update checkout status to paid
          await adminClient
            .from('checkouts')
            .update({ status: 'paid' })
            .eq('id', checkoutId);

          // Update associated job if it exists
          await adminClient
            .from('jobs')
            .update({ payment_status: 'paid', paid_at: new Date().toISOString() })
            .eq('checkout_id', checkoutId);
        }

        console.log(
          `payment_intent.succeeded: pi=${eventObject.id}, checkout=${checkoutId || 'none'}`
        );
        break;
      }

      case 'payment_intent.payment_failed': {
        if (checkoutId) {
          // Update checkout status to failed
          await adminClient
            .from('checkouts')
            .update({ status: 'failed' })
            .eq('id', checkoutId);

          // Update associated job if it exists
          await adminClient
            .from('jobs')
            .update({ payment_status: 'failed' })
            .eq('checkout_id', checkoutId);
        }

        console.log(
          `payment_intent.payment_failed: pi=${eventObject.id}, checkout=${checkoutId || 'none'}`
        );
        break;
      }

      case 'charge.refunded': {
        // Find the associated payment intent and checkout
        const paymentIntentId = eventObject?.payment_intent;
        if (paymentIntentId) {
          // Find checkout by payment_intent_id
          const { data: checkout } = await adminClient
            .from('checkouts')
            .select('id')
            .eq('payment_intent_id', paymentIntentId)
            .maybeSingle();

          if (checkout) {
            await adminClient
              .from('checkouts')
              .update({ status: 'refunded' })
              .eq('id', checkout.id);

            await adminClient
              .from('jobs')
              .update({ payment_status: 'refunded' })
              .eq('checkout_id', checkout.id);
          }
        }

        console.log(
          `charge.refunded: charge=${eventObject.id}, pi=${eventObject?.payment_intent || 'none'}`
        );
        break;
      }

      default: {
        // Unhandled event type — acknowledge receipt but do nothing
        console.log(`Unhandled Stripe webhook event type: ${event.type}`);
        break;
      }
    }

    // --- Mark event as processed ---
    await adminClient.from('processed_webhook_events').insert({
      event_id: event.id,
      event_type: event.type,
      processed_at: new Date().toISOString(),
    });

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('stripe-webhook error:', error?.message);
    return new Response(
      JSON.stringify({ error: 'Webhook processing failed' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});
