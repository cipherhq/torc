import type { Session } from '@supabase/supabase-js';

// Supabase localStorage key used by the web apps
const SUPABASE_STORAGE_KEY = 'sb-apojatplmfsbimgcyjoo-auth-token';

// --- Message types ---

// Messages sent FROM web → native (via postMessage)
export type WebToNativeMessage =
  | { type: 'SIGN_OUT' }
  | { type: 'NAVIGATE_NATIVE'; screen: string; params?: Record<string, any> }
  | { type: 'SHARE'; payload: { title?: string; text?: string; url?: string } }
  | { type: 'REQUEST_MIC_PERMISSION' }
  | { type: 'OPEN_APP_SETTINGS' }
  | { type: 'READY' };

// Messages sent FROM native → web (via injectJavaScript)
export type NativeToWebMessage =
  | { type: 'AUTH_SESSION'; session: Session }
  | { type: 'PUSH_TOKEN'; token: string }
  | { type: 'NAVIGATE'; path: string };

/**
 * Build JS to inject BEFORE web content loads.
 * Sets `window.__TORC_NATIVE__` flag and writes the Supabase session
 * to localStorage so the web app's auth context picks it up immediately.
 */
export function buildSessionInjectionJS(session: Session): string {
  const payload = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
    user: session.user,
  });

  // Use escaped JSON to avoid quote issues in the injected script
  const escapedPayload = payload.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  return `
    (function() {
      window.__TORC_NATIVE__ = true;
      try {
        localStorage.setItem('${SUPABASE_STORAGE_KEY}', '${escapedPayload}');
      } catch(e) {
        console.warn('Failed to inject session:', e);
      }
    })();
    true;
  `;
}

/**
 * Build JS to send a message from native to the web app at runtime.
 * The web app listens via `window.addEventListener('message', ...)`.
 */
export function buildPostMessageJS(message: NativeToWebMessage): string {
  const json = JSON.stringify(message);
  return `
    (function() {
      window.postMessage(${json}, '*');
    })();
    true;
  `;
}

/**
 * Parse a message received from the web app's postMessage.
 * Returns null if the message is not a valid Torc bridge message.
 */
export function parseWebMessage(data: string): WebToNativeMessage | null {
  try {
    const parsed = JSON.parse(data);
    if (parsed && typeof parsed.type === 'string') {
      return parsed as WebToNativeMessage;
    }
    return null;
  } catch {
    return null;
  }
}
