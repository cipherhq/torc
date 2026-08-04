import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// --- CORS allowlist (configurable via ALLOWED_ORIGINS env var) ---
const DEFAULT_ORIGINS = [
  'https://torcapp.com',
  'https://www.torcapp.com',
  'https://provider.torcservices.com',
  'https://admin.torcservices.com',
  'https://customer.torcservices.com',
];
const envOrigins = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').filter(Boolean);
const ALLOWED_ORIGINS = envOrigins.length > 0 ? envOrigins : DEFAULT_ORIGINS;

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  const isAllowed =
    ALLOWED_ORIGINS.includes(origin) ||
    origin.startsWith('http://localhost:') ||
    origin.startsWith('http://127.0.0.1:') ||
    origin === 'capacitor://localhost' ||
    origin === 'capacitor://app.torcapp.com' ||
    origin === 'capacitor://app.torcpro.com' ||
    origin === 'https://app.torcapp.com' ||
    origin === 'https://app.torcpro.com' ||
    origin === 'http://localhost' ||
    origin === 'https://localhost';
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

const MAX_AMOUNT_CENTS = 1_000_000; // $10,000

async function stripeRequest(
  path: string,
  body: URLSearchParams,
  secretKey: string,
  options: { method?: string; idempotencyKey?: string } = {}
) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }

  const response = await fetch(`https://api.stripe.com${path}`, {
    method: options.method || 'POST',
    headers,
    body: options.method === 'GET' ? undefined : body,
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || 'Stripe request failed');
  }
  return payload;
}

