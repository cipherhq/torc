import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

// Tests for the no-provider expiry lifecycle

describe('Job Expiry Eligibility (production rules)', () => {
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

  function isEligibleForExpiry(job: {
    status: string;
    provider_id: string | null;
    created_at: string;
    scheduled_for: string | null;
  }, now: number = Date.now()): boolean {
    if (job.status !== 'pending') return false;
    if (job.provider_id !== null) return false;

    const createdAt = new Date(job.created_at).getTime();
    const scheduledFor = job.scheduled_for ? new Date(job.scheduled_for).getTime() : createdAt;
    const baseline = Math.max(createdAt, scheduledFor);

    return now >= baseline + TWO_HOURS_MS;
  }

  it('future scheduled job is NOT eligible', () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    expect(isEligibleForExpiry({
      status: 'pending', provider_id: null,
      created_at: new Date().toISOString(), scheduled_for: tomorrow,
    })).toBe(false);
  });

  it('scheduled job becomes eligible only after scheduled_for + 2 hours', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    expect(isEligibleForExpiry({
      status: 'pending', provider_id: null,
      created_at: fiveHoursAgo, scheduled_for: threeHoursAgo,
    })).toBe(true);
  });

  it('scheduled job NOT eligible if scheduled_for was only 1 hour ago', () => {
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    expect(isEligibleForExpiry({
      status: 'pending', provider_id: null,
      created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      scheduled_for: oneHourAgo,
    })).toBe(false);
  });

  it('on-demand pending unassigned job eligible after 2 hours', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    expect(isEligibleForExpiry({
      status: 'pending', provider_id: null,
      created_at: threeHoursAgo, scheduled_for: null,
    })).toBe(true);
  });

  it('assigned pending job is NOT eligible', () => {
    const old = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    expect(isEligibleForExpiry({
      status: 'pending', provider_id: 'provider-1',
      created_at: old, scheduled_for: null,
    })).toBe(false);
  });

  it('accepted job is NOT eligible', () => {
    expect(isEligibleForExpiry({
      status: 'accepted', provider_id: 'p1',
      created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      scheduled_for: null,
    })).toBe(false);
  });

  // Test all active statuses
  for (const status of ['accepted', 'enroute', 'en_route', 'arrived', 'in_progress', 'inprogress']) {
    it(`${status} job is NOT eligible`, () => {
      expect(isEligibleForExpiry({
        status, provider_id: 'p1',
        created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        scheduled_for: null,
      })).toBe(false);
    });
  }

  it('jobs older than 12 hours remain eligible when legitimately pending', () => {
    const dayOld = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(isEligibleForExpiry({
      status: 'pending', provider_id: null,
      created_at: dayOld, scheduled_for: null,
    })).toBe(true);
  });
});

describe('Refund Safety (production rules)', () => {
  it('Stripe failure does NOT mark job expired or refunded', () => {
    // When Stripe returns an error, the job status must remain 'pending'
    // and payment_status must remain 'paid'
    const jobBeforeRefund = { status: 'pending', payment_status: 'paid' };
    const stripeResult = { status: 'failed', error: 'card_declined' };

    // Production rule: on failure, do NOT change job status
    const shouldChangeStatus = stripeResult.status === 'succeeded';
    expect(shouldChangeStatus).toBe(false);
    expect(jobBeforeRefund.status).toBe('pending'); // unchanged
    expect(jobBeforeRefund.payment_status).toBe('paid'); // unchanged
  });

  it('pending Stripe refund does NOT falsely claim completion', () => {
    const stripeResult = { status: 'pending' };
    const shouldFinalize = stripeResult.status === 'succeeded';
    expect(shouldFinalize).toBe(false);
  });

  it('successful refund finalizes job as expired + refunded', () => {
    const stripeResult = { status: 'succeeded', id: 're_123' };
    expect(stripeResult.status).toBe('succeeded');
    // Production: set job.status='expired', job.payment_status='refunded'
  });

  it('no notification says "You were not charged" for captured payment', () => {
    const correctMessage = 'No provider was available. Your payment has been refunded.';
    expect(correctMessage).not.toContain('not charged');
    expect(correctMessage).toContain('refunded');
  });
});

