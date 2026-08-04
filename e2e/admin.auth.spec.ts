/**
 * Admin auth E2E tests — verifies that unauthenticated users are redirected
 * to /login and the dashboard component never mounts in the DOM.
 */
import { test, expect } from '@playwright/test';

const SUPABASE_URL = 'https://test.supabase.co';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Admin Auth — Unauthorized Access Rejection', () => {
  test.beforeEach(async ({ page }) => {
    // Mock Supabase to return no session (unauthenticated)
    await page.route(`${SUPABASE_URL}/auth/v1/token*`, (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_grant' }),
      }),
    );

    await page.route(`${SUPABASE_URL}/auth/v1/user`, (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'not authenticated' }),
      }),
    );

    await page.route(`${SUPABASE_URL}/rest/v1/**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      }),
    );

    await page.route(`${SUPABASE_URL}/realtime/**`, (route) =>
      route.abort('connectionrefused'),
    );
  });

  test('unauthenticated user visiting /dashboard is redirected to /login and dashboard never mounts', async ({
    page,
  }) => {
    // Navigate to the protected dashboard route without auth
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Allow time for async auth check and redirect
    await page.waitForTimeout(3000);

    // Verify the URL changed to /login
    const url = page.url();
    expect(url).toContain('/login');

    // Verify the dashboard component never appeared in the DOM
    // Check for typical dashboard elements that should NOT be present
    const dashboardHeading = page.locator('h1:has-text("Dashboard"), h2:has-text("Dashboard")');
    const dashboardCount = await dashboardHeading.count();
    expect(dashboardCount).toBe(0);

    // Also verify no analytics/overview sections mounted
    const analyticsSection = page.locator('[data-testid="dashboard-content"], [data-testid="analytics"]');
    const analyticsCount = await analyticsSection.count();
    expect(analyticsCount).toBe(0);
  });

  test('unauthenticated user visiting /users is redirected to /login', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const url = page.url();
    expect(url).toContain('/login');
  });
});
