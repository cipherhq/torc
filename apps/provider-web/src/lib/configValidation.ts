/**
 * Validates required environment variables before app mount.
 * Called from main.jsx -- surfaces a clear error instead of a blank screen.
 *
 * In production mode (VITE_APP_ENV=production), additionally rejects
 * unsafe configuration that should never ship in a release build:
 * - localhost / 127.0.0.1 URLs
 * - Vercel preview deployment hosts
 * - Stripe test keys (pk_test_)
 * - Service-role / secret keys
 */

interface ValidationResult {
  valid: boolean;
  missing: string[];
}

const REQUIRED_VARS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
] as const;

const PROHIBITED_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /localhost/i, label: 'localhost reference' },
  { pattern: /127\.0\.0\.1/, label: '127.0.0.1 reference' },
  { pattern: /\.vercel\.app/i, label: 'Vercel preview deployment host' },
  { pattern: /pk_test_/i, label: 'Stripe test publishable key' },
  { pattern: /sk_test_/i, label: 'Stripe test secret key' },
  { pattern: /sk_live_/i, label: 'Stripe live secret key (must not be client-side)' },
  { pattern: /service.?role/i, label: 'Supabase service-role key' },
];

export function validateConfig(): ValidationResult {
  const missing: string[] = [];

  for (const key of REQUIRED_VARS) {
    const value = import.meta.env[key];
    if (!value || typeof value !== 'string' || value.trim() === '') {
      missing.push(key);
    }
  }

  // In production mode, reject unsafe configuration
  const appEnv = String(import.meta.env.VITE_APP_ENV || '').trim().toLowerCase();
  if (appEnv === 'production') {
    const appUrl = String(import.meta.env.VITE_APP_URL || '').trim();
    if (!appUrl) {
      missing.push('VITE_APP_URL (required in production)');
    }

    // Scan all VITE_ env vars for prohibited patterns
    const viteVars = Object.entries(import.meta.env).filter(([k]) => k.startsWith('VITE_'));
    for (const [key, value] of viteVars) {
      if (typeof value !== 'string') continue;
      for (const { pattern, label } of PROHIBITED_PATTERNS) {
        if (pattern.test(value)) {
          missing.push(`${key} contains ${label}`);
        }
      }
    }
  }

  return { valid: missing.length === 0, missing };
}

export function renderConfigError(missing: string[]): void {
  const root = document.getElementById('root');
  if (!root) return;

  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,sans-serif;background:#f9fafb">
      <div style="max-width:420px;width:100%;background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);padding:32px;text-align:center">
        <h1 style="font-size:20px;font-weight:700;color:#111;margin:0 0 8px">Configuration Error</h1>
        <p style="font-size:14px;color:#666;margin:0 0 16px">
          The app cannot start because required environment variables are missing.
        </p>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;text-align:left;margin-bottom:16px">
          <p style="font-size:12px;color:#991b1b;font-weight:600;margin:0 0 4px">Missing:</p>
          ${missing.map(k => `<p style="font-size:12px;color:#991b1b;font-family:monospace;margin:2px 0">${k}</p>`).join('')}
        </div>
        <p style="font-size:12px;color:#999;margin:0">Check your .env file and restart the dev server.</p>
      </div>
    </div>
  `;
}
