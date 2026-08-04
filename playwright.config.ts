import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 0,
  use: {
    headless: true,
  },
  webServer: [
    {
      command:
        'VITE_SUPABASE_URL=https://test.supabase.co VITE_SUPABASE_ANON_KEY=test-anon-key npm run dev --workspace=apps/customer-web -- --port 7002',
      port: 7002,
      reuseExistingServer: true,
      timeout: 30000,
    },
    {
      command:
        'VITE_SUPABASE_URL=https://test.supabase.co VITE_SUPABASE_ANON_KEY=test-anon-key npm run dev --workspace=apps/provider-web -- --port 7001',
      port: 7001,
      reuseExistingServer: true,
      timeout: 30000,
    },
    {
      command:
        'VITE_SUPABASE_URL=https://test.supabase.co VITE_SUPABASE_ANON_KEY=test-anon-key npm run dev --workspace=apps/admin-web -- --port 8082',
      port: 8082,
      reuseExistingServer: true,
      timeout: 30000,
    },
  ],
  projects: [
    {
      name: 'customer',
      testMatch: /customer\..*\.spec\.ts/,
      use: { baseURL: 'http://localhost:7002' },
    },
    {
      name: 'provider',
      testMatch: /provider\..*\.spec\.ts/,
      use: { baseURL: 'http://localhost:7001' },
    },
    {
      name: 'admin',
      testMatch: /admin\..*\.spec\.ts/,
      use: { baseURL: 'http://localhost:8082' },
    },
  ],
});
