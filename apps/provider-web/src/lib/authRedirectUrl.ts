const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function isPrivateHost(hostname: string): boolean {
  const host = (hostname || '').toLowerCase();
  if (!host) return true;
  if (LOCAL_HOSTS.has(host)) return true;
  if (host.endsWith('.local')) return true;

  // Basic private IPv4 ranges
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }

  return false;
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function isPublicHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return false;
    return !isPrivateHost(url.hostname);
  } catch {
    return false;
  }
}

export function getAuthSiteUrl(): string {
  const envUrl = String(import.meta.env.VITE_APP_URL || '').trim();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  // Prefer explicit public env URL.
  if (envUrl && isPublicHttpUrl(envUrl)) {
    return normalizeBaseUrl(envUrl);
  }

  // If env URL is localhost/private on production, use the real origin.
  if (origin && isPublicHttpUrl(origin)) {
    return normalizeBaseUrl(origin);
  }

  // Local/dev fallback.
  if (envUrl) return normalizeBaseUrl(envUrl);
  if (origin) return normalizeBaseUrl(origin);
  return 'https://provider-web-zeta.vercel.app';
}

export function getAuthCallbackUrl(): string {
  return `${getAuthSiteUrl()}/auth/callback`;
}