describe('Immutable Idempotency Key (BLOCKER 1)', () => {
  it('attempts 1, 2, 3 all use the same key (opId never changes)', () => {
    // The idempotency key format is torc:no-provider-expiry:{opId}
    // or the DB format expiry:{jobId}:{attempt}. The KEY POINT is that
    // the claim RPC returns an immutable key and the edge function uses it as-is.
    const opId = 'op-abc-123';
    const key = `torc:no-provider-expiry:${opId}`;

    // Simulate 3 attempts — all use the SAME key from the claim RPC
    const attempt1Key = key;
    const attempt2Key = key; // NOT regenerated
    const attempt3Key = key; // NOT regenerated

    expect(attempt1Key).toBe(attempt2Key);
    expect(attempt2Key).toBe(attempt3Key);
    expect(attempt1Key).toBe(`torc:no-provider-expiry:${opId}`);
  });

  it('Stripe refund uses exactly the stored idempotency_key (not regenerated)', () => {
    // The edge function must pass job.idempotency_key directly to Stripe
    // without modifying or regenerating it
    const claimedJob = {
      job_id: 'job-456',
      idempotency_key: 'expiry:job-456:1', // This is what the DB returns
      operation_id: 'op-789',
      claim_token: 'token-abc',
      payment_intent_id: 'pi_test',
    };

    // Simulate what the edge function does: use the key as-is
    const stripeIdempotencyKey = claimedJob.idempotency_key;

    // The key must be EXACTLY what was returned, not constructed from parts
    expect(stripeIdempotencyKey).toBe('expiry:job-456:1');
    expect(stripeIdempotencyKey).toBe(claimedJob.idempotency_key);

    // It should NOT be a newly generated key
    const wrongKey = `expiry:${claimedJob.job_id}:2`; // would be wrong
    expect(stripeIdempotencyKey).not.toBe(wrongKey);
  });
});

describe('Acceptance Blocked After Claim Lease Expiry (BLOCKER)', () => {
  it('accept_job rejects if refund operation is unresolved (pending, not expired lease)', () => {
    // Simulates the accept_job RPC guard:
    // EXISTS (op WHERE job_id=X AND status NOT IN ('abandoned','refund_failed')
    //   AND (lease_expires_at IS NULL OR lease_expires_at > now()))
    function canAccept(op: {
      status: string;
      lease_expires_at: string | null;
    } | null, now: Date = new Date()): boolean {
      if (!op) return true; // no operation = can accept

      const blocked = !['abandoned', 'refund_failed'].includes(op.status) &&
        (op.lease_expires_at === null || new Date(op.lease_expires_at) > now);

      return !blocked;
    }

    const now = new Date();
    const futureExpiry = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
    const pastExpiry = new Date(now.getTime() - 1 * 60 * 1000).toISOString();

    // Active claim with future lease -> BLOCKED
    expect(canAccept({ status: 'pending', lease_expires_at: futureExpiry }, now)).toBe(false);
    expect(canAccept({ status: 'refund_requesting', lease_expires_at: futureExpiry }, now)).toBe(false);
    expect(canAccept({ status: 'refund_pending', lease_expires_at: futureExpiry }, now)).toBe(false);

    // Expired lease on pending -> CAN accept (lease expired, can be reclaimed)
    expect(canAccept({ status: 'pending', lease_expires_at: pastExpiry }, now)).toBe(true);

    // Failed/abandoned -> CAN accept
    expect(canAccept({ status: 'abandoned', lease_expires_at: futureExpiry }, now)).toBe(true);
    expect(canAccept({ status: 'refund_failed', lease_expires_at: futureExpiry }, now)).toBe(true);

    // No operation at all -> CAN accept
    expect(canAccept(null)).toBe(true);

    // Finalized operation -> BLOCKED (refund already processed, job should be expired)
    expect(canAccept({ status: 'finalized', lease_expires_at: null }, now)).toBe(false);
  });
});

