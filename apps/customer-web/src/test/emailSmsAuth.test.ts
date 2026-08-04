/**
 * Negative authorization tests for email/SMS edge functions.
 *
 * Since we cannot call Deno edge functions from jsdom, we replicate the
 * authorization logic from supabase/functions/send-email/index.ts and
 * supabase/functions/send-sms/index.ts as pure-function helpers and test
 * that the authorization checks reject unauthorized requests.
 */
import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Authorization logic extracted from the edge functions
// ---------------------------------------------------------------------------

const ADMIN_ONLY_TEMPLATES = new Set([
  'welcome',
  'documents_pending',
  'document_request',
  'provider_approved',
  'provider_suspended',
]);

const JOB_TEMPLATES = new Set(['customer_invoice', 'provider_completion']);

const ALLOWED_TEMPLATES = [
  'welcome', 'documents_pending', 'document_request',
  'provider_approved', 'provider_suspended',
  'customer_invoice', 'provider_completion',
];

interface EmailAuthCheck {
  callerRole: string | null;
  callerId: string;
  template: string;
  jobId?: string;
  job?: { customer_id: string; provider_id: string } | null;
}

/**
 * Mirrors the authorization checks in send-email/index.ts.
 * Returns { status, error } mimicking HTTP response codes.
 */
function checkEmailAuthorization(params: EmailAuthCheck): { status: number; error?: string } {
  const { callerRole, callerId, template, jobId, job } = params;

  if (!ALLOWED_TEMPLATES.includes(template)) {
    return { status: 400, error: `Unknown template: ${template}` };
  }

  // Admin-only templates require admin role
  if (ADMIN_ONLY_TEMPLATES.has(template) && callerRole !== 'admin') {
    return { status: 403, error: 'Not authorized to send this email type' };
  }

  // Job templates require jobId and job participation
  if (JOB_TEMPLATES.has(template)) {
    if (!jobId) {
      return { status: 400, error: 'jobId is required for this template' };
    }
    if (!job) {
      return { status: 404, error: 'Job not found' };
    }
    if (callerRole !== 'admin' && job.customer_id !== callerId && job.provider_id !== callerId) {
      return { status: 403, error: 'Not authorized for this job' };
    }
  }

  return { status: 200 };
}

// ---------------------------------------------------------------------------
// SMS authorization logic extracted from send-sms/index.ts
// ---------------------------------------------------------------------------

const SMS_TEMPLATES = ['provider_enroute', 'provider_arrived', 'job_completed', 'job_cancelled'];

interface SmsAuthCheck {
  callerId: string;
  messageTemplate: string;
  jobId?: string;
  job?: { customer_id: string; provider_id: string } | null;
}

function checkSmsAuthorization(params: SmsAuthCheck): { status: number; error?: string } {
  const { callerId, messageTemplate, jobId, job } = params;

  if (!messageTemplate) {
    return { status: 400, error: 'messageTemplate is required' };
  }

  if (!SMS_TEMPLATES.includes(messageTemplate)) {
    return { status: 400, error: `Unknown message template: ${messageTemplate}` };
  }

  // Always requires jobId — no arbitrary `to` numbers
  if (!jobId) {
    return { status: 400, error: 'jobId is required' };
  }

  if (!job) {
    return { status: 404, error: 'Job not found' };
  }

  // Caller must be participant in the job
  if (job.customer_id !== callerId && job.provider_id !== callerId) {
    return { status: 403, error: 'Not authorized for this job' };
  }

  return { status: 200 };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Email authorization', () => {
  const CUSTOMER_ID = 'customer-1';
  const PROVIDER_ID = 'provider-1';
  const ADMIN_ID = 'admin-1';
  const OUTSIDER_ID = 'outsider-1';

  const testJob = { customer_id: CUSTOMER_ID, provider_id: PROVIDER_ID };

  describe('admin-only templates', () => {
    const adminTemplates = ['welcome', 'documents_pending', 'document_request', 'provider_approved', 'provider_suspended'];

    adminTemplates.forEach((template) => {
      it(`customer cannot send ${template} template`, () => {
        const result = checkEmailAuthorization({
          callerRole: 'customer',
          callerId: CUSTOMER_ID,
          template,
        });
        expect(result.status).toBe(403);
        expect(result.error).toContain('Not authorized');
      });

      it(`provider cannot send ${template} template`, () => {
        const result = checkEmailAuthorization({
          callerRole: 'provider',
          callerId: PROVIDER_ID,
          template,
        });
        expect(result.status).toBe(403);
      });

      it(`null role cannot send ${template} template`, () => {
        const result = checkEmailAuthorization({
          callerRole: null,
          callerId: OUTSIDER_ID,
          template,
        });
        expect(result.status).toBe(403);
      });

      it(`admin CAN send ${template} template`, () => {
        const result = checkEmailAuthorization({
          callerRole: 'admin',
          callerId: ADMIN_ID,
          template,
        });
        // Should pass authorization (200), not 403
        expect(result.status).not.toBe(403);
      });
    });
  });

  describe('job-scoped templates', () => {
    it('customer cannot send email without jobId for customer_invoice', () => {
      const result = checkEmailAuthorization({
        callerRole: 'customer',
        callerId: CUSTOMER_ID,
        template: 'customer_invoice',
      });
      expect(result.status).toBe(400);
      expect(result.error).toContain('jobId is required');
    });

    it('customer not part of job gets 403', () => {
      const result = checkEmailAuthorization({
        callerRole: 'customer',
        callerId: OUTSIDER_ID,
        template: 'customer_invoice',
        jobId: 'job-1',
        job: testJob,
      });
      expect(result.status).toBe(403);
      expect(result.error).toContain('Not authorized for this job');
    });

    it('customer who IS part of job succeeds', () => {
      const result = checkEmailAuthorization({
        callerRole: 'customer',
        callerId: CUSTOMER_ID,
        template: 'customer_invoice',
        jobId: 'job-1',
        job: testJob,
      });
      expect(result.status).toBe(200);
    });

    it('provider who IS part of job succeeds for provider_completion', () => {
      const result = checkEmailAuthorization({
        callerRole: 'provider',
        callerId: PROVIDER_ID,
        template: 'provider_completion',
        jobId: 'job-1',
        job: testJob,
      });
      expect(result.status).toBe(200);
    });

    it('returns 404 if job not found', () => {
      const result = checkEmailAuthorization({
        callerRole: 'customer',
        callerId: CUSTOMER_ID,
        template: 'customer_invoice',
        jobId: 'nonexistent-job',
        job: null,
      });
      expect(result.status).toBe(404);
    });
  });

  describe('unknown templates', () => {
    it('rejects unknown template', () => {
      const result = checkEmailAuthorization({
        callerRole: 'admin',
        callerId: ADMIN_ID,
        template: 'phishing_attack',
      });
      expect(result.status).toBe(400);
      expect(result.error).toContain('Unknown template');
    });
  });
});

