import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSupabaseSecretKey, getSupabasePublishableKey } from '../_shared/supabaseKeys.ts';

/**
 * create-tip-intent Edge Function
 *
 * Creates a Stripe PaymentIntent for a customer tip on a completed job.
 * Server-authoritative: validates job/customer/amount, creates PI with idempotency.
 *
 * POST body: { tip_id: string }
 * The tip_id comes from the request_tip_payment RPC which validates everything.
 */

Deno.serve(async (req) => {
  const jsonHeaders = { 'Content-Type': 'application/json' };

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

    // Get the caller's JWT from Authorization header
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');

    // Create client with user's JWT for auth context
    const userClient = createClient(supabaseUrl, getSupabasePublishableKey() || supabaseServiceRoleKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: jsonHeaders,
      });
    }

    const body = await req.json();
    const { tip_id } = body;

    if (!tip_id) {
      return new Response(JSON.stringify({ error: 'tip_id is required' }), {
        status: 400, headers: jsonHeaders,
      });
    }

    // Use admin client to read the tip record
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: tip, error: tipError } = await adminClient
      .from('job_tips')
      .select('*')
      .eq('id', tip_id)
      .single();

    if (tipError || !tip) {
      return new Response(JSON.stringify({ error: 'Tip not found' }), {
        status: 404, headers: jsonHeaders,
      });
    }

    // Verify the caller is the customer
    if (tip.customer_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 403, headers: jsonHeaders,
      });
    }

    // Already has a PaymentIntent — retrieve from Stripe for SCA continuation
    if (tip.payment_intent_id) {
      const existingPiRes = await fetch(
        `https://api.stripe.com/v1/payment_intents/${tip.payment_intent_id}`,
        { headers: { 'Authorization': `Bearer ${stripeSecretKey}` } }
      );
      if (existingPiRes.ok) {
        const existingPi = await existingPiRes.json();
        // Verify PI belongs to this tip
        if (existingPi.metadata?.tip_id !== tip.id) {
          return new Response(JSON.stringify({
            error: 'PaymentIntent identity mismatch',
          }), { status: 409, headers: jsonHeaders });
        }
        // Dead PI — clear and allow new creation below
        if (existingPi.status === 'canceled' || existingPi.status === 'requires_payment_method') {
          await adminClient
            .from('job_tips')
            .update({ payment_intent_id: null, stripe_status: 'pending' })
            .eq('id', tip_id);
          // Fall through to create a new PI
        } else {
          // Active PI — return client_secret for SCA or status for succeeded
          return new Response(JSON.stringify({
            client_secret: existingPi.client_secret || null,
            tip_id: tip.id,
            payment_intent_id: tip.payment_intent_id,
            status: existingPi.status,
            amount: tip.amount,
            already_created: true,
          }), { status: 200, headers: jsonHeaders });
        }
      }
      // Stripe lookup failed — fall through to create new PI
    }

    // Look up the customer's Stripe customer ID and payment method from the original checkout
    const { data: job } = await adminClient
      .from('jobs')
      .select('checkout_id')
      .eq('id', tip.job_id)
      .single();

    let stripeCustomerId: string | null = null;
    let paymentMethodId: string | null = null;

    if (job?.checkout_id) {
      const { data: checkout } = await adminClient
        .from('checkouts')
        .select('stripe_customer_id, payment_method_id')
        .eq('id', job.checkout_id)
        .single();
      stripeCustomerId = checkout?.stripe_customer_id || null;
      paymentMethodId = checkout?.payment_method_id || null;
    }

    // Create and auto-confirm Stripe PaymentIntent for the tip
    const amountCents = Math.round(tip.amount * 100);

    const params = new URLSearchParams();
    params.append('amount', amountCents.toString());
    params.append('currency', 'usd');
    params.append('metadata[tip_id]', tip.id);
    params.append('metadata[job_id]', tip.job_id);
    params.append('metadata[type]', 'tip');
    // Auto-confirm with the customer's saved payment method
    if (stripeCustomerId) params.append('customer', stripeCustomerId);
    if (paymentMethodId) {
      params.append('payment_method', paymentMethodId);
      params.append('confirm', 'true');
      // Customer is present during tipping — use return_url for SCA redirects
      params.append('return_url', `${supabaseUrl}/functions/v1/create-tip-intent`);
    }

    const stripeResponse = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': tip.idempotency_key,
      },
      body: params,
    });

    const pi = await stripeResponse.json();
    if (!stripeResponse.ok) {
      throw new Error(pi?.error?.message || 'Failed to create PaymentIntent');
    }

    // Store the PaymentIntent ID on the tip record
    await adminClient
      .from('job_tips')
      .update({ payment_intent_id: pi.id })
      .eq('id', tip_id);

    return new Response(JSON.stringify({
      client_secret: pi.client_secret,
      tip_id: tip.id,
      payment_intent_id: pi.id,
      amount: tip.amount,
    }), { status: 200, headers: jsonHeaders });

  } catch (error: any) {
    console.error('[create-tip-intent] Error:', error?.message);
    return new Response(
      JSON.stringify({ error: error?.message || 'Failed to create tip payment' }),
      { status: 500, headers: jsonHeaders }
    );
  }
});