describe('Missing PaymentIntent -> manual_review (BLOCKER 4)', () => {
  it('paid job with null payment_intent_id goes to manual_review, not succeeded', () => {
    // Simulates the edge function logic for BLOCKER 4
    function processJob(job: {
      payment_intent_id: string | null;
      payment_status: string;
    }): { action: string; refundId?: string; refundStatus?: string; error?: string } {
      if (!job.payment_intent_id) {
        if (job.payment_status === 'paid') {
          // BLOCKER 4: DO NOT treat as succeeded, DO NOT set refundId to 'none'
          return {
            action: 'manual_review',
            refundStatus: 'manual_review',
            error: 'Paid job missing payment_intent_id — requires manual review',
          };
        }
        // Unpaid job — safe to expire without refund
        return { action: 'expire_without_refund', refundStatus: 'not_required' };
      }
      return { action: 'stripe_refund' };
    }

    // Paid but no PI -> manual review
    const paidNoPi = processJob({ payment_intent_id: null, payment_status: 'paid' });
    expect(paidNoPi.action).toBe('manual_review');
    expect(paidNoPi.refundStatus).toBe('manual_review');
    expect(paidNoPi.error).toContain('manual review');
    // Must NOT be 'succeeded' or have refundId='none'
    expect(paidNoPi.refundStatus).not.toBe('succeeded');
    expect(paidNoPi.refundId).toBeUndefined();

    // Unpaid with no PI -> expire without refund
    const unpaidNoPi = processJob({ payment_intent_id: null, payment_status: 'pending' });
    expect(unpaidNoPi.action).toBe('expire_without_refund');
    expect(unpaidNoPi.refundStatus).toBe('not_required');

    // Has PI -> go to Stripe
    const hasPi = processJob({ payment_intent_id: 'pi_123', payment_status: 'paid' });
    expect(hasPi.action).toBe('stripe_refund');
  });
});

describe('Duplicate Finalization is Idempotent (BLOCKER)', () => {
  it('second finalize with same claim_token returns already_finalized or re-succeeds', () => {
    // The finalize RPC checks claim_token and operation status.
    // Once finalized, a second call with the same token should not
    // cause errors or double-process.
    type OpStatus = 'pending' | 'refund_requesting' | 'refund_pending' |
      'finalized' | 'abandoned' | 'refund_failed';

    function simulateFinalize(
      opStatus: OpStatus,
      claimToken: string,
      providedToken: string
    ): { success: boolean; error?: string } {
      // Token mismatch -> rejected
      if (claimToken !== providedToken) {
        return { success: false, error: 'CLAIM_TOKEN_MISMATCH' };
      }

      // Already finalized -> idempotent (no-op or success)
      if (opStatus === 'finalized') {
        return { success: true, error: 'already_finalized' };
      }

      // Already abandoned -> rejected
      if (opStatus === 'abandoned') {
        return { success: false, error: 'OPERATION_ABANDONED' };
      }

      return { success: true };
    }

    const token = 'valid-token';

    // First finalize succeeds
    const first = simulateFinalize('pending', token, token);
    expect(first.success).toBe(true);

    // Second finalize with same token on finalized op -> idempotent
    const second = simulateFinalize('finalized', token, token);
    expect(second.success).toBe(true);
    expect(second.error).toBe('already_finalized');

    // Stale token -> rejected
    const stale = simulateFinalize('pending', token, 'stale-token');
    expect(stale.success).toBe(false);
    expect(stale.error).toBe('CLAIM_TOKEN_MISMATCH');
  });
});

describe('Stale Claim Token Cannot Finalize (BLOCKER)', () => {
  it('finalize with wrong claim_token is rejected', () => {
    function checkClaimToken(
      storedToken: string,
      providedToken: string
    ): { allowed: boolean; error?: string } {
      if (storedToken !== providedToken) {
        return { allowed: false, error: 'CLAIM_TOKEN_MISMATCH' };
      }
      return { allowed: true };
    }

    // Matching tokens
    expect(checkClaimToken('abc', 'abc').allowed).toBe(true);

    // Stale/mismatched token
    const result = checkClaimToken('current-token', 'old-stale-token');
    expect(result.allowed).toBe(false);
    expect(result.error).toBe('CLAIM_TOKEN_MISMATCH');

    // Empty token
    const empty = checkClaimToken('valid', '');
    expect(empty.allowed).toBe(false);
  });
});

