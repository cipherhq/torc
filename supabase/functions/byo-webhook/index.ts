import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// --- AES-256-GCM decryption (Deno / Web Crypto API) ---
// Compatible with lib/encryption.ts (Node.js version).
// Format: "iv:ciphertext:authTag" (all hex, colon-separated).

function hexDecode(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

async function getEncryptionKey(): Promise<CryptoKey> {
  const hex = Deno.env.get('CREDENTIALS_ENCRYPTION_KEY');
  if (!hex || hex.length !== 64) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY must be a 64-char hex string (32 bytes).');
  }
  const raw = hexDecode(hex);
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
}

async function decrypt(encrypted: string): Promise<string> {
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload format.');
  }
  const [ivHex, ciphertextHex, authTagHex] = parts;
  const key = await getEncryptionKey();
  const iv = hexDecode(ivHex);
  const ciphertext = hexDecode(ciphertextHex);
  const authTag = hexDecode(authTagHex);

  // Web Crypto expects ciphertext + authTag concatenated
  const combined = new Uint8Array(ciphertext.length + authTag.length);
  combined.set(ciphertext);
  combined.set(authTag, ciphertext.length);

  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, combined);
  return new TextDecoder().decode(plainBuf);
}

// --- HMAC verification helpers ---

async function computeHmac(
  secret: string,
  body: string,
  algorithm: 'SHA-512' | 'SHA-256' = 'SHA-512'
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: algorithm },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

Deno.serve(async (req) => {
  // This endpoint is called by payment gateways (Paystack, Flutterwave, Stripe).
  // The businessId is in the URL path.
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  // Expected path: /byo-webhook/<businessId>
  const businessId = pathParts[pathParts.length - 1];

  if (!businessId || req.method !== 'POST') {
    return new Response('Not found', { status: 404 });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey =
      Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing Supabase configuration.');
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Fetch the active BYO credential for this business
    const { data: creds, error: credError } = await adminClient
      .from('business_payment_credentials')
      .select('id, gateway, secret_key, connection_type')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (credError || !creds) {
      return new Response(JSON.stringify({ error: 'No credentials found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const rawBody = await req.text();

    // Decrypt the secret key for HMAC verification
    let secretKey: string;
    if (creds.secret_key && creds.secret_key.includes(':')) {
      // Encrypted format
      secretKey = await decrypt(creds.secret_key);
    } else if (creds.secret_key) {
      // Legacy unencrypted (pre-migration)
      secretKey = creds.secret_key;
    } else {
      return new Response(JSON.stringify({ error: 'No secret key configured' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Verify webhook signature based on gateway
    let verified = false;

    if (creds.gateway === 'paystack') {
      const signature = req.headers.get('x-paystack-signature') || '';
      const expected = await computeHmac(secretKey, rawBody, 'SHA-512');
      verified = timingSafeEqual(expected, signature);
    } else if (creds.gateway === 'flutterwave') {
      const signature = req.headers.get('verif-hash') || '';
      verified = timingSafeEqual(secretKey, signature);
    } else if (creds.gateway === 'stripe') {
      // Stripe uses a different signature scheme (timestamp + payload).
      // For now, just verify the sig header exists.
      const sigHeader = req.headers.get('stripe-signature') || '';
      verified = sigHeader.length > 0;
    }

    if (!verified) {
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const event = JSON.parse(rawBody);

    // TODO: Process the webhook event (update job payment status, etc.)
    // This is a placeholder — actual business logic depends on gateway event types.
    console.log(`BYO webhook received for business ${businessId}:`, event?.event || event?.type);

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('byo-webhook error:', error?.message);
    return new Response(JSON.stringify({ error: 'Webhook processing failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
