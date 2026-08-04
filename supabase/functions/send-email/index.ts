import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── CORS with origin allowlist (configurable via ALLOWED_ORIGINS env var) ───
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

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'TORC <noreply@torcapp.com>';

// ─── HTML escaping to prevent XSS in email templates ────────────────
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── Template allowlist and authorization rules ─────────────────────
// Maps template name to: which roles can send it, and whether recipients
// must be derived from platform records (not caller-supplied).
const TEMPLATE_RULES: Record<string, {
  allowedRoles: string[];
  deriveRecipient: boolean;
  requiredData: string[];
}> = {
  welcome:             { allowedRoles: ['admin', 'system'], deriveRecipient: true, requiredData: ['name'] },
  documents_pending:   { allowedRoles: ['admin', 'system'], deriveRecipient: true, requiredData: ['name'] },
  document_request:    { allowedRoles: ['admin'],           deriveRecipient: true, requiredData: ['name'] },
  provider_approved:   { allowedRoles: ['admin', 'system'], deriveRecipient: true, requiredData: ['name'] },
  provider_suspended:  { allowedRoles: ['admin'],           deriveRecipient: true, requiredData: ['name'] },
  customer_invoice:    { allowedRoles: ['admin', 'system', 'customer', 'provider'], deriveRecipient: true, requiredData: ['jobId'] },
  provider_completion: { allowedRoles: ['admin', 'system', 'customer', 'provider'], deriveRecipient: true, requiredData: ['jobId'] },
  payout_paid:         { allowedRoles: ['admin', 'system'], deriveRecipient: true, requiredData: ['providerName', 'amount'] },
  password_changed:    { allowedRoles: ['admin', 'system', 'customer', 'provider'], deriveRecipient: false, requiredData: ['name'] },
};

// ─── Rate limiting (in-memory per instance, resets on cold start) ───
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 20;      // max emails per user per window
const RATE_LIMIT_WINDOW = 3600000; // 1 hour

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }
  entry.count++;
  return true;
}

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
      <div class="header"><h1>Welcome to TORC</h1><p>Roadside assistance, reimagined</p></div>
      <div class="body">
        <h2>Hey ${name}!</h2>
        <p>Welcome to TORC — your go-to platform for fast, reliable roadside assistance.</p>
        <div class="card">
          <div class="card-row"><span class="card-label">Request help in seconds</span></div>
          <div class="card-row"><span class="card-label">Track your provider in real-time</span></div>
          <div class="card-row"><span class="card-label">Chat directly with your provider</span></div>
          <div class="card-row"><span class="card-label">Secure, cashless payments</span></div>
        </div>
        <p style="text-align:center; margin-top: 24px;"><a href="https://torcapp.com" class="btn">Open TORC</a></p>
      </div>`),
  };
}

function documentsPendingEmail(name: string): { subject: string; html: string } {
  return {
    subject: 'Documents Under Review — TORC',
    html: baseLayout(`
      <div class="header"><h1>Documents Received</h1><p>We're reviewing your submission</p></div>
      <div class="body">
        <h2>Thanks, ${name}!</h2>
        <p>We've received your documents and they are currently under review. This typically takes 1-2 business days.</p>
        <div class="card"><div style="text-align:center; padding: 12px 0;"><span class="badge badge-pending">Under Review</span></div></div>
      </div>`),
  };
}

function documentRequestEmail(name: string, reason: string): { subject: string; html: string } {
  return {
    subject: 'Action Required: Additional Documents Needed — TORC',
    html: baseLayout(`
      <div class="header"><h1>Documents Needed</h1></div>
      <div class="body">
        <h2>Hi ${name},</h2>
        <p>We need additional documentation before we can approve your account.</p>
        <div class="card"><p style="font-size: 14px; font-weight: 600; color: #1A1F2E; margin: 0 0 8px;">Reason:</p><p style="font-size: 14px; color: #4B5563; margin: 0;">${reason || 'Please upload clearer copies of your required documents.'}</p></div>
        <p style="text-align:center; margin-top: 24px;"><a href="https://torcapp.com" class="btn">Upload Documents</a></p>
      </div>`),
  };
}

function providerApprovedEmail(name: string): { subject: string; html: string } {
  return {
    subject: 'Your TORC Account is Approved!',
    html: baseLayout(`
      <div class="header"><h1>You're Approved!</h1></div>
      <div class="body">
        <h2>Congratulations, ${name}!</h2>
        <p>Your provider application has been approved. You can now start accepting service requests.</p>
        <div class="card"><div style="text-align:center;"><span class="badge badge-success">Verified Provider</span></div></div>
        <p style="text-align:center; margin-top: 24px;"><a href="https://torcapp.com" class="btn">Open TORC</a></p>
      </div>`),
  };
}

function providerSuspendedEmail(name: string, reason: string): { subject: string; html: string } {
  return {
    subject: 'Account Suspended — TORC',
    html: baseLayout(`
      <div class="header" style="background: linear-gradient(135deg, #EF4444, #DC2626);"><h1>Account Suspended</h1></div>
      <div class="body">
        <h2>Hi ${name},</h2>
        <p>Your TORC provider account has been suspended.</p>
        <div class="card"><p style="font-size: 14px; font-weight: 600; color: #1A1F2E; margin: 0 0 8px;">Reason:</p><p style="font-size: 14px; color: #4B5563; margin: 0;">${reason || 'Please contact support for more information.'}</p></div>
      </div>`),
  };
}

function customerInvoiceEmail(data: Record<string, any>): { subject: string; html: string } {
  return {
    subject: `Service Complete — Invoice #${(data.jobId || '').slice(0, 8).toUpperCase()}`,
    html: baseLayout(`
      <div class="header"><h1>Service Complete</h1></div>
      <div class="body">
        <h2>Hi ${data.customerName},</h2>
        <p>Your service has been completed. Here's your invoice:</p>
        <div class="card">
          <div style="text-align:center; margin-bottom: 16px;"><p class="amount">${data.amount}</p><span class="badge badge-success">Paid</span></div>
          <div class="divider"></div>
          <div class="card-row"><span class="card-label">Service</span><span class="card-value">${data.serviceName}</span></div>
          <div class="card-row"><span class="card-label">Provider</span><span class="card-value">${data.providerName}</span></div>
          <div class="card-row"><span class="card-label">Location</span><span class="card-value">${data.address}</span></div>
          <div class="card-row"><span class="card-label">Date</span><span class="card-value">${data.date}</span></div>
        </div>
      </div>`),
  };
}

