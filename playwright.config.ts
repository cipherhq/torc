import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:7002',
    headless: true,
  },
  webServer: [
    {
      command: 'VITE_SUPABASE_URL=https://test.supabase.co VITE_SUPABASE_ANON_KEY=test-key npm run dev --workspace=apps/customer-web',
      port: 7002,
      reuseExistingServer: true,
      timeout: 30000,
    },
  ],
  projects: [
    { name: 'customer', testMatch: /customer\..*\.spec\.ts/ },
    { name: 'provider', testMatch: /provider\..*\.spec\.ts/ },
    { name: 'admin', testMatch: /admin\..*\.spec\.ts/ },
  ],
});
