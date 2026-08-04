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
    subject: 'Welcome to TORC! 🎉',
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
            <span class="card-label">🚗</span>
            <span class="card-value">Request help in seconds</span>
          </div>
          <div class="card-row">
            <span class="card-label">📍</span>
            <span class="card-value">Track your provider in real-time</span>
          </div>
          <div class="card-row">
            <span class="card-label">💬</span>
            <span class="card-value">Chat directly with your provider</span>
          </div>
          <div class="card-row">
            <span class="card-label">💳</span>
            <span class="card-value">Secure, cashless payments</span>
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
            <span class="badge badge-pending">⏳ Under Review</span>
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
    subject: 'Your TORC Account is Approved! ✅',
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
            <span class="badge badge-success">✓ Verified Provider</span>
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
            <span class="badge badge-success">✓ Paid</span>
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
  payout: string;
  address: string;
  jobId: string;
  duration?: string;
}): { subject: string; html: string } {
  return {
    subject: `Job Complete — Earned ${data.payout}`,
    html: baseLayout(`
      <div class="header">
        <h1>Job Complete!</h1>
        <p>Great work out there</p>
      </div>
      <div class="body">
        <h2>Nice job, ${data.providerName}!</h2>
        <p>You've successfully completed a service. Here's your earnings summary:</p>

        <div class="card">
          <div style="text-align:center; margin-bottom: 16px;">
            <p class="amount-label">You Earned</p>
            <p class="amount" style="color: #22C55E;">${data.payout}</p>
            <span class="badge badge-success">✓ Completed</span>
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

        <p>Your earnings will be deposited to your linked bank account. Keep up the great work!</p>
        <p style="text-align:center; margin-top: 24px;">
          <a href="https://torcapp.com" class="btn">View Earnings</a>
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

// ─── Template Router ────────────────────────────────────────────────

const ALLOWED_TEMPLATES = [
  'welcome', 'documents_pending', 'document_request',
  'provider_approved', 'provider_suspended',
  'customer_invoice', 'provider_completion',
];

// Templates that only admin/system should send — never ordinary customers/providers
const ADMIN_ONLY_TEMPLATES = new Set([
  'welcome', 'documents_pending', 'document_request',
  'provider_approved', 'provider_suspended',
]);

// Templates tied to a specific job (require job ownership verification)
const JOB_TEMPLATES = new Set(['customer_invoice', 'provider_completion']);

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
    case 'welcome':
      return welcomeEmail(safeData.name || 'there');
    case 'documents_pending':
      return documentsPendingEmail(safeData.name || 'there');
    case 'document_request':
      return documentRequestEmail(safeData.name || 'there', safeData.reason || '');
    case 'provider_approved':
      return providerApprovedEmail(safeData.name || 'there');
    case 'provider_suspended':
      return providerSuspendedEmail(safeData.name || 'there', safeData.reason || '');
    case 'customer_invoice':
      return customerInvoiceEmail(safeData);
    case 'provider_completion':
      return providerCompletionEmail(safeData);
    default:
      throw new Error(`Unknown email template: ${template}`);
  }
}

// ─── Durable rate limiting (database-backed) ────────────────────────

async function checkDurableRateLimit(
  adminClient: any,
  key: string,
  maxCount: number,
  windowSeconds: number
): Promise<boolean> {
  const windowStart = new Date(Date.now() - windowSeconds * 1000).toISOString();

  // Count recent actions in this window
  const { count, error } = await adminClient
    .from('rate_limit_log')
    .select('id', { count: 'exact', head: true })
    .eq('key', key)
    .gte('created_at', windowStart);

  if (error) {
    console.warn('[send-email] Rate limit check failed, allowing:', error.message);
    return true; // Fail open to not block legitimate requests
  }

  if ((count || 0) >= maxCount) return false;

  // Record this action
  await adminClient.from('rate_limit_log').insert({ key, action: 'send_email' });
  return true;
}

// ─── Main Handler ───────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) throw new Error('Email service not configured.');

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

    const { template, data, jobId } = await req.json();

    if (!template) {
      return new Response(JSON.stringify({ error: 'Missing required field: template' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!ALLOWED_TEMPLATES.includes(template)) {
      return new Response(JSON.stringify({ error: `Unknown template: ${template}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!serviceRoleKey) throw new Error('Missing service configuration.');
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // ── Look up caller's role from profile ──────────────────────────
    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    // Do NOT default to 'customer' — null role = no special permissions
    const callerRole = callerProfile?.role || null;

    // ── Template authorization ──────────────────────────────────────
    if (ADMIN_ONLY_TEMPLATES.has(template) && callerRole !== 'admin') {
      console.warn(`[send-email] Unauthorized: ${user.id} (${callerRole}) attempted admin template ${template}`);
      return new Response(JSON.stringify({ error: 'Not authorized to send this email type' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Durable rate limiting ───────────────────────────────────────
    const allowed = await checkDurableRateLimit(adminClient, `email:${user.id}`, 20, 3600);
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again later.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Derive recipient from trusted records ───────────────────────
    let recipient: string;

    if (JOB_TEMPLATES.has(template)) {
      // Job-related templates: require jobId, verify caller is participant, derive recipient from job
      if (!jobId) {
        return new Response(JSON.stringify({ error: 'jobId is required for this template' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: job } = await adminClient
        .from('jobs')
        .select('customer_id, provider_id')
        .eq('id', jobId)
        .maybeSingle();

      if (!job) {
        return new Response(JSON.stringify({ error: 'Job not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify caller is part of this job (or admin)
      if (callerRole !== 'admin' && job.customer_id !== user.id && job.provider_id !== user.id) {
        return new Response(JSON.stringify({ error: 'Not authorized for this job' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Derive recipient: invoice → customer, completion → provider
      const targetId = template === 'customer_invoice' ? job.customer_id : job.provider_id;
      if (!targetId) {
        return new Response(JSON.stringify({ error: 'No target user for this job' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: targetProfile } = await adminClient
        .from('profiles')
        .select('email')
        .eq('id', targetId)
        .maybeSingle();

      if (!targetProfile?.email) {
        return new Response(JSON.stringify({ error: 'Target user email not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      recipient = targetProfile.email;
    } else {
      // Admin-only templates: admin provides targetUserId, recipient derived from DB
      const targetUserId = data?.targetUserId;
      if (!targetUserId) {
        return new Response(JSON.stringify({ error: 'targetUserId is required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: targetProfile } = await adminClient
        .from('profiles')
        .select('email')
        .eq('id', targetUserId)
        .maybeSingle();

      if (!targetProfile?.email) {
        return new Response(JSON.stringify({ error: 'Target user email not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      recipient = targetProfile.email;
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
      body: JSON.stringify({ from: FROM_EMAIL, to: [recipient], subject, html }),
    });

    const result = await res.json();
    if (!res.ok) {
      console.error(`[send-email] Resend error: template=${template}, status=${res.status}`);
      return new Response(JSON.stringify({ error: 'Email send failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[send-email] Sent template=${template}, id=${result.id}`);
    return new Response(JSON.stringify({ success: true, id: result.id }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[send-email] Error:', err?.message);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
