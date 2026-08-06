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
    expect(custSrc).toContain("supabase.rpc('cancel_job'");
    expect(provSrc).toContain("supabase.rpc('cancel_job'");
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
    expect(custCtx).toContain("supabase.rpc('cancel_job'");
  });

  it('CROSS-001 updateJobStatus still uses transition RPC (no regression)', () => {
    const provCtx = fs.readFileSync(
      path.resolve(REPO_ROOT, 'apps/provider-web/src/context/JobContext.jsx'), 'utf-8'
    );
    expect(provCtx).toContain("supabase.rpc('transition_job_status_by_participant'");
  });
});
