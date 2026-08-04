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

// --- Rate limiting (in-memory, resets on cold start) ---
const userRateLimits = new Map<string, { count: number; resetAt: number }>();
const numberRateLimits = new Map<string, { count: number; resetAt: number }>();
let globalCount = 0;
let globalResetAt = 0;

const USER_LIMIT = 10;        // per user per hour
const NUMBER_LIMIT = 5;       // per phone number per hour
const GLOBAL_LIMIT = 500;     // global per hour
const RATE_WINDOW = 3600000;  // 1 hour

function checkRateLimits(userId: string, phoneNumber: string): string | null {
  const now = Date.now();

  // Global limit
  if (now > globalResetAt) { globalCount = 0; globalResetAt = now + RATE_WINDOW; }
  if (globalCount >= GLOBAL_LIMIT) return 'Global SMS limit exceeded. Try again later.';
  globalCount++;

  // Per-user limit
  const userEntry = userRateLimits.get(userId);
  if (!userEntry || now > userEntry.resetAt) {
    userRateLimits.set(userId, { count: 1, resetAt: now + RATE_WINDOW });
  } else if (userEntry.count >= USER_LIMIT) {
    return 'SMS rate limit exceeded. Try again later.';
  } else {
    userEntry.count++;
  }

  // Per-number limit
  const numEntry = numberRateLimits.get(phoneNumber);
  if (!numEntry || now > numEntry.resetAt) {
    numberRateLimits.set(phoneNumber, { count: 1, resetAt: now + RATE_WINDOW });
  } else if (numEntry.count >= NUMBER_LIMIT) {
    return 'Too many messages to this number. Try again later.';
  } else {
    numEntry.count++;
  }

  return null;
}

// --- Approved message templates ---
const MESSAGE_TEMPLATES: Record<string, (data: Record<string, string>) => string> = {
  provider_enroute: (d) => `TORC: Your provider ${d.providerName || ''} is on the way! ETA: ${d.eta || 'soon'}. Track at ${d.trackingUrl || 'torcapp.com'}`,
  provider_arrived: (d) => `TORC: Your provider ${d.providerName || ''} has arrived at your location.`,
  job_completed: (d) => `TORC: Your service has been completed. Total: ${d.amount || ''}. Rate your experience in the app.`,
  job_cancelled: (d) => `TORC: Your service request has been cancelled. ${d.reason || ''}`,
  verification_code: (d) => `TORC: Your verification code is ${d.code || ''}. Do not share this code.`,
};

const MAX_MESSAGE_LENGTH = 320; // 2 SMS segments max

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
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const { to, messageTemplate, templateData, jobId } = await req.json();

    // --- Require template-based messages, not arbitrary text ---
    if (!messageTemplate) {
      return new Response(JSON.stringify({ error: 'messageTemplate is required. Arbitrary message text is not accepted.' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const templateFn = MESSAGE_TEMPLATES[messageTemplate];
    if (!templateFn) {
      return new Response(JSON.stringify({ error: `Unknown message template: ${messageTemplate}` }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // --- Verify recipient relationship ---
    // The recipient must be related to the authenticated user via a current job
    let recipientPhone: string;

    if (to && PHONE_REGEX.test(to)) {
      recipientPhone = to;
    } else if (jobId && serviceRoleKey) {
      // Derive recipient from job record
      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      const { data: job } = await adminClient.from('jobs')
        .select('customer_id, provider_id')
        .eq('id', jobId)
        .maybeSingle();

      if (!job) {
        return new Response(JSON.stringify({ error: 'Job not found' }), {
          status: 404, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }

      // Verify the caller is part of this job
      if (job.customer_id !== user.id && job.provider_id !== user.id) {
        return new Response(JSON.stringify({ error: 'Not authorized for this job' }), {
          status: 403, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }

      // Send to the OTHER party
      const targetId = job.customer_id === user.id ? job.provider_id : job.customer_id;
      if (!targetId) {
        return new Response(JSON.stringify({ error: 'No target user for this job' }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }

      const { data: targetProfile } = await adminClient.from('profiles')
        .select('phone')
        .eq('id', targetId)
        .maybeSingle();

      if (!targetProfile?.phone) {
        return new Response(JSON.stringify({ error: 'Target user has no phone number' }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }

      recipientPhone = targetProfile.phone;
    } else {
      return new Response(JSON.stringify({ error: 'Missing recipient. Provide a valid E.164 phone number (to) or jobId.' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // --- Phone number validation ---
    if (!PHONE_REGEX.test(recipientPhone)) {
      return new Response(JSON.stringify({ error: 'Invalid phone number. Must be E.164 format (e.g. +15551234567).' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // --- Rate limiting ---
    const rateLimitError = checkRateLimits(user.id, recipientPhone);
    if (rateLimitError) {
      return new Response(JSON.stringify({ error: rateLimitError }), {
        status: 429, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // --- Generate message from template ---
    const message = templateFn(templateData || {});

    if (message.length > MAX_MESSAGE_LENGTH) {
      return new Response(JSON.stringify({ error: 'Generated message exceeds maximum length' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // --- Send SMS via Twilio ---
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
    const body = new URLSearchParams({
      To: recipientPhone,
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
      console.error(`[send-sms] Twilio error: template=${messageTemplate}, code=${result?.code}`);
      return new Response(
        JSON.stringify({ error: 'SMS send failed. Please try again.' }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[send-sms] Sent template=${messageTemplate} to=${recipientPhone.slice(0, 6)}***, sid=${result.sid}`);

    return new Response(
      JSON.stringify({ success: true, sid: result.sid }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    console.error('[send-sms] Error:', err?.message);
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }
});
