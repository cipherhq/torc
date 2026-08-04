/**
 * Provider redirect safety E2E tests — verifies that active-job polling
 * does NOT redirect the provider away from data entry forms.
 * Navigates to /personal-information, waits through a full polling cycle,
 * and confirms the form is still visible and the URL has not changed.
 */
import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUPABASE_URL = 'https://test.supabase.co';

const TEST_USER = {
  id: 'provider-e2e-1',
  email: 'provider@example.com',
  aud: 'authenticated',
  role: 'authenticated',
  user_metadata: { first_name: 'Mike', last_name: 'Smith', role: 'provider' },
};

const TEST_SESSION = {
  access_token: 'fake-provider-token',
  refresh_token: 'fake-provider-refresh',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: TEST_USER,
};

const TEST_PROFILE = {
  id: 'provider-e2e-1',
  email: 'provider@example.com',
  first_name: 'Mike',
  last_name: 'Smith',
  full_name: 'Mike Smith',
  phone: '+15559876543',
  role: 'provider',
};

const PROVIDER_PROFILE = {
  id: 'provider-e2e-1',
  is_verified: true,
  created_at: new Date().toISOString(),
};

const ACTIVE_JOB = {
  id: 'job-active-e2e-1',
  status: 'in_progress',
  provider_id: 'provider-e2e-1',
  service_id: 'svc-tow',
  created_at: new Date().toISOString(),
  services: { name: 'Tow Service' },
  customers: { first_name: 'Jane' },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Provider Redirect Safety — Active Job Polling', () => {
  test.beforeEach(async ({ page }) => {
    // Auth mocks
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

    // REST mocks
    await page.route(`${SUPABASE_URL}/rest/v1/**`, (route) => {
      const url = route.request().url();
      if (url.includes('profiles')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(TEST_PROFILE),
        });
      }
      if (url.includes('provider_profiles')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(PROVIDER_PROFILE),
        });
      }
      if (url.includes('jobs')) {
        // Always return an active job to simulate polling finding one
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(ACTIVE_JOB),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    // Realtime
    await page.route(`${SUPABASE_URL}/realtime/**`, (route) =>
      route.abort('connectionrefused'),
    );

    // Seed the Supabase session in localStorage before navigation
    await page.goto('about:blank');
    await page.evaluate((session) => {
      localStorage.setItem(
        'sb-test-auth-token',
        JSON.stringify({
          currentSession: session,
          expiresAt: session.expires_at,
        }),
      );
    }, TEST_SESSION);
  });

  test('provider on /personal-information is NOT redirected after active-job polling cycle (10s wait)', async ({
    page,
  }) => {
    // Navigate to a data entry form page (session pre-seeded)
    await page.goto('/personal-information');
    await page.waitForLoadState('networkidle');

    // Record the URL immediately after load
    const urlAfterLoad = page.url();
    expect(urlAfterLoad).toContain('/personal-information');

    // Wait 10 seconds — active job polling interval is ~8s, so this covers
    // at least one full polling cycle
    await page.waitForTimeout(10000);

    // Verify URL has NOT changed — the provider was not redirected
    const urlAfterPolling = page.url();
    expect(urlAfterPolling).toContain('/personal-information');
    expect(urlAfterPolling).not.toContain('/job/');

    // Verify the form is still visible on the page
    const formElements = page.locator('input, textarea, select, form');
    const formCount = await formElements.count();
    expect(formCount).toBeGreaterThan(0);
  });
});
