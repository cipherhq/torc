import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// --- AES-256-GCM encryption (Deno / Web Crypto API) ---
// Compatible with lib/encryption.ts (Node.js version).
// Format: "iv:ciphertext:authTag" (all hex, colon-separated).

function hexEncode(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

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
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

async function encrypt(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  // AES-GCM appends a 16-byte auth tag to the ciphertext
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const cipherArr = new Uint8Array(cipherBuf);

  // Last 16 bytes are the auth tag
  const ciphertext = cipherArr.slice(0, cipherArr.length - 16);
  const authTag = cipherArr.slice(cipherArr.length - 16);

  return `${hexEncode(iv)}:${hexEncode(ciphertext)}:${hexEncode(authTag)}`;
}

// --- CORS ---

const DEFAULT_ORIGINS = [
  'https://torcapp.com',
  'https://www.torcapp.com',
  'https://provider.torcservices.com',
  'https://admin.torcservices.com',
  'https://customer.torcservices.com',
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  const isAllowed =
    DEFAULT_ORIGINS.includes(origin) ||
    origin.startsWith('http://localhost:') ||
    origin.startsWith('http://127.0.0.1:') ||
    origin === 'capacitor://localhost' ||
    origin === 'http://localhost';
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : DEFAULT_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey =
      Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      throw new Error('Missing Supabase configuration.');
    }

    // Authenticate the caller
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const { action, business_id, gateway, secret_key, public_key } = body;

    // Verify the user owns this business
    const { data: business, error: bizError } = await adminClient
      .from('businesses')
      .select('id, owner_id')
      .eq('id', business_id)
      .single();

    if (bizError || !business || business.owner_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'upsert') {
      if (!gateway || !secret_key) {
        return new Response(
          JSON.stringify({ error: 'gateway and secret_key are required' }),
          { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
        );
      }

      const encryptedSecret = await encrypt(secret_key);
      const encryptedPublic = public_key ? await encrypt(public_key) : null;

      // Deactivate existing credential for this gateway
      await adminClient
        .from('business_payment_credentials')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('business_id', business_id)
        .eq('gateway', gateway)
        .eq('is_active', true);

      // Insert new encrypted credential
      const { data: cred, error: insertError } = await adminClient
        .from('business_payment_credentials')
        .insert({
          business_id,
          gateway,
          secret_key: encryptedSecret,
          public_key: encryptedPublic,
          is_active: true,
          connection_type: 'manual',
        })
        .select('id, gateway, is_active, created_at')
        .single();

      if (insertError) throw insertError;

      return new Response(JSON.stringify({ credential: cred }), {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'list') {
      // Return metadata only — never return secret_key to the client
      const { data: creds, error: listError } = await adminClient
        .from('business_payment_credentials')
        .select('id, gateway, is_active, connection_type, verified_at, created_at')
        .eq('business_id', business_id)
        .eq('is_active', true);

      if (listError) throw listError;

      return new Response(JSON.stringify({ credentials: creds }), {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'delete') {
      const { credential_id } = body;
      if (!credential_id) {
        return new Response(
          JSON.stringify({ error: 'credential_id is required' }),
          { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
        );
      }

      const { error: delError } = await adminClient
        .from('business_payment_credentials')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', credential_id)
        .eq('business_id', business_id);

      if (delError) throw delError;

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('manage-payment-credentials error:', error?.message);
    return new Response(
      JSON.stringify({ error: error?.message || 'Internal error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
