import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PHONE_REGEX = /^\+[1-9]\d{1,14}$/;

// Approved message templates — ordinary clients cannot send arbitrary text
const MESSAGE_TEMPLATES: Record<string, (data: Record<string, string>) => string> = {
  provider_enroute: (d) => `TORC: Your provider ${d.providerName || ''} is on the way! ETA: ${d.eta || 'soon'}. Track at ${d.trackingUrl || 'torcapp.com'}`,
  provider_arrived: (d) => `TORC: Your provider ${d.providerName || ''} has arrived at your location.`,
  job_completed: (d) => `TORC: Your service has been completed. Total: ${d.amount || ''}. Rate your experience in the app.`,
  job_cancelled: (d) => `TORC: Your service request has been cancelled. ${d.reason || ''}`,
  // Third-party notification: sent to requester_phone when someone requests help for another person
  third_party_enroute: (d) => `TORC: ${d.customerName || 'Someone'} has requested roadside assistance for you. ${d.providerName || 'Your provider'} is on the way to ${d.address || 'your location'}. — TORC`,
};

const MAX_MESSAGE_LENGTH = 320;

// Atomic rate limiting (database RPC, fail-closed)
async function claimRateLimitSlot(
  adminClient: any,
  key: string,
  maxCount: number,
  windowSeconds: number
): Promise<boolean> {
  const { data, error } = await adminClient.rpc('claim_rate_limit_slot', {
    p_key: key,
    p_max_count: maxCount,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error('[send-sms] Rate limit RPC failed, blocking:', error.message);
    return false; // Fail closed
  }
  return data === true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
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
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!serviceRoleKey) throw new Error('Missing service configuration.');
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { messageTemplate, templateData, jobId, recipientType } = await req.json();

    // --- Require template-based messages — no arbitrary text ---
    if (!messageTemplate) {
      return new Response(JSON.stringify({ error: 'messageTemplate is required. Arbitrary message text is not accepted.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const templateFn = MESSAGE_TEMPLATES[messageTemplate];
    if (!templateFn) {
      return new Response(JSON.stringify({ error: `Unknown message template: ${messageTemplate}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- Derive recipient from job (no arbitrary `to` for ordinary clients) ---
    if (!jobId) {
      return new Response(JSON.stringify({ error: 'jobId is required. Recipients are derived from authorized jobs.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: job } = await adminClient
      .from('jobs')
      .select('customer_id, provider_id, requester_phone, requester_type')
      .eq('id', jobId)
      .maybeSingle();

    if (!job) {
      return new Response(JSON.stringify({ error: 'Job not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify the caller is part of this job
    if (job.customer_id !== user.id && job.provider_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Not authorized for this job' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Determine recipient: 'requester' sends to the job's requester_phone (third-party),
    // default sends to the other party (provider or customer).
    let recipientPhone: string;

    if (recipientType === 'requester') {
      // Third-party notification: the customer requested help for someone else.
      // The phone is stored on the job record, derived from the booking, not caller-supplied.
      if (job.requester_type !== 'other') {
        return new Response(JSON.stringify({ error: 'Job is not a third-party request' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!job.requester_phone) {
        return new Response(JSON.stringify({ error: 'No requester phone on this job' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      recipientPhone = job.requester_phone;
    } else {
      // Default: send to the other job participant
      const targetId = job.customer_id === user.id ? job.provider_id : job.customer_id;
      if (!targetId) {
        return new Response(JSON.stringify({ error: 'No target user for this job' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: targetProfile } = await adminClient
        .from('profiles')
        .select('phone')
        .eq('id', targetId)
        .maybeSingle();

      if (!targetProfile?.phone) {
        return new Response(JSON.stringify({ error: 'Target user has no phone number' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      recipientPhone = targetProfile.phone;
    }

    if (!PHONE_REGEX.test(recipientPhone)) {
      return new Response(JSON.stringify({ error: 'Invalid phone number format in profile.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- Durable rate limiting ---
    const userAllowed = await claimRateLimitSlot(adminClient, `sms:user:${user.id}`, 10, 3600);
    if (!userAllowed) {
      return new Response(JSON.stringify({ error: 'SMS rate limit exceeded. Try again later.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const numberAllowed = await claimRateLimitSlot(adminClient, `sms:number:${recipientPhone}`, 5, 3600);
    if (!numberAllowed) {
      return new Response(JSON.stringify({ error: 'Too many messages to this number.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- Generate message from template ---
    const message = templateFn(templateData || {});
    if (message.length > MAX_MESSAGE_LENGTH) {
      return new Response(JSON.stringify({ error: 'Generated message exceeds maximum length' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
      return new Response(JSON.stringify({ error: 'SMS send failed. Please try again.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[send-sms] Sent template=${messageTemplate} to=${recipientPhone.slice(0, 6)}***, sid=${result.sid}`);
    return new Response(JSON.stringify({ success: true, sid: result.sid }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[send-sms] Error:', err?.message);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