describe('SMS authorization', () => {
  const CUSTOMER_ID = 'customer-1';
  const PROVIDER_ID = 'provider-1';
  const OUTSIDER_ID = 'outsider-1';

  const testJob = { customer_id: CUSTOMER_ID, provider_id: PROVIDER_ID };

  it('requires messageTemplate', () => {
    const result = checkSmsAuthorization({
      callerId: CUSTOMER_ID,
      messageTemplate: '',
    });
    expect(result.status).toBe(400);
    expect(result.error).toContain('messageTemplate is required');
  });

  it('rejects unknown message template', () => {
    const result = checkSmsAuthorization({
      callerId: CUSTOMER_ID,
      messageTemplate: 'spam_everyone',
    });
    expect(result.status).toBe(400);
    expect(result.error).toContain('Unknown message template');
  });

  it('requires jobId (no arbitrary to numbers)', () => {
    const result = checkSmsAuthorization({
      callerId: CUSTOMER_ID,
      messageTemplate: 'provider_enroute',
    });
    expect(result.status).toBe(400);
    expect(result.error).toContain('jobId is required');
  });

  it('returns 404 if job not found', () => {
    const result = checkSmsAuthorization({
      callerId: CUSTOMER_ID,
      messageTemplate: 'provider_enroute',
      jobId: 'nonexistent-job',
      job: null,
    });
    expect(result.status).toBe(404);
  });

  it('caller must be participant in the job', () => {
    const result = checkSmsAuthorization({
      callerId: OUTSIDER_ID,
      messageTemplate: 'provider_enroute',
      jobId: 'job-1',
      job: testJob,
    });
    expect(result.status).toBe(403);
    expect(result.error).toContain('Not authorized for this job');
  });

  it('customer who is participant succeeds', () => {
    const result = checkSmsAuthorization({
      callerId: CUSTOMER_ID,
      messageTemplate: 'job_completed',
      jobId: 'job-1',
      job: testJob,
    });
    expect(result.status).toBe(200);
  });

  it('provider who is participant succeeds', () => {
    const result = checkSmsAuthorization({
      callerId: PROVIDER_ID,
      messageTemplate: 'provider_arrived',
      jobId: 'job-1',
      job: testJob,
    });
    expect(result.status).toBe(200);
  });

  it('all valid SMS templates are accepted for authorized callers', () => {
    const templates = ['provider_enroute', 'provider_arrived', 'job_completed', 'job_cancelled'];

    for (const messageTemplate of templates) {
      const result = checkSmsAuthorization({
        callerId: CUSTOMER_ID,
        messageTemplate,
        jobId: 'job-1',
        job: testJob,
      });
      expect(result.status).toBe(200);
    }
  });
});