function providerCompletionEmail(data: Record<string, any>): { subject: string; html: string } {
  return {
    subject: `Job Complete — Earned ${data.payout}`,
    html: baseLayout(`
      <div class="header"><h1>Job Complete!</h1></div>
      <div class="body">
        <h2>Nice job, ${data.providerName}!</h2>
        <div class="card">
          <div style="text-align:center;"><p class="amount" style="color: #22C55E;">${data.payout}</p><span class="badge badge-success">Completed</span></div>
          <div class="divider"></div>
          <div class="card-row"><span class="card-label">Service</span><span class="card-value">${data.serviceName}</span></div>
          <div class="card-row"><span class="card-label">Customer</span><span class="card-value">${data.customerName}</span></div>
          <div class="card-row"><span class="card-label">Location</span><span class="card-value">${data.address}</span></div>
        </div>
      </div>`),
  };
}

function payoutPaidEmail(data: Record<string, any>): { subject: string; html: string } {
  return {
    subject: `Your Payout Has Been Processed — ${data.amount}`,
    html: baseLayout(`
      <div class="header"><h1>Payout Processed</h1></div>
      <div class="body">
        <h2>Hi ${data.providerName},</h2>
        <div class="card">
          <div style="text-align:center;"><p class="amount" style="color: #22C55E;">${data.amount}</p><span class="badge badge-success">Paid</span></div>
          <div class="divider"></div>
          <div class="card-row"><span class="card-label">Reference</span><span class="card-value">${data.referenceId}</span></div>
          <div class="card-row"><span class="card-label">Date</span><span class="card-value">${data.paidAt}</span></div>
        </div>
      </div>`),
  };
}

function passwordChangedEmail(data: Record<string, any>): { subject: string; html: string } {
  return {
    subject: 'Your Password Has Been Changed — TORC',
    html: baseLayout(`
      <div class="header" style="background: linear-gradient(135deg, #F59E0B, #D97706);"><h1>Password Changed</h1></div>
      <div class="body">
        <h2>Hi ${data.name},</h2>
        <p>Your TORC account password was successfully changed.</p>
        <div class="card">
          <div class="card-row"><span class="card-label">Date</span><span class="card-value">${data.changedAt}</span></div>
        </div>
        <div class="card" style="background: rgba(245,158,11,0.08); border-color: rgba(245,158,11,0.3);">
          <p style="font-size: 14px; font-weight: 600; color: #D97706; margin: 0 0 8px;">Didn't make this change?</p>
          <p style="font-size: 13px; color: #4B5563; margin: 0;">Contact support immediately at support@torcapp.com</p>
        </div>
      </div>`),
  };
}

// ─── Template Router ────────────────────────────────────────────────

function getEmailContent(
  template: string,
  data: Record<string, any>
): { subject: string; html: string } {
  // Escape all string values to prevent XSS in email templates
  const safeData: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    safeData[key] = typeof value === 'string' ? escapeHtml(value) : value;
  }

  switch (template) {
    case 'welcome':            return welcomeEmail(safeData.name || 'there');
    case 'documents_pending':  return documentsPendingEmail(safeData.name || 'there');
    case 'document_request':   return documentRequestEmail(safeData.name || 'there', safeData.reason || '');
    case 'provider_approved':  return providerApprovedEmail(safeData.name || 'there');
    case 'provider_suspended': return providerSuspendedEmail(safeData.name || 'there', safeData.reason || '');
    case 'customer_invoice':   return customerInvoiceEmail(safeData);
    case 'provider_completion':return providerCompletionEmail(safeData);
    case 'payout_paid':        return payoutPaidEmail(safeData);
    case 'password_changed':   return passwordChangedEmail(safeData);
    default:
      throw new Error(`Unknown email template: ${template}`);
  }
}

