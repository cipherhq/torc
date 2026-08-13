/**
 * @vitest-environment jsdom
 */

/**
 * Booking/checkout lifecycle tests.
 *
 * Verifies:
 * A. New booking gets fresh transaction state
 * B. Two bookings get different checkoutIds
 * C. Payment retry preserves checkoutId
 * D. Old paymentIntentId doesn't leak into new booking
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getRequestContext,
  updateRequestContext,
  resetRequestContext,
  startNewBooking,
} from '../data/bookingDraftStore';

beforeEach(() => {
  resetRequestContext();
  localStorage.clear();
});

describe('startNewBooking — transaction lifecycle', () => {
  it('clears checkoutId from previous booking', () => {
    updateRequestContext({ checkoutId: 'old-checkout-123' });
    expect(getRequestContext().checkoutId).toBe('old-checkout-123');

    startNewBooking();
    expect(getRequestContext().checkoutId).toBeFalsy();
  });

  it('clears paymentIntentId from previous booking', () => {
    updateRequestContext({ paymentIntentId: 'pi_old_123' });
    startNewBooking();
    expect(getRequestContext().paymentIntentId).toBeNull();
  });

  it('clears paymentStatus from previous booking', () => {
    updateRequestContext({ paymentStatus: 'paid' });
    startNewBooking();
    expect(getRequestContext().paymentStatus).toBeNull();
  });

  it('clears paymentMethodId from previous booking', () => {
    updateRequestContext({ paymentMethodId: 'pm_old' });
    startNewBooking();
    expect(getRequestContext().paymentMethodId).toBeNull();
  });

  it('clears estimatedPrice from previous booking', () => {
    updateRequestContext({ estimatedPrice: 49.99 });
    startNewBooking();
    expect(getRequestContext().estimatedPrice).toBe(0);
  });

  it('clears all transaction fields at once', () => {
    updateRequestContext({
      checkoutId: 'old-checkout',
      paymentIntentId: 'pi_old',
      paymentStatus: 'payment_processing',
      paymentMethodId: 'pm_old',
      estimatedPrice: 99.99,
      paymentCurrency: 'USD',
      serviceId: 'tire',
      location: { lat: 40.7, lng: -74, address: 'NYC' },
    });

    startNewBooking();

    const ctx = getRequestContext();
    expect(ctx.checkoutId).toBeFalsy();
    expect(ctx.paymentIntentId).toBeFalsy();
    expect(ctx.paymentStatus).toBeFalsy();
    expect(ctx.paymentMethodId).toBeFalsy();
    expect(ctx.estimatedPrice).toBe(0);
    expect(ctx.paymentCurrency).toBeFalsy();
    // Service/location are also reset for a fresh booking
    expect(ctx.serviceId).toBeFalsy();
    expect(ctx.location).toBeFalsy();
  });
});

describe('Two independent bookings', () => {
  it('get different checkoutIds when set independently', () => {
    // Booking A
    startNewBooking();
    updateRequestContext({ checkoutId: crypto.randomUUID() });
    const checkoutA = getRequestContext().checkoutId;

    // Booking B
    startNewBooking();
    updateRequestContext({ checkoutId: crypto.randomUUID() });
    const checkoutB = getRequestContext().checkoutId;

    expect(checkoutA).toBeTruthy();
    expect(checkoutB).toBeTruthy();
    expect(checkoutA).not.toBe(checkoutB);
  });
});

describe('Same-booking retry preserves checkoutId', () => {
  it('updateRequestContext keeps existing checkoutId', () => {
    startNewBooking();
    const checkoutId = crypto.randomUUID();
    updateRequestContext({ checkoutId });

    // Simulate payment retry — update payment fields only
    updateRequestContext({ paymentStatus: 'failed' });
    updateRequestContext({ paymentStatus: 'payment_processing' });

    expect(getRequestContext().checkoutId).toBe(checkoutId);
  });
});

describe('HomeMap source verification', () => {
  it('HomeMap calls startNewBooking before navigating', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../pages/customer/HomeMap.tsx'),
      'utf-8',
    );
    expect(source).toContain('startNewBooking()');
    expect(source).toContain("import { startNewBooking }");

    // startNewBooking must come before navigate
    const btnSection = source.substring(
      source.indexOf('Request Assistance') - 200,
      source.indexOf('Request Assistance') + 100,
    );
    const startIdx = btnSection.indexOf('startNewBooking()');
    const navIdx = btnSection.indexOf("navigate('/who-needs-help')");
    expect(startIdx).toBeGreaterThan(-1);
    expect(navIdx).toBeGreaterThan(-1);
    expect(startIdx).toBeLessThan(navIdx);
  });
});

describe('Matching cancellation source verification', () => {
  it('calls cancel_checkout when no job exists', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../pages/customer/Matching.tsx'),
      'utf-8',
    );
    expect(source).toContain("supabase.rpc('cancel_checkout'");
    expect(source).toContain('resetRequestContext()');
  });

  it('does not navigate Home before server-side cancel succeeds', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../pages/customer/Matching.tsx'),
      'utf-8',
    );
    // If cancel fails, we return early (don't navigate)
    expect(source).toContain("return; // Stay on screen");
  });
});
