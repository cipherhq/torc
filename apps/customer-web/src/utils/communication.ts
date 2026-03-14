/**
 * Open the phone dialer with the given number.
 */
export function callPhone(phoneNumber: string) {
  if (!phoneNumber || typeof phoneNumber !== 'string') return;
  window.location.href = `tel:${phoneNumber.replace(/\s/g, '')}`;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const DEFAULT_SHARE_BASE_URL = String(import.meta.env.VITE_APP_URL || 'https://torcapp.com').replace(/\/+$/, '');

function isPrivateHost(hostname: string): boolean {
  const host = (hostname || '').toLowerCase();
  if (!host) return true;
  if (LOCAL_HOSTS.has(host)) return true;
  if (host.endsWith('.local')) return true;

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

function getShareBaseUrl(): string {
  const envShareUrl = String(import.meta.env.VITE_SHARE_BASE_URL || '').trim();
  const envCustomerUrl = String(import.meta.env.VITE_CUSTOMER_APP_URL || '').trim();
  const envAppUrl = String(import.meta.env.VITE_APP_URL || '').trim();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const candidates = [envShareUrl, envCustomerUrl, envAppUrl, origin].filter(Boolean);
  const firstPublic = candidates.find(isPublicHttpUrl);
  return firstPublic ? normalizeBaseUrl(firstPublic) : DEFAULT_SHARE_BASE_URL;
}

function postNativeShareMessage(payload: { title?: string; text?: string; url?: string }): boolean {
  if (typeof window === 'undefined') return false;
  const bridge = (window as any).ReactNativeWebView;
  if (!bridge?.postMessage) return false;
  try {
    bridge.postMessage(JSON.stringify({ type: 'SHARE', payload }));
    return true;
  } catch {
    return false;
  }
}

export async function shareContent(payload: { title?: string; text?: string; url?: string }): Promise<boolean> {
  const textToCopy = [payload.text, payload.url].filter(Boolean).join('\n');

  // Native WebView bridge: open iOS/Android share sheet (Messages, Mail, etc.).
  if (postNativeShareMessage(payload)) return true;

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: payload.title,
        text: payload.text,
        url: payload.url,
      });
      return true;
    } catch (err: any) {
      if (err?.name === 'AbortError') return false;
    }
  }

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(textToCopy);
      return true;
    }
  } catch {
    // Ignore clipboard failures.
  }

  return false;
}

/**
 * Share trip / job details using the Web Share API,
 * with a clipboard fallback for browsers that don't support it.
 */
export async function shareJobDetails(details: {
  jobId?: string;
  service?: string;
  providerName?: string;
  eta?: number | null;
  status?: string;
}): Promise<boolean> {
  const { jobId, service, providerName, eta, status } = details;
  const shareBaseUrl = getShareBaseUrl();
  const trackingUrl = jobId ? `${shareBaseUrl}/tracking/${jobId}` : undefined;

  const lines: string[] = ['Torc - Roadside Assistance'];
  if (service) lines.push(`Service: ${service}`);
  if (providerName) lines.push(`Provider: ${providerName}`);
  if (eta != null) lines.push(`ETA: ${eta} min`);
  if (status) lines.push(`Status: ${status}`);
  if (trackingUrl) lines.push(`Track: ${trackingUrl}`);

  const text = lines.join('\n');
  return shareContent({ title: 'My Torc Rescue', text, url: trackingUrl });
}

/**
 * Open SMS app with pre-filled message.
 */
export function sendSMS(phoneNumber: string, message?: string) {
  const body = message ? `&body=${encodeURIComponent(message)}` : '';
  window.location.href = `sms:${phoneNumber.replace(/\s/g, '')}${body}`;
}
