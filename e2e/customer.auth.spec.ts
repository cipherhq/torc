/**
 * Customer auth E2E tests — real UI interactions via Playwright route
 * interception. Tests that token refresh preserves the mounted route
 * and form field values on /customer/personal-info.
 */
import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUPABASE_URL = 'https://test.supabase.co';

const TEST_USER = {
  id: 'user-e2e-1',
  email: 'e2e@example.com',
  aud: 'authenticated',
  role: 'authenticated',
  user_metadata: { first_name: 'Jane', last_name: 'Doe', role: 'customer' },
};

const TEST_SESSION = {
  access_token: 'fake-access-token',
  refresh_token: 'fake-refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: TEST_USER,
};

const TEST_PROFILE = {
  id: 'user-e2e-1',
  email: 'e2e@example.com',
  first_name: 'Jane',
  last_name: 'Doe',
  full_name: 'Jane Doe',
  phone: '+15551234567',
  role: 'customer',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Customer Auth — Token Refresh Preserves Route & Form', () => {
  test.beforeEach(async ({ page }) => {
    // Mock Supabase auth endpoints
    await page.route(`${SUPABASE_URL}/auth/v1/token*`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(TEST_SESSION),
      }),
    );

    await page.route(`${SUPABASE_URL}/auth/v1/user`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(TEST_USER),
      }),
    );

    // Mock Supabase REST queries
    await page.route(`${SUPABASE_URL}/rest/v1/**`, (route) => {
      const url = route.request().url();
      if (url.includes('profiles')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(TEST_PROFILE),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    // Abort realtime gracefully
    await page.route(`${SUPABASE_URL}/realtime/**`, (route) =>
      route.abort('connectionrefused'),
    );

    // Seed the Supabase session in localStorage BEFORE any page JS runs.
    // addInitScript runs before any script on every page load.
    await page.addInitScript((session) => {
      localStorage.setItem(
        'sb-test-auth-token',
        JSON.stringify({
          currentSession: session,
          expiresAt: session.expires_at,
        }),
      );
    }, TEST_SESSION);
  });

  test('navigate to /customer/personal-info, type into form fields, trigger token refresh — route stays mounted and values survive', async ({
    page,
  }) => {
    // Navigate to the personal-info form page (session pre-seeded in beforeEach)
    await page.goto('/customer/personal-info');
    await page.waitForLoadState('networkidle');

    // Find text inputs on the form page and type values
    const inputs = page.locator('input[type="text"], input[type="tel"], input[type="email"]');
    const inputCount = await inputs.count();

    // We need at least one input to test form preservation
    if (inputCount > 0) {
      const firstInput = inputs.first();
      await firstInput.fill('Unsaved E2E Value');

      // If there's a second input, fill it too
      if (inputCount > 1) {
        const secondInput = inputs.nth(1);
        await secondInput.fill('Second Unsaved Value');
      }
    }

    // Record current URL before refresh event
    const urlBefore = page.url();

    // Simulate a SIGNED_IN auth event (token refresh) via Supabase storage event
    await page.evaluate(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'sb-test-auth-token',
          newValue: JSON.stringify({
            access_token: 'refreshed-token',
            refresh_token: 'refreshed-refresh-token',
            expires_at: Math.floor(Date.now() / 1000) + 7200,
          }),
        }),
      );
    });

    // Wait for React to process the auth event
    await page.waitForTimeout(1000);

    // Verify route is still mounted — URL has not changed
    expect(page.url()).toBe(urlBefore);
    expect(page.url()).toContain('/customer/personal-info');

    // Verify form values survived the token refresh
    if (inputCount > 0) {
      const firstValue = await inputs.first().inputValue();
      expect(firstValue).toBe('Unsaved E2E Value');

      if (inputCount > 1) {
        const secondValue = await inputs.nth(1).inputValue();
        expect(secondValue).toBe('Second Unsaved Value');
      }
    }

    // Verify the page is not showing a loading/error screen
    const loadingScreen = page.locator('[data-testid="loading-screen"]');
    const loadingVisible = await loadingScreen.isVisible().catch(() => false);
    expect(loadingVisible).toBe(false);
  });
});
