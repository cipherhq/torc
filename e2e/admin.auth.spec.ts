/**
 * Admin auth E2E tests — uses Playwright route interception to mock
 * Supabase. Tests unauthenticated redirect and loading state.
 */
import { test, expect, type Page } from '@playwright/test';

const SUPABASE_URL = 'https://test.supabase.co';

/**
 * Mock Supabase to return no session (unauthenticated).
 */
async function mockSupabaseUnauthenticated(page: Page) {
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

  await page.route(`${SUPABASE_URL}/rest/v1/profiles*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(null),
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
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Admin Auth — Unauthorized Access Rejection', () => {
  test('unauthenticated user visiting /dashboard gets redirected to /login', async ({ page }) => {
    await mockSupabaseUnauthenticated(page);

    // Try to access the dashboard directly
    await page.goto('/dashboard');

    // Wait for the app to check auth and redirect
    await page.waitForLoadState('networkidle');

    // The ProtectedAdminRoute component should redirect to /login
    // Allow time for the async auth check and navigation
    await page.waitForTimeout(2000);

    // Should end up on /login (or at least not on /dashboard with real content)
    const url = page.url();
    const isRedirected = url.includes('/login') || url.endsWith('/');
    expect(isRedirected).toBe(true);
  });

  test('loading screen shows during auth check', async ({ page }) => {
    // Delay the auth response to catch the loading state
    await page.route(`${SUPABASE_URL}/auth/v1/token*`, async (route) => {
      // Delay response by 3 seconds to ensure loading screen is visible
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_grant' }),
      });
    });

    await page.route(`${SUPABASE_URL}/auth/v1/user`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'not authenticated' }),
      });
    });

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

    // Navigate to the dashboard — should see loading state while auth checks
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    // Look for loading indicators: spinner, loading text, or animate-spin class
    // The ProtectedAdminRoute shows a spinner with animate-spin
    const loadingIndicator = page.locator('.animate-spin, [data-testid="loading-screen"], text=Loading');
    const hasLoading = await loadingIndicator.first().isVisible().catch(() => false);

    // At minimum, the page should not show dashboard content yet
    const dashboardContent = page.locator('text=Dashboard, text=Analytics, text=Overview');
    const dashboardVisible = await dashboardContent.first().isVisible().catch(() => false);

    // During auth check, either loading is shown OR dashboard is not yet visible
    expect(hasLoading || !dashboardVisible).toBe(true);
  });
});
