import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'TORC <noreply@torcapp.com>';

// ─── Email Templates ────────────────────────────────────────────────

function baseLayout(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #F5F5F5; }
    .container { max-width: 600px; margin: 0 auto; background: #FFFFFF; }
    .header { background: linear-gradient(135deg, #4ECDC4, #2A9D8F); padding: 32px 24px; text-align: center; }
    .header h1 { color: #FFFFFF; font-size: 28px; margin: 0; font-weight: 700; }
    .header p { color: rgba(255,255,255,0.85); font-size: 14px; margin: 8px 0 0; }
    .body { padding: 32px 24px; }
    .body h2 { color: #1A1F2E; font-size: 22px; margin: 0 0 12px; }
    .body p { color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 16px; }
    .card { background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 16px; padding: 20px; margin: 20px 0; }
    .card-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #F3F4F6; }
    .card-row:last-child { border-bottom: none; }
    .card-label { color: #6B7280; font-size: 13px; }
    .card-value { color: #1A1F2E; font-size: 14px; font-weight: 600; }
    .btn { display: inline-block; background: linear-gradient(135deg, #4ECDC4, #2A9D8F); color: #FFFFFF; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 15px; }
    .footer { padding: 24px; text-align: center; border-top: 1px solid #E5E7EB; }
    .footer p { color: #9CA3AF; font-size: 12px; margin: 0; }
    .amount { font-size: 32px; font-weight: 700; color: #1A1F2E; }
    .amount-label { color: #6B7280; font-size: 13px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
    .badge-success { background: rgba(34,197,94,0.1); color: #22C55E; }
    .badge-pending { background: rgba(245,158,11,0.1); color: #F59E0B; }
    .divider { height: 1px; background: #E5E7EB; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    ${content}
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} TORC Roadside Assistance. All rights reserved.</p>
      <p style="margin-top: 8px;">Need help? Contact us at support@torcapp.com</p>
    </div>
  </div>
</body>
</html>`;
}

function welcomeEmail(name: string): { subject: string; html: string } {
  return {
    subject: 'Welcome to TORC!',
    html: baseLayout(`
      <div class="header">
        <h1>Welcome to TORC</h1>
        <p>Roadside assistance, reimagined</p>
      </div>
      <div class="body">
        <h2>Hey ${name}!</h2>
        <p>Welcome to TORC — your go-to platform for fast, reliable roadside assistance. Whether you need a tow, tire change, jump start, or fuel delivery, we've got you covered.</p>
        <p>Here's what you can do:</p>
        <div class="card">
          <div class="card-row">
            <span class="card-label">Request help in seconds</span>
            <span class="card-value">Fast</span>
          </div>
          <div class="card-row">
            <span class="card-label">Track your provider in real-time</span>
            <span class="card-value">Live GPS</span>
          </div>
          <div class="card-row">
            <span class="card-label">Chat directly with your provider</span>
            <span class="card-value">In-app</span>
          </div>
          <div class="card-row">
            <span class="card-label">Secure, cashless payments</span>
            <span class="card-value">Safe</span>
          </div>
        </div>
        <p>Ready to get started? Open the app and request your first service!</p>
        <p style="text-align:center; margin-top: 24px;">
          <a href="https://torcapp.com" class="btn">Open TORC</a>
        </p>
      </div>
    `),
  };
}

function documentsPendingEmail(name: string): { subject: string; html: string } {
  return {
    subject: 'Documents Under Review — TORC',
    html: baseLayout(`
      <div class="header">
        <h1>Documents Received</h1>
        <p>We're reviewing your submission</p>
      </div>
      <div class="body">
        <h2>Thanks, ${name}!</h2>
        <p>We've received your documents and they are currently under review. This process typically takes 1-2 business days.</p>
        <div class="card">
          <div style="text-align:center; padding: 12px 0;">
            <span class="badge badge-pending">Under Review</span>
          </div>
          <div class="divider"></div>
          <p style="font-size: 13px; color: #6B7280; margin: 8px 0 0; text-align: center;">
            We'll email you as soon as your account is verified and ready to go.
          </p>
        </div>
        <p>In the meantime, make sure your profile information is up to date.</p>
      </div>
    `),
  };
}

function documentRequestEmail(name: string, reason: string): { subject: string; html: string } {
  return {
    subject: 'Action Required: Additional Documents Needed — TORC',
    html: baseLayout(`
      <div class="header">
        <h1>Documents Needed</h1>
        <p>We need a bit more from you</p>
      </div>
      <div class="body">
        <h2>Hi ${name},</h2>
        <p>We've reviewed your application and need additional documentation before we can approve your account.</p>
        <div class="card">
          <p style="font-size: 14px; font-weight: 600; color: #1A1F2E; margin: 0 0 8px;">Reason:</p>
          <p style="font-size: 14px; color: #4B5563; margin: 0;">${reason || 'Please upload clearer copies of your required documents.'}</p>
        </div>
        <p>Please log in to the app and navigate to your profile to upload the requested documents.</p>
        <p style="text-align:center; margin-top: 24px;">
          <a href="https://torcapp.com" class="btn">Upload Documents</a>
        </p>
      </div>
    `),
  };
}

function providerApprovedEmail(name: string): { subject: string; html: string } {
  return {
    subject: 'Your TORC Account is Approved!',
    html: baseLayout(`
      <div class="header">
        <h1>You're Approved!</h1>
        <p>Welcome to the TORC provider network</p>
      </div>
      <div class="body">
        <h2>Congratulations, ${name}!</h2>
        <p>Your provider application has been reviewed and approved. You can now start accepting service requests and earning money on the TORC platform.</p>
        <div class="card">
          <div style="text-align:center; padding: 12px 0;">
            <span class="badge badge-success">Verified Provider</span>
          </div>
          <div class="divider"></div>
          <div class="card-row">
            <span class="card-label">Next Steps</span>
            <span class="card-value">Go online & start earning</span>
          </div>
          <div class="card-row">
            <span class="card-label">Set Up Payouts</span>
            <span class="card-value">Add your bank details</span>
          </div>
        </div>
        <p>Open the app to go online and start receiving job requests in your area!</p>
        <p style="text-align:center; margin-top: 24px;">
          <a href="https://torcapp.com" class="btn">Open TORC</a>
        </p>
      </div>
    `),
  };
}

function providerSuspendedEmail(name: string, reason: string): { subject: string; html: string } {
  return {
    subject: 'Account Suspended — TORC',
    html: baseLayout(`
      <div class="header" style="background: linear-gradient(135deg, #EF4444, #DC2626);">
        <h1>Account Suspended</h1>
        <p>Action required to restore your account</p>
      </div>
      <div class="body">
        <h2>Hi ${name},</h2>
        <p>Your TORC provider account has been suspended and you will not be able to receive new service requests until this is resolved.</p>
        <div class="card">
          <p style="font-size: 14px; font-weight: 600; color: #1A1F2E; margin: 0 0 8px;">Reason:</p>
          <p style="font-size: 14px; color: #4B5563; margin: 0;">${reason || 'Your account has been suspended. Please contact support for more information.'}</p>
        </div>
        <p>To restore your account, please address the issue above and contact our support team or update your documents in the app.</p>
        <p style="text-align:center; margin-top: 24px;">
          <a href="https://torcapp.com" class="btn">Open TORC</a>
        </p>
      </div>
    `),
  };
}

function customerInvoiceEmail(data: {
  customerName: string;
  serviceName: string;
  providerName: string;
  date: string;
  amount: string;
  address: string;
  jobId: string;
  paymentMethod?: string;
}): { subject: string; html: string } {
  return {
    subject: `Service Complete — Invoice #${data.jobId.slice(0, 8).toUpperCase()}`,
    html: baseLayout(`
      <div class="header">
        <h1>Service Complete</h1>
        <p>Thank you for using TORC</p>
      </div>
      <div class="body">
        <h2>Hi ${data.customerName},</h2>
        <p>Your service has been completed. Here's your invoice summary:</p>

        <div class="card">
          <div style="text-align:center; margin-bottom: 16px;">
            <p class="amount-label">Total Charged</p>
            <p class="amount">${data.amount}</p>
            <span class="badge badge-success">Paid</span>
          </div>
          <div class="divider"></div>
          <div class="card-row">
            <span class="card-label">Service</span>
            <span class="card-value">${data.serviceName}</span>
          </div>
          <div class="card-row">
            <span class="card-label">Provider</span>
            <span class="card-value">${data.providerName}</span>
          </div>
          <div class="card-row">
            <span class="card-label">Location</span>
            <span class="card-value">${data.address}</span>
          </div>
          <div class="card-row">
            <span class="card-label">Date</span>
            <span class="card-value">${data.date}</span>
          </div>
          <div class="card-row">
            <span class="card-label">Invoice #</span>
            <span class="card-value">${data.jobId.slice(0, 8).toUpperCase()}</span>
          </div>
          ${data.paymentMethod ? `<div class="card-row">
            <span class="card-label">Payment</span>
            <span class="card-value">${data.paymentMethod}</span>
          </div>` : ''}
        </div>

        <p>If you have any questions about this charge, please contact our support team.</p>
        <p style="text-align:center; margin-top: 24px;">
          <a href="https://torcapp.com" class="btn">Rate Your Provider</a>
        </p>
      </div>
    `),
  };
}

function providerCompletionEmail(data: {
  providerName: string;
  customerName: string;
  serviceName: string;
  date: string;
  address: string;
  jobId: string;
  duration?: string;
}): { subject: string; html: string } {
  return {
    subject: `Job Complete — TORC`,
    html: baseLayout(`
      <div class="header">
        <h1>Job Complete!</h1>
        <p>Great work out there</p>
      </div>
      <div class="body">
        <h2>Nice job, ${data.providerName}!</h2>
        <p>Your job has been completed successfully.</p>

        <div class="card">
          <div style="text-align:center; margin-bottom: 16px;">
            <span class="badge badge-success">Completed</span>
          </div>
          <div class="divider"></div>
          <div class="card-row">
            <span class="card-label">Service</span>
            <span class="card-value">${data.serviceName}</span>
          </div>
          <div class="card-row">
            <span class="card-label">Customer</span>
            <span class="card-value">${data.customerName}</span>
          </div>
          <div class="card-row">
            <span class="card-label">Location</span>
            <span class="card-value">${data.address}</span>
          </div>
          <div class="card-row">
            <span class="card-label">Date</span>
            <span class="card-value">${data.date}</span>
          </div>
          ${data.duration ? `<div class="card-row">
            <span class="card-label">Duration</span>
            <span class="card-value">${data.duration}</span>
          </div>` : ''}
          <div class="card-row">
            <span class="card-label">Job #</span>
            <span class="card-value">${data.jobId.slice(0, 8).toUpperCase()}</span>
          </div>
        </div>

        <p>View your earnings dashboard for payout details. Keep up the great work!</p>
        <p style="text-align:center; margin-top: 24px;">
          <a href="https://torcapp.com" class="btn">View Dashboard</a>
        </p>
      </div>
    `),
  };
}

// ─── HTML escaping to prevent XSS in email templates ────────────────
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── Durable notification delivery (claim/mark pattern) ─────────────

/** Claim delivery — returns UUID token on success, null if already sent/in-progress */
async function claimDelivery(adminClient: any, eventKey: string, template: string): Promise<string | null> {
  const { data, error } = await adminClient.rpc('claim_notification_delivery', {
    p_event_key: eventKey,
    p_channel: 'email',
    p_template: template,
  });
  if (error) {
    console.error('[send-email] Delivery claim failed, blocking:', error.message);
    return null;
  }
  // RPC returns UUID or null
  return data || null;
}

/** Mark delivery — requires the claim token for ownership. Returns true if this token owns the claim. */
async function markDelivery(
  adminClient: any, eventKey: string, claimToken: string, status: 'sent' | 'failed',
  externalId?: string, errorMessage?: string, recipient?: string
): Promise<boolean> {
  const { data, error } = await adminClient.rpc('mark_notification_delivery', {
    p_event_key: eventKey,
    p_claim_token: claimToken,
    p_status: status,
    p_external_id: externalId || null,
    p_error_message: errorMessage || null,
    p_recipient: recipient || null,
  });
  if (error) {
    console.warn('[send-email] Mark delivery failed:', error.message);
    return false;
  }
  return data === true;
}

// ─── Rate limiting (still used for abuse protection, not idempotency) ─

async function claimRateLimitSlot(adminClient: any, key: string, max: number, window: number): Promise<boolean> {
  const { data, error } = await adminClient.rpc('claim_rate_limit_slot', {
    p_key: key, p_max_count: max, p_window_seconds: window,
  });
  if (error) { console.error('[send-email] Rate limit failed, blocking:', error.message); return false; }
  return data === true;
}

// ─── Helpers ────────────────────────────────────────────────────────

function jsonResp(body: Record<string, any>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Load profile name in "FirstName L." format
async function loadProfileName(adminClient: any, userId: string): Promise<string> {
  const { data } = await adminClient
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', userId)
    .maybeSingle();
  if (!data) return 'there';
  const first = data.first_name || '';
  const last = data.last_name ? `${data.last_name.charAt(0)}.` : '';
  return `${first} ${last}`.trim() || 'there';
}

// Format date for display
function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'N/A';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return 'N/A';
  }
}

// Calculate duration between two timestamps
function calcDuration(startedAt: string | null, completedAt: string | null): string | undefined {
  if (!startedAt || !completedAt) return undefined;
  try {
    const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
    if (ms <= 0) return undefined;
    const mins = Math.round(ms / 60000);
    if (mins < 60) return `${mins} min`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
  } catch {
    return undefined;
  }
}

// ─── Template categories ────────────────────────────────────────────

const ALLOWED_TEMPLATES = [
  'welcome', 'documents_pending', 'document_request',
  'provider_approved', 'provider_suspended',
  'customer_invoice', 'provider_completion',
];

// Admin-only: only admin can trigger these
const ADMIN_ONLY_TEMPLATES = new Set([
  'document_request', 'provider_approved', 'provider_suspended',
]);

// Job-based templates: require jobId, status=completed, derive all content
const JOB_TEMPLATES = new Set(['customer_invoice', 'provider_completion']);

// Self-service templates: authenticated user triggers for themselves only
const SELF_SERVICE_TEMPLATES = new Set(['welcome', 'documents_pending']);

// ─── Main Handler ───────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Declare cleanup state BEFORE try so catch can access them
  let adminClient: any = null;
  let deliveryEventKey: string | null = null;
  let deliveryClaimToken: string | null = null;

  try {
    if (!RESEND_API_KEY) throw new Error('Email service not configured.');

    // ── Authentication ──────────────────────────────────────────────
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

    const { template, data, jobId } = await req.json();

    if (!template) {
      return jsonResp({ error: 'Missing required field: template' }, 400);
    }
    if (!ALLOWED_TEMPLATES.includes(template)) {
      return jsonResp({ error: `Unknown template: ${template}` }, 400);
    }

    if (!serviceRoleKey) throw new Error('Missing service configuration.');
    adminClient = createClient(supabaseUrl, serviceRoleKey);

    // ── Load caller profile ─────────────────────────────────────────
    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('role, first_name, last_name, email, phone')
      .eq('id', user.id)
      .maybeSingle();

    const callerRole = callerProfile?.role || null;

    // ── Durable rate limiting (per-user) ────────────────────────────
    const allowed = await claimRateLimitSlot(adminClient, `email:${user.id}`, 20, 3600);
    if (!allowed) {
      return jsonResp({ error: 'Rate limit exceeded. Try again later.' }, 429);
    }

    // ── Route by template category ──────────────────────────────────

    let recipient: string;
    let emailContent: { subject: string; html: string };

    // ─────────────────────────────────────────────────────────────────
    // ADMIN-ONLY TEMPLATES
    // ─────────────────────────────────────────────────────────────────
    if (ADMIN_ONLY_TEMPLATES.has(template)) {
      if (callerRole !== 'admin') {
        console.warn(`[send-email] Unauthorized: ${user.id} (${callerRole}) attempted admin template ${template}`);
        return jsonResp({ error: 'Not authorized to send this email type' }, 403);
      }

      const targetUserId = data?.targetUserId;
      if (!targetUserId) {
        return jsonResp({ error: 'targetUserId is required' }, 400);
      }

      const { data: targetProfile } = await adminClient
        .from('profiles')
        .select('email, first_name, last_name')
        .eq('id', targetUserId)
        .maybeSingle();

      if (!targetProfile?.email) {
        return jsonResp({ error: 'Target user email not found' }, 404);
      }
      recipient = targetProfile.email;

      const targetName = escapeHtml(
        targetProfile.first_name
          ? `${targetProfile.first_name} ${targetProfile.last_name ? targetProfile.last_name.charAt(0) + '.' : ''}`.trim()
          : 'there'
      );

      switch (template) {
        case 'document_request':
          emailContent = documentRequestEmail(targetName, escapeHtml(data?.reason || ''));
          break;
        case 'provider_approved':
          emailContent = providerApprovedEmail(targetName);
          break;
        case 'provider_suspended':
          emailContent = providerSuspendedEmail(targetName, escapeHtml(data?.reason || ''));
          break;
        default:
          return jsonResp({ error: `Unhandled admin template: ${template}` }, 400);
      }
    }

    // ─────────────────────────────────────────────────────────────────
    // SELF-SERVICE: welcome
    // ─────────────────────────────────────────────────────────────────
    else if (template === 'welcome') {
      // Validate FIRST — before claiming
      recipient = callerProfile?.email || user.email || '';
      if (!recipient) {
        return jsonResp({ error: 'No email address found for your account' }, 400);
      }
      const name = escapeHtml(callerProfile?.first_name || user.user_metadata?.first_name || 'there');
      emailContent = welcomeEmail(name);

      // Claim AFTER validation — exactly once per user, permanent
      deliveryEventKey = `welcome:${user.id}`;
      deliveryClaimToken = await claimDelivery(adminClient, deliveryEventKey, 'welcome');
      if (!deliveryClaimToken) {
        return jsonResp({ success: true, message: 'Welcome email already sent' }, 200);
      }
    }

    // ─────────────────────────────────────────────────────────────────
    // SELF-SERVICE: documents_pending
    // ─────────────────────────────────────────────────────────────────
    else if (template === 'documents_pending') {
      // Caller must be a provider
      if (callerRole !== 'provider') {
        return jsonResp({ error: 'Only providers can trigger document notifications' }, 403);
      }

      // Verify actual document state and get ALL pending documents for cycle identity
      const { data: pendingDocs, error: docErr } = await adminClient
        .from('documents')
        .select('id, updated_at')
        .eq('provider_id', user.id)
        .eq('status', 'pending')
        .order('id', { ascending: true });

      if (docErr || !pendingDocs || pendingDocs.length === 0) {
        return jsonResp({ error: 'No pending documents found for your account' }, 400);
      }

      // Validate recipient BEFORE claiming
      recipient = callerProfile?.email || user.email || '';
      if (!recipient) {
        return jsonResp({ error: 'No email address found for your account' }, 400);
      }
      const name = escapeHtml(callerProfile?.first_name || 'there');
      emailContent = documentsPendingEmail(name);

      // Build deterministic cycle identity from ALL pending (id, updated_at) pairs.
      // Same exact submission → same key. Reupload/update → different key.
      const canonicalPairs = pendingDocs
        .map((d: any) => `${d.id}:${d.updated_at}`)
        .join('|');
      // SHA-256 hash for a stable, fixed-length key
      const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalPairs));
      const cycleHash = [...new Uint8Array(hashBuffer)].map(b => b.toString(16).padStart(2, '0')).join('');
      deliveryEventKey = `documents_pending:${user.id}:${cycleHash}`;
      deliveryClaimToken = await claimDelivery(adminClient, deliveryEventKey, 'documents_pending');
      if (!deliveryClaimToken) {
        return jsonResp({ success: true, message: 'Documents pending email already sent for this submission' }, 200);
      }
    }

    // ─────────────────────────────────────────────────────────────────
    // JOB TEMPLATES: customer_invoice, provider_completion
    // ─────────────────────────────────────────────────────────────────
    else if (JOB_TEMPLATES.has(template)) {
      if (!jobId) {
        return jsonResp({ error: 'jobId is required for this template' }, 400);
      }

      // Load full job record (provider_payout does not exist in schema — omitted)
      const { data: job } = await adminClient
        .from('jobs')
        .select('id, customer_id, provider_id, service_id, status, pickup_address, total_amount, completed_at, started_at')
        .eq('id', jobId)
        .maybeSingle();

      if (!job) {
        return jsonResp({ error: 'Job not found' }, 404);
      }

      // Job MUST be completed
      if (job.status !== 'completed') {
        return jsonResp({ error: 'Job is not completed. Cannot send completion email.' }, 400);
      }

      // Caller must be a participant
      if (job.customer_id !== user.id && job.provider_id !== user.id) {
        return jsonResp({ error: 'Not authorized for this job' }, 403);
      }

      // Load profiles and service name in parallel (BEFORE claiming)
      const [customerProfile, providerProfile, serviceRecord] = await Promise.all([
        job.customer_id
          ? adminClient.from('profiles').select('first_name, last_name, email').eq('id', job.customer_id).maybeSingle().then((r: any) => r.data)
          : null,
        job.provider_id
          ? adminClient.from('profiles').select('first_name, last_name, email').eq('id', job.provider_id).maybeSingle().then((r: any) => r.data)
          : null,
        job.service_id
          ? adminClient.from('services').select('name').eq('id', job.service_id).maybeSingle().then((r: any) => r.data)
          : null,
      ]);

      const customerName = customerProfile
        ? escapeHtml(`${customerProfile.first_name || ''} ${customerProfile.last_name ? customerProfile.last_name.charAt(0) + '.' : ''}`.trim() || 'Customer')
        : 'Customer';
      const providerName = providerProfile
        ? escapeHtml(`${providerProfile.first_name || ''} ${providerProfile.last_name ? providerProfile.last_name.charAt(0) + '.' : ''}`.trim() || 'Provider')
        : 'Provider';
      const serviceName = escapeHtml(serviceRecord?.name || 'Roadside Service');
      const address = escapeHtml(job.pickup_address || 'N/A');
      const date = formatDate(job.completed_at);
      const duration = calcDuration(job.started_at, job.completed_at);
      const totalAmount = job.total_amount ? `$${Number(job.total_amount).toFixed(2)}` : '$0.00';

      if (template === 'customer_invoice') {
        // Recipient: customer
        if (!customerProfile?.email) {
          return jsonResp({ error: 'Customer email not found' }, 404);
        }
        recipient = customerProfile.email;

        emailContent = customerInvoiceEmail({
          customerName,
          serviceName,
          providerName,
          date,
          amount: totalAmount,
          address,
          jobId: job.id,
        });
      } else {
        // provider_completion — recipient: provider
        if (!providerProfile?.email) {
          return jsonResp({ error: 'Provider email not found' }, 404);
        }
        recipient = providerProfile.email;

        // No trusted provider_payout column exists — neutral completion email
        emailContent = providerCompletionEmail({
          providerName,
          customerName,
          serviceName,
          date,
          address,
          jobId: job.id,
          duration,
        });
      }

      // Claim AFTER all validation and content derivation — just before send
      deliveryEventKey = `${template}:${jobId}`;
      deliveryClaimToken = await claimDelivery(adminClient, deliveryEventKey, template);
      if (!deliveryClaimToken) {
        return jsonResp({ success: true, message: 'This email has already been sent' }, 200);
      }
    } else {
      return jsonResp({ error: `Unhandled template: ${template}` }, 400);
    }

    // ── Send via Resend (nested try/catch for post-claim safety) ────
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: FROM_EMAIL, to: [recipient], subject: emailContent!.subject, html: emailContent!.html }),
      });

      const result = await res.json();
      if (!res.ok) {
        console.error(`[send-email] Resend error: template=${template}, status=${res.status}`);
        if (deliveryEventKey && deliveryClaimToken) {
          await markDelivery(adminClient, deliveryEventKey, deliveryClaimToken, 'failed', undefined, `Resend HTTP ${res.status}`, recipient);
        }
        return jsonResp({ error: 'Email send failed' }, 500);
      }

      // Mark sent with ownership token
      if (deliveryEventKey && deliveryClaimToken) {
        const finalized = await markDelivery(adminClient, deliveryEventKey, deliveryClaimToken, 'sent', result.id, undefined, recipient);
        if (!finalized) {
          console.error(`[send-email] RECONCILIATION WARNING: mark_sent returned false for ${deliveryEventKey} — ownership lost, external send may have completed`);
        }
      }

      console.log(`[send-email] Sent template=${template}, id=${result.id}`);
      return jsonResp({ success: true, id: result.id }, 200);
    } catch (sendErr: any) {
      // Network/fetch/JSON error after claim — mark failed with owned token
      console.error(`[send-email] Send error after claim: ${sendErr?.message}`);
      if (deliveryEventKey && deliveryClaimToken) {
        try {
          await markDelivery(adminClient, deliveryEventKey, deliveryClaimToken, 'failed', undefined, sendErr?.message);
        } catch { /* best effort */ }
      }
      return jsonResp({ error: 'Email send failed' }, 500);
    }
  } catch (err: any) {
    // Pre-claim errors (auth, validation, etc.) — no delivery row to clean up
    console.error('[send-email] Error:', err?.message);
    return jsonResp({ error: 'Internal error' }, 500);
  }
});