async function stripeGet(path: string, secretKey: string) {
  const response = await fetch(`https://api.stripe.com${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${secretKey}`,
    },
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || 'Stripe GET request failed');
  }
  return payload;
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey =
      Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    const environment = Deno.env.get('ENVIRONMENT') || '';

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey || !stripeSecretKey) {
      throw new Error('Missing required configuration.');
    }

    // Reject test keys in production
    if (environment === 'production' && stripeSecretKey.startsWith('sk_test_')) {
      throw new Error('Test Stripe keys are not allowed in production.');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
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
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const {
      serviceId,
      vehicleId,
      isHazardous = false,
      scheduledFor,
      checkoutId,
      paymentMethodId,
      savePaymentMethod = false,
    } = await req.json();

    // --- Input validation ---
    if (!serviceId || typeof serviceId !== 'string') {
      return new Response(JSON.stringify({ error: 'serviceId is required' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    if (!checkoutId || typeof checkoutId !== 'string') {
      return new Response(JSON.stringify({ error: 'checkoutId is required' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    if (!paymentMethodId || typeof paymentMethodId !== 'string') {
      return new Response(JSON.stringify({ error: 'paymentMethodId is required' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    // --- Idempotency: check if this checkoutId has already been processed ---
    const { data: existingCheckout } = await supabaseAdmin
      .from('checkouts')
      .select('id, status, payment_intent_id, server_calculated_amount')
      .eq('id', checkoutId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingCheckout && existingCheckout.payment_intent_id) {
      // Already created a PaymentIntent for this checkout — return it
      return new Response(
        JSON.stringify({
          paymentIntentId: existingCheckout.payment_intent_id,
          checkoutId: existingCheckout.id,
          status: existingCheckout.status,
          amountCents: existingCheckout.server_calculated_amount,
        }),
        {
          status: 200,
          headers: { ...cors, 'Content-Type': 'application/json' },
        }
      );
    }

    // --- Server-authoritative pricing ---
    // 1. Look up service base price
    const { data: service, error: serviceError } = await supabaseAdmin
      .from('services')
      .select('id, name, base_price')
      .eq('id', serviceId)
      .eq('is_active', true)
      .single();

    if (serviceError || !service) {
      return new Response(JSON.stringify({ error: 'Service not found or inactive' }), {
        status: 404,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // 2. Load platform settings for pricing
    const { data: settingsRows } = await supabaseAdmin
      .from('platform_settings')
      .select('key, value')
      .in('key', ['tax_rate', 'hazard_fee', 'scheduling_fee', 'service_fee_pct']);

    const settings: Record<string, number> = {
      tax_rate: 8,
      hazard_fee: 15,
      scheduling_fee: 5,
      service_fee_pct: 10,
    };
    (settingsRows || []).forEach((row: { key: string; value: unknown }) => {
      const n = Number(row.value);
      if (Number.isFinite(n)) {
        settings[row.key] = n;
      }
    });

    // 3. Calculate authoritative total
    const basePriceDollars = Number(service.base_price) || 0;
    const hazardFeeDollars = isHazardous ? settings.hazard_fee : 0;
    const schedulingFeeDollars = scheduledFor ? settings.scheduling_fee : 0;

    const subtotalDollars = basePriceDollars + hazardFeeDollars + schedulingFeeDollars;
    const serviceFeeDollars = subtotalDollars * (settings.service_fee_pct / 100);
    const pretaxDollars = subtotalDollars + serviceFeeDollars;
    const taxDollars = pretaxDollars * (settings.tax_rate / 100);
    const totalDollars = pretaxDollars + taxDollars;

    // Convert to cents (Stripe uses integer cents)
    const totalCents = Math.round(totalDollars * 100);

    if (totalCents <= 0) {
      return new Response(JSON.stringify({ error: 'Calculated amount must be greater than zero' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    if (totalCents > MAX_AMOUNT_CENTS) {
      return new Response(
        JSON.stringify({ error: `Amount exceeds maximum of $${MAX_AMOUNT_CENTS / 100}` }),
        {
          status: 400,
          headers: { ...cors, 'Content-Type': 'application/json' },
        }
      );
    }

    // --- Create checkout record before payment ---
    if (!existingCheckout) {
      const { error: insertError } = await supabaseAdmin.from('checkouts').insert({
        id: checkoutId,
        user_id: user.id,
        service_id: serviceId,
        vehicle_id: vehicleId || null,
        status: 'pending',
        server_calculated_amount: totalCents,
        payment_intent_id: null,
        created_at: new Date().toISOString(),
      });

      if (insertError) {
        // If conflict on id, the checkout was created by a concurrent request
        if (!String(insertError.message).includes('duplicate') &&
            !String(insertError.code).includes('23505')) {
          throw new Error('Failed to create checkout record.');
        }
      }
    }

    // --- Resolve or create Stripe customer ---
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
        throw new Error('Failed to persist Stripe customer mapping.');
      }
    }

    // --- Validate payment method ownership ---
    const paymentMethod = await stripeGet(
      `/v1/payment_methods/${paymentMethodId}`,
      stripeSecretKey
    );

    if (paymentMethod.customer && paymentMethod.customer !== stripeCustomerId) {
      return new Response(
        JSON.stringify({ error: 'Payment method does not belong to this customer' }),
        {
          status: 403,
          headers: { ...cors, 'Content-Type': 'application/json' },
        }
      );
    }

    // Attach payment method to customer if not yet attached
    if (!paymentMethod.customer) {
      const attachBody = new URLSearchParams();
      attachBody.append('customer', stripeCustomerId!);
      const attachResult = await stripeRequest(
        `/v1/payment_methods/${paymentMethodId}/attach`,
        attachBody,
        stripeSecretKey
      );
      if (!attachResult.id) {
        return new Response(
          JSON.stringify({ error: 'Failed to attach payment method' }),
          {
            status: 400,
            headers: { ...cors, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // --- Create PaymentIntent with idempotency ---
    const intentBody = new URLSearchParams();
    intentBody.append('amount', String(totalCents));
    intentBody.append('currency', 'usd');
    intentBody.append('customer', stripeCustomerId!);
    intentBody.append('payment_method', paymentMethodId);
    intentBody.append('payment_method_types[]', 'card');
    intentBody.append('confirm', 'true');
    intentBody.append('off_session', 'false');
    if (savePaymentMethod) {
      intentBody.append('setup_future_usage', 'off_session');
    }
    // Only controlled metadata — no arbitrary client metadata
    intentBody.append('metadata[supabase_user_id]', user.id);
    intentBody.append('metadata[checkout_id]', checkoutId);

    const paymentIntent = await stripeRequest(
      '/v1/payment_intents',
      intentBody,
      stripeSecretKey,
      { idempotencyKey: checkoutId }
    );

    // --- Update checkout record with payment_intent_id ---
    await supabaseAdmin
      .from('checkouts')
      .update({ payment_intent_id: paymentIntent.id })
      .eq('id', checkoutId);

    return new Response(
      JSON.stringify({
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        customerId: stripeCustomerId,
        status: paymentIntent.status,
        checkoutId,
        priceBreakdown: {
          basePriceCents: Math.round(basePriceDollars * 100),
          hazardFeeCents: Math.round(hazardFeeDollars * 100),
          schedulingFeeCents: Math.round(schedulingFeeDollars * 100),
          serviceFeeCents: Math.round(serviceFeeDollars * 100),
          taxCents: Math.round(taxDollars * 100),
          totalCents,
        },
      }),
      {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('create-payment-intent error:', error?.message);
    return new Response(
      JSON.stringify({ error: error?.message || 'Failed to create payment intent. Please try again.' }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      }
    );
  }
});
