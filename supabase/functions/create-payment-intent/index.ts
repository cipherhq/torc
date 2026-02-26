import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function stripeRequest(path: string, body: URLSearchParams, secretKey: string) {
  const response = await fetch(`https://api.stripe.com${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || 'Stripe request failed');
  }
  return payload;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey =
      Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey || !stripeSecretKey) {
      throw new Error('Missing required secrets for payment function (STRIPE_SECRET_KEY, SERVICE_ROLE_KEY).');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabaseUserClient.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized', detail: authError?.message || 'No user returned' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const {
      amount,
      currency = 'usd',
      paymentMethodId,
      savePaymentMethod = true,
      metadata = {},
    } = await req.json();

    const normalizedAmount = Number(amount);
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      return new Response(JSON.stringify({ error: 'Invalid amount' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!paymentMethodId || typeof paymentMethodId !== 'string') {
      return new Response(JSON.stringify({ error: 'paymentMethodId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Resolve or create Stripe customer for this user
    const { data: existingCustomer } = await supabaseAdmin
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    let stripeCustomerId = existingCustomer?.stripe_customer_id || null;
    if (!stripeCustomerId) {
      const customerBody = new URLSearchParams();
      customerBody.append('email', user.email || '');
      customerBody.append('metadata[supabase_user_id]', user.id);
      const customer = await stripeRequest('/v1/customers', customerBody, stripeSecretKey);
      stripeCustomerId = customer.id;

      const { error: upsertError } = await supabaseAdmin.from('stripe_customers').upsert({
        user_id: user.id,
        stripe_customer_id: stripeCustomerId,
      });
      if (upsertError) {
        throw new Error(`Failed to persist Stripe customer mapping: ${upsertError.message}`);
      }
    }

    // Attach payment method to customer (idempotent - ignores if already attached)
    try {
      const attachBody = new URLSearchParams();
      attachBody.append('customer', stripeCustomerId);
      await stripeRequest(`/v1/payment_methods/${paymentMethodId}/attach`, attachBody, stripeSecretKey);
    } catch {
      // Already attached or other non-critical error — continue
    }

    const intentBody = new URLSearchParams();
    intentBody.append('amount', String(Math.round(normalizedAmount * 100)));
    intentBody.append('currency', String(currency).toLowerCase());
    intentBody.append('customer', stripeCustomerId);
    intentBody.append('payment_method', paymentMethodId);
    intentBody.append('payment_method_types[]', 'card');
    if (savePaymentMethod) {
      intentBody.append('setup_future_usage', 'off_session');
    }
    intentBody.append('metadata[supabase_user_id]', user.id);
    Object.entries(metadata || {}).forEach(([key, value]) => {
      intentBody.append(`metadata[${key}]`, String(value));
    });

    const paymentIntent = await stripeRequest('/v1/payment_intents', intentBody, stripeSecretKey);

    return new Response(
      JSON.stringify({
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        customerId: stripeCustomerId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message || 'Failed to create payment intent' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

