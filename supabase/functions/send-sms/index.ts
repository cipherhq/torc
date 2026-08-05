import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PHONE_REGEX = /^\+[1-9]\d{1,14}$/;

// Valid job states for active-service notifications
const ACTIVE_JOB_STATES = new Set(['accepted', 'enroute', 'arrived', 'inprogress']);

// Approved message templates — ordinary clients cannot send arbitrary text
const MESSAGE_TEMPLATES: Record<string, (data: Record<string, string>) => string> = {
  provider_enroute: (d) => `TORC: Your provider ${d.providerName || ''} is on the way!${d.trackingUrl ? ` Track at ${d.trackingUrl}` : ''} — TORC`,
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

// Helper: load a profile's display name from DB
async function loadProfileName(adminClient: any, userId: string): Promise<string> {
  const { data } = await adminClient
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', userId)
    .maybeSingle();
  if (!data) return 'Unknown';
  const first = data.first_name || '';
  const last = data.last_name ? `${data.last_name.charAt(0)}.` : '';
  return `${first} ${last}`.trim() || 'Unknown';
}

function jsonResp(body: Record<string, any>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Declare cleanup state before try so catch can access if needed
  let smsEventKey: string | null = null;
  let smsClaimToken: string | null = null;

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
      return jsonResp({ error: 'Unauthorized' }, 401);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return jsonResp({ error: 'Unauthorized' }, 401);
    }

    if (!serviceRoleKey) throw new Error('Missing service configuration.');
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { messageTemplate, templateData, jobId } = await req.json();

    // --- Require template-based messages — no arbitrary text ---
    if (!messageTemplate) {
      return jsonResp({ error: 'messageTemplate is required. Arbitrary message text is not accepted.' }, 400);
    }

    const templateFn = MESSAGE_TEMPLATES[messageTemplate];
    if (!templateFn) {
      return jsonResp({ error: `Unknown message template: ${messageTemplate}` }, 400);
    }

    // --- Require jobId for all SMS templates ---
    if (!jobId) {
      return jsonResp({ error: 'jobId is required. Recipients are derived from authorized jobs.' }, 400);
    }

    // --- Load job with all needed fields ---
    const { data: job } = await adminClient
      .from('jobs')
      .select('customer_id, provider_id, requester_phone, requester_type, status, pickup_address, service_id, total_amount, cancellation_reason')
      .eq('id', jobId)
      .maybeSingle();

    if (!job) {
      return jsonResp({ error: 'Job not found' }, 404);
    }

    // --- Template-specific authorization & server-derived data ---
    let recipientPhone: string;
    let serverTemplateData: Record<string, string> = {};

    switch (messageTemplate) {
      case 'third_party_enroute': {
        // Caller MUST be the customer
        if (user.id !== job.customer_id) {
          return jsonResp({ error: 'Only the customer can send third-party notifications' }, 403);
        }
        // Must be a third-party request
        if (job.requester_type !== 'other') {
          return jsonResp({ error: 'Job is not a third-party request' }, 400);
        }
        if (!job.requester_phone) {
          return jsonResp({ error: 'No requester phone on this job' }, 400);
        }
        if (!job.provider_id) {
          return jsonResp({ error: 'No provider assigned to this job' }, 400);
        }
        // Job must be in an active state
        if (!ACTIVE_JOB_STATES.has(job.status)) {
          return jsonResp({ error: `Cannot send notification for job in '${job.status}' state` }, 400);
        }

        recipientPhone = job.requester_phone;

        // Derive ALL content server-side — ignore client-supplied identity/address fields
        const [customerName, providerName] = await Promise.all([
          loadProfileName(adminClient, job.customer_id),
          loadProfileName(adminClient, job.provider_id),
        ]);

        serverTemplateData = {
          customerName,
          providerName,
          address: job.pickup_address || 'your location',
        };
        break;
      }

      case 'provider_enroute':
      case 'provider_arrived': {
        // Caller MUST be the provider
        if (user.id !== job.provider_id) {
          return jsonResp({ error: 'Only the assigned provider can send this notification' }, 403);
        }
        // Job must be in an active state
        if (!ACTIVE_JOB_STATES.has(job.status)) {
          return jsonResp({ error: `Cannot send notification for job in '${job.status}' state` }, 400);
        }
        // Recipient is the customer
        if (!job.customer_id) {
          return jsonResp({ error: 'No customer on this job' }, 400);
        }

        const { data: customerProfile } = await adminClient
          .from('profiles')
          .select('phone')
          .eq('id', job.customer_id)
          .maybeSingle();

        if (!customerProfile?.phone) {
          return jsonResp({ error: 'Customer has no phone number' }, 400);
        }
        recipientPhone = customerProfile.phone;

        // Derive providerName server-side
        const providerName = await loadProfileName(adminClient, job.provider_id);
        serverTemplateData = { providerName };

        // Derive tracking URL server-side from approved domain + jobId
        serverTemplateData.trackingUrl = `https://torcapp.com/tracking/${jobId}`;
        // ETA is omitted — no trusted server-side source currently available
        break;
      }

      case 'job_completed': {
        // Caller must be provider OR customer
        if (user.id !== job.provider_id && user.id !== job.customer_id) {
          return jsonResp({ error: 'Not authorized for this job' }, 403);
        }
        // Job MUST be completed
        if (job.status !== 'completed') {
          return jsonResp({ error: 'Job is not completed' }, 400);
        }

        // Send to the other party
        const targetId = user.id === job.customer_id ? job.provider_id : job.customer_id;
        if (!targetId) {
          return jsonResp({ error: 'No target user for this job' }, 400);
        }

        const { data: targetProfile } = await adminClient
          .from('profiles')
          .select('phone')
          .eq('id', targetId)
          .maybeSingle();

        if (!targetProfile?.phone) {
          return jsonResp({ error: 'Target user has no phone number' }, 400);
        }
        recipientPhone = targetProfile.phone;

        // Derive amount server-side
        serverTemplateData = {
          amount: job.total_amount ? `$${Number(job.total_amount).toFixed(2)}` : '',
        };
        break;
      }

      case 'job_cancelled': {
        // Caller must be the one who cancelled (customer or provider)
        if (user.id !== job.provider_id && user.id !== job.customer_id) {
          return jsonResp({ error: 'Not authorized for this job' }, 403);
        }
        // Job MUST be cancelled
        if (job.status !== 'cancelled') {
          return jsonResp({ error: 'Job is not cancelled' }, 400);
        }

        // Send to the other party
        const targetId = user.id === job.customer_id ? job.provider_id : job.customer_id;
        if (!targetId) {
          return jsonResp({ error: 'No target user for this job' }, 400);
        }

        const { data: targetProfile } = await adminClient
          .from('profiles')
          .select('phone')
          .eq('id', targetId)
          .maybeSingle();

        if (!targetProfile?.phone) {
          return jsonResp({ error: 'Target user has no phone number' }, 400);
        }
        recipientPhone = targetProfile.phone;

        // Use cancellation reason from job record, not client
        serverTemplateData = {
          reason: job.cancellation_reason || '',
        };
        break;
      }

      default:
        return jsonResp({ error: `Unhandled template: ${messageTemplate}` }, 400);
    }

    if (!PHONE_REGEX.test(recipientPhone)) {
      return jsonResp({ error: 'Invalid phone number format in profile.' }, 400);
    }

    // --- Durable rate limiting ---
    const userAllowed = await claimRateLimitSlot(adminClient, `sms:user:${user.id}`, 10, 3600);
    if (!userAllowed) {
      return jsonResp({ error: 'SMS rate limit exceeded. Try again later.' }, 429);
    }
    const numberAllowed = await claimRateLimitSlot(adminClient, `sms:number:${recipientPhone}`, 5, 3600);
    if (!numberAllowed) {
      return jsonResp({ error: 'Too many messages to this number.' }, 429);
    }

    // --- Generate message from server-derived template data ---
    const message = templateFn(serverTemplateData);
    if (message.length > MAX_MESSAGE_LENGTH) {
      return jsonResp({ error: 'Generated message exceeds maximum length' }, 400);
    }

    // --- Durable SMS idempotency with claim-token ownership ---
    const recipientRole = recipientPhone === job.requester_phone ? 'requester'
      : (user.id === job.customer_id ? 'provider' : 'customer');
    smsEventKey = `sms:${messageTemplate}:${jobId}:${recipientRole}`;

    // Claim returns UUID token or null
    const { data: claimedToken, error: smsClaimErr } = await adminClient.rpc('claim_notification_delivery', {
      p_event_key: smsEventKey, p_channel: 'sms', p_template: messageTemplate,
    });
    if (smsClaimErr) {
      console.error('[send-sms] Delivery claim failed:', smsClaimErr.message);
      return jsonResp({ error: 'Internal error' }, 500);
    }
    if (!claimedToken) {
      return jsonResp({ success: true, message: 'SMS already sent' }, 200);
    }
    smsClaimToken = claimedToken;

    // --- Send SMS via Twilio (nested try/catch for post-claim safety) ---
    try {
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
        await adminClient.rpc('mark_notification_delivery', {
          p_event_key: smsEventKey, p_claim_token: smsClaimToken, p_status: 'failed',
          p_error_message: `Twilio ${result?.code || res.status}`,
        });
        return jsonResp({ error: 'SMS send failed. Please try again.' }, 500);
      }

      // Mark sent — check ownership
      const { data: finalized } = await adminClient.rpc('mark_notification_delivery', {
        p_event_key: smsEventKey, p_claim_token: smsClaimToken, p_status: 'sent',
        p_external_id: result.sid, p_recipient: recipientPhone,
      });
      if (!finalized) {
        console.error(`[send-sms] RECONCILIATION WARNING: mark_sent returned false for ${smsEventKey} — ownership lost`);
      }

      console.log(`[send-sms] Sent template=${messageTemplate} to=${recipientPhone.slice(0, 6)}***, sid=${result.sid}`);
      return jsonResp({ success: true, sid: result.sid }, 200);
    } catch (sendErr: any) {
      // Network/fetch error after claim — mark failed with owned token for immediate retry
      console.error(`[send-sms] Send error after claim: ${sendErr?.message}`);
      try {
        await adminClient.rpc('mark_notification_delivery', {
          p_event_key: smsEventKey, p_claim_token: smsClaimToken, p_status: 'failed',
          p_error_message: sendErr?.message,
        });
      } catch { /* best effort */ }
      return jsonResp({ error: 'SMS send failed. Please try again.' }, 500);
    }
  } catch (err: any) {
    // Pre-claim errors — no delivery row to clean up
    console.error('[send-sms] Error:', err?.message);
    return jsonResp({ error: 'Internal error' }, 500);
  }
});