// ─── Validate email address format ──────────────────────────────────
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email) && email.length <= 254;
}

// ─── Main Handler ───────────────────────────────────────────────────

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) {
      throw new Error('Email service not configured.');
    }

    // ── Authentication ──────────────────────────────────────────────
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

    // ── Rate limiting ───────────────────────────────────────────────
    if (!checkRateLimit(user.id)) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Try again later.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Process request ─────────────────────────────────────────────
    const { to, template, data, targetUserId, jobId } = await req.json();

    if (!template) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: template' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Template authorization ──────────────────────────────────────
    const rules = TEMPLATE_RULES[template];
    if (!rules) {
      return new Response(
        JSON.stringify({ error: `Unknown template: ${template}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Look up user's role
    const adminClient = serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;
    const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    const callerRole = callerProfile?.role || 'customer';

    if (!rules.allowedRoles.includes(callerRole)) {
      console.warn(`[send-email] Unauthorized: user ${user.id} (${callerRole}) attempted template ${template}`);
      return new Response(
        JSON.stringify({ error: 'Not authorized to send this email type' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Validate required data fields ───────────────────────────────
    for (const field of rules.requiredData) {
      if (!data?.[field] && field !== 'jobId' && field !== 'name') {
        return new Response(
          JSON.stringify({ error: `Missing required data field: ${field}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ── Derive recipient from platform records when required ────────
    let recipients: string[];

    if (rules.deriveRecipient && adminClient) {
      // Derive recipient from targetUserId or jobId, not from caller-supplied `to`
      if (targetUserId) {
        const { data: targetProfile } = await adminClient.from('profiles').select('email').eq('id', targetUserId).maybeSingle();
        if (!targetProfile?.email) {
          return new Response(JSON.stringify({ error: 'Target user email not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        recipients = [targetProfile.email];
      } else if (jobId) {
        // Derive from job record
        const { data: job } = await adminClient.from('jobs').select('customer_id, provider_id').eq('id', jobId).maybeSingle();
        if (!job) {
          return new Response(JSON.stringify({ error: 'Job not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const targetId = template.startsWith('provider_') || template === 'payout_paid'
          ? job.provider_id
          : job.customer_id;
        if (!targetId) {
          return new Response(JSON.stringify({ error: 'No target user for this job' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const { data: targetProfile } = await adminClient.from('profiles').select('email').eq('id', targetId).maybeSingle();
        if (!targetProfile?.email) {
          return new Response(JSON.stringify({ error: 'Target user email not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        recipients = [targetProfile.email];
      } else if (to) {
        // Fallback: admin-role callers can still provide 'to' directly
        if (callerRole !== 'admin') {
          return new Response(JSON.stringify({ error: 'Non-admin callers must specify targetUserId or jobId' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        recipients = Array.isArray(to) ? to : [to];
      } else {
        return new Response(JSON.stringify({ error: 'Missing targetUserId, jobId, or to' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    } else {
      // Templates that don't derive recipients (e.g., password_changed to self)
      if (!to) {
        return new Response(JSON.stringify({ error: 'Missing required field: to' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      recipients = Array.isArray(to) ? to : [to];

      // Non-admin users can only send to their own email for non-derived templates
      if (callerRole !== 'admin') {
        recipients = recipients.filter(email => email === user.email);
        if (recipients.length === 0) {
          return new Response(JSON.stringify({ error: 'Can only send to your own email address' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }
    }

    // ── Validate email addresses ────────────────────────────────────
    for (const email of recipients) {
      if (!isValidEmail(email)) {
        return new Response(JSON.stringify({ error: `Invalid email address: ${email}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // ── Limit recipients ────────────────────────────────────────────
    if (recipients.length > 10) {
      return new Response(JSON.stringify({ error: 'Too many recipients (max 10)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── Generate email content ──────────────────────────────────────
    const { subject, html } = getEmailContent(template, data || {});

    // ── Send via Resend ─────────────────────────────────────────────
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM_EMAIL, to: recipients, subject, html }),
    });

    const result = await res.json();

    if (!res.ok) {
      console.error(`[send-email] Resend error: template=${template}, status=${res.status}`);
      return new Response(
        JSON.stringify({ error: 'Email send failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[send-email] Sent template=${template} to=${recipients.length} recipients, id=${result.id}`);

    return new Response(
      JSON.stringify({ success: true, id: result.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[send-email] Error:', err?.message);
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
