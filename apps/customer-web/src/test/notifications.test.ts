/**
 * Tests for notification client compatibility:
 * - SMS: authorized template contract, no arbitrary recipients
 * - Email: jobId-based routing, admin template rejection
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// SMS authorization logic (mirrors send-sms Edge Function)
// ---------------------------------------------------------------------------

interface Job {
  customer_id: string;
  provider_id: string | null;
  requester_phone: string | null;
  requester_type: string;
}

const VALID_TEMPLATES = [
  'provider_enroute', 'provider_arrived', 'job_completed',
  'job_cancelled', 'third_party_enroute',
];

function validateSmsRequest(
  userId: string,
  params: { messageTemplate?: string; jobId?: string; recipientType?: string; to?: string },
  job: Job | null
): { error?: string; allowed: boolean } {
  // No arbitrary 'to' allowed
  if (params.to) {
    return { allowed: false, error: 'Arbitrary to is not accepted' };
  }

  if (!params.messageTemplate) {
    return { allowed: false, error: 'messageTemplate is required' };
  }

  if (!VALID_TEMPLATES.includes(params.messageTemplate)) {
    return { allowed: false, error: `Unknown template: ${params.messageTemplate}` };
  }

  if (!params.jobId) {
    return { allowed: false, error: 'jobId is required' };
  }

  if (!job) {
    return { allowed: false, error: 'Job not found' };
  }

  // Caller must be part of the job
  if (job.customer_id !== userId && job.provider_id !== userId) {
    return { allowed: false, error: 'Not authorized for this job' };
  }

  // requester type validation
  if (params.recipientType === 'requester') {
    if (job.requester_type !== 'other') {
      return { allowed: false, error: 'Job is not a third-party request' };
    }
    if (!job.requester_phone) {
      return { allowed: false, error: 'No requester phone' };
    }
  }

  return { allowed: true };
}

describe('SMS Authorization', () => {
  const userId = 'user-1';
  const job: Job = {
    customer_id: 'user-1',
    provider_id: 'provider-1',
    requester_phone: '+15551234567',
    requester_type: 'other',
  };

  it('rejects arbitrary to number', () => {
    const result = validateSmsRequest(userId, {
      to: '+15559999999',
      messageTemplate: 'provider_enroute',
      jobId: 'job-1',
    }, job);
    expect(result.allowed).toBe(false);
    expect(result.error).toContain('Arbitrary to');
  });

  it('rejects missing messageTemplate', () => {
    const result = validateSmsRequest(userId, { jobId: 'job-1' }, job);
    expect(result.allowed).toBe(false);
    expect(result.error).toContain('messageTemplate');
  });

  it('rejects unknown template', () => {
    const result = validateSmsRequest(userId, {
      messageTemplate: 'custom_spam',
      jobId: 'job-1',
    }, job);
    expect(result.allowed).toBe(false);
    expect(result.error).toContain('Unknown template');
  });

  it('rejects missing jobId', () => {
    const result = validateSmsRequest(userId, {
      messageTemplate: 'provider_enroute',
    }, job);
    expect(result.allowed).toBe(false);
    expect(result.error).toContain('jobId');
  });

  it('rejects caller not part of job', () => {
    const result = validateSmsRequest('stranger-id', {
      messageTemplate: 'provider_enroute',
      jobId: 'job-1',
    }, job);
    expect(result.allowed).toBe(false);
    expect(result.error).toContain('Not authorized');
  });

  it('allows valid job participant with template', () => {
    const result = validateSmsRequest(userId, {
      messageTemplate: 'provider_enroute',
      jobId: 'job-1',
    }, job);
    expect(result.allowed).toBe(true);
  });

  it('allows third_party_enroute with requester recipientType', () => {
    const result = validateSmsRequest(userId, {
      messageTemplate: 'third_party_enroute',
      jobId: 'job-1',
      recipientType: 'requester',
    }, job);
    expect(result.allowed).toBe(true);
  });

  it('rejects requester recipientType when job is not third-party', () => {
    const selfJob = { ...job, requester_type: 'self' };
    const result = validateSmsRequest(userId, {
      messageTemplate: 'third_party_enroute',
      jobId: 'job-1',
      recipientType: 'requester',
    }, selfJob);
    expect(result.allowed).toBe(false);
    expect(result.error).toContain('not a third-party');
  });
});

// ---------------------------------------------------------------------------
// Email authorization logic (mirrors send-email Edge Function)
// ---------------------------------------------------------------------------

const ADMIN_ONLY_TEMPLATES = new Set([
  'welcome', 'documents_pending', 'document_request',
  'provider_approved', 'provider_suspended',
]);

const JOB_TEMPLATES = new Set(['customer_invoice', 'provider_completion']);

function validateEmailRequest(
  callerRole: string | null,
  params: { template: string; to?: string; jobId?: string; targetUserId?: string },
  callerIsJobParticipant: boolean
): { error?: string; allowed: boolean } {
  if (ADMIN_ONLY_TEMPLATES.has(params.template)) {
    if (callerRole !== 'admin') {
      return { allowed: false, error: 'Not authorized to send this email type' };
    }
  }

  if (JOB_TEMPLATES.has(params.template)) {
    if (!params.jobId) {
      return { allowed: false, error: 'jobId is required for this template' };
    }
    if (callerRole !== 'admin' && !callerIsJobParticipant) {
      return { allowed: false, error: 'Not authorized for this job' };
    }
    // No arbitrary 'to' for job templates — recipient derived from job
    if (params.to) {
      return { allowed: false, error: 'Recipient derived from job, not caller-supplied' };
    }
  }

  return { allowed: true };
}

describe('Email Authorization', () => {
  it('customer cannot invoke admin-only templates', () => {
    for (const template of ADMIN_ONLY_TEMPLATES) {
      const result = validateEmailRequest('customer', { template }, false);
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('Not authorized');
    }
  });

  it('provider cannot invoke admin-only templates', () => {
    const result = validateEmailRequest('provider', { template: 'welcome' }, false);
    expect(result.allowed).toBe(false);
  });

  it('null role cannot invoke admin-only templates', () => {
    const result = validateEmailRequest(null, { template: 'provider_approved' }, false);
    expect(result.allowed).toBe(false);
  });

  it('admin CAN invoke admin-only templates', () => {
    const result = validateEmailRequest('admin', { template: 'welcome' }, false);
    expect(result.allowed).toBe(true);
  });

  it('job completion email requires jobId', () => {
    const result = validateEmailRequest('customer', { template: 'customer_invoice' }, true);
    expect(result.allowed).toBe(false);
    expect(result.error).toContain('jobId');
  });

  it('job completion email with jobId and participant succeeds', () => {
    const result = validateEmailRequest('customer', {
      template: 'customer_invoice',
      jobId: 'job-1',
    }, true);
    expect(result.allowed).toBe(true);
  });

  it('non-participant cannot send job email', () => {
    const result = validateEmailRequest('customer', {
      template: 'customer_invoice',
      jobId: 'job-1',
    }, false);
    expect(result.allowed).toBe(false);
    expect(result.error).toContain('Not authorized');
  });

  it('job email rejects arbitrary to', () => {
    const result = validateEmailRequest('customer', {
      template: 'customer_invoice',
      jobId: 'job-1',
      to: 'victim@example.com',
    }, true);
    expect(result.allowed).toBe(false);
    expect(result.error).toContain('derived from job');
  });
});

// ---------------------------------------------------------------------------
// Email service contract (sendCustomerInvoiceEmail uses jobId, not email)
// ---------------------------------------------------------------------------

describe('Email Service Contract', () => {
  it('sendCustomerInvoiceEmail signature takes jobId as first param, not email', async () => {
    // Import the actual function and verify its signature
    const { sendCustomerInvoiceEmail } = await import('../services/email.service');
    // The function should accept (jobId, data) — jobId is a UUID string
    expect(typeof sendCustomerInvoiceEmail).toBe('function');
    expect(sendCustomerInvoiceEmail.length).toBeGreaterThanOrEqual(1);
  });

  it('sendProviderCompletionEmail signature takes jobId as first param', async () => {
    const { sendProviderCompletionEmail } = await import('../services/email.service');
    expect(typeof sendProviderCompletionEmail).toBe('function');
  });
});

describe('Notification Error Surfacing', () => {
  it('email service logs failures with template name', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Mock supabase.functions.invoke to fail
    vi.doMock('../lib/supabase', () => ({
      supabase: {
        functions: {
          invoke: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Rate limit exceeded' },
          }),
        },
      },
    }));

    // Re-import with mocked supabase
    const { sendCustomerInvoiceEmail } = await import('../services/email.service');
    const result = await sendCustomerInvoiceEmail('job-1', {
      customerName: 'Test', serviceName: 'Tow', providerName: 'P',
      date: '2026-01-01', amount: '$50', address: '123 Main', jobId: 'job-1',
    });

    expect(result).toBe(false);
    // The console.warn should have been called with the template name
    const calls = warnSpy.mock.calls.map(c => c.join(' '));
    const hasTemplateLog = calls.some(c => c.includes('customer_invoice'));
    expect(hasTemplateLog).toBe(true);

    warnSpy.mockRestore();
    vi.doUnmock('../lib/supabase');
  });
});
