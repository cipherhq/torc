/**
 * Validates required environment variables before app mount.
 * Called from main.jsx -- surfaces a clear error instead of a blank screen.
 */

interface ValidationResult {
  valid: boolean;
  missing: string[];
}

const REQUIRED_VARS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
] as const;

export function validateConfig(): ValidationResult {
  const missing: string[] = [];

  for (const key of REQUIRED_VARS) {
    const value = import.meta.env[key];
    if (!value || typeof value !== 'string' || value.trim() === '') {
      missing.push(key);
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
