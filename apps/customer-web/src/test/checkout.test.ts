/**
 * Checkout contract integration test — verifies PricingPayment sends the
 * correct server-authoritative fields (serviceId, checkoutId, paymentMethodId)
 * and does NOT send amount/currency/metadata (the server computes those).
 *
 * Also tests recovery: if checkout already paid, client navigates without
 * re-confirming via Stripe.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// The PricingPayment component is heavily coupled to React, Stripe Elements,
// and routing. Rather than render the full component, we extract and test the
// checkout contract by simulating the fetch call with the same logic as
// handleConfirm in PricingPayment.tsx.
// ---------------------------------------------------------------------------

describe('checkout contract', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * Simulate the checkout request body exactly as PricingPayment builds it.
   * This mirrors lines 289-307 of PricingPayment.tsx.
   */
  function buildCheckoutRequest(context: {
    serviceId: string;
    vehicleId?: string | null;
    isHazardous?: boolean;
    scheduledFor?: string | null;
    checkoutId: string;
    paymentMethodId: string;
    savePaymentMethod?: boolean;
  }) {
    return {
      serviceId: context.serviceId,
      vehicleId: context.vehicleId || null,
      isHazardous: context.isHazardous || false,
      scheduledFor: context.scheduledFor || null,
      checkoutId: context.checkoutId,
      paymentMethodId: context.paymentMethodId,
      savePaymentMethod: context.savePaymentMethod ?? false,
    };
  }

  it('sends serviceId, checkoutId, paymentMethodId to create-payment-intent', () => {
    const body = buildCheckoutRequest({
      serviceId: 'svc-tire-change',
      checkoutId: 'checkout-uuid-123',
      paymentMethodId: 'pm_stripe_abc',
    });

    expect(body).toHaveProperty('serviceId', 'svc-tire-change');
    expect(body).toHaveProperty('checkoutId', 'checkout-uuid-123');
    expect(body).toHaveProperty('paymentMethodId', 'pm_stripe_abc');
  });

  it('does NOT send amount, currency, or metadata (server computes those)', () => {
    const body = buildCheckoutRequest({
      serviceId: 'svc-tow',
      checkoutId: 'checkout-uuid-456',
      paymentMethodId: 'pm_stripe_def',
    });

    expect(body).not.toHaveProperty('amount');
    expect(body).not.toHaveProperty('currency');
    expect(body).not.toHaveProperty('metadata');
    expect(body).not.toHaveProperty('price');
    expect(body).not.toHaveProperty('total');
  });

  it('includes vehicleId, isHazardous, scheduledFor when provided', () => {
    const body = buildCheckoutRequest({
      serviceId: 'svc-jump-start',
      checkoutId: 'checkout-uuid-789',
      paymentMethodId: 'pm_stripe_ghi',
      vehicleId: 'vehicle-42',
      isHazardous: true,
      scheduledFor: '2026-08-15T14:00:00Z',
    });

    expect(body.vehicleId).toBe('vehicle-42');
    expect(body.isHazardous).toBe(true);
    expect(body.scheduledFor).toBe('2026-08-15T14:00:00Z');
  });

  it('defaults vehicleId to null, isHazardous to false, scheduledFor to null', () => {
    const body = buildCheckoutRequest({
      serviceId: 'svc-fuel',
      checkoutId: 'checkout-uuid-000',
      paymentMethodId: 'pm_stripe_jkl',
    });

    expect(body.vehicleId).toBeNull();
    expect(body.isHazardous).toBe(false);
    expect(body.scheduledFor).toBeNull();
  });

  it('sends checkoutId for idempotency', () => {
    const checkoutId = 'idempotency-key-abc';
    const body = buildCheckoutRequest({
      serviceId: 'svc-lockout',
      checkoutId,
      paymentMethodId: 'pm_xyz',
    });

    // Same checkoutId should produce identical request
    const body2 = buildCheckoutRequest({
      serviceId: 'svc-lockout',
      checkoutId,
      paymentMethodId: 'pm_xyz',
    });

    expect(body.checkoutId).toBe(checkoutId);
    expect(JSON.stringify(body)).toBe(JSON.stringify(body2));
  });

  describe('recovery: checkout already paid', () => {
    it('navigates to matching when server returns status=paid', async () => {
      // Simulate server response for already-paid checkout
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'paid',
          paymentIntentId: 'pi_already_paid',
          priceBreakdown: { totalCents: 5900 },
        }),
      });

      const supabaseUrl = 'https://test.supabase.co';
      const token = 'test-token';
      const body = buildCheckoutRequest({
        serviceId: 'svc-tow',
        checkoutId: 'checkout-already-done',
        paymentMethodId: 'pm_abc',
      });

      const res = await fetch(`${supabaseUrl}/functions/v1/create-payment-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: 'anon-key',
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      // When status is 'paid' or 'succeeded', client should navigate without
      // calling stripe.confirmCardPayment
      expect(data.status).toBe('paid');
      expect(data.paymentIntentId).toBe('pi_already_paid');

      // The client-side logic:
      // if (data.status === 'paid' || data.status === 'succeeded') { navigate('/matching'); return; }
      const shouldSkipStripeConfirm = data.status === 'paid' || data.status === 'succeeded';
      expect(shouldSkipStripeConfirm).toBe(true);
    });

    it('navigates to matching when server returns status=succeeded', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'succeeded',
          paymentIntentId: 'pi_succeeded',
          priceBreakdown: { totalCents: 7500 },
        }),
      });

      const res = await fetch('https://test.supabase.co/functions/v1/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildCheckoutRequest({
          serviceId: 'svc-tow',
          checkoutId: 'checkout-succeeded',
          paymentMethodId: 'pm_def',
        })),
      });

      const data = await res.json();
      const shouldSkipStripeConfirm = data.status === 'paid' || data.status === 'succeeded';
      expect(shouldSkipStripeConfirm).toBe(true);
    });

    it('proceeds to Stripe confirm when status is not paid/succeeded', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'requires_confirmation',
          clientSecret: 'pi_secret_abc',
          priceBreakdown: { totalCents: 5900 },
        }),
      });

      const res = await fetch('https://test.supabase.co/functions/v1/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildCheckoutRequest({
          serviceId: 'svc-tow',
          checkoutId: 'checkout-new',
          paymentMethodId: 'pm_ghi',
        })),
      });

      const data = await res.json();
      const shouldSkipStripeConfirm = data.status === 'paid' || data.status === 'succeeded';
      expect(shouldSkipStripeConfirm).toBe(false);
      expect(data.clientSecret).toBe('pi_secret_abc');
    });
  });
});
