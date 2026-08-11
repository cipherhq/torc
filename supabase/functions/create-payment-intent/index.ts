import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSupabaseSecretKey, getSupabasePublishableKey } from '../_shared/supabaseKeys.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_AMOUNT_CENTS = 1_000_000; // $10,000

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
    throw new Error(payload?.error?.message || 'Stripe request failed');
  }
  return payload;
}

async function stripeGet(path: string, secretKey: string) {
  const response = await fetch(`https://api.stripe.com${path}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || 'Stripe GET request failed');
  }
  return payload;
}

/** Compare two values that may be date strings or null */
function scheduledForMatches(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  // Compare as ISO strings (trim to second precision to avoid ms drift)
  return new Date(a).toISOString() === new Date(b).toISOString();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = getSupabasePublishableKey();
    const supabaseServiceRoleKey = getSupabaseSecretKey();
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
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseUserClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const {
      serviceId,
      vehicleId,
      isHazardous = false,
      scheduledFor,
      checkoutId,
      paymentMethodId,
      savePaymentMethod = false,
      // Booking snapshot fields — stored on checkout for webhook-driven job creation
      pickupLocation,
      pickupAddress,
      destinationLocation,
      destinationAddress,
      requesterType,
      requesterName,
      requesterPhone,
      customerNotes,
    } = body;

    // --- Input validation ---
    if (!serviceId || typeof serviceId !== 'string') {
      return new Response(JSON.stringify({ error: 'serviceId is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!checkoutId || typeof checkoutId !== 'string') {
      return new Response(JSON.stringify({ error: 'checkoutId is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!paymentMethodId || typeof paymentMethodId !== 'string') {
      return new Response(JSON.stringify({ error: 'paymentMethodId is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    // --- Server-authoritative pricing (computed early for validation) ---
    const { data: service, error: serviceError } = await supabaseAdmin
      .from('services')
      .select('id, name, base_price')
      .eq('id', serviceId)
      .maybeSingle();

    if (serviceError || !service) {
      return new Response(JSON.stringify({ error: 'Service not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load platform settings
    const { data: settingsRows } = await supabaseAdmin
      .from('platform_settings')
      .select('key, value');

    const settings: Record<string, number> = {
      tax_rate_pct: 8, hazard_fee: 15, scheduling_fee: 5, service_fee_pct: 10,
    };
    (settingsRows || []).forEach((row: { key: string; value: unknown }) => {
      const n = Number(row.value);
      if (Number.isFinite(n) && row.key in settings) settings[row.key] = n;
    });

    const basePriceDollars = Number(service.base_price) || 0;
    const hazardFeeDollars = isHazardous ? settings.hazard_fee : 0;
    const schedulingFeeDollars = scheduledFor ? settings.scheduling_fee : 0;
    const subtotalDollars = basePriceDollars + hazardFeeDollars + schedulingFeeDollars;
    const taxDollars = subtotalDollars * (settings.tax_rate_pct / 100);
    const totalDollars = subtotalDollars + taxDollars;
    const totalCents = Math.round(totalDollars * 100);

    if (totalCents <= 0) {
      return new Response(JSON.stringify({ error: 'Calculated amount must be greater than zero' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (totalCents > MAX_AMOUNT_CENTS) {
      return new Response(JSON.stringify({ error: `Amount exceeds maximum of $${MAX_AMOUNT_CENTS / 100}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- Idempotency: check existing checkout ---
    const { data: existingCheckout } = await supabaseAdmin
      .from('checkouts')
      .select('id, status, payment_intent_id, total_amount, service_id, vehicle_id, is_hazardous, scheduled_for, currency, user_id, attempt_number')
      .eq('id', checkoutId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingCheckout) {
      // --- Item 6: Full checkout validation ---
      if (existingCheckout.service_id !== serviceId) {
        return new Response(JSON.stringify({ error: 'Checkout service mismatch. Start a new checkout.' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if ((existingCheckout.vehicle_id || null) !== (vehicleId || null)) {
        return new Response(JSON.stringify({ error: 'Checkout vehicle mismatch. Start a new checkout.' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (Boolean(existingCheckout.is_hazardous) !== Boolean(isHazardous)) {
        return new Response(JSON.stringify({ error: 'Checkout hazardous flag mismatch. Start a new checkout.' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!scheduledForMatches(existingCheckout.scheduled_for, scheduledFor || null)) {
        return new Response(JSON.stringify({ error: 'Checkout scheduled time mismatch. Start a new checkout.' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (existingCheckout.currency && existingCheckout.currency !== 'USD') {
        return new Response(JSON.stringify({ error: 'Only USD currency is supported.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (existingCheckout.user_id !== user.id) {
        // Already filtered by .eq('user_id', user.id), but be explicit
        return new Response(JSON.stringify({ error: 'Checkout does not belong to this user.' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // Validate total_amount matches server-recalculated amount
      const existingTotalCents = Math.round(Number(existingCheckout.total_amount) * 100);
      if (existingTotalCents !== totalCents) {
        return new Response(JSON.stringify({ error: 'Checkout amount mismatch with current pricing. Start a new checkout.' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // If already paid (set by webhook), return success
      if (existingCheckout.status === 'paid') {
        return new Response(JSON.stringify({
          paymentIntentId: existingCheckout.payment_intent_id,
          checkoutId: existingCheckout.id,
          status: 'paid',
          priceBreakdown: { totalCents },
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // --- Item 7: Explicit PI retrieval with safe recovery ---
      if (existingCheckout.payment_intent_id) {
        let pi;
        try {
          pi = await stripeGet(`/v1/payment_intents/${existingCheckout.payment_intent_id}`, stripeSecretKey);
        } catch (retrievalError: any) {
          // Item 7: Retrieval failed — return error, do NOT fall through
          console.error('PaymentIntent retrieval failed:', retrievalError?.message);
          return new Response(JSON.stringify({
            error: 'Unable to retrieve existing payment. Please try again or start a new checkout.',
          }), {
            status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // PI retrieved successfully — handle by status
        if (pi.status === 'succeeded') {
          // Item 4: Do NOT mark as paid — webhook is the authority
          return new Response(JSON.stringify({
            paymentIntentId: pi.id,
            checkoutId: existingCheckout.id,
            status: pi.status,
            priceBreakdown: { totalCents },
          }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if (pi.status === 'requires_action' || pi.status === 'requires_confirmation' || pi.status === 'processing') {
          // Still in progress — return clientSecret for frontend to continue
          return new Response(JSON.stringify({
            paymentIntentId: pi.id,
            clientSecret: pi.client_secret,
            checkoutId: existingCheckout.id,
            status: pi.status,
            priceBreakdown: { totalCents },
          }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if (pi.status === 'canceled' || pi.status === 'requires_payment_method') {
          // Item 5: Cancelled/failed PI — increment attempt_number for new idempotency key
          const newAttempt = (existingCheckout.attempt_number || 1) + 1;
          await supabaseAdmin.from('checkouts').update({
            status: 'pending',
            payment_intent_id: null,
            attempt_number: newAttempt,
          }).eq('id', checkoutId);
          // Fall through to create new PaymentIntent with updated attempt_number
          existingCheckout.attempt_number = newAttempt;
        } else {
          // Unknown PI status — return error, don't fall through
          return new Response(JSON.stringify({
            error: `Payment is in an unexpected state (${pi.status}). Please contact support.`,
          }), {
            status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // If status is 'failed' with no PI (e.g. cleared above or webhook set failed)
      if (existingCheckout.status === 'failed' && !existingCheckout.payment_intent_id) {
        const newAttempt = (existingCheckout.attempt_number || 1) + 1;
        await supabaseAdmin.from('checkouts').update({
          status: 'pending',
          payment_intent_id: null,
          attempt_number: newAttempt,
        }).eq('id', checkoutId);
        existingCheckout.attempt_number = newAttempt;
      }
    }

    // --- Create/update checkout record BEFORE payment ---
    if (!existingCheckout) {
      // Build booking snapshot with trusted client-provided booking details.
      // These are stored on the checkout so the webhook can create the job
      // from verified data without relying on client state.
      const bookingSnapshot: Record<string, unknown> = {};
      if (pickupLocation) bookingSnapshot.pickupLocation = pickupLocation;
      if (pickupAddress) bookingSnapshot.pickupAddress = pickupAddress;
      if (destinationLocation) bookingSnapshot.destinationLocation = destinationLocation;
      if (destinationAddress) bookingSnapshot.destinationAddress = destinationAddress;
      if (requesterType) bookingSnapshot.requesterType = requesterType;
      if (requesterName) bookingSnapshot.requesterName = requesterName;
      if (requesterPhone) bookingSnapshot.requesterPhone = requesterPhone;
      if (customerNotes) bookingSnapshot.customerNotes = customerNotes;
      if (scheduledFor) bookingSnapshot.scheduledFor = scheduledFor;

      const { error: insertError } = await supabaseAdmin.from('checkouts').insert({
        id: checkoutId,
        user_id: user.id,
        service_id: serviceId,
        vehicle_id: vehicleId || null,
        is_hazardous: isHazardous,
        scheduled_for: scheduledFor || null,
        base_price: basePriceDollars,
        hazard_fee: hazardFeeDollars,
        scheduling_fee: schedulingFeeDollars,
        tax: taxDollars,
        total_amount: totalDollars,
        currency: 'USD',
        status: 'pending',
        attempt_number: 1,
        booking_snapshot: Object.keys(bookingSnapshot).length > 0 ? bookingSnapshot : null,
      });
      if (insertError && !String(insertError.code).includes('23505')) {
        throw new Error('Failed to create checkout record.');
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
      await supabaseAdmin.from('stripe_customers').upsert({
        user_id: user.id,
        stripe_customer_id: stripeCustomerId,
      });
    }

    // --- Validate payment method ownership ---
    const paymentMethod = await stripeGet(`/v1/payment_methods/${paymentMethodId}`, stripeSecretKey);
    if (paymentMethod.customer && paymentMethod.customer !== stripeCustomerId) {
      return new Response(JSON.stringify({ error: 'Payment method does not belong to this customer' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Attach if not yet attached
    if (!paymentMethod.customer) {
      const attachBody = new URLSearchParams();
      attachBody.append('customer', stripeCustomerId!);
      await stripeRequest(`/v1/payment_methods/${paymentMethodId}/attach`, attachBody, stripeSecretKey);
    }

    // --- Item 4/5: Claim payment attempt via atomic RPC for idempotency ---
    const attemptNumber = existingCheckout?.attempt_number || 1;
    const { data: idempotencyKey, error: attemptError } = await supabaseAdmin.rpc('claim_payment_attempt', {
      p_checkout_id: checkoutId,
      p_attempt_number: attemptNumber,
    });
    if (attemptError) throw new Error('Failed to claim payment attempt: ' + attemptError.message);

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
    intentBody.append('metadata[supabase_user_id]', user.id);
    intentBody.append('metadata[checkout_id]', checkoutId);

    const paymentIntent = await stripeRequest(
      '/v1/payment_intents', intentBody, stripeSecretKey,
      { idempotencyKey }
    );

    // Update payment_attempts record with the PI ID and status
    await supabaseAdmin.from('payment_attempts').update({
      payment_intent_id: paymentIntent.id,
      status: paymentIntent.status === 'succeeded' ? 'succeeded' : 'processing',
    }).eq('stripe_idempotency_key', idempotencyKey);

    // --- Item 4: Always set status to payment_processing, never 'paid' ---
    // The verified Stripe webhook is the sole authority for marking payments as paid.
    await supabaseAdmin.from('checkouts').update({
      payment_intent_id: paymentIntent.id,
      payment_method_id: paymentMethodId,
      stripe_customer_id: stripeCustomerId,
      status: 'payment_processing',
    }).eq('id', checkoutId);

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
          taxCents: Math.round(taxDollars * 100),
          totalCents,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('create-payment-intent error:', error?.message);
    return new Response(
      JSON.stringify({ error: error?.message || 'Failed to create payment intent. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
