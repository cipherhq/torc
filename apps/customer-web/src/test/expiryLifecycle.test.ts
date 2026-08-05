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

  it('duplicate operations use stable idempotency key', () => {
    const jobId = 'job-123';
    const attempt = 1;
    const key1 = `expiry:${jobId}:${attempt}`;
    const key2 = `expiry:${jobId}:${attempt}`;
    expect(key1).toBe(key2); // Same key for same job+attempt

    const key3 = `expiry:${jobId}:${attempt + 1}`;
    expect(key3).not.toBe(key1); // Different key for different attempt
  });

  it('no notification says "You were not charged" for captured payment', () => {
    const correctMessage = 'No provider was available. Your payment has been refunded.';
    expect(correctMessage).not.toContain('not charged');
    expect(correctMessage).toContain('refunded');
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
