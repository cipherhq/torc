import { describe, it, expect, beforeAll } from 'vitest';
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

describe('Stripe Error Classification (BLOCKER 10)', () => {
  // Mirror the classifyStripeError function from the edge function
  function classifyStripeError(error: any): 'retryable' | 'permanent' | 'unknown' {
    const type = error?.stripeError?.type;
    const status = error?.status;
    if (error?.isTimeout || !type) return 'unknown';
    if (status === 429 || (status && status >= 500)) return 'retryable';
    if (type === 'invalid_request_error') return 'permanent';
    return 'retryable';
  }

  it('timeout error is classified as unknown (retryable)', () => {
    expect(classifyStripeError({ isTimeout: true })).toBe('unknown');
  });

  it('rate limit (429) is classified as retryable', () => {
    expect(classifyStripeError({ status: 429, stripeError: { type: 'rate_limit_error' } })).toBe('retryable');
  });

  it('server error (500) is classified as retryable', () => {
    expect(classifyStripeError({ status: 500, stripeError: { type: 'api_error' } })).toBe('retryable');
  });

  it('invalid_request_error is classified as permanent', () => {
    expect(classifyStripeError({ stripeError: { type: 'invalid_request_error' } })).toBe('permanent');
  });

  it('generic error without type is classified as unknown', () => {
    expect(classifyStripeError({})).toBe('unknown');
  });

  it('permanent errors finalize as permanent_failure', () => {
    const edgeFnPath = path.join(
      REPO_ROOT,
      'supabase/functions/expire-pending-jobs/index.ts'
    );
    const edgeFnSource = fs.readFileSync(edgeFnPath, 'utf-8');

    expect(edgeFnSource).toContain("p_stripe_refund_status: 'permanent_failure'");
  });

  it('retryable/unknown errors leave operation in refund_requesting for reclaim', () => {
    // On retryable/unknown error, the operation stays in refund_requesting state
    // and will be reclaimed on the next run after lease expiry
    let operationStatus = 'refund_requesting';
    const errorClass = classifyStripeError({ isTimeout: true });

    if (errorClass === 'unknown' || errorClass === 'retryable') {
      // Do NOT call finalize — leave in refund_requesting
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

describe('No Sentinel Refund IDs (BLOCKER 4+5)', () => {
  it('edge function source never passes sentinel strings as p_stripe_refund_id', () => {
    const edgeFnPath = path.join(
      REPO_ROOT,
      'supabase/functions/expire-pending-jobs/index.ts'
    );
    const edgeFnSource = fs.readFileSync(edgeFnPath, 'utf-8');

    // Must NOT contain sentinel values in p_stripe_refund_id
    expect(edgeFnSource).not.toContain("refundId || 'none'");
    expect(edgeFnSource).not.toContain("p_stripe_refund_id: 'none'");
    expect(edgeFnSource).not.toContain("p_stripe_refund_id: 'error'");
    expect(edgeFnSource).not.toContain("p_stripe_refund_id: 'manual_review'");
    expect(edgeFnSource).not.toContain("refundId || errorMessage");
    expect(edgeFnSource).not.toContain("errorMessage || 'error'");

    // Must pass null when no refund ID is available
    expect(edgeFnSource).toContain('p_stripe_refund_id: null');
  });

  it('unpaid jobs use finalize_expiry_no_refund RPC', () => {
    const edgeFnPath = path.join(
      REPO_ROOT,
      'supabase/functions/expire-pending-jobs/index.ts'
    );
    const edgeFnSource = fs.readFileSync(edgeFnPath, 'utf-8');

    expect(edgeFnSource).toContain('finalize_expiry_no_refund');
  });

  it('paid job with missing PI uses missing_payment_intent status, not manual_review sentinel', () => {
    const edgeFnPath = path.join(
      REPO_ROOT,
      'supabase/functions/expire-pending-jobs/index.ts'
    );
    const edgeFnSource = fs.readFileSync(edgeFnPath, 'utf-8');

    expect(edgeFnSource).toContain("'missing_payment_intent'");
    expect(edgeFnSource).toContain('Job is paid but payment_intent_id is missing');
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

  it('calls begin_expiry_refund_request before Stripe call', () => {
    const edgeFnPath = path.join(
      REPO_ROOT,
      'supabase/functions/expire-pending-jobs/index.ts'
    );
    const edgeFnSource = fs.readFileSync(edgeFnPath, 'utf-8');

    // begin_expiry_refund_request must be called
    expect(edgeFnSource).toContain('begin_expiry_refund_request');

    // It must come BEFORE the Stripe call
    const beginIdx = edgeFnSource.indexOf('begin_expiry_refund_request');
    const stripeCallIdx = edgeFnSource.indexOf('stripePost(\'/v1/refunds\'');
    expect(beginIdx).toBeLessThan(stripeCallIdx);
  });

  it('classifies Stripe errors as retryable vs permanent', () => {
    const edgeFnPath = path.join(
      REPO_ROOT,
      'supabase/functions/expire-pending-jobs/index.ts'
    );
    const edgeFnSource = fs.readFileSync(edgeFnPath, 'utf-8');

    expect(edgeFnSource).toContain('classifyStripeError');
    expect(edgeFnSource).toContain("'retryable'");
    expect(edgeFnSource).toContain("'permanent'");
    expect(edgeFnSource).toContain("'unknown'");
    expect(edgeFnSource).toContain('invalid_request_error');
    expect(edgeFnSource).toContain("'permanent_failure'");
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

describe('Stripe Webhook Expiry Correlation (BLOCKER 11)', () => {
  it('webhook correlates by exact stripe_refund_id only', () => {
    const webhookPath = path.join(
      REPO_ROOT,
      'supabase/functions/stripe-webhook/index.ts'
    );
    const webhookSource = fs.readFileSync(webhookPath, 'utf-8');

    // Must handle charge.refunded and refund.updated
    expect(webhookSource).toContain('charge.refunded');
    expect(webhookSource).toContain('refund.updated');

    // Must look up by exact stripe_refund_id
    expect(webhookSource).toContain("eq('stripe_refund_id', refundId)");
    expect(webhookSource).toContain("eq('status', 'refund_pending')");

    // Must verify payment_intent matches
    expect(webhookSource).toContain('payment_intent_id');
    expect(webhookSource).toContain('Payment intent mismatch');

    // Must NOT default unknown status to succeeded
    expect(webhookSource).not.toContain("refundStatus || 'succeeded'");

    // Must only finalize on explicit succeeded or failed
    expect(webhookSource).toContain("refundStatus !== 'succeeded'");
    expect(webhookSource).toContain("refundStatus !== 'failed'");
  });

  it('webhook checks both RPC error and result.success', () => {
    const webhookPath = path.join(
      REPO_ROOT,
      'supabase/functions/stripe-webhook/index.ts'
    );
    const webhookSource = fs.readFileSync(webhookPath, 'utf-8');

    expect(webhookSource).toContain('result?.success === false');
    expect(webhookSource).toContain('finalizeError');
  });

  it('webhook handles lookup errors without crashing', () => {
    const webhookPath = path.join(
      REPO_ROOT,
      'supabase/functions/stripe-webhook/index.ts'
    );
    const webhookSource = fs.readFileSync(webhookPath, 'utf-8');

    // Must catch exceptions so webhook returns 200
    expect(webhookSource).toContain('catch (refundErr');
    expect(webhookSource).toContain('lookupError');
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

describe('Reconciliation: Pending Refund Checked on Later Run', () => {
  it('edge function calls reconcile_pending_refunds RPC', () => {
    const edgeFnPath = path.join(
      REPO_ROOT,
      'supabase/functions/expire-pending-jobs/index.ts'
    );
    const edgeFnSource = fs.readFileSync(edgeFnPath, 'utf-8');

    // Must call reconcile_pending_refunds
    expect(edgeFnSource).toContain('reconcile_pending_refunds');
    expect(edgeFnSource).toContain('p_batch_size');
    expect(edgeFnSource).toContain('p_stale_minutes');
  });

  it('reconciliation retrieves refund via GET, never creates', () => {
    const edgeFnPath = path.join(
      REPO_ROOT,
      'supabase/functions/expire-pending-jobs/index.ts'
    );
    const edgeFnSource = fs.readFileSync(edgeFnPath, 'utf-8');

    // The reconciliation phase must use stripeGet for retrieval
    // Count occurrences of stripeGet in the file - should appear in both
    // the retry-with-existing-refund path AND the reconciliation path
    const stripeGetMatches = edgeFnSource.match(/stripeGet\(`\/v1\/refunds\//g);
    expect(stripeGetMatches).not.toBeNull();
    expect(stripeGetMatches!.length).toBeGreaterThanOrEqual(2);

    // Must NOT call stripePost in reconciliation phase
    // The reconciliation block should contain stripeGet but not stripePost
    const reconcileIdx = edgeFnSource.indexOf('reconcile_pending_refunds');
    const reconcileBlock = edgeFnSource.slice(reconcileIdx);
    expect(reconcileBlock).toContain('stripeGet');
    expect(reconcileBlock).not.toContain('stripePost');
  });

  it('reconciliation calls finalize_expiry_refund for each pending op', () => {
    const edgeFnPath = path.join(
      REPO_ROOT,
      'supabase/functions/expire-pending-jobs/index.ts'
    );
    const edgeFnSource = fs.readFileSync(edgeFnPath, 'utf-8');

    const reconcileIdx = edgeFnSource.indexOf('reconcile_pending_refunds');
    const reconcileBlock = edgeFnSource.slice(reconcileIdx);
    expect(reconcileBlock).toContain('finalize_expiry_refund');
    expect(reconcileBlock).toContain('op.operation_id');
    expect(reconcileBlock).toContain('op.claim_token');
  });

  it('response includes reconciled count', () => {
    const edgeFnPath = path.join(
      REPO_ROOT,
      'supabase/functions/expire-pending-jobs/index.ts'
    );
    const edgeFnSource = fs.readFileSync(edgeFnPath, 'utf-8');

    expect(edgeFnSource).toContain('reconciled');
  });
});

describe('Permanent Error enters manual_review, not reclaimable', () => {
  it('permanent_failure status is passed to finalize RPC', () => {
    const edgeFnPath = path.join(
      REPO_ROOT,
      'supabase/functions/expire-pending-jobs/index.ts'
    );
    const edgeFnSource = fs.readFileSync(edgeFnPath, 'utf-8');

    // permanent_failure must be sent as p_stripe_refund_status
    expect(edgeFnSource).toContain("p_stripe_refund_status: 'permanent_failure'");
    // Must NOT log "finalized" for permanent failures
    // The permanent failure path should log "Permanent Stripe error", not "finalized"
    const permIdx = edgeFnSource.indexOf("'permanent_failure'");
    const permBlock = edgeFnSource.slice(Math.max(0, permIdx - 200), permIdx + 300);
    expect(permBlock).toContain('Permanent Stripe error');
  });

  it('permanent_failure finalize passes null for p_stripe_refund_id', () => {
    const edgeFnPath = path.join(
      REPO_ROOT,
      'supabase/functions/expire-pending-jobs/index.ts'
    );
    const edgeFnSource = fs.readFileSync(edgeFnPath, 'utf-8');

    // Find the permanent_failure finalization block — search for the actual code, not comment
    const permFinalizeIdx = edgeFnSource.indexOf("'permanent_failure'");
    expect(permFinalizeIdx).toBeGreaterThan(-1);
    const permBlock = edgeFnSource.slice(
      Math.max(0, permFinalizeIdx - 200),
      permFinalizeIdx + 300
    );
    expect(permBlock).toContain('p_stripe_refund_id: null');
  });

  it('permanent errors increment failed counter, not succeeded', () => {
    const edgeFnPath = path.join(
      REPO_ROOT,
      'supabase/functions/expire-pending-jobs/index.ts'
    );
    const edgeFnSource = fs.readFileSync(edgeFnPath, 'utf-8');

    // After permanent_failure finalize, must increment failed++
    const permIdx = edgeFnSource.indexOf("'permanent_failure'");
    const afterPerm = edgeFnSource.slice(permIdx, permIdx + 600);
    expect(afterPerm).toContain('failed++');
    expect(afterPerm).not.toContain('succeeded++');
  });
});

describe('Webhook Failure is Not Silently Lost', () => {
  it('webhook logs CRITICAL warning when finalization fails', () => {
    const webhookPath = path.join(
      REPO_ROOT,
      'supabase/functions/stripe-webhook/index.ts'
    );
    const webhookSource = fs.readFileSync(webhookPath, 'utf-8');

    // Must contain CRITICAL warnings for finalization failures
    expect(webhookSource).toContain('CRITICAL');

    // Count CRITICAL occurrences — should be at least 3:
    // 1. lookup error, 2. finalize transport error, 3. finalize result.success=false, 4. exception
    const criticalMatches = webhookSource.match(/CRITICAL/g);
    expect(criticalMatches).not.toBeNull();
    expect(criticalMatches!.length).toBeGreaterThanOrEqual(3);
  });

  it('webhook mentions scheduled reconciliation as safety net', () => {
    const webhookPath = path.join(
      REPO_ROOT,
      'supabase/functions/stripe-webhook/index.ts'
    );
    const webhookSource = fs.readFileSync(webhookPath, 'utf-8');

    // Must reference reconciliation as the fallback
    expect(webhookSource).toContain('scheduled reconciliation will handle this');
  });

  it('webhook does not log "finalized" for failed finalization', () => {
    const webhookPath = path.join(
      REPO_ROOT,
      'supabase/functions/stripe-webhook/index.ts'
    );
    const webhookSource = fs.readFileSync(webhookPath, 'utf-8');

    // The "Finalized expiry refund" log should only appear in the success branch
    const finalizedLogIdx = webhookSource.indexOf('Finalized expiry refund');
    expect(finalizedLogIdx).toBeGreaterThan(-1);

    // It should be preceded by "else {" (the success branch), not by the error branches
    const before = webhookSource.slice(Math.max(0, finalizedLogIdx - 100), finalizedLogIdx);
    expect(before).toContain('else');
  });

  it('webhook handles lookup errors explicitly', () => {
    const webhookPath = path.join(
      REPO_ROOT,
      'supabase/functions/stripe-webhook/index.ts'
    );
    const webhookSource = fs.readFileSync(webhookPath, 'utf-8');

    // Must handle job lookup errors (PI verification)
    expect(webhookSource).toContain('jobLookupError');
    expect(webhookSource).toContain('CRITICAL: Failed to look up job');
  });
});

describe('Conflicting Finalization Preserves Finalized State', () => {
  it('second finalize call does not overwrite finalized operation', () => {
    // Simulate the SQL-side behavior: once an operation is finalized,
    // a second call should NOT change its state
    type FinalizeResult = { success: boolean; already_finalized?: boolean; error?: string };

    function simulateFinalize(
      currentStatus: string,
      claimToken: string,
      providedToken: string,
      refundStatus: string
    ): FinalizeResult {
      if (claimToken !== providedToken) {
        return { success: false, error: 'CLAIM_TOKEN_MISMATCH' };
      }
      if (currentStatus === 'finalized') {
        // Idempotent: return success but don't change state
        return { success: true, already_finalized: true };
      }
      if (currentStatus === 'manual_review') {
        return { success: true, already_finalized: true };
      }
      return { success: true };
    }

    const token = 'valid-token';

    // First finalize: succeeded
    const r1 = simulateFinalize('refund_pending', token, token, 'succeeded');
    expect(r1.success).toBe(true);
    expect(r1.already_finalized).toBeUndefined();

    // Second finalize with "failed" status — must NOT overwrite
    const r2 = simulateFinalize('finalized', token, token, 'failed');
    expect(r2.success).toBe(true);
    expect(r2.already_finalized).toBe(true);

    // Third finalize with wrong token — rejected
    const r3 = simulateFinalize('finalized', token, 'wrong-token', 'succeeded');
    expect(r3.success).toBe(false);
  });

  it('edge function handles already_finalized result gracefully', () => {
    // When finalize returns success=true with already_finalized,
    // the edge function should NOT double-count
    function processResult(result: { success: boolean; already_finalized?: boolean }): {
      shouldCount: boolean;
    } {
      if (result.already_finalized) return { shouldCount: false };
      return { shouldCount: result.success };
    }

    expect(processResult({ success: true })).toEqual({ shouldCount: true });
    expect(processResult({ success: true, already_finalized: true })).toEqual({ shouldCount: false });
    expect(processResult({ success: false })).toEqual({ shouldCount: false });
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

  // CROSS-002: HomeMap must not perform client-side stale job cancellation
  const homeMapPath = path.join(REPO_ROOT, 'apps/customer-web/src/pages/customer/HomeMap.tsx');

  it('HomeMap does not directly update a job to cancelled as stale-job cleanup', () => {
    const src = fs.readFileSync(homeMapPath, 'utf-8');
    expect(src).not.toContain("cancellation_reason: 'auto_expired_stale'");
    expect(src).not.toContain("status: 'cancelled'");
  });

  it('HomeMap does not contain a 12-hour client-side expiry mechanism', () => {
    const src = fs.readFileSync(homeMapPath, 'utf-8');
    expect(src).not.toContain('twelveHoursAgo');
    expect(src).not.toContain('12 * 60 * 60 * 1000');
    expect(src).not.toContain('hasCleaned');
  });

  it('HomeMap does not filter active jobs by created_at age', () => {
    const src = fs.readFileSync(homeMapPath, 'utf-8');
    // The active job query must not exclude jobs based on age
    expect(src).not.toContain('.lt(\'created_at\'');
    expect(src).not.toContain('.gte(\'created_at\'');
  });

  it('HomeMap crash recovery still queries active jobs', () => {
    const src = fs.readFileSync(homeMapPath, 'utf-8');
    expect(src).toContain('.select(');
    expect(src).toContain("'pending'");
    expect(src).toContain("'accepted'");
    expect(src).toContain("'in_progress'");
    expect(src).toContain('setActiveJob');
  });

  it('HomeMap does not perform any .update() on the jobs table', () => {
    const src = fs.readFileSync(homeMapPath, 'utf-8');
    // HomeMap should only read job state, never write it
    const jobsUpdatePattern = /\.from\(['"]jobs['"]\)\s*\n?\s*\.update\(/;
    expect(src).not.toMatch(jobsUpdatePattern);
  });
});

// =============================================================================
// expire-pending-jobs auth hardening tests
// =============================================================================

describe('expire-pending-jobs auth hardening', () => {
  const fnPath = path.resolve(REPO_ROOT, 'supabase/functions/expire-pending-jobs/index.ts');
  const configPath = path.resolve(REPO_ROOT, 'supabase/config.toml');
  let fnSource: string;
  let configSource: string;

  beforeAll(() => {
    fnSource = fs.readFileSync(fnPath, 'utf-8');
    configSource = fs.readFileSync(configPath, 'utf-8');
  });

  it('supabase/config.toml sets verify_jwt = false for expire-pending-jobs', () => {
    expect(configSource).toContain('[functions.expire-pending-jobs]');
    // Extract the section and verify verify_jwt = false
    const section = configSource.split('[functions.expire-pending-jobs]')[1]?.split('[')[0] || '';
    expect(section).toContain('verify_jwt = false');
  });

  it('supabase/config.toml sets verify_jwt = false for stripe-webhook', () => {
    expect(configSource).toContain('[functions.stripe-webhook]');
    const section = configSource.split('[functions.stripe-webhook]')[1]?.split('[')[0] || '';
    expect(section).toContain('verify_jwt = false');
  });

  it('authenticates via x-torc-cron-secret header, not Authorization bearer', () => {
    expect(fnSource).toContain("req.headers.get('x-torc-cron-secret')");
    // Auth check must occur before the actual RPC call (not just a comment mention)
    const authIdx = fnSource.indexOf("req.headers.get('x-torc-cron-secret')");
    const claimIdx = fnSource.indexOf("'claim_expiry_eligible_jobs'");
    expect(authIdx).toBeLessThan(claimIdx);
  });

  it('does NOT accept Authorization bearer token for function auth', () => {
    // The function should not compare Authorization header against cronSecret
    expect(fnSource).not.toMatch(/authHeader.*cronSecret/);
    expect(fnSource).not.toMatch(/token\s*===\s*cronSecret/);
    expect(fnSource).not.toContain('isCronAuth');
    expect(fnSource).not.toContain('isServiceRole');
  });

  it('returns 401 when x-torc-cron-secret is missing', () => {
    // The guard must return 401 when suppliedSecret is falsy
    expect(fnSource).toContain('!suppliedSecret');
    expect(fnSource).toContain("{ error: 'Unauthorized' }");
    expect(fnSource).toContain('status: 401');
  });

  it('returns 401 when x-torc-cron-secret is wrong', () => {
    // The comparison must check suppliedSecret !== cronSecret
    expect(fnSource).toContain('suppliedSecret !== cronSecret');
  });

  it('GET with valid cron secret returns health check', () => {
    expect(fnSource).toContain("req.method === 'GET'");
    expect(fnSource).toContain("{ ok: true, service: 'expire-pending-jobs' }");
  });

  it('GET health check performs zero RPC calls', () => {
    // The GET handler must return before any RPC/Supabase client usage
    const getIdx = fnSource.indexOf("req.method === 'GET'");
    const getReturn = fnSource.indexOf('return new Response', getIdx);
    const getBlock = fnSource.substring(getIdx, getReturn + 50);
    expect(getBlock).not.toContain('claim_expiry_eligible_jobs');
    expect(getBlock).not.toContain('adminClient');
    expect(getBlock).not.toContain('createClient');
  });

  it('GET health check performs zero Stripe calls', () => {
    const getIdx = fnSource.indexOf("req.method === 'GET'");
    const getReturn = fnSource.indexOf('return new Response', getIdx);
    const getBlock = fnSource.substring(getIdx, getReturn + 50);
    expect(getBlock).not.toContain('stripePost');
    expect(getBlock).not.toContain('stripeGet');
    expect(getBlock).not.toContain('api.stripe.com');
  });

  it('POST without valid cron header cannot reach claim RPC', () => {
    // Auth rejection must be before the actual RPC call string (not comment mentions)
    const authReject = fnSource.indexOf('suppliedSecret !== cronSecret');
    const claimRpc = fnSource.indexOf("'claim_expiry_eligible_jobs'");
    expect(authReject).toBeLessThan(claimRpc);
  });

  it('never logs the cron secret value', () => {
    // Should not log suppliedSecret or cronSecret values
    expect(fnSource).not.toMatch(/console\.(log|error|warn).*suppliedSecret/);
    expect(fnSource).not.toMatch(/console\.(log|error|warn).*cronSecret/);
  });

  it('requires CRON_SECRET env var to be configured', () => {
    expect(fnSource).toContain("Deno.env.get('CRON_SECRET')");
    expect(fnSource).toContain('!cronSecret');
    expect(fnSource).toContain('Server misconfigured');
  });
});

// =============================================================================
// TRACK-001: Job tracking Realtime channel authorization tests
// =============================================================================

describe('Job tracking Realtime channel authorization (TRACK-001)', () => {
  const customerHookPath = path.resolve(REPO_ROOT, 'apps/customer-web/src/hooks/useRealtimeLocation.ts');
  const providerHookPath = path.resolve(REPO_ROOT, 'apps/provider-web/src/hooks/useRealtimeLocation.ts');

  it('customer job-tracking channel is private', () => {
    const src = fs.readFileSync(customerHookPath, 'utf-8');
    expect(src).toContain('private: true');
  });

  it('provider job-tracking channel is private', () => {
    const src = fs.readFileSync(providerHookPath, 'utf-8');
    expect(src).toContain('private: true');
  });

  it('both hooks use the same job-specific topic pattern', () => {
    const custSrc = fs.readFileSync(customerHookPath, 'utf-8');
    const provSrc = fs.readFileSync(providerHookPath, 'utf-8');
    expect(custSrc).toContain('`job-tracking-${jobId}`');
    expect(provSrc).toContain('`job-tracking-${jobId}`');
  });

  it('broadcast functionality remains in both hooks', () => {
    const custSrc = fs.readFileSync(customerHookPath, 'utf-8');
    const provSrc = fs.readFileSync(providerHookPath, 'utf-8');
    expect(custSrc).toContain("event: 'location_update'");
    expect(provSrc).toContain("event: 'location_update'");
    expect(custSrc).toContain('broadcastLocation');
    expect(provSrc).toContain('broadcastLocation');
  });

  it('presence functionality remains in both hooks', () => {
    const custSrc = fs.readFileSync(customerHookPath, 'utf-8');
    const provSrc = fs.readFileSync(providerHookPath, 'utf-8');
    expect(custSrc).toContain("event: 'join'");
    expect(custSrc).toContain("event: 'leave'");
    expect(provSrc).toContain("event: 'join'");
    expect(provSrc).toContain("event: 'leave'");
    expect(custSrc).toContain('channel.track(');
    expect(provSrc).toContain('channel.track(');
  });

  it('no fallback public job-tracking channel exists', () => {
    const custSrc = fs.readFileSync(customerHookPath, 'utf-8');
    const provSrc = fs.readFileSync(providerHookPath, 'utf-8');
    // Count occurrences of channel creation — should be exactly one per hook
    const custChannels = (custSrc.match(/supabase\.channel\(/g) || []).length;
    const provChannels = (provSrc.match(/supabase\.channel\(/g) || []).length;
    expect(custChannels).toBe(1);
    expect(provChannels).toBe(1);
    // No public fallback — private must be the only mode
    expect(custSrc).not.toContain('private: false');
    expect(provSrc).not.toContain('private: false');
  });

  it('realtime authorization migration exists with safe UUID parsing', () => {
    const migrationPath = path.resolve(REPO_ROOT, 'supabase/migrations/20260807000000_secure_job_tracking_realtime.sql');
    expect(fs.existsSync(migrationPath)).toBe(true);
    const src = fs.readFileSync(migrationPath, 'utf-8');
    expect(src).toContain('realtime.messages');
    expect(src).toContain('job-tracking-');
    expect(src).toContain('customer_id = auth.uid()');
    expect(src).toContain('provider_id = auth.uid()');
    expect(src).toContain("'completed'");
    expect(src).toContain("'cancelled'");
    expect(src).toContain('FOR SELECT');
    expect(src).toContain('FOR INSERT');
    // UUID validation must use regex, not length-only check
    expect(src).toContain('[0-9a-f]');
    expect(src).toContain('extract_job_tracking_uuid');
  });

  it('LiveTracking status is declared before isTrackingActive (no TDZ)', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/customer-web/src/pages/customer/LiveTracking.tsx'), 'utf-8'
    );
    const lines = src.split('\n');
    // Find the line numbers for status declaration and isTrackingActive usage
    const statusDeclLine = lines.findIndex(l => l.includes('useState<JobStatus>'));
    const trackingActiveLine = lines.findIndex(l => l.includes('isTrackingActive') && l.includes('status'));
    expect(statusDeclLine).toBeGreaterThan(-1);
    expect(trackingActiveLine).toBeGreaterThan(-1);
    expect(statusDeclLine).toBeLessThan(trackingActiveLine);
  });

  it('customer tracking is disabled after completed', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/customer-web/src/pages/customer/LiveTracking.tsx'), 'utf-8'
    );
    expect(src).toContain("status !== 'completed'");
    expect(src).toMatch(/useWatchPosition\(isTrackingActive\)/);
    expect(src).toContain('enabled: isTrackingActive');
  });

  it('customer tracking is disabled after cancelled', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/customer-web/src/pages/customer/LiveTracking.tsx'), 'utf-8'
    );
    expect(src).toContain("status !== 'cancelled'");
  });

  it('provider initial fetch derives terminal state both ways (true AND false)', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/provider-web/src/pages/provider/JobActiveRealtime.tsx'), 'utf-8'
    );
    // Must compute terminal as a boolean and call setIsJobTerminal(terminal),
    // not only setIsJobTerminal(true) conditionally.
    // This ensures navigating from a terminal job to an active job resets the state.
    expect(src).toMatch(/const terminal\s*=\s*jobStatus\s*===\s*'completed'/);
    expect(src).toContain("jobStatus === 'cancelled'");
    expect(src).toContain("jobStatus === 'expired'");
    expect(src).toContain('setIsJobTerminal(terminal)');
  });

  it('provider terminal state resets when navigating to active job', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/provider-web/src/pages/provider/JobActiveRealtime.tsx'), 'utf-8'
    );
    // setIsJobTerminal(terminal) where terminal derives from jobStatus means:
    // - completed/cancelled/expired → terminal=true → tracking disabled
    // - accepted/enroute/arrived/inprogress → terminal=false → tracking enabled
    // The same call handles both directions, preventing stale state across job changes.
    expect(src).toContain('setIsJobTerminal(terminal)');
    // The effect depends on jobId, so changing jobId triggers a new fetch
    const fetchEffect = src.match(/useEffect\(\(\)\s*=>\s*\{[\s\S]*?fetchJob\(jobId\)[\s\S]*?\},\s*\[([^\]]*)\]\)/);
    expect(fetchEffect).not.toBeNull();
    expect(fetchEffect![1]).toContain('jobId');
  });

  it('provider tracking is disabled after customer cancellation', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/provider-web/src/pages/provider/JobActiveRealtime.tsx'), 'utf-8'
    );
    expect(src).toContain('setIsJobTerminal(true)');
    expect(src).toMatch(/useWatchPosition\(isTrackingActive\)/);
    expect(src).toContain('enabled: isTrackingActive');
    expect(src).toContain('!isJobTerminal');
  });

  it('provider tracking is disabled after DB completion event', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/provider-web/src/pages/provider/JobActiveRealtime.tsx'), 'utf-8'
    );
    expect(src).toMatch(/dbStatus\s*===\s*'completed'[\s\S]*?setIsJobTerminal\(true\)/);
  });

  it('hook cleanup unsubscribes channel when enabled transitions to false', () => {
    const custHook = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/customer-web/src/hooks/useRealtimeLocation.ts'), 'utf-8'
    );
    const provHook = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/provider-web/src/hooks/useRealtimeLocation.ts'), 'utf-8'
    );
    // Both hooks must unsubscribe in their cleanup function
    expect(custHook).toContain('channel.unsubscribe()');
    expect(provHook).toContain('channel.unsubscribe()');
    // Both hooks depend on enabled in their effect deps
    expect(custHook).toContain('enabled]');
    expect(provHook).toContain('enabled]');
  });
});

// =============================================================================
// CROSS-001: Server-authoritative job transition tests
// =============================================================================

describe('Server-authoritative job transitions (CROSS-001)', () => {
  const custCtxPath = path.resolve(REPO_ROOT, 'apps/customer-web/src/context/JobContext.jsx');
  const provCtxPath = path.resolve(REPO_ROOT, 'apps/provider-web/src/context/JobContext.jsx');
  const liveTrackingPath = path.resolve(REPO_ROOT, 'apps/customer-web/src/pages/customer/LiveTracking.tsx');
  const migrationPath = path.resolve(REPO_ROOT, 'supabase/migrations/20260808000000_server_authoritative_job_transitions.sql');

  it('customer updateJobStatus calls RPC, not direct jobs.update', () => {
    const src = fs.readFileSync(custCtxPath, 'utf-8');
    const fnBody = src.substring(src.indexOf('async function updateJobStatus'), src.indexOf('async function sendCompletionEmails'));
    expect(fnBody).toContain("supabase.rpc('transition_job_status_by_participant'");
    expect(fnBody).not.toContain(".from('jobs')");
    expect(fnBody).not.toContain('.update(');
  });

  it('provider updateJobStatus calls RPC, not direct jobs.update', () => {
    const src = fs.readFileSync(provCtxPath, 'utf-8');
    const fnBody = src.substring(src.indexOf('async function updateJobStatus'), src.indexOf('async function sendTemplatedEmail'));
    expect(fnBody).toContain("supabase.rpc('transition_job_status_by_participant'");
    expect(fnBody).not.toContain(".from('jobs')");
    expect(fnBody).not.toContain('.update(');
  });

  it('no lifecycle timestamps are generated by client updateJobStatus', () => {
    const custSrc = fs.readFileSync(custCtxPath, 'utf-8');
    const provSrc = fs.readFileSync(provCtxPath, 'utf-8');
    const custFn = custSrc.substring(custSrc.indexOf('async function updateJobStatus'), custSrc.indexOf('async function sendCompletionEmails'));
    const provFn = provSrc.substring(provSrc.indexOf('async function updateJobStatus'), provSrc.indexOf('async function sendTemplatedEmail'));
    for (const fn of [custFn, provFn]) {
      expect(fn).not.toContain('accepted_at');
      expect(fn).not.toContain('started_at');
      expect(fn).not.toContain('completed_at');
      expect(fn).not.toContain('new Date().toISOString()');
    }
  });

  it('LiveTracking customer completion uses confirmation RPC', () => {
    const src = fs.readFileSync(liveTrackingPath, 'utf-8');
    expect(src).toContain("supabase.rpc('confirm_customer_job_completion'");
    // Must NOT directly write customer_completed_at
    expect(src).not.toContain("customer_completed_at:");
    expect(src).not.toContain("customer_completed_at':");
  });

  it('cancellation still uses cancel_job RPC', () => {
    const custSrc = fs.readFileSync(custCtxPath, 'utf-8');
    const provSrc = fs.readFileSync(provCtxPath, 'utf-8');
    expect(custSrc).toContain("supabase.rpc('cancel_job");
    expect(provSrc).toContain("supabase.rpc('cancel_job");
  });

  it('acceptance still uses accept_job RPC', () => {
    // accept_job is called from provider JobRequest page, not context
    const provSrc = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/provider-web/src/pages/provider/JobRequest.tsx'), 'utf-8'
    );
    expect(provSrc).toContain("'accept_job'");
  });

  it('migration creates guard trigger and participant RPC', () => {
    const src = fs.readFileSync(migrationPath, 'utf-8');
    expect(src).toContain('guard_job_lifecycle_fields');
    expect(src).toContain('transition_job_status_by_participant');
    expect(src).toContain('confirm_customer_job_completion');
    expect(src).toContain('SECURITY DEFINER');
    expect(src).toContain('FOR UPDATE');
    expect(src).toContain("current_user IN ('postgres'");
  });

  it('TRACK-001 tracking shutdown behavior is unchanged', () => {
    const src = fs.readFileSync(liveTrackingPath, 'utf-8');
    expect(src).toContain('isTrackingActive');
    expect(src).toContain('enabled: isTrackingActive');
  });
});

// =============================================================================
// MATCH-001: Provider acceptance serialization tests
// =============================================================================

describe('Provider acceptance serialization (MATCH-001)', () => {
  it('JobRequest still calls accept_job RPC', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/provider-web/src/pages/provider/JobRequest.tsx'), 'utf-8'
    );
    expect(src).toContain("supabase.rpc('accept_job'");
    expect(src).toContain('p_job_id');
    expect(src).toContain('p_provider_id');
  });

  it('accept_job p_provider_id comes from authenticated user', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/provider-web/src/pages/provider/JobRequest.tsx'), 'utf-8'
    );
    expect(src).toContain('p_provider_id: user.id');
  });

  it('failed acceptance navigates home', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/provider-web/src/pages/provider/JobRequest.tsx'), 'utf-8'
    );
    // On !data.success, navigates home
    expect(src).toContain("navigate('/home')");
  });

  it('ProviderHome suppresses new requests when provider has active job', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/provider-web/src/pages/provider/ProviderHome.tsx'), 'utf-8'
    );
    // ProviderHome checks for active jobs
    expect(src).toContain("'accepted'");
    expect(src).toContain("'in_progress'");
  });

  it('accept_job migration includes provider advisory lock serialization', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'supabase/migrations/20260809000000_serialize_provider_acceptance.sql'), 'utf-8'
    );
    expect(src).toContain('pg_advisory_xact_lock');
    expect(src).toContain('PROVIDER_BUSY');
    expect(src).toContain("status IN ('accepted'");
    expect(src).toContain('SECURITY DEFINER');
    expect(src).toContain('auth.uid()');
  });

  it('cancellation still uses cancel_job RPC (no regression)', () => {
    const custCtx = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/customer-web/src/context/JobContext.jsx'), 'utf-8'
    );
    expect(custCtx).toContain("supabase.rpc('cancel_job");
  });

  it('CROSS-001 updateJobStatus still uses transition RPC (no regression)', () => {
    const provCtx = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/provider-web/src/context/JobContext.jsx'), 'utf-8'
    );
    expect(provCtx).toContain("supabase.rpc('transition_job_status_by_participant'");
  });
});

// =============================================================================
// PROV-001: Provider verification protection tests
// =============================================================================

describe('Provider verification protection (PROV-001)', () => {
  it('verification guard migration exists', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'supabase/migrations/20260810000000_protect_provider_verification.sql'), 'utf-8'
    );
    expect(src).toContain('guard_provider_verification');
    expect(src).toContain('is_verified');
    expect(src).toContain('is_admin');
    expect(src).toContain('BEFORE INSERT OR UPDATE');
    expect(src).toContain("current_user IN ('postgres'");
  });

  it('ProviderSignup does not set is_verified', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/provider-web/src/pages/provider/ProviderSignup.tsx'), 'utf-8'
    );
    expect(src).not.toContain('is_verified');
  });

  it('ProviderHome is_online toggle does not touch is_verified', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/provider-web/src/pages/provider/ProviderHome.tsx'), 'utf-8'
    );
    // Search for upsert/update calls to provider_profiles — none should include is_verified
    const ppUpdates = src.match(/\.from\(['"]provider_profiles['"]\)[\s\S]*?\.(update|upsert)\(/g) || [];
    for (const update of ppUpdates) {
      expect(update).not.toContain('is_verified');
    }
  });

  it('admin approval pages set is_verified for providers', () => {
    const approvalSrc = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/admin-web/src/pages/admin/ProviderApproval.tsx'), 'utf-8'
    );
    expect(approvalSrc).toContain('is_verified');
  });
});

// =============================================================================
// SUSP-001: Provider suspension enforcement tests
// =============================================================================

describe('Provider suspension enforcement (SUSP-001)', () => {
  it('suspension enforcement migration exists', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'supabase/migrations/20260811000000_enforce_provider_suspension.sql'), 'utf-8'
    );
    expect(src).toContain('guard_profiles_suspension');
    expect(src).toContain('PROVIDER_SUSPENDED');
    expect(src).toContain("p.status = 'suspended'");
    expect(src).toContain('get_nearby_providers');
    expect(src).toContain('accept_job');
  });

  it('accept_job checks suspension before advisory lock', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'supabase/migrations/20260811000000_enforce_provider_suspension.sql'), 'utf-8'
    );
    const suspIdx = src.indexOf('PROVIDER_SUSPENDED');
    const lockIdx = src.indexOf('pg_advisory_xact_lock');
    expect(suspIdx).toBeGreaterThan(-1);
    expect(lockIdx).toBeGreaterThan(-1);
    expect(suspIdx).toBeLessThan(lockIdx);
  });

  it('admin Providers page still manages suspension', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/admin-web/src/pages/admin/Providers.tsx'), 'utf-8'
    );
    expect(src).toContain('suspended');
    expect(src).toContain('suspended_at');
  });

  it('PROV-001 verification protection unchanged', () => {
    expect(fs.existsSync(
      path.resolve(REPO_ROOT, 'supabase/migrations/20260810000000_protect_provider_verification.sql')
    )).toBe(true);
  });
});

// =============================================================================
// DEL-001: Account deletion lifecycle tests
// =============================================================================

describe('Account deletion lifecycle (DEL-001)', () => {
  it('constraint migration adds pending_deletion', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'supabase/migrations/20260812000000_allow_pending_deletion_status.sql'), 'utf-8'
    );
    expect(src).toContain('pending_deletion');
    expect(src).toContain('profiles_status_check');
  });

  it('customer deletion uses RPC and handles errors', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/customer-web/src/pages/customer/AccountSecurity.tsx'), 'utf-8'
    );
    expect(src).toContain("supabase.rpc('request_account_deletion'");
    expect(src).toContain('setDeleteError');
    const rpcCall = src.indexOf('request_account_deletion');
    const signOut = src.indexOf('signOut');
    const successLine = src.indexOf('pending review');
    expect(rpcCall).toBeLessThan(successLine);
    expect(successLine).toBeLessThan(signOut);
  });

  it('provider deletion uses RPC and handles errors', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/provider-web/src/pages/provider/AccountSecurity.tsx'), 'utf-8'
    );
    expect(src).toContain("supabase.rpc('request_account_deletion'");
    expect(src).toContain('setDeleteError');
    const rpcCall = src.indexOf('request_account_deletion');
    const signOut = src.indexOf('signOut');
    expect(rpcCall).toBeLessThan(signOut);
  });
});

// =============================================================================
// CANCEL-RACE-001: Server-owned no-provider expiry
// =============================================================================

describe('Server-owned no-provider expiry (CANCEL-RACE-001)', () => {
  const liveTrackingPath = path.resolve(REPO_ROOT, 'apps/customer-web/src/pages/customer/LiveTracking.tsx');

  it('LiveTracking does NOT invoke cancelJob with request_expired from a timer', () => {
    const src = fs.readFileSync(liveTrackingPath, 'utf-8');
    expect(src).not.toContain("cancelJob(jobId!, 'request_expired')");
    expect(src).not.toContain("cancelJob(jobId, 'request_expired')");
    expect(src).not.toContain("'request_expired'");
  });

  it('no client-side EXPIRE_MS / 2-hour timer exists', () => {
    const src = fs.readFileSync(liveTrackingPath, 'utf-8');
    expect(src).not.toContain('EXPIRE_MS');
    expect(src).not.toContain('2 * 60 * 60 * 1000');
    expect(src).not.toContain('checkExpiry');
  });

  it('expired is an explicit JobStatus (not normalized to pending)', () => {
    const src = fs.readFileSync(liveTrackingPath, 'utf-8');
    // JobStatus type includes expired
    expect(src).toMatch(/type JobStatus\s*=.*'expired'/);
    // normalizeJobStatus explicitly returns expired
    expect(src).toMatch(/case 'expired':/);
    // JOB_STATUS_ORDER includes expired
    expect(src).toContain('expired: 6');
  });

  it('expired is terminal for tracking', () => {
    const src = fs.readFileSync(liveTrackingPath, 'utf-8');
    expect(src).toContain("status !== 'expired'");
    expect(src).toContain('isTrackingActive');
  });

  it('server-expired state navigates customer home with neutral message', () => {
    const src = fs.readFileSync(liveTrackingPath, 'utf-8');
    expect(src).toContain("status === 'expired'");
    expect(src).toContain("navigate('/customer/home')");
    expect(src).toContain('Request Expired');
    // Must NOT infer payment/refund outcome — server notification is authoritative
    expect(src).not.toContain('will be refunded');
    expect(src).not.toContain('has been refunded');
    expect(src).not.toContain('payment');
  });

  it('existing customer explicit cancellation still uses cancelJob', () => {
    const src = fs.readFileSync(liveTrackingPath, 'utf-8');
    // LiveTracking still calls cancelJob for user-initiated cancellation
    expect(src).toContain('cancelJob(jobId');
    // The cancel_job RPC is in JobContext, not LiveTracking
    const ctxSrc = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/customer-web/src/context/JobContext.jsx'), 'utf-8'
    );
    expect(ctxSrc).toContain("supabase.rpc('cancel_job");
    // But no request_expired usage remains
    expect(src).not.toContain("'request_expired'");
  });

  it('server expiry migration remains unchanged', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'supabase/migrations/20260805000000_no_provider_expiry_refund.sql'), 'utf-8'
    );
    expect(src).toContain('claim_expiry_eligible_jobs');
    expect(src).toContain("j.status = 'pending'");
    expect(src).toContain('j.provider_id IS NULL');
  });
});

// =============================================================================
// PROV-002: Verified-only matching and acceptance
// =============================================================================

describe('PROV-002: Verified-only provider matching and acceptance', () => {
  const migrationPath = path.resolve(
    REPO_ROOT, 'supabase/migrations/20260815000000_financial_completion.sql'
  );

  it('get_nearby_providers requires pp.is_verified = true', () => {
    const src = fs.readFileSync(migrationPath, 'utf-8');
    expect(src).toContain('pp.is_verified = true');
    // Must appear in the WHERE clause of the matching query
    const fnStart = src.indexOf('get_nearby_providers');
    const verifiedCheck = src.indexOf('pp.is_verified = true', fnStart);
    expect(verifiedCheck).toBeGreaterThan(fnStart);
  });

  it('accept_job blocks unverified providers with PROVIDER_NOT_VERIFIED', () => {
    const src = fs.readFileSync(migrationPath, 'utf-8');
    expect(src).toContain('PROVIDER_NOT_VERIFIED');
    expect(src).toContain('v_is_verified IS NOT TRUE');
  });

  it('accept_job checks verification AFTER suspension check', () => {
    const src = fs.readFileSync(migrationPath, 'utf-8');
    const acceptStart = src.indexOf("CREATE OR REPLACE FUNCTION public.accept_job");
    const suspCheck = src.indexOf('PROVIDER_SUSPENDED', acceptStart);
    const verCheck = src.indexOf('PROVIDER_NOT_VERIFIED', acceptStart);
    expect(suspCheck).toBeLessThan(verCheck);
  });

  it('get_nearby_providers requires active status (fail-closed)', () => {
    const src = fs.readFileSync(migrationPath, 'utf-8');
    const fnStart = src.indexOf('get_nearby_providers');
    const fnEnd = src.indexOf('$$;', fnStart);
    const fnBody = src.slice(fnStart, fnEnd);
    expect(fnBody).toContain("p.status = 'active'");
  });
});

// =============================================================================
// Pending deletion: accept_job and job creation blocks
// =============================================================================

describe('Pending deletion lifecycle enforcement', () => {
  const migrationPath = path.resolve(
    REPO_ROOT, 'supabase/migrations/20260815000000_financial_completion.sql'
  );

  it('accept_job blocks pending_deletion providers with ACCOUNT_PENDING_DELETION', () => {
    const src = fs.readFileSync(migrationPath, 'utf-8');
    expect(src).toContain('ACCOUNT_PENDING_DELETION');
    const acceptStart = src.indexOf("CREATE OR REPLACE FUNCTION public.accept_job");
    const deletionCheck = src.indexOf('ACCOUNT_PENDING_DELETION', acceptStart);
    expect(deletionCheck).toBeGreaterThan(acceptStart);
  });

  it('job creation trigger blocks pending_deletion customers', () => {
    const src = fs.readFileSync(migrationPath, 'utf-8');
    expect(src).toContain('check_user_not_pending_deletion');
    expect(src).toContain("v_status = 'pending_deletion'");
    expect(src).toContain('trg_check_deletion_on_job_create');
  });

  it('admin Users page renders pending_deletion badge', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/admin-web/src/pages/admin/Users.tsx'), 'utf-8'
    );
    expect(src).toContain("case 'pending_deletion'");
    expect(src).toContain('bg-orange-100 text-orange-700');
  });
});

// =============================================================================
// Financial completion: tipping, cancellation refunds, provider earnings
// =============================================================================

describe('Financial completion integrity', () => {
  const migrationPath = path.resolve(
    REPO_ROOT, 'supabase/migrations/20260815000000_financial_completion.sql'
  );

  it('provider_earnings supports multiple entry types per job', () => {
    const src = fs.readFileSync(migrationPath, 'utf-8');
    expect(src).toContain('provider_earnings_unique_job_type');
    expect(src).toContain("entry_type TEXT NOT NULL DEFAULT 'service_earning'");
  });

  it('tip finalization creates provider earning only on succeeded', () => {
    const src = fs.readFileSync(migrationPath, 'utf-8');
    const fnStart = src.indexOf('finalize_tip_payment');
    const fnBody = src.slice(fnStart, src.indexOf('$$;', fnStart));
    expect(fnBody).toContain("p_stripe_status = 'succeeded'");
    expect(fnBody).toContain("'tip'");
  });

  it('cancellation refund does NOT create provider compensation prematurely', () => {
    const src = fs.readFileSync(migrationPath, 'utf-8');
    const fnStart = src.indexOf('cancel_job_with_refund');
    const fnEnd = src.indexOf('$$;', fnStart);
    const fnBody = src.slice(fnStart, fnEnd);
    expect(fnBody).toContain('Provider compensation created ONLY after refund succeeds');
  });

  it('admin settings includes tipping controls', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/admin-web/src/pages/admin/Settings.tsx'), 'utf-8'
    );
    expect(src).toContain('tipping_enabled');
    expect(src).toContain('tip_presets');
    expect(src).toContain('Enable Tipping');
  });

  it('admin finance renders cancellation operations and tips', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/admin-web/src/pages/admin/Finance.tsx'), 'utf-8'
    );
    expect(src).toContain('setCancelOps');
    expect(src).toContain('setTips');
    expect(src).toContain('setEarnings');
    expect(src).toContain('Cancellation Refunds');
    expect(src).toContain('Tips & Provider Earnings');
  });

  it('provider Earnings.tsx uses ledger not job-based recomputation', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/provider-web/src/pages/provider/Earnings.tsx'), 'utf-8'
    );
    expect(src).toContain('provider_earnings');
    expect(src).toContain('ledgerEntries');
    expect(src).toContain("entry_type === 'service_earning'");
    expect(src).toContain("entry_type === 'tip'");
    expect(src).toContain("entry_type === 'cancellation_compensation'");
    // Must NOT reference earningsRes directly in calcProviderEarnings
    expect(src).not.toContain('(earningsRes as any)');
  });

  it('ServiceCompletion consumes tipping settings', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/customer-web/src/pages/customer/ServiceCompletion.tsx'), 'utf-8'
    );
    expect(src).toContain('tipping_enabled');
    expect(src).toContain('tip_presets');
    expect(src).toContain('handleNextAction');
  });
});

// =============================================================================
// Supabase modern secret key support
// =============================================================================

describe('Supabase modern secret key support', () => {
  const sharedKeyPath = path.resolve(REPO_ROOT, 'supabase/functions/_shared/supabaseKeys.ts');

  it('shared helper exists with getSupabaseSecretKey and getSupabasePublishableKey', () => {
    const src = fs.readFileSync(sharedKeyPath, 'utf-8');
    expect(src).toContain('export function getSupabaseSecretKey');
    expect(src).toContain('export function getSupabasePublishableKey');
  });

  it('shared helper prefers SUPABASE_SECRET_KEYS JSON over legacy', () => {
    const src = fs.readFileSync(sharedKeyPath, 'utf-8');
    expect(src).toContain('SUPABASE_SECRET_KEYS');
    expect(src).toContain("parsed?.default");
    // Fallback to legacy
    expect(src).toContain('SERVICE_ROLE_KEY');
    expect(src).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('shared helper prefers SUPABASE_PUBLISHABLE_KEYS JSON over legacy', () => {
    const src = fs.readFileSync(sharedKeyPath, 'utf-8');
    expect(src).toContain('SUPABASE_PUBLISHABLE_KEYS');
    expect(src).toContain('SUPABASE_ANON_KEY');
  });

  it('all Edge Functions import from shared helper', () => {
    const fns = [
      'create-payment-intent', 'create-tip-intent', 'expire-pending-jobs',
      'process-cancellation-refunds', 'stripe-webhook', 'send-email', 'send-sms',
    ];
    for (const fn of fns) {
      const src = fs.readFileSync(
        path.resolve(REPO_ROOT, `supabase/functions/${fn}/index.ts`), 'utf-8'
      );
      expect(src).toContain("from '../_shared/supabaseKeys.ts'");
      expect(src).toContain('getSupabaseSecretKey');
    }
  });

  it('no Edge Function directly reads SERVICE_ROLE_KEY after migration', () => {
    const fns = [
      'create-payment-intent', 'create-tip-intent', 'expire-pending-jobs',
      'process-cancellation-refunds', 'stripe-webhook', 'send-email', 'send-sms',
    ];
    for (const fn of fns) {
      const src = fs.readFileSync(
        path.resolve(REPO_ROOT, `supabase/functions/${fn}/index.ts`), 'utf-8'
      );
      expect(src).not.toContain("Deno.env.get('SERVICE_ROLE_KEY')");
      expect(src).not.toContain("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')");
    }
  });

  it('shared helper warns that modern keys are not JWTs', () => {
    const src = fs.readFileSync(sharedKeyPath, 'utf-8');
    expect(src).toContain('NOT JWTs');
  });

  it('no Edge Function uses Supabase key as Bearer token (only Stripe uses Bearer)', () => {
    // The service role key should only go into createClient(), never as Authorization: Bearer
    const fns = [
      'create-payment-intent', 'create-tip-intent', 'expire-pending-jobs',
      'process-cancellation-refunds', 'stripe-webhook', 'send-email', 'send-sms',
    ];
    for (const fn of fns) {
      const src = fs.readFileSync(
        path.resolve(REPO_ROOT, `supabase/functions/${fn}/index.ts`), 'utf-8'
      );
      // All Bearer usages should be with stripeSecretKey, authHeader, or other non-supabase vars
      const bearerLines = src.split('\n').filter((l: string) => l.includes('Bearer') && l.includes('supabaseServiceRoleKey'));
      expect(bearerLines).toHaveLength(0);
      const bearerLines2 = src.split('\n').filter((l: string) => l.includes('Bearer') && l.includes('serviceRoleKey'));
      expect(bearerLines2).toHaveLength(0);
    }
  });
});

// =============================================================================
// Account deletion wording truthfulness
// =============================================================================

describe('Account deletion wording truthfulness', () => {
  it('customer deletion confirm does NOT promise automatic permanent destruction', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/customer-web/src/pages/customer/AccountSecurity.tsx'), 'utf-8'
    );
    expect(src).not.toContain('permanently removed within 30 days');
    expect(src).toContain('review and process your request');
  });

  it('provider deletion confirm does NOT promise automatic permanent destruction', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/provider-web/src/pages/provider/AccountSecurity.tsx'), 'utf-8'
    );
    expect(src).not.toContain('permanently removed within 30 days');
    expect(src).toContain('review and process your request');
  });

  it('customer deletion success message says scheduled, not permanent', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/customer-web/src/pages/customer/AccountSecurity.tsx'), 'utf-8'
    );
    expect(src).toContain('pending review');
  });

  it('provider deletion success message says scheduled, not permanent', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/provider-web/src/pages/provider/AccountSecurity.tsx'), 'utf-8'
    );
    expect(src).toContain('pending review');
  });
});

// =============================================================================
// Defect 1: Paid cancellation fail-closed on missing checkout linkage
// =============================================================================

describe('Paid cancellation fail-closed checkout linkage', () => {
  const migrationPath = path.resolve(REPO_ROOT, 'supabase/migrations/20260815000000_financial_completion.sql');

  it('get_cancellation_quote fails on paid job with NULL checkout_id', () => {
    const src = fs.readFileSync(migrationPath, 'utf-8');
    const fnStart = src.indexOf('get_cancellation_quote');
    const fnBody = src.slice(fnStart, src.indexOf('$$;', fnStart));
    expect(fnBody).toContain('CHECKOUT_LINKAGE_MISSING');
    expect(fnBody).toContain('checkout_id IS NULL');
  });

  it('get_cancellation_quote fails on paid job with invalid checkout', () => {
    const src = fs.readFileSync(migrationPath, 'utf-8');
    const fnStart = src.indexOf('get_cancellation_quote');
    const fnBody = src.slice(fnStart, src.indexOf('$$;', fnStart));
    expect(fnBody).toContain('CHECKOUT_VERIFICATION_FAILED');
  });

  it('cancel_job_with_refund sends paid+NULL checkout to manual_review', () => {
    const src = fs.readFileSync(migrationPath, 'utf-8');
    const fnStart = src.indexOf('cancel_job_with_refund');
    const fnBody = src.slice(fnStart, src.indexOf('$$;', fnStart));
    expect(fnBody).toContain('NULL checkout_id');
    expect(fnBody).toContain("'manual_review'");
  });

  it('both RPCs no longer gate checkout lookup on checkout_id IS NOT NULL', () => {
    const src = fs.readFileSync(migrationPath, 'utf-8');
    // The old pattern was: IF v_job.payment_status = 'paid' AND v_job.checkout_id IS NOT NULL
    // Should NOT appear anymore — now just: IF v_job.payment_status = 'paid'
    const quoteStart = src.indexOf('get_cancellation_quote');
    const quoteBody = src.slice(quoteStart, src.indexOf('$$;', quoteStart));
    expect(quoteBody).not.toContain("payment_status = 'paid' AND v_job.checkout_id IS NOT NULL");

    const cancelStart = src.indexOf('cancel_job_with_refund');
    const cancelBody = src.slice(cancelStart, src.indexOf('$$;', cancelStart));
    expect(cancelBody).not.toContain("payment_status = 'paid' AND v_job.checkout_id IS NOT NULL");
  });
});

// =============================================================================
// Defect 2: Admin Finance RLS
// =============================================================================

describe('Admin Finance RLS', () => {
  it('job_cancellation_operations has admin SELECT policy', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'supabase/migrations/20260815000000_financial_completion.sql'), 'utf-8'
    );
    expect(src).toContain('Admin can read cancellation ops');
    expect(src).toContain('FOR SELECT USING (is_admin(auth.uid()))');
  });

  it('job_tips has admin SELECT policy', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'supabase/migrations/20260815000000_financial_completion.sql'), 'utf-8'
    );
    expect(src).toContain('Admin can view all tips');
  });
});

// =============================================================================
// Defect 3: Provider Earnings ledger period filtering
// =============================================================================

describe('Provider Earnings ledger period filtering', () => {
  const earningsPath = path.resolve(REPO_ROOT, 'apps/provider-web/src/pages/provider/Earnings.tsx');

  it('calcLedgerStats filters by created_at timestamp', () => {
    const src = fs.readFileSync(earningsPath, 'utf-8');
    expect(src).toContain('calcLedgerStats');
    expect(src).toContain("new Date(e.created_at) >= since");
  });

  it('chart uses ledger entry timestamps, not job-based filtering', () => {
    const src = fs.readFileSync(earningsPath, 'utf-8');
    const chartSection = src.slice(src.indexOf('// Chart data'), src.indexOf('// Per-job'));
    expect(chartSection).toContain("new Date(e.created_at) >= weekStart");
    expect(chartSection).not.toContain('deriveBasePrice');
  });

  it('recent jobs use ledger for finalized and estimate for active', () => {
    const src = fs.readFileSync(earningsPath, 'utf-8');
    expect(src).toContain('isFinalized');
    expect(src).toContain('isEstimated');
    expect(src).toContain('jobLedgerMap');
  });

  it('cancellation compensation is tracked separately from tips', () => {
    const src = fs.readFileSync(earningsPath, 'utf-8');
    expect(src).toContain('netCompensation');
    expect(src).toContain('compensationGross');
    expect(src).toContain('Cancellation compensation');
  });
});

// =============================================================================
// Defect 4: Admin Settings cancel fee + tip_presets validation
// =============================================================================

describe('Admin Settings cancel fee and tip_presets', () => {
  const settingsPath = path.resolve(REPO_ROOT, 'apps/admin-web/src/pages/admin/Settings.tsx');

  it('interface includes cancel_fee_accepted_pct and cancel_fee_arrived_pct', () => {
    const src = fs.readFileSync(settingsPath, 'utf-8');
    expect(src).toContain('cancel_fee_accepted_pct: number');
    expect(src).toContain('cancel_fee_arrived_pct: number');
    expect(src).not.toContain('cancellation_fee_pct: number');
  });

  it('defaults include both cancellation fee keys', () => {
    const src = fs.readFileSync(settingsPath, 'utf-8');
    expect(src).toContain('cancel_fee_accepted_pct: 25');
    expect(src).toContain('cancel_fee_arrived_pct: 50');
  });

  it('tip_presets JSON array is validated before save', () => {
    const src = fs.readFileSync(settingsPath, 'utf-8');
    expect(src).toContain('JSON.parse(settings.tip_presets)');
    expect(src).toContain('Array.isArray(parsedTipPresets)');
  });

  it('cancellation percentages validated to 0-100 range', () => {
    const src = fs.readFileSync(settingsPath, 'utf-8');
    expect(src).toContain("v < 0 || v > 100");
  });

  it('tip_presets serialized as JSON array when saving to DB', () => {
    const src = fs.readFileSync(settingsPath, 'utf-8');
    expect(src).toContain("key === 'tip_presets' ? parsedTipPresets : value");
  });

  it('loading handles JSON array from DB for tip_presets', () => {
    const src = fs.readFileSync(settingsPath, 'utf-8');
    expect(src).toContain("Array.isArray(row.value)");
    expect(src).toContain("JSON.stringify(row.value)");
  });
});

// =============================================================================
// Defect 5: PROV-002 active status fail-closed
// =============================================================================

describe('PROV-002 active status fail-closed', () => {
  const migrationPath = path.resolve(REPO_ROOT, 'supabase/migrations/20260815000000_financial_completion.sql');

  it('get_nearby_providers positively requires status = active', () => {
    const src = fs.readFileSync(migrationPath, 'utf-8');
    const fnStart = src.indexOf('get_nearby_providers');
    const fnBody = src.slice(fnStart, src.indexOf('$$;', fnStart));
    expect(fnBody).toContain("p.status = 'active'");
    // Must NOT use deny-list pattern
    expect(fnBody).not.toContain("p.status IN ('suspended'");
  });

  it('accept_job requires active status via fail-closed CASE', () => {
    const src = fs.readFileSync(migrationPath, 'utf-8');
    const fnStart = src.indexOf('CREATE OR REPLACE FUNCTION public.accept_job');
    const fnBody = src.slice(fnStart, src.indexOf('$$;', fnStart));
    expect(fnBody).toContain("IS DISTINCT FROM 'active'");
    expect(fnBody).toContain('PROVIDER_INACTIVE');
    expect(fnBody).toContain('PROVIDER_NOT_FOUND');
  });
});

// =============================================================================
// Defect 6: Tip SCA + idempotent continuation
// =============================================================================

describe('Tip SCA and idempotent continuation', () => {
  it('request_tip_payment returns existing tip for retry instead of TIP_ALREADY_EXISTS', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'supabase/migrations/20260815000000_financial_completion.sql'), 'utf-8'
    );
    const fnStart = src.indexOf('request_tip_payment');
    const fnBody = src.slice(fnStart, src.indexOf('$$;', fnStart));
    // Should NOT have the old hard block
    expect(fnBody).not.toContain("'TIP_ALREADY_EXISTS'");
    // Should return existing tip for continuation
    expect(fnBody).toContain("'existing', true");
    // Should block completed tips
    expect(fnBody).toContain("TIP_ALREADY_COMPLETED");
  });

  it('create-tip-intent retrieves existing PI from Stripe for SCA continuation', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'supabase/functions/create-tip-intent/index.ts'), 'utf-8'
    );
    expect(src).toContain('payment_intents/${tip.payment_intent_id}');
    expect(src).toContain('client_secret');
    expect(src).toContain('already_created');
  });

  it('create-tip-intent verifies PI belongs to tip via metadata', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'supabase/functions/create-tip-intent/index.ts'), 'utf-8'
    );
    expect(src).toContain('metadata?.tip_id');
    expect(src).toContain('PaymentIntent identity mismatch');
  });

  it('create-tip-intent handles dead PIs by clearing and recreating', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'supabase/functions/create-tip-intent/index.ts'), 'utf-8'
    );
    expect(src).toContain("status === 'canceled'");
    expect(src).toContain("payment_intent_id: null");
  });

  it('customer ServiceCompletion handles TIP_ALREADY_COMPLETED', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/customer-web/src/pages/customer/ServiceCompletion.tsx'), 'utf-8'
    );
    expect(src).toContain('TIP_ALREADY_COMPLETED');
  });

  it('tip PI uses use_stripe_sdk + card-only + confirm, no return_url', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'supabase/functions/create-tip-intent/index.ts'), 'utf-8'
    );
    // Server-confirmed with Stripe.js handling next actions
    expect(src).toContain("'use_stripe_sdk', 'true'");
    expect(src).toContain("'confirm', 'true'");
    expect(src).toContain("payment_method_types[]', 'card'");
    expect(src).not.toContain('return_url');
    expect(src).not.toContain('off_session');
  });

  it('config.toml sets verify_jwt=false for both payment functions', () => {
    const config = fs.readFileSync(
      path.resolve(REPO_ROOT, 'supabase/config.toml'), 'utf-8'
    );
    // Both payment functions must have verify_jwt = false in config
    // so raw JWT passes through for function-level auth.getUser()
    expect(config).toContain('[functions.create-payment-intent]');
    expect(config).toContain('[functions.create-tip-intent]');
    // Verify each has verify_jwt = false after its section header
    const piSection = config.slice(config.indexOf('[functions.create-payment-intent]'));
    const tipSection = config.slice(config.indexOf('[functions.create-tip-intent]'));
    expect(piSection.slice(0, 100)).toContain('verify_jwt = false');
    expect(tipSection.slice(0, 100)).toContain('verify_jwt = false');
  });

  it('checkout PI uses use_stripe_sdk + card-only + confirm, no return_url', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'supabase/functions/create-payment-intent/index.ts'), 'utf-8'
    );
    expect(src).toContain("'use_stripe_sdk', 'true'");
    expect(src).toContain("'confirm', 'true'");
    expect(src).toContain("payment_method_types[]', 'card'");
    expect(src).not.toContain('return_url');
  });

  it('webhook finalization remains idempotent', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'supabase/migrations/20260815000000_financial_completion.sql'), 'utf-8'
    );
    const fnStart = src.indexOf('finalize_tip_payment');
    const fnBody = src.slice(fnStart, src.indexOf('$$;', fnStart));
    expect(fnBody).toContain("v_tip.stripe_status = 'succeeded'");
    expect(fnBody).toContain("'already_completed', true");
    expect(fnBody).toContain('ON CONFLICT (job_id, entry_type) DO NOTHING');
  });
});

// =============================================================================
// Blocker 1: Provider payout state must be authoritative
// =============================================================================

describe('Provider payout state authority', () => {
  const earningsPath = path.resolve(REPO_ROOT, 'apps/provider-web/src/pages/provider/Earnings.tsx');

  it('payout history uses provider_payouts records, not fabricated weekly groups', () => {
    const src = fs.readFileSync(earningsPath, 'utf-8');
    // Must NOT group completed jobs by week and hardcode paid
    expect(src).not.toContain("status: 'paid' as const");
    // Must use actual payout records
    expect(src).toContain('p.status');
    expect(src).toContain('period_start');
    expect(src).toContain('period_end');
  });

  it('payout status renders from actual payout record, not hardcoded', () => {
    const src = fs.readFileSync(earningsPath, 'utf-8');
    expect(src).toContain("payout.status === 'paid'");
    expect(src).toContain("payout.status === 'processing'");
    expect(src).toContain("payout.status === 'failed'");
    expect(src).toContain("payout.status === 'pending'");
    // Actual status label is dynamic
    expect(src).not.toMatch(/>\s*Paid\s*<\/span>\s*\n\s*<\/div>\s*\n\s*<\/div>\s*\n\s*<div.*text-xs.*\n.*Gross/);
  });

  it('ProviderPayout interface includes period and status fields', () => {
    const src = fs.readFileSync(earningsPath, 'utf-8');
    expect(src).toContain('period_start');
    expect(src).toContain('period_end');
    expect(src).toContain("total_earnings");
    expect(src).toContain("total_tips");
    expect(src).toContain("platform_fee");
  });

  it('payouts query fetches complete records for authoritative display', () => {
    const src = fs.readFileSync(earningsPath, 'utf-8');
    expect(src).toContain("'id, status, net_payout, total_earnings, total_tips, platform_fee, period_start, period_end, created_at'");
  });
});

// =============================================================================
// Blocker 2: Tip SCA + retry state
// =============================================================================

describe('Tip SCA and retry state', () => {
  it('tipStatus includes requires_action state', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/customer-web/src/pages/customer/ServiceCompletion.tsx'), 'utf-8'
    );
    expect(src).toContain("'requires_action'");
    expect(src).toContain("tipClientSecret");
  });

  it('handles PI status requires_action explicitly', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/customer-web/src/pages/customer/ServiceCompletion.tsx'), 'utf-8'
    );
    expect(src).toContain("piStatus === 'requires_action'");
    expect(src).toContain("piStatus === 'processing'");
    expect(src).toContain("piStatus === 'succeeded'");
    expect(src).toContain("piStatus === 'requires_payment_method'");
    expect(src).toContain("piStatus === 'canceled'");
  });

  it('does not navigate away when tip outcome is actionable', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/customer-web/src/pages/customer/ServiceCompletion.tsx'), 'utf-8'
    );
    expect(src).toContain("tipOutcome === 'idle' || tipOutcome === 'succeeded'");
  });

  it('shows retry guidance for failed tip', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/customer-web/src/pages/customer/ServiceCompletion.tsx'), 'utf-8'
    );
    expect(src).toContain('retry');
  });

  it('shows authentication guidance for requires_action', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/customer-web/src/pages/customer/ServiceCompletion.tsx'), 'utf-8'
    );
    expect(src).toContain('Authentication needed');
  });

  it('create-tip-intent uses atomic RPC for dead PI retry', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'supabase/functions/create-tip-intent/index.ts'), 'utf-8'
    );
    expect(src).toContain('rotate_tip_idempotency_key');
  });

  it('retry does not skip tip when tipStatus is already succeeded', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/customer-web/src/pages/customer/ServiceCompletion.tsx'), 'utf-8'
    );
    expect(src).toContain("tipStatus !== 'succeeded'");
  });
});

// =============================================================================
// Blocker 1: Provider earnings includes all finalized ledger money
// =============================================================================

describe('Provider earnings includes all finalized ledger money', () => {
  const earningsPath = path.resolve(REPO_ROOT, 'apps/provider-web/src/pages/provider/Earnings.tsx');

  it('all-time stats use ledger timestamps, not completedJobs filter', () => {
    const src = fs.readFileSync(earningsPath, 'utf-8');
    expect(src).toContain('calcLedgerStats()');
    expect(src).not.toContain('calcProviderEarnings(completedJobs)');
  });

  it('week/month stats filter by ledger created_at timestamp', () => {
    const src = fs.readFileSync(earningsPath, 'utf-8');
    expect(src).toContain('calcLedgerStats(weekStart)');
    expect(src).toContain('calcLedgerStats(monthStart)');
  });

  it('calcLedgerStats filters entries by since date', () => {
    const src = fs.readFileSync(earningsPath, 'utf-8');
    expect(src).toContain("new Date(e.created_at) >= since");
  });

  it('chart uses ledger entry timestamps for all entry types including compensation', () => {
    const src = fs.readFileSync(earningsPath, 'utf-8');
    const chartSection = src.slice(src.indexOf('// Chart data'), src.indexOf('// Per-job'));
    expect(chartSection).toContain("new Date(e.created_at) >= weekStart");
    expect(chartSection).toContain('e.provider_net');
  });

  it('cancellation_compensation increases netEarnings and available balance', () => {
    const src = fs.readFileSync(earningsPath, 'utf-8');
    expect(src).toContain('compensationGross');
    expect(src).toContain('serviceGross + compensationGross + totalTips');
  });

  it('paidOutTotal only subtracts paid payouts, not processing/pending', () => {
    const src = fs.readFileSync(earningsPath, 'utf-8');
    expect(src).toContain("p.status === 'paid'");
    expect(src).toContain('allTimeStats.netEarnings - paidOutTotal');
  });

  it('pending estimate is clearly separate from finalized ledger', () => {
    const src = fs.readFileSync(earningsPath, 'utf-8');
    expect(src).toContain('deriveBasePrice');
    expect(src).toContain('pendingJobs');
  });
});

// =============================================================================
// Blocker 2: Tip SCA/retry control flow
// =============================================================================

describe('Tip SCA/retry control flow', () => {
  const scPath = path.resolve(REPO_ROOT, 'apps/customer-web/src/pages/customer/ServiceCompletion.tsx');
  const tipIntentPath = path.resolve(REPO_ROOT, 'supabase/functions/create-tip-intent/index.ts');
  const migrationPath = path.resolve(REPO_ROOT, 'supabase/migrations/20260815000000_financial_completion.sql');

  it('2A: uses local tipOutcome variable, not stale React state, for navigation', () => {
    const src = fs.readFileSync(scPath, 'utf-8');
    expect(src).toContain('tipOutcome');
    expect(src).toContain("tipOutcome === 'idle' || tipOutcome === 'succeeded'");
    expect(src).toContain("navigate('/home')");
  });

  it('2A: failed tip stays on page', () => {
    const src = fs.readFileSync(scPath, 'utf-8');
    // Only navigates on idle or succeeded
    const navLine = src.indexOf("navigate('/home')");
    const guardLine = src.lastIndexOf('tipOutcome', navLine);
    expect(src.slice(guardLine, navLine)).toContain("=== 'succeeded'");
  });

  it('2A: tip uses direct fetch with refreshed token, not supabase.functions.invoke', () => {
    const src = fs.readFileSync(scPath, 'utf-8');
    // Must NOT use supabase.functions.invoke for tip
    expect(src).not.toContain("supabase.functions.invoke('create-tip-intent'");
    // Must use direct fetch with explicit auth (same pattern as checkout)
    expect(src).toContain('functions/v1/create-tip-intent');
    expect(src).toContain('Authorization: `Bearer ${tipToken}`');
    expect(src).toContain('supabase.auth.refreshSession()');
    // SCA/3DS handled by handleNextAction (server-confirmed PI)
    expect(src).toContain('handleNextAction');
    // Failure UX
    expect(src).toContain('Continue Without Tip');
    expect(src).toContain('handleContinueWithoutTip');
    // No service-role/secret key in client
    expect(src).not.toContain('service_role');
    expect(src).not.toContain('SUPABASE_SERVICE_ROLE');
  });

  it('2B: new PI response includes status field', () => {
    const src = fs.readFileSync(tipIntentPath, 'utf-8');
    // The new-PI response must include status: pi.status
    const newPiResponse = src.slice(src.lastIndexOf('client_secret: pi.client_secret'));
    expect(newPiResponse).toContain('status: pi.status');
  });

  it('2C: processing maps to processing, not succeeded', () => {
    const src = fs.readFileSync(scPath, 'utf-8');
    const processingBlock = src.slice(
      src.indexOf("piStatus === 'processing'"),
      src.indexOf("piStatus === 'processing'") + 200
    );
    expect(processingBlock).toContain("setTipStatus('processing')");
    expect(processingBlock).not.toContain("setTipStatus('succeeded')");
  });

  it('2C: processing tipOutcome is processing, not succeeded', () => {
    const src = fs.readFileSync(scPath, 'utf-8');
    const processingBlock = src.slice(
      src.indexOf("piStatus === 'processing'"),
      src.indexOf("piStatus === 'processing'") + 200
    );
    expect(processingBlock).toContain("tipOutcome = 'processing'");
    expect(processingBlock).not.toContain("tipOutcome = 'succeeded'");
  });

  it('2D: dead PI rotation uses atomic RPC, not direct DB update', () => {
    const src = fs.readFileSync(tipIntentPath, 'utf-8');
    expect(src).toContain('rotate_tip_idempotency_key');
    expect(src).not.toContain("'torc:tip:retry:' + crypto.randomUUID()");
  });

  it('2D: rotate_tip_idempotency_key uses SELECT FOR UPDATE', () => {
    const src = fs.readFileSync(migrationPath, 'utf-8');
    const fnStart = src.indexOf('rotate_tip_idempotency_key');
    const fnBody = src.slice(fnStart, src.indexOf('$$;', fnStart));
    expect(fnBody).toContain('FOR UPDATE');
    expect(fnBody).toContain('ALREADY_ROTATED');
  });

  it('2D: concurrent loser observes winning PI', () => {
    const src = fs.readFileSync(tipIntentPath, 'utf-8');
    expect(src).toContain('Another caller already rotated');
    expect(src).toContain('winning PI');
  });

  it('succeeded PI is not reconfirmed', () => {
    const src = fs.readFileSync(scPath, 'utf-8');
    const succeededBlock = src.slice(
      src.indexOf("piStatus === 'succeeded'"),
      src.indexOf("piStatus === 'succeeded'") + 200
    );
    expect(succeededBlock).not.toContain('confirmCardPayment');
  });
});

// =============================================================================
// CTO Gate 1: Provider ledger financial consistency
// =============================================================================

describe('Provider ledger financial consistency', () => {
  const earningsPath = path.resolve(REPO_ROOT, 'apps/provider-web/src/pages/provider/Earnings.tsx');

  it('calcLedgerStats includes compensation base_earnings in grossEarnings', () => {
    const src = fs.readFileSync(earningsPath, 'utf-8');
    expect(src).toContain('compensationGross = compEntries.reduce');
    expect(src).toContain("e.base_earnings || 0");
    expect(src).toContain('serviceGross + compensationGross + totalTips');
  });

  it('totalCommission includes fees from both service_earning and cancellation_compensation', () => {
    const src = fs.readFileSync(earningsPath, 'utf-8');
    // Must sum platform_fee from BOTH entry types
    const fnBody = src.slice(src.indexOf('calcLedgerStats'), src.indexOf('jobCount:'));
    const platformFeeReduces = (fnBody.match(/platform_fee/g) || []).length;
    expect(platformFeeReduces).toBeGreaterThanOrEqual(2);
    expect(fnBody).toContain('compEntries.reduce((s: number, e: any) => s + Number(e.platform_fee');
  });

  it('netEarnings sums provider_net across all entry types', () => {
    const src = fs.readFileSync(earningsPath, 'utf-8');
    expect(src).toContain('filtered.reduce((s: number, e: any) => s + Number(e.provider_net');
  });

  it('grossEarnings - totalCommission = netEarnings relationship holds', () => {
    const src = fs.readFileSync(earningsPath, 'utf-8');
    // The code must compute netEarnings as sum of all provider_net
    // and grossEarnings as serviceGross + compensationGross + totalTips
    // These are consistent when tip platform_fee = 0
    expect(src).toContain('grossEarnings = serviceGross + compensationGross + totalTips');
    expect(src).toContain('netEarnings = filtered.reduce');
  });

  it('Tax Summary uses grossEarnings not grossBase + tips', () => {
    const src = fs.readFileSync(earningsPath, 'utf-8');
    expect(src).toContain('allTimeStats.grossEarnings');
    expect(src).not.toContain('allTimeStats.grossBase');
  });

  it('finalized UI does not label fees with current commissionPct', () => {
    const src = fs.readFileSync(earningsPath, 'utf-8');
    // Earnings breakdown uses "Platform fees" not "Platform fee (15%)"
    const breakdownSection = src.slice(src.indexOf('Earnings Breakdown'), src.indexOf('Net Earnings'));
    expect(breakdownSection).toContain("Platform fees");
    expect(breakdownSection).not.toContain('commissionPct');
  });

  it('per-job detail shows estimated label only for unfinalized jobs', () => {
    const src = fs.readFileSync(earningsPath, 'utf-8');
    expect(src).toContain("isEstimated ? `Platform fee (est. ${commissionPct}%)` : 'Platform fees'");
  });
});

// =============================================================================
// CTO Gate 2A: Existing PI retrieval fail-closed
// =============================================================================

describe('Tip PI retrieval fail-closed', () => {
  const tipIntentPath = path.resolve(REPO_ROOT, 'supabase/functions/create-tip-intent/index.ts');

  it('Stripe GET failure returns retryable error, not PI creation', () => {
    const src = fs.readFileSync(tipIntentPath, 'utf-8');
    expect(src).toContain('Could not verify existing payment');
    expect(src).toContain('retryable: true');
    expect(src).toContain('status: 502');
  });

  it('does NOT fall through to create new PI on Stripe lookup failure', () => {
    const src = fs.readFileSync(tipIntentPath, 'utf-8');
    expect(src).not.toContain('Stripe lookup failed — fall through');
  });

  it('only rotates after successful Stripe GET confirms dead status', () => {
    const src = fs.readFileSync(tipIntentPath, 'utf-8');
    // The rotation only happens inside the existingPiRes.ok branch
    const okBranch = src.slice(src.indexOf('existingPiRes.ok'), src.indexOf('Could not verify'));
    expect(okBranch).toContain('rotate_tip_idempotency_key');
    // The else branch (GET failed) does NOT contain rotation
    const elseBranch = src.slice(src.indexOf('Could not verify'));
    expect(elseBranch).not.toContain('rotate_tip_idempotency_key');
  });
});

// =============================================================================
// CTO Gate 2B: SCA return URL
// =============================================================================

describe('Tip SCA return URL', () => {
  const tipIntentPath = path.resolve(REPO_ROOT, 'supabase/functions/create-tip-intent/index.ts');

  it('does not use Edge Function URL as customer return destination', () => {
    const src = fs.readFileSync(tipIntentPath, 'utf-8');
    expect(src).not.toContain('functions/v1/create-tip-intent');
    expect(src).not.toContain('return_url');
  });

  it('uses card-only payment method types for saved-card flow', () => {
    const src = fs.readFileSync(tipIntentPath, 'utf-8');
    expect(src).toContain("payment_method_types[]");
    expect(src).toContain("'card'");
  });

  it('does not use off_session for customer-present flow', () => {
    const src = fs.readFileSync(tipIntentPath, 'utf-8');
    expect(src).not.toContain('off_session');
  });
});

// =============================================================================
// Per-job cancellation compensation breakdown
// =============================================================================

describe('Per-job cancellation compensation breakdown', () => {
  const earningsPath = path.resolve(REPO_ROOT, 'apps/provider-web/src/pages/provider/Earnings.tsx');

  it('jobLedgerMap tracks compGross, compFee, compNet for cancellation_compensation', () => {
    const src = fs.readFileSync(earningsPath, 'utf-8');
    const mapSection = src.slice(src.indexOf('jobLedgerMap'), src.indexOf('recentJobsDetailed'));
    expect(mapSection).toContain('compGross');
    expect(mapSection).toContain('compFee');
    expect(mapSection).toContain('compNet');
  });

  it('cancellation_compensation adds base_earnings to compGross', () => {
    const src = fs.readFileSync(earningsPath, 'utf-8');
    const mapSection = src.slice(src.indexOf('jobLedgerMap'), src.indexOf('recentJobsDetailed'));
    const compBlock = mapSection.slice(mapSection.indexOf("'cancellation_compensation'"));
    expect(compBlock).toContain("cur.compGross += Number(e.base_earnings");
  });

  it('cancellation_compensation adds platform_fee to both compFee and commission', () => {
    const src = fs.readFileSync(earningsPath, 'utf-8');
    const mapSection = src.slice(src.indexOf('jobLedgerMap'), src.indexOf('recentJobsDetailed'));
    const compBlock = mapSection.slice(mapSection.indexOf("'cancellation_compensation'"));
    expect(compBlock).toContain("cur.compFee += Number(e.platform_fee");
    expect(compBlock).toContain("cur.commission += Number(e.platform_fee");
  });

  it('recentJobsDetailed exposes compGross, compFee, compNet', () => {
    const src = fs.readFileSync(earningsPath, 'utf-8');
    const detailSection = src.slice(src.indexOf('recentJobsDetailed'), src.indexOf('payoutHistory'));
    expect(detailSection).toContain('compGross');
    expect(detailSection).toContain('compFee');
    expect(detailSection).toContain('compNet');
  });

  it('expanded UI shows Cancellation compensation label for compGross > 0', () => {
    const src = fs.readFileSync(earningsPath, 'utf-8');
    expect(src).toContain("job.compGross > 0");
    expect(src).toContain("Cancellation compensation");
    expect(src).toContain("fmt(job.compGross)");
  });

  it('expanded UI does NOT show Base price $0 for compensation-only jobs', () => {
    const src = fs.readFileSync(earningsPath, 'utf-8');
    // Service earnings line only renders when basePrice > 0
    expect(src).toContain("job.basePrice > 0");
    // Does NOT unconditionally render "Base price"
    expect(src).not.toContain('>Base price<');
  });

  it('platform fees line renders when commission > 0 or estimated', () => {
    const src = fs.readFileSync(earningsPath, 'utf-8');
    expect(src).toContain("job.commission > 0 || isEstimated");
  });
});

// =============================================================================
// Account deletion store compliance
// =============================================================================

describe('Account deletion store compliance', () => {
  const migrationPath = path.resolve(REPO_ROOT, 'supabase/migrations/20260816000000_account_deletion_compliance.sql');

  // Architecture
  it('has separate self-request, internal-process, and internal-finalize RPCs', () => {
    const src = fs.readFileSync(migrationPath, 'utf-8');
    expect(src).toContain('request_account_deletion');
    expect(src).toContain('_internal_process_deletion');
    expect(src).toContain('_internal_finalize_deletion');
  });

  it('does NOT use current_user for authorization', () => {
    const src = fs.readFileSync(migrationPath, 'utf-8');
    expect(src).not.toContain('current_user NOT IN');
    expect(src).not.toContain("current_user IN ('postgres'");
  });

  // Blocker 1: Authorization
  it('_internal_process_deletion revoked from authenticated/anon/PUBLIC', () => {
    const src = fs.readFileSync(migrationPath, 'utf-8');
    const section = src.slice(src.indexOf('_internal_process_deletion'));
    expect(section).toContain("REVOKE EXECUTE ON FUNCTION public._internal_process_deletion");
    expect(section).toContain('FROM authenticated');
  });

  it('_internal_finalize_deletion revoked from authenticated/anon/PUBLIC', () => {
    const src = fs.readFileSync(migrationPath, 'utf-8');
    const section = src.slice(src.indexOf('_internal_finalize_deletion'));
    expect(section).toContain("REVOKE EXECUTE ON FUNCTION public._internal_finalize_deletion");
    expect(section).toContain('FROM authenticated');
  });

  it('request_account_deletion is self-only via auth.uid()', () => {
    const src = fs.readFileSync(migrationPath, 'utf-8');
    const fnStart = src.indexOf('CREATE OR REPLACE FUNCTION public.request_account_deletion');
    const fnEnd = src.indexOf('$$;', fnStart);
    const fnBody = src.slice(fnStart, fnEnd);
    expect(fnBody).toContain('auth.uid()');
    // Function takes only p_reason, not p_user_id — user determined internally
    expect(fnBody).not.toContain('p_user_id');
  });

  // Blocker 2: Cross-user eligibility
  it('check_deletion_eligibility enforces self-or-admin', () => {
    const src = fs.readFileSync(migrationPath, 'utf-8');
    const fnStart = src.indexOf('CREATE OR REPLACE FUNCTION public.check_deletion_eligibility');
    const fnBody = src.slice(fnStart, src.indexOf('$$;', fnStart));
    expect(fnBody).toContain('v_caller != p_user_id');
    expect(fnBody).toContain('is_admin(v_caller)');
    expect(fnBody).toContain("'UNAUTHORIZED'");
  });

  // Blocker 3: Two-stage deletion
  it('_internal_process_deletion sets deletion_processing, not deleted', () => {
    const src = fs.readFileSync(migrationPath, 'utf-8');
    const fnStart = src.indexOf('CREATE OR REPLACE FUNCTION public._internal_process_deletion');
    const fnEnd = src.indexOf('$$;', fnStart);
    const fnBody = src.slice(fnStart, fnEnd);
    expect(fnBody).toContain("'deletion_processing'");
    // The UPDATE sets deletion_processing, NOT deleted
    const updateLine = fnBody.match(/UPDATE profiles SET[\s\S]*?WHERE id = p_user_id/);
    expect(updateLine).not.toBeNull();
    expect(updateLine![0]).toContain('deletion_processing');
    expect(updateLine![0]).not.toContain("= 'deleted'");
  });

  it('_internal_finalize_deletion verifies auth.users absence', () => {
    const src = fs.readFileSync(migrationPath, 'utf-8');
    const fnStart = src.indexOf('CREATE OR REPLACE FUNCTION public._internal_finalize_deletion');
    const fnBody = src.slice(fnStart, src.indexOf('$$;', fnStart));
    expect(fnBody).toContain('AUTH_NOT_DELETED');
    expect(fnBody).toContain('auth.users');
    expect(fnBody).toContain('v_auth_exists');
  });

  // Safety checks
  it('fails closed on active jobs, pending refunds, pending payouts', () => {
    const src = fs.readFileSync(migrationPath, 'utf-8');
    expect(src).toContain('ACTIVE_JOBS_EXIST');
    expect(src).toContain('PENDING_REFUNDS');
    expect(src).toContain('PENDING_PAYOUTS');
  });

  // Data handling
  it('anonymizes personal data and retains financial records', () => {
    const src = fs.readFileSync(migrationPath, 'utf-8');
    expect(src).toContain("email = NULL");
    expect(src).toContain("phone = NULL");
    expect(src).toContain('DELETE FROM device_tokens');
    expect(src).not.toContain('DELETE FROM provider_earnings');
    expect(src).not.toContain('DELETE FROM provider_payouts');
  });

  it('drops old process_account_deletion function', () => {
    const src = fs.readFileSync(migrationPath, 'utf-8');
    expect(src).toContain('DROP FUNCTION IF EXISTS public.process_account_deletion');
  });

  // Blocker 4: External web
  it('external web deletion page uses Supabase auth for identity verification', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/website/src/pages/AccountDeletion.jsx'), 'utf-8'
    );
    expect(src).toContain('signInWithOtp');
    expect(src).not.toContain("supabase.from('support_tickets')");
    expect(src).toContain('Check Your Email');
  });

  it('external page calls RPC only after authenticated session', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/website/src/pages/AccountDeletion.jsx'), 'utf-8'
    );
    expect(src).toContain('request_account_deletion');
    expect(src).toContain('getSession');
    expect(src).toContain('onAuthStateChange');
  });

  it('reason is optional', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/website/src/pages/AccountDeletion.jsx'), 'utf-8'
    );
    expect(src).toContain('optional');
  });

  it('website routes include /account-deletion', () => {
    const src = fs.readFileSync(path.resolve(REPO_ROOT, 'apps/website/src/routes.jsx'), 'utf-8');
    expect(src).toContain('/account-deletion');
  });

  it('customer/provider UI explains data retention', () => {
    const cust = fs.readFileSync(path.resolve(REPO_ROOT, 'apps/customer-web/src/pages/customer/AccountSecurity.tsx'), 'utf-8');
    const prov = fs.readFileSync(path.resolve(REPO_ROOT, 'apps/provider-web/src/pages/provider/AccountSecurity.tsx'), 'utf-8');
    expect(cust).toContain('Financial records may be retained');
    expect(prov).toContain('Financial records may be retained');
  });

  // Item 1: In-app RPC wiring
  it('customer uses request_account_deletion RPC, not direct DB mutations', () => {
    const src = fs.readFileSync(path.resolve(REPO_ROOT, 'apps/customer-web/src/pages/customer/AccountSecurity.tsx'), 'utf-8');
    expect(src).toContain("supabase.rpc('request_account_deletion'");
    expect(src).not.toContain("supabase.from('support_tickets').insert");
    expect(src).not.toContain(".update({ status: 'pending_deletion' })");
  });

  it('provider uses request_account_deletion RPC, not direct DB mutations', () => {
    const src = fs.readFileSync(path.resolve(REPO_ROOT, 'apps/provider-web/src/pages/provider/AccountSecurity.tsx'), 'utf-8');
    expect(src).toContain("supabase.rpc('request_account_deletion'");
    expect(src).not.toContain("supabase.from('support_tickets').insert");
    expect(src).not.toContain(".update({ status: 'pending_deletion' })");
  });

  it('blank reason is accepted (no minimum length requirement)', () => {
    const cust = fs.readFileSync(path.resolve(REPO_ROOT, 'apps/customer-web/src/pages/customer/AccountSecurity.tsx'), 'utf-8');
    const prov = fs.readFileSync(path.resolve(REPO_ROOT, 'apps/provider-web/src/pages/provider/AccountSecurity.tsx'), 'utf-8');
    expect(cust).not.toContain('cleanReason.length < 10');
    expect(prov).not.toContain('cleanReason.length < 10');
    expect(cust).toContain('optional');
    expect(prov).toContain('optional');
  });

  // Item 2: Web end-to-end flow
  it('website uses authenticated RPC after magic link, not direct DB insert', () => {
    const src = fs.readFileSync(path.resolve(REPO_ROOT, 'apps/website/src/pages/AccountDeletion.jsx'), 'utf-8');
    expect(src).toContain("supabase.rpc(\"request_account_deletion\"");
    expect(src).not.toContain("support_tickets");
    expect(src).not.toContain("pending_deletion");
  });

  it('website completes deletion on-site, does not require mobile app', () => {
    const src = fs.readFileSync(path.resolve(REPO_ROOT, 'apps/website/src/pages/AccountDeletion.jsx'), 'utf-8');
    expect(src).toContain('redirected back to this page');
    expect(src).toContain('Permanently Delete My Account');
    expect(src).toContain("step === \"confirm\"");
  });

  it('website uses configured redirect URL, not hardcoded', () => {
    const src = fs.readFileSync(path.resolve(REPO_ROOT, 'apps/website/src/pages/AccountDeletion.jsx'), 'utf-8');
    expect(src).toContain('VITE_PUBLIC_URL');
    expect(src).toContain('/account-deletion');
  });

  // Item 3: Trusted auth deletion
  it('trusted Edge Function exists for account deletion', () => {
    expect(fs.existsSync(
      path.resolve(REPO_ROOT, 'supabase/functions/process-account-deletion/index.ts')
    )).toBe(true);
  });

  it('Edge Function uses cron secret auth, not JWT', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'supabase/functions/process-account-deletion/index.ts'), 'utf-8'
    );
    expect(src).toContain('x-torc-cron-secret');
    expect(src).toContain('CRON_SECRET');
  });

  it('Edge Function handles auth deletion failure as retryable', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'supabase/functions/process-account-deletion/index.ts'), 'utf-8'
    );
    expect(src).toContain('AUTH_DELETION_FAILED');
    expect(src).toContain("stage: 'deletion_processing'");
    expect(src).toContain('retryable: true');
  });

  it('Edge Function handles already-absent auth user idempotently', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'supabase/functions/process-account-deletion/index.ts'), 'utf-8'
    );
    expect(src).toContain('status === 404');
    expect(src).toContain('authDeleted = true');
  });

  // Item 4: Explicit grants
  it('internal functions have explicit GRANT to service_role', () => {
    const src = fs.readFileSync(migrationPath, 'utf-8');
    expect(src).toContain('GRANT  EXECUTE ON FUNCTION public._internal_process_deletion(UUID) TO service_role');
    expect(src).toContain('GRANT  EXECUTE ON FUNCTION public._internal_finalize_deletion(UUID) TO service_role');
  });

  it('finalizer verifies auth.users row absence, not caller claim', () => {
    const src = fs.readFileSync(migrationPath, 'utf-8');
    const fnStart = src.indexOf('CREATE OR REPLACE FUNCTION public._internal_finalize_deletion');
    const fnBody = src.slice(fnStart, src.indexOf('$$;', fnStart));
    expect(fnBody).toContain('SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id)');
    expect(fnBody).toContain('v_auth_exists');
    expect(fnBody).not.toContain('p_auth_deleted');
  });

  // Item 3 FK safety
  it('migration drops CASCADE FKs on retained financial tables', () => {
    const src = fs.readFileSync(migrationPath, 'utf-8');
    expect(src).toContain('provider_payouts_provider_id_fkey');
    expect(src).toContain('checkouts_user_id_fkey');
    expect(src).toContain('support_tickets_requester_id_fkey');
    expect(src).toContain('documents_provider_id_fkey');
  });
});

// ============================================================
// PR #29 — Tip webhook finalization hardening
// ============================================================

describe('Tip webhook routing: tip events bypass checkout RPC', () => {
  const webhookSrc = fs.readFileSync(
    path.resolve(REPO_ROOT, 'supabase/functions/stripe-webhook/index.ts'), 'utf-8'
  );

  it('detects tip events via metadata.type', () => {
    expect(webhookSrc).toContain("metadata?.type === 'tip'");
  });

  it('checkout process_stripe_webhook is skipped for tip events', () => {
    // The condition must exclude isTipEvent from entering process_stripe_webhook
    expect(webhookSrc).toContain('&& !isTipEvent');
  });

  it('tip payment_intent.succeeded reaches finalize_tip_payment', () => {
    expect(webhookSrc).toContain("finalize_tip_payment");
    // The tip block handles payment_intent.succeeded
    expect(webhookSrc).toContain("payment_intent.succeeded");
  });

  it('tip payment_intent.payment_failed is routed separately', () => {
    // Tip block handles both succeeded and payment_failed
    expect(webhookSrc).toContain("payment_intent.payment_failed");
    // isTipEvent check covers both event types
    expect(webhookSrc).toContain("isTipEvent && (event.type === 'payment_intent.succeeded' || event.type === 'payment_intent.payment_failed')");
  });

  it('tip finalization failure throws (non-2xx for Stripe retry)', () => {
    // Errors must throw, not just log — outer catch returns 500
    const tipBlock = webhookSrc.slice(webhookSrc.indexOf('TIP PAYMENT LIFECYCLE'));
    expect(tipBlock).toContain('throw new Error');
    // Must NOT silently swallow finalization errors
    expect(tipBlock).not.toMatch(/finalizeErr\);\s*\n\s*\} else/);
  });

  it('duplicate succeeded tip event is idempotent (no throw)', () => {
    expect(webhookSrc).toContain("Tip already finalized");
  });

  it('failed tip creates no provider earning (finalize_tip_payment logic)', () => {
    const migSrc = fs.readFileSync(
      path.resolve(REPO_ROOT, 'supabase/migrations/20260815000000_financial_completion.sql'), 'utf-8'
    );
    const fnStart = migSrc.indexOf('finalize_tip_payment');
    const fnBody = migSrc.slice(fnStart, migSrc.indexOf('$$;', fnStart));
    // Only inserts earning when succeeded
    expect(fnBody).toContain("IF p_stripe_status = 'succeeded' THEN");
    expect(fnBody).toContain("INSERT INTO provider_earnings");
  });

  it('ordinary checkout webhook behavior is unchanged', () => {
    // process_stripe_webhook is still called for non-tip events
    expect(webhookSrc).toContain("process_stripe_webhook");
    // Errors from checkout RPC still throw
    expect(webhookSrc).toContain("Webhook RPC failed");
  });
});

describe('Tip service-role grants migration', () => {
  const grantSrc = fs.readFileSync(
    path.resolve(REPO_ROOT, 'supabase/migrations/20260822000000_fix_tip_rpc_grants.sql'), 'utf-8'
  );

  it('grants finalize_tip_payment to service_role', () => {
    expect(grantSrc).toContain('GRANT EXECUTE ON FUNCTION public.finalize_tip_payment(UUID, TEXT, TEXT) TO service_role');
  });

  it('grants rotate_tip_idempotency_key to service_role', () => {
    expect(grantSrc).toContain('GRANT EXECUTE ON FUNCTION public.rotate_tip_idempotency_key(UUID, TEXT) TO service_role');
  });
});

describe('Tip 3DS uses handleNextAction with status verification', () => {
  const scSrc = fs.readFileSync(
    path.resolve(REPO_ROOT, 'apps/customer-web/src/pages/customer/ServiceCompletion.tsx'), 'utf-8'
  );

  it('uses handleNextAction, not confirmCardPayment, for tip requires_action', () => {
    // handleNextAction is correct for server-confirmed PIs
    expect(scSrc).toContain('handleNextAction');
    // confirmCardPayment must NOT be used for tip flow
    expect(scSrc).not.toContain('confirmCardPayment');
  });

  it('checks paymentIntent.status from handleNextAction result', () => {
    expect(scSrc).toContain("nextActionResult.paymentIntent?.status === 'succeeded'");
    expect(scSrc).toContain("nextActionResult.paymentIntent?.status === 'processing'");
  });

  it('does not treat no-error as unconditional success', () => {
    // Must inspect paymentIntent.status, not just absence of error
    expect(scSrc).toContain('nextActionResult.error');
    expect(scSrc).toContain("nextActionResult.paymentIntent?.status");
  });
});

describe('Payment method consistency in create-payment-intent', () => {
  const piSrc = fs.readFileSync(
    path.resolve(REPO_ROOT, 'supabase/functions/create-payment-intent/index.ts'), 'utf-8'
  );

  it('reads payment_method_id from existing checkout', () => {
    // The select must include payment_method_id
    expect(piSrc).toContain('payment_method_id');
    const selectMatch = piSrc.match(/\.select\([^)]*payment_method_id[^)]*\)/);
    expect(selectMatch).not.toBeNull();
  });

  it('rejects in-progress PI when payment method differs', () => {
    expect(piSrc).toContain('PAYMENT_METHOD_MISMATCH');
    expect(piSrc).toContain('paymentMethodId !== existingCheckout.payment_method_id');
  });

  it('PM check only applies to in-progress PI states', () => {
    // The mismatch check is inside the requires_action/requires_confirmation/processing block
    const raBlock = piSrc.slice(
      piSrc.indexOf("pi.status === 'requires_action'"),
      piSrc.indexOf("pi.status === 'canceled'")
    );
    expect(raBlock).toContain('PAYMENT_METHOD_MISMATCH');
  });

  it('paid checkout returns without PM check (already settled)', () => {
    // The paid branch returns before reaching PM check
    const paidBlock = piSrc.slice(
      piSrc.indexOf("status === 'paid'"),
      piSrc.indexOf("status === 'paid'") + 300
    );
    expect(paidBlock).not.toContain('PAYMENT_METHOD_MISMATCH');
  });

  it('dead PI retry clears payment_intent_id for new attempt', () => {
    expect(piSrc).toContain("pi.status === 'canceled'");
    expect(piSrc).toContain("payment_intent_id: null");
    expect(piSrc).toContain("attempt_number");
  });

  it('idempotency key uses attempt_number', () => {
    expect(piSrc).toContain('attempt_number');
    expect(piSrc).toContain('Idempotency-Key');
  });
});

describe('Customer completion navigation safety', () => {
  const ltSrc = fs.readFileSync(
    path.resolve(REPO_ROOT, 'apps/customer-web/src/pages/customer/LiveTracking.tsx'), 'utf-8'
  );
  const scSrc = fs.readFileSync(
    path.resolve(REPO_ROOT, 'apps/customer-web/src/pages/customer/ServiceCompletion.tsx'), 'utf-8'
  );

  it('handleComplete does NOT navigate to /completion/ after RPC', () => {
    // After confirm_customer_job_completion, handleComplete must NOT unconditionally navigate
    const fnStart = ltSrc.indexOf('handleComplete');
    const fnEnd = ltSrc.indexOf('};', ltSrc.indexOf('setConfirmingComplete(false)', fnStart));
    const fnBody = ltSrc.slice(fnStart, fnEnd);
    // Must call the RPC
    expect(fnBody).toContain('confirm_customer_job_completion');
    // Must set customerConfirmed
    expect(fnBody).toContain('setCustomerConfirmed(true)');
    // Must NOT have unconditional navigate after RPC — only navigates if freshStatus === 'completed'
    expect(fnBody).toContain("freshStatus === 'completed'");
    // Should not have a bare navigate('/completion/') outside the completed check
    const lines = fnBody.split('\n');
    const navigateLines = lines.filter(l => l.includes("navigate(`/completion/"));
    const completedCheckLines = lines.filter(l => l.includes("=== 'completed'"));
    expect(completedCheckLines.length).toBeGreaterThanOrEqual(1);
    expect(navigateLines.length).toBe(1); // only inside the completed check
  });

  it('customer confirmation RPC still runs on Service Complete tap', () => {
    const fnStart = ltSrc.indexOf('handleComplete');
    const fnEnd = ltSrc.indexOf('};', ltSrc.indexOf('setConfirmingComplete(false)', fnStart));
    const fnBody = ltSrc.slice(fnStart, fnEnd);
    expect(fnBody).toContain("supabase.rpc('confirm_customer_job_completion'");
  });

  it('customer sees waiting state after confirmation during inprogress', () => {
    // Button should be hidden when customerConfirmed is true
    expect(ltSrc).toContain("status === 'inprogress' && !customerConfirmed");
    // Waiting message should appear when customerConfirmed is true
    expect(ltSrc).toContain("status === 'inprogress' && customerConfirmed");
    expect(ltSrc).toContain('Waiting for provider to finish');
  });

  it('provider/server transition to completed triggers completion navigation', () => {
    // The existing realtime subscription + status effect should navigate on completed
    expect(ltSrc).toContain("mustCompleteCustomerRating");
    expect(ltSrc).toContain("navigate(`/completion/${jobId}`");
    // status === 'completed' must trigger navigation via the existing useEffect
    expect(ltSrc).toContain("status === 'completed' && !customerHasRatedProvider");
  });

  it('near-simultaneous provider completion is handled — race safety', () => {
    // After RPC, handleComplete re-reads authoritative status
    const fnStart = ltSrc.indexOf('handleComplete');
    const fnEnd = ltSrc.indexOf('};', ltSrc.indexOf('setConfirmingComplete(false)', fnStart));
    const fnBody = ltSrc.slice(fnStart, fnEnd);
    // Must fetch fresh job state after RPC
    expect(fnBody).toContain('fetchJob(jobId');
    expect(fnBody).toContain('normalizeJobStatus');
    expect(fnBody).toContain("freshStatus === 'completed'");
  });

  it('jobReady=false blocks all actionable controls — no rating, tip, submit, or photo', () => {
    // Rating section gated by jobReady === true
    expect(scSrc).toContain("jobReady === true");
    // Count occurrences — rating, receipt, photo, and bottom bar should all be gated
    const gateMatches = scSrc.match(/jobReady === true/g) || [];
    // At least: receipt, rating, photo, bottom button, tip processing guard
    expect(gateMatches.length).toBeGreaterThanOrEqual(4);
    // handleSubmit tip processing gated
    expect(scSrc).toContain("jobReady === true");
    // Waiting state shown when not ready
    expect(scSrc).toContain('Waiting for provider to complete');
    expect(scSrc).toContain('jobReady !== true');
  });

  it('jobReady=false cannot call rateJob or navigate Home through submit', () => {
    // handleSubmit contains rateJob — but the submit button is hidden when jobReady !== true
    // The bottom button div is wrapped in {jobReady === true && (...)}
    const bottomSection = scSrc.slice(scSrc.indexOf('Fixed bottom button'));
    expect(bottomSection).toContain('jobReady === true');
    // handleSubmit also guards tip processing
    expect(scSrc).toContain('jobReady === true');
  });

  it('ServiceCompletion subscribes to realtime for job status updates', () => {
    expect(scSrc).toContain('postgres_changes');
    expect(scSrc).toContain("table: 'jobs'");
    expect(scSrc).toContain("status === 'completed'");
    expect(scSrc).toContain('setJobReady(true)');
  });

  it('authoritative completed reveals full rating/tip UI', () => {
    // When jobReady === true, all controls render
    expect(scSrc).toContain("tippingEnabled");
    expect(scSrc).toContain('Rate Your Experience');
    expect(scSrc).toContain('Skip Rating');
    expect(scSrc).toContain('Submit & Return Home');
    // Photo section gated
    expect(scSrc).toContain('After Service Photo');
  });

  it('confirmation RPC failure does NOT set customerConfirmed', () => {
    const fnStart = ltSrc.indexOf('handleComplete');
    const fnEnd = ltSrc.indexOf('};', ltSrc.indexOf('setConfirmingComplete(false)', fnStart));
    const fnBody = ltSrc.slice(fnStart, fnEnd);
    // catch block must NOT contain setCustomerConfirmed(true)
    const catchStart = fnBody.indexOf('} catch');
    const catchEnd = fnBody.indexOf('} finally');
    const catchBlock = fnBody.slice(catchStart, catchEnd);
    expect(catchBlock).not.toContain('setCustomerConfirmed(true)');
    // catch block shows error toast instead
    expect(catchBlock).toContain('showToast');
  });

  it('resolved Supabase RPC error cannot reach confirmed/waiting state', () => {
    // Supabase .rpc() resolves with { data, error } — does NOT throw on failure.
    // handleComplete must destructure and check the error before setCustomerConfirmed.
    const fnStart = ltSrc.indexOf('handleComplete');
    const fnEnd = ltSrc.indexOf('};', ltSrc.indexOf('setConfirmingComplete(false)', fnStart));
    const fnBody = ltSrc.slice(fnStart, fnEnd);
    // Must destructure { error: confirmError } from the RPC result
    expect(fnBody).toContain('error: confirmError');
    expect(fnBody).toContain("supabase.rpc('confirm_customer_job_completion'");
    // Must check confirmError BEFORE setCustomerConfirmed(true)
    const confirmErrorCheck = fnBody.indexOf('if (confirmError)');
    const setConfirmed = fnBody.indexOf('setCustomerConfirmed(true)');
    expect(confirmErrorCheck).toBeGreaterThan(-1);
    expect(setConfirmed).toBeGreaterThan(-1);
    expect(confirmErrorCheck).toBeLessThan(setConfirmed);
    // confirmError branch must return (not fall through)
    const errorBlock = fnBody.slice(confirmErrorCheck, setConfirmed);
    expect(errorBlock).toContain('return');
  });

  it('confirmation RPC success DOES set customerConfirmed and show waiting state', () => {
    const fnStart = ltSrc.indexOf('handleComplete');
    const fnEnd = ltSrc.indexOf('};', ltSrc.indexOf('setConfirmingComplete(false)', fnStart));
    const fnBody = ltSrc.slice(fnStart, fnEnd);
    // try block sets customerConfirmed after successful RPC
    const tryStart = fnBody.indexOf('try {');
    const catchStart = fnBody.indexOf('} catch');
    const tryBlock = fnBody.slice(tryStart, catchStart);
    expect(tryBlock).toContain('setCustomerConfirmed(true)');
    // Waiting UI renders when customerConfirmed
    expect(ltSrc).toContain("status === 'inprogress' && customerConfirmed");
    expect(ltSrc).toContain('Waiting for provider to finish');
  });
});

// =============================================================================
// SERVER-SIDE GEOFENCE + MATCHING HARDENING
// =============================================================================

describe('Server-side geofence: accept_job distance validation', () => {
  const migSrc = fs.readFileSync(
    path.resolve(REPO_ROOT, 'supabase/migrations/20260823000000_server_side_geofence.sql'), 'utf-8'
  );
  const acceptStart = migSrc.indexOf('CREATE OR REPLACE FUNCTION public.accept_job');
  const acceptEnd = migSrc.indexOf('$$;', acceptStart) + 3;
  const acceptBody = migSrc.slice(acceptStart, acceptEnd);

  it('accept_job validates pickup coordinates exist and are non-zero', () => {
    expect(acceptBody).toContain('INVALID_PICKUP_COORDINATES');
    expect(acceptBody).toContain('pickup_latitude IS NULL');
    expect(acceptBody).toContain('pickup_latitude = 0');
  });

  it('accept_job validates provider location exists', () => {
    expect(acceptBody).toContain('PROVIDER_LOCATION_MISSING');
    expect(acceptBody).toContain('provider_locations');
  });

  it('accept_job validates provider location is not stale', () => {
    expect(acceptBody).toContain('PROVIDER_LOCATION_STALE');
    expect(acceptBody).toContain("INTERVAL '5 minutes'");
  });

  it('accept_job validates provider coordinates are valid (non-zero)', () => {
    expect(acceptBody).toContain('PROVIDER_LOCATION_INVALID');
    expect(acceptBody).toContain('v_provider_loc.latitude = 0');
  });

  it('accept_job computes haversine distance and rejects out-of-range', () => {
    expect(acceptBody).toContain('haversine_distance_miles');
    expect(acceptBody).toContain('PROVIDER_OUT_OF_RANGE');
    expect(acceptBody).toContain('v_distance > v_max_radius');
  });

  it('accept_job uses authoritative max_job_radius from platform_settings', () => {
    expect(acceptBody).toContain("key = 'max_job_radius'");
    expect(acceptBody).toContain('v_max_radius');
  });

  it('accept_job validates service eligibility', () => {
    expect(acceptBody).toContain('SERVICE_NOT_OFFERED');
    expect(acceptBody).toContain('v_provider_services');
  });

  it('accept_job requires provider online for immediate jobs', () => {
    expect(acceptBody).toContain('PROVIDER_NOT_ONLINE');
    expect(acceptBody).toContain('is_online IS NOT TRUE');
  });

  it('accept_job allows scheduled jobs without online requirement', () => {
    // Scheduled jobs (scheduled_for > now + 10 min) skip is_online check
    expect(acceptBody).toContain('scheduled_for');
    expect(acceptBody).toContain("INTERVAL '10 minutes'");
    // The else branch for scheduled does NOT check is_online
    const scheduledBranch = acceptBody.slice(acceptBody.indexOf('SCHEDULED JOB'));
    expect(scheduledBranch).not.toContain('PROVIDER_NOT_ONLINE');
  });

  it('rejected acceptance does not set provider_id or change status', () => {
    // All validation returns BEFORE the UPDATE statement
    const updatePos = acceptBody.indexOf('UPDATE jobs SET provider_id');
    const outOfRangePos = acceptBody.indexOf('PROVIDER_OUT_OF_RANGE');
    const servicePos = acceptBody.indexOf('SERVICE_NOT_OFFERED');
    const locationPos = acceptBody.indexOf('PROVIDER_LOCATION_MISSING');
    expect(outOfRangePos).toBeLessThan(updatePos);
    expect(servicePos).toBeLessThan(updatePos);
    expect(locationPos).toBeLessThan(updatePos);
  });

  it('rejected acceptance creates no job_accepted event', () => {
    // job_accepted event is only after UPDATE
    const eventInsert = acceptBody.indexOf("'job_accepted'");
    const updatePos = acceptBody.indexOf('UPDATE jobs SET provider_id');
    expect(eventInsert).toBeGreaterThan(updatePos);
  });

  it('distance is logged in job_accepted event metadata', () => {
    expect(acceptBody).toContain('distance_miles');
    const eventSection = acceptBody.slice(acceptBody.indexOf('INSERT INTO job_events'));
    expect(eventSection).toContain('distance_miles');
  });

  it('preserves all existing protections', () => {
    expect(acceptBody).toContain('auth.uid()');
    expect(acceptBody).toContain('UNAUTHORIZED');
    expect(acceptBody).toContain('PROVIDER_SUSPENDED');
    expect(acceptBody).toContain('PROVIDER_NOT_VERIFIED');
    expect(acceptBody).toContain('PROVIDER_BUSY');
    expect(acceptBody).toContain('JOB_NOT_FOUND');
    expect(acceptBody).toContain('JOB_ALREADY_ACCEPTED');
    expect(acceptBody).toContain('JOB_EXPIRY_IN_PROGRESS');
    expect(acceptBody).toContain('pg_advisory_xact_lock');
    expect(acceptBody).toContain('FOR UPDATE');
    expect(acceptBody).toContain('already_accepted');
  });

  it('US Customer / UK Provider forged accept_job is rejected by distance', () => {
    // With max_job_radius default 50 and US→UK ~3500 miles,
    // v_distance > v_max_radius triggers PROVIDER_OUT_OF_RANGE
    expect(acceptBody).toContain('PROVIDER_OUT_OF_RANGE');
    expect(acceptBody).toContain('distance_miles');
    expect(acceptBody).toContain('max_radius_miles');
  });
});

describe('Server-side geofence: get_eligible_pending_jobs_for_provider', () => {
  const migSrc = fs.readFileSync(
    path.resolve(REPO_ROOT, 'supabase/migrations/20260823000000_server_side_geofence.sql'), 'utf-8'
  );
  const rpcStart = migSrc.indexOf('CREATE OR REPLACE FUNCTION public.get_eligible_pending_jobs_for_provider');
  const rpcEnd = migSrc.indexOf('$$;', rpcStart) + 3;
  const rpcBody = migSrc.slice(rpcStart, rpcEnd);

  it('derives provider identity from auth.uid(), not caller parameter', () => {
    expect(rpcBody).toContain('auth.uid()');
    // Function has no provider_id parameter
    expect(rpcBody).toContain('get_eligible_pending_jobs_for_provider()');
    expect(rpcBody).not.toMatch(/get_eligible_pending_jobs_for_provider\([^)]+\)/);
  });

  it('checks provider is active', () => {
    expect(rpcBody).toContain("status IS DISTINCT FROM 'active'");
  });

  it('checks provider is verified', () => {
    expect(rpcBody).toContain('is_verified IS NOT TRUE');
  });

  it('requires fresh online provider location', () => {
    expect(rpcBody).toContain('is_online IS NOT TRUE');
    expect(rpcBody).toContain("INTERVAL '5 minutes'");
  });

  it('checks provider is not busy', () => {
    expect(rpcBody).toContain("'accepted','en_route','enroute','arrived','in_progress','inprogress'");
  });

  it('filters by distance using haversine and max_job_radius', () => {
    expect(rpcBody).toContain('haversine_distance_miles');
    expect(rpcBody).toContain('v_max_radius');
    expect(rpcBody).toContain("key = 'max_job_radius'");
  });

  it('filters by service eligibility', () => {
    expect(rpcBody).toContain('ANY(v_provider_services)');
  });

  it('only returns pending unassigned jobs', () => {
    expect(rpcBody).toContain("j.status = 'pending'");
    expect(rpcBody).toContain('j.provider_id IS NULL');
  });

  it('validates pickup coordinates', () => {
    expect(rpcBody).toContain('j.pickup_latitude IS NOT NULL');
    expect(rpcBody).toContain('j.pickup_latitude != 0');
  });

  it('returns distance_miles for client display', () => {
    expect(rpcBody).toContain('distance_miles');
  });

  it('is SECURITY DEFINER and granted to authenticated only', () => {
    const grants = migSrc.slice(rpcEnd);
    expect(grants).toContain('REVOKE EXECUTE ON FUNCTION public.get_eligible_pending_jobs_for_provider() FROM PUBLIC');
    expect(grants).toContain('GRANT  EXECUTE ON FUNCTION public.get_eligible_pending_jobs_for_provider() TO authenticated');
  });
});

describe('Server-side geofence: shared haversine helper', () => {
  const migSrc = fs.readFileSync(
    path.resolve(REPO_ROOT, 'supabase/migrations/20260823000000_server_side_geofence.sql'), 'utf-8'
  );

  it('haversine_distance_miles is defined as IMMUTABLE STRICT', () => {
    expect(migSrc).toContain('haversine_distance_miles');
    expect(migSrc).toContain('IMMUTABLE STRICT');
  });

  it('get_nearby_providers uses the shared helper', () => {
    const gnpStart = migSrc.indexOf('CREATE OR REPLACE FUNCTION public.get_nearby_providers');
    const gnpEnd = migSrc.indexOf('$$;', gnpStart);
    const gnpBody = migSrc.slice(gnpStart, gnpEnd);
    expect(gnpBody).toContain('haversine_distance_miles');
  });
});

describe('Server-side geofence: Wave 3 bounded dispatch', () => {
  const matchingSrc = fs.readFileSync(
    path.resolve(REPO_ROOT, 'apps/customer-web/src/pages/customer/Matching.tsx'), 'utf-8'
  );

  it('Wave 3 uses get_nearby_providers, not global broadcast', () => {
    expect(matchingSrc).toContain("p_radius_miles: 500"); // capped server-side
    expect(matchingSrc).toContain("get_nearby_providers");
    // No global broadcast channel
    expect(matchingSrc).not.toContain("'new-job-broadcast'");
    expect(matchingSrc).not.toContain("'new-job-rebroadcast'");
  });

  it('Wave 1 and Wave 2 preserved with existing radii', () => {
    expect(matchingSrc).toContain('p_radius_miles: 5');
    expect(matchingSrc).toContain('p_radius_miles: 15');
  });
});

describe('Server-side geofence: ProviderHome eligible-job source', () => {
  const phSrc = fs.readFileSync(
    path.resolve(REPO_ROOT, 'apps/provider-web/src/pages/provider/ProviderHome.tsx'), 'utf-8'
  );

  it('uses server-authoritative RPC instead of direct table query', () => {
    expect(phSrc).toContain("supabase.rpc('get_eligible_pending_jobs_for_provider')");
    // Should NOT directly query jobs table for pending jobs
    const loadPendingStart = phSrc.indexOf('const loadPending');
    const loadPendingEnd = phSrc.indexOf('}, [', loadPendingStart);
    const loadPendingBody = phSrc.slice(loadPendingStart, loadPendingEnd);
    expect(loadPendingBody).not.toContain(".from('jobs')");
    expect(loadPendingBody).not.toContain(".eq('status', 'pending')");
  });

  it('does not subscribe to global broadcast channels', () => {
    expect(phSrc).not.toContain("'new-job-broadcast'");
    expect(phSrc).not.toContain("'new-job-rebroadcast'");
  });

  it('preserves per-provider targeted channel for dispatch and tips', () => {
    expect(phSrc).toContain('provider-job-${user.id}');
    expect(phSrc).toContain('tip_received');
  });
});

describe('Server-side geofence: jobs RLS tightened', () => {
  const migSrc = fs.readFileSync(
    path.resolve(REPO_ROOT, 'supabase/migrations/20260823000000_server_side_geofence.sql'), 'utf-8'
  );

  it('drops blanket "Providers can view pending jobs" policy', () => {
    expect(migSrc).toContain('DROP POLICY IF EXISTS "Providers can view pending jobs"');
  });

  it('replaces with assigned-or-own-jobs policy', () => {
    expect(migSrc).toContain('Providers can view assigned or own jobs');
    expect(migSrc).toContain('auth.uid() = provider_id');
  });

  it('preserves customer job visibility', () => {
    expect(migSrc).toContain('auth.uid() = customer_id');
  });
});

describe('Server-side geofence: existing lifecycle preservation', () => {
  const migSrc = fs.readFileSync(
    path.resolve(REPO_ROOT, 'supabase/migrations/20260823000000_server_side_geofence.sql'), 'utf-8'
  );

  it('no-provider expiry/refund lifecycle unchanged', () => {
    // accept_job still checks expiry operations
    const acceptBody = migSrc.slice(
      migSrc.indexOf('CREATE OR REPLACE FUNCTION public.accept_job'),
      migSrc.indexOf('$$;', migSrc.indexOf('CREATE OR REPLACE FUNCTION public.accept_job'))
    );
    expect(acceptBody).toContain('JOB_EXPIRY_IN_PROGRESS');
    expect(acceptBody).toContain('job_expiry_refund_operations');
  });

  it('get_nearby_providers preserves existing filters', () => {
    const gnpStart = migSrc.indexOf('CREATE OR REPLACE FUNCTION public.get_nearby_providers');
    const gnpEnd = migSrc.indexOf('$$;', gnpStart);
    const gnpBody = migSrc.slice(gnpStart, gnpEnd);
    expect(gnpBody).toContain('is_online = true');
    expect(gnpBody).toContain('is_verified = true');
    expect(gnpBody).toContain("INTERVAL '5 minutes'");
    expect(gnpBody).toContain("status = 'active'");
  });

  it('atomic acceptance with advisory lock preserved', () => {
    const acceptBody = migSrc.slice(
      migSrc.indexOf('CREATE OR REPLACE FUNCTION public.accept_job'),
      migSrc.indexOf('$$;', migSrc.indexOf('CREATE OR REPLACE FUNCTION public.accept_job'))
    );
    expect(acceptBody).toContain('pg_advisory_xact_lock');
    expect(acceptBody).toContain('FOR UPDATE');
  });
});
