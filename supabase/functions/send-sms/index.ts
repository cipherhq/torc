import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// --- CORS allowlist (configurable via ALLOWED_ORIGINS env var) ---
const DEFAULT_ORIGINS = [
  'https://torcapp.com',
  'https://www.torcapp.com',
  'https://provider.torcservices.com',
  'https://admin.torcservices.com',
  'https://customer.torcservices.com',
];
const envOrigins = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').filter(Boolean);
const ALLOWED_ORIGINS = envOrigins.length > 0 ? envOrigins : DEFAULT_ORIGINS;

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  const isAllowed =
    ALLOWED_ORIGINS.includes(origin) ||
    origin.startsWith('http://localhost:') ||
    origin.startsWith('http://127.0.0.1:') ||
    origin === 'capacitor://localhost' ||
    origin === 'capacitor://app.torcapp.com' ||
    origin === 'capacitor://app.torcpro.com' ||
    origin === 'https://app.torcapp.com' ||
    origin === 'https://app.torcpro.com' ||
    origin === 'http://localhost' ||
    origin === 'https://localhost';
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

// E.164 phone number validation
const PHONE_REGEX = /^\+[1-9]\d{1,14}$/;

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioMessagingServiceSid = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID');

    if (!twilioSid || !twilioToken || !twilioMessagingServiceSid) {
      throw new Error('Missing Twilio configuration.');
    }

    // --- Authentication ---
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const { to, message } = await req.json();

    if (!to || !message) {
      return new Response(JSON.stringify({ error: 'Missing required fields: to, message' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // --- Phone number validation ---
    if (!PHONE_REGEX.test(to)) {
      return new Response(JSON.stringify({ error: 'Invalid phone number. Must be E.164 format (e.g. +15551234567).' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // Send SMS via Twilio REST API using Messaging Service
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
    const body = new URLSearchParams({
      To: to,
      MessagingServiceSid: twilioMessagingServiceSid,
      Body: message,
    });

    const res = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${twilioSid}:${twilioToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    const result = await res.json();

    if (!res.ok) {
      console.error('Twilio error:', result?.code);
      return new Response(
        JSON.stringify({ error: 'SMS send failed. Please try again.' }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, sid: result.sid }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    console.error('send-sms error:', err?.message);
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }
});
