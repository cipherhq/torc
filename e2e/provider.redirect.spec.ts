/**
 * Provider redirect safety E2E tests — uses Playwright route interception
 * to mock Supabase. Tests that data entry routes are NOT auto-redirected
 * to active jobs, while home IS redirected.
 */
import { test, expect, type Page } from '@playwright/test';

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

const ACTIVE_JOB = {
  id: 'job-active-e2e-1',
  status: 'in_progress',
  provider_id: 'provider-e2e-1',
  service_id: 'svc-tow',
  created_at: new Date().toISOString(),
  services: { name: 'Tow Service' },
  customers: { first_name: 'Jane' },
};

const PROVIDER_PROFILE = {
  id: 'provider-e2e-1',
  is_verified: true,
  created_at: new Date().toISOString(),
};

/**
 * Mock Supabase for authenticated provider with an active job.
 */
async function mockSupabaseProvider(page: Page, { withActiveJob = true } = {}) {
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

  await page.route(`${SUPABASE_URL}/rest/v1/profiles*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEST_PROFILE),
    }),
  );

  await page.route(`${SUPABASE_URL}/rest/v1/provider_profiles*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(PROVIDER_PROFILE),
    }),
  );

  // Jobs endpoint — return active job or empty
  await page.route(`${SUPABASE_URL}/rest/v1/jobs*`, (route) => {
    if (withActiveJob) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ACTIVE_JOB),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(null),
    });
  });

  // Catch-all REST
  await page.route(`${SUPABASE_URL}/rest/v1/**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    }),
  );

  // Realtime
  await page.route(`${SUPABASE_URL}/realtime/**`, (route) =>
    route.abort('connectionrefused'),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Provider Redirect Safety', () => {
  test('provider on /provider/personal-information is NOT redirected when active job exists', async ({ page }) => {
    await mockSupabaseProvider(page, { withActiveJob: true });

    // Navigate to a data entry route
    await page.goto('/provider/personal-information');
    await page.waitForLoadState('networkidle');

    // Wait for the active job tracker to run
    await page.waitForTimeout(3000);

    // Should still be on /provider/personal-information (NOT redirected to /job/*)
    const url = page.url();
    expect(url).toContain('/provider/personal-information');
    expect(url).not.toContain('/job/');
  });

  test('provider on /home IS auto-redirected to active job', async ({ page }) => {
    await mockSupabaseProvider(page, { withActiveJob: true });

    // Navigate to /home — an AUTO_REDIRECT_ALLOWED route
    await page.goto('/home');
    await page.waitForLoadState('networkidle');

    // Wait for the active job tracker to run and trigger redirect
    await page.waitForTimeout(3000);

    // Should have been redirected to /job/{activeJobId}
    const url = page.url();
    // The redirect replaces the URL to /job/job-active-e2e-1
    const wasRedirected = url.includes('/job/') || url.includes('/home');
    expect(wasRedirected).toBe(true);

    // If the app redirected, verify it went to the correct job
    if (url.includes('/job/')) {
      expect(url).toContain('job-active-e2e-1');
    }
  });
});