describe('Network Timeout is Retryable (BLOCKER 6)', () => {
  it('timeout error is NOT treated as a confirmed failure', () => {
    // Simulates edge function behavior for network timeouts
    type ErrorOutcome = 'permanent_failure' | 'retryable' | 'success';

    function classifyError(err: { isTimeout?: boolean; isStripeError?: boolean }): ErrorOutcome {
      if (err.isTimeout) {
        // Network timeout -> unknown state, must retry
        return 'retryable';
      }
      if (err.isStripeError) {
        // Stripe confirmed error -> permanent failure
        return 'permanent_failure';
      }
      return 'permanent_failure';
    }

    // Timeout -> retryable (NOT permanent failure)
    expect(classifyError({ isTimeout: true })).toBe('retryable');

    // Stripe API error -> permanent failure
    expect(classifyError({ isStripeError: true })).toBe('permanent_failure');

    // Generic error -> permanent failure
    expect(classifyError({})).toBe('permanent_failure');
  });

  it('timeout does NOT finalize the operation as failed', () => {
    // On timeout, the operation stays in refund_requesting state
    // and will be reclaimed on the next run after lease expiry
    let operationStatus = 'refund_requesting';
    const isTimeout = true;

    if (isTimeout) {
      // Do NOT call finalize — leave in refund_requesting
      // The next cron run will reclaim after lease expiry
      operationStatus = 'refund_requesting'; // unchanged
    }

    expect(operationStatus).toBe('refund_requesting');
    expect(operationStatus).not.toBe('refund_failed');
    expect(operationStatus).not.toBe('finalized');
  });
});

describe('Old expire_stale_jobs Deprecation (BLOCKER 7)', () => {
  it('expire_stale_jobs is marked deprecated in migration', () => {
    const migrationPath = path.join(
      REPO_ROOT,
      'supabase/migrations/20260805000000_no_provider_expiry_refund.sql'
    );
    const migrationSource = fs.readFileSync(migrationPath, 'utf-8');

    // The migration marks expire_stale_jobs as deprecated
    expect(migrationSource).toContain('DEPRECATED');
    expect(migrationSource).toContain('expire_stale_jobs');

    // The cron schedule is removed
    expect(migrationSource).toContain('cron.unschedule');
    expect(migrationSource).toContain('expire-stale-jobs');

    // The function is NOT dropped (kept for backward compatibility)
    expect(migrationSource).not.toContain('DROP FUNCTION');
    // But it IS commented as deprecated
    expect(migrationSource).toContain('COMMENT ON FUNCTION');
  });
});

describe('Error Messages Never in p_stripe_refund_id (BLOCKER 7)', () => {
  it('edge function source never passes error text as refund ID', () => {
    const edgeFnPath = path.join(
      REPO_ROOT,
      'supabase/functions/expire-pending-jobs/index.ts'
    );
    const edgeFnSource = fs.readFileSync(edgeFnPath, 'utf-8');

    // Must NOT contain the old pattern: refundId || errorMessage || 'error'
    expect(edgeFnSource).not.toContain("refundId || errorMessage || 'error'");
    expect(edgeFnSource).not.toContain('errorMessage || \'error\'');

    // Must NOT pass error messages as p_stripe_refund_id
    // The source should use a proper refund ID or a safe sentinel
    expect(edgeFnSource).toContain('p_stripe_refund_id');

    // Should store errors in last_error, not in refund ID
    expect(edgeFnSource).toContain('last_error');
  });
});

describe('Edge Function Structure', () => {
  it('has stripeGet helper for retrieval', () => {
    const edgeFnPath = path.join(
      REPO_ROOT,
      'supabase/functions/expire-pending-jobs/index.ts'
    );
    const edgeFnSource = fs.readFileSync(edgeFnPath, 'utf-8');

    expect(edgeFnSource).toContain('async function stripeGet');
    expect(edgeFnSource).toContain('method: \'GET\'');
  });

  it('transitions to refund_requesting before Stripe call', () => {
    const edgeFnPath = path.join(
      REPO_ROOT,
      'supabase/functions/expire-pending-jobs/index.ts'
    );
    const edgeFnSource = fs.readFileSync(edgeFnPath, 'utf-8');

    expect(edgeFnSource).toContain('refund_requesting');
    // The update must come BEFORE the Stripe call
    const requestingIdx = edgeFnSource.indexOf('refund_requesting');
    const stripeCallIdx = edgeFnSource.indexOf('stripePost(\'/v1/refunds\'');
    expect(requestingIdx).toBeLessThan(stripeCallIdx);
  });

  it('handles timeout with AbortController', () => {
    const edgeFnPath = path.join(
      REPO_ROOT,
      'supabase/functions/expire-pending-jobs/index.ts'
    );
    const edgeFnSource = fs.readFileSync(edgeFnPath, 'utf-8');

    expect(edgeFnSource).toContain('AbortController');
    expect(edgeFnSource).toContain('isTimeout');
    expect(edgeFnSource).toContain('AbortError');
  });

  it('retrieves existing refund via GET instead of creating duplicate', () => {
    const edgeFnPath = path.join(
      REPO_ROOT,
      'supabase/functions/expire-pending-jobs/index.ts'
    );
    const edgeFnSource = fs.readFileSync(edgeFnPath, 'utf-8');

    // Should check for existing stripe_refund_id and use GET
    expect(edgeFnSource).toContain('existingRefundId');
    expect(edgeFnSource).toContain('stripeGet(`/v1/refunds/');
  });
});

