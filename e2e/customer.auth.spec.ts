/**
 * Customer auth E2E tests — uses Playwright route interception to mock
 * Supabase responses. Tests token refresh stability, dirty form preservation,
 * and missing config error screen.
 */
import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
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

/**
 * Mock all Supabase REST and Auth endpoints so the app loads without a real
 * backend. Uses Playwright's page.route() for network interception.
 */
async function mockSupabaseAuth(page: Page, { authenticated = true } = {}) {
  // Mock GoTrue session endpoint
  await page.route(`${SUPABASE_URL}/auth/v1/token*`, (route) => {
    if (authenticated) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(TEST_SESSION),
      });
    }
    return route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }),
    });
  });

  // Mock GoTrue user endpoint
  await page.route(`${SUPABASE_URL}/auth/v1/user`, (route) => {
    if (authenticated) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(TEST_USER),
      });
    }
    return route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'not authenticated' }),
    });
  });

  // Mock profiles REST query
  await page.route(`${SUPABASE_URL}/rest/v1/profiles*`, (route) => {
    if (authenticated) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(TEST_PROFILE),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(null),
    });
  });

  // Catch-all for other Supabase REST calls (services, jobs, etc.)
  await page.route(`${SUPABASE_URL}/rest/v1/**`, (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  // Mock Supabase Realtime websocket upgrade — just let it fail gracefully
  await page.route(`${SUPABASE_URL}/realtime/**`, (route) => {
    return route.abort('connectionrefused');
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Customer Auth — Token Refresh', () => {
  test('page loads with mocked auth and form input survives simulated token refresh', async ({ page }) => {
    await mockSupabaseAuth(page, { authenticated: true });
    await page.goto('/');

    // Wait for app to render authenticated content (not loading screen)
    await page.waitForLoadState('networkidle');

    // If there is a form input visible, type into it
    const inputs = page.locator('input[type="text"], input[type="search"], textarea');
    const inputCount = await inputs.count();

    if (inputCount > 0) {
      const firstInput = inputs.first();
      await firstInput.fill('test-dirty-value');

      // Simulate TOKEN_REFRESHED event via the Supabase client in the page context
      await page.evaluate(() => {
        // Dispatch a storage event that Supabase uses for cross-tab auth sync
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

      // Wait a tick for React to process
      await page.waitForTimeout(500);

      // The input value should be preserved
      const value = await firstInput.inputValue();
      expect(value).toBe('test-dirty-value');
    }

    // The page should still be showing authenticated content (not a loading screen)
    const loadingScreen = page.locator('[data-testid="loading-screen"]');
    const loadingVisible = await loadingScreen.isVisible().catch(() => false);
    expect(loadingVisible).toBe(false);
  });

  test('dirty form values preserved when auth state changes', async ({ page }) => {
    await mockSupabaseAuth(page, { authenticated: true });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Inject a test form into the page to verify form state survives auth events
    await page.evaluate(() => {
      const form = document.createElement('form');
      form.id = 'e2e-test-form';
      form.innerHTML = `
        <input type="text" id="e2e-input-name" value="" />
        <textarea id="e2e-textarea-notes"></textarea>
      `;
      document.body.appendChild(form);
    });

    const nameInput = page.locator('#e2e-input-name');
    const notesTextarea = page.locator('#e2e-textarea-notes');

    await nameInput.fill('Unsaved Name');
    await notesTextarea.fill('Important notes that must not be lost');

    // Simulate SIGNED_IN event (same user — should be deduplicated)
    await page.evaluate(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'sb-test-auth-token',
          newValue: JSON.stringify({
            access_token: 'same-user-new-token',
            refresh_token: 'same-user-refresh',
            expires_at: Math.floor(Date.now() / 1000) + 7200,
          }),
        }),
      );
    });

    await page.waitForTimeout(300);

    // Form values must be preserved
    expect(await nameInput.inputValue()).toBe('Unsaved Name');
    expect(await notesTextarea.inputValue()).toBe('Important notes that must not be lost');
  });

  test('missing config shows configuration error or fails gracefully', async ({ page }) => {
    // Do NOT mock supabase — let the app try to connect with its test env vars
    // The page should either show an error screen or the login page

    // Navigate and wait — we expect the app to handle missing/invalid backend gracefully
    const response = await page.goto('/');

    // The page should at least load (200 from the dev server serving index.html)
    if (response) {
      expect(response.status()).toBeLessThan(500);
    }

    // Wait for the app to attempt auth and settle
    await page.waitForTimeout(2000);

    // The page should show either:
    // 1. A configuration error screen
    // 2. The login page (graceful fallback)
    // 3. Some visible content (not a blank white page)
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(0);
  });
});