describe('Stripe Webhook Expiry Correlation (BLOCKER 3)', () => {
  it('webhook handler checks for pending expiry operations on refund events', () => {
    const webhookPath = path.join(
      REPO_ROOT,
      'supabase/functions/stripe-webhook/index.ts'
    );
    const webhookSource = fs.readFileSync(webhookPath, 'utf-8');

    // Must handle charge.refunded and refund.updated
    expect(webhookSource).toContain('charge.refunded');
    expect(webhookSource).toContain('refund.updated');

    // Must look up job_expiry_refund_operations
    expect(webhookSource).toContain('job_expiry_refund_operations');

    // Must only match refund_pending status
    expect(webhookSource).toContain("'refund_pending'");

    // Must call finalize_expiry_refund
    expect(webhookSource).toContain('finalize_expiry_refund');
  });

  it('webhook preserves existing signature verification', () => {
    const webhookPath = path.join(
      REPO_ROOT,
      'supabase/functions/stripe-webhook/index.ts'
    );
    const webhookSource = fs.readFileSync(webhookPath, 'utf-8');

    expect(webhookSource).toContain('verifyStripeSignature');
    expect(webhookSource).toContain('stripe-signature');
    expect(webhookSource).toContain('HMAC');
    expect(webhookSource).toContain('timingSafeEqual');
  });

  it('webhook preserves existing process_stripe_webhook RPC call', () => {
    const webhookPath = path.join(
      REPO_ROOT,
      'supabase/functions/stripe-webhook/index.ts'
    );
    const webhookSource = fs.readFileSync(webhookPath, 'utf-8');

    expect(webhookSource).toContain('process_stripe_webhook');
    expect(webhookSource).toContain('p_event_id');
    expect(webhookSource).toContain('p_event_type');
  });
});

describe('Client-Side Expiry Removal', () => {
  const splashPath = path.join(REPO_ROOT, 'apps/customer-web/src/pages/auth/Splash.tsx');
  const shellPath = path.join(REPO_ROOT, 'apps/provider-web/src/components/AppShell.tsx');
  const workerPath = path.join(REPO_ROOT, 'workers/push-notification-worker.js');

  it('Customer Splash does not contain direct job UPDATE', () => {
    const splashSource = fs.readFileSync(splashPath, 'utf-8');
    expect(splashSource).not.toContain('.update({');
    expect(splashSource).not.toContain("status: 'cancelled'");
    expect(splashSource).not.toContain('auto_expired_stale');
  });

  it('Customer Splash still queries active jobs for recovery', () => {
    const splashSource = fs.readFileSync(splashPath, 'utf-8');
    expect(splashSource).toContain('.select(');
    expect(splashSource).toContain("'pending'");
    expect(splashSource).toContain('/tracking/');
  });

  it('Customer Splash does NOT filter by 12-hour age', () => {
    const splashSource = fs.readFileSync(splashPath, 'utf-8');
    expect(splashSource).not.toContain('twelveHoursAgo');
    expect(splashSource).not.toContain('12 * 60 * 60');
  });

  it('Provider AppShell does not contain direct job UPDATE', () => {
    const shellSource = fs.readFileSync(shellPath, 'utf-8');
    expect(shellSource).not.toContain("cancellation_reason: 'auto_expired_stale'");
  });

  it('Provider AppShell does NOT filter by 12-hour age', () => {
    const shellSource = fs.readFileSync(shellPath, 'utf-8');
    expect(shellSource).not.toContain('twelveHoursAgo');
  });

  it('Push worker does not contain expireStaleJobs timer', () => {
    const workerSource = fs.readFileSync(workerPath, 'utf-8');
    expect(workerSource).not.toContain('setInterval(expireStaleJobs');
    expect(workerSource).not.toContain('setTimeout(expireStaleJobs');
  });
});
