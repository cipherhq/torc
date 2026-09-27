import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryState = vi.hoisted(() => ({
  selections: [] as Array<{ table: string; fields: string }>,
  tables: [] as string[],
}));

const job = {
  id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', customer_id: 'customer-a', provider_id: 'provider-a',
  service_id: 'towing', vehicle_id: 'vehicle-a', status: 'completed',
  pickup_latitude: 39.2904, pickup_longitude: -76.6122, pickup_address: '123 Pickup Avenue',
  destination_latitude: 39.4015, destination_longitude: -76.6019, destination_address: '987 Destination Boulevard',
  provider_latitude: null, provider_longitude: null, scheduled_for: null,
  accepted_at: '2026-09-27T12:10:00.000Z', provider_arrived_at: null,
  customer_confirmed_arrival_at: null, provider_started_service_at: null, started_at: null,
  provider_marked_completed_at: null, customer_confirmed_completion_at: null,
  customer_completed_at: null, completed_at: '2026-09-27T13:00:00.000Z', cancelled_at: null,
  cancellation_reason: null, cancelled_by: null, customer_notes: 'Garage level B2',
  requester_type: 'self', requester_name: null, requester_phone: null, payment_status: 'paid',
  rating: 5, review: 'Great service', reviewed_at: '2026-09-27T13:10:00.000Z',
  provider_rating: 5, provider_review: 'Ready at pickup', created_at: '2026-09-27T12:00:00.000Z',
  updated_at: '2026-09-27T13:10:00.000Z', base_price: 100, service_fee: 20, tax: 10,
  tip: 15, total_amount: 145, cancellation_fee: 0, cancellation_fee_pct: 0,
  payment_currency: 'USD', paid_at: '2026-09-27T12:02:00.000Z',
  payment_intent_id: 'pi_admin_safe_123', stripe_charge_id: 'ch_admin_safe_123', checkout_id: 'checkout-a',
};

function result(data: unknown) {
  return Promise.resolve({ data, error: null });
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      queryState.tables.push(table);
      return {
        select: (fields: string) => {
          queryState.selections.push({ table, fields });
          if (table === 'jobs') return { eq: () => ({ single: () => result(job) }) };
          if (table === 'profiles') return { in: () => result([]) };
          if (table === 'services') return { eq: () => ({ maybeSingle: () => result({ id: 'towing', name: 'Towing' }) }) };
          if (table === 'job_status_audit') return { eq: () => ({ order: () => result([]) }) };
          if (table === 'refunds' || table === 'provider_earnings') return { eq: () => ({ order: () => result([]) }) };
          if (table === 'job_cancellation_operations') return { eq: () => ({ maybeSingle: () => result(null) }) };
          if (table === 'provider_payouts') return { in: () => result([]) };
          throw new Error(`Unexpected table: ${table}`);
        },
      };
    },
  },
}));

import {
  ADMIN_ONLY_JOB_FINANCIAL_FIELDS, fetchJobDetails, SUPPORT_SAFE_JOB_DETAIL_FIELDS,
} from '../pages/admin/jobDetails';

beforeEach(() => {
  queryState.selections.length = 0;
  queryState.tables.length = 0;
});

describe('job detail data minimization', () => {
  it('does not request Admin-only financial fields or related financial tables for Support', async () => {
    await fetchJobDetails(job.id, false);
    const selectedFields = queryState.selections.find(({ table }) => table === 'jobs')!.fields.split(', ');

    expect(selectedFields).toEqual([...SUPPORT_SAFE_JOB_DETAIL_FIELDS]);
    expect(selectedFields).not.toContain('payment_intent_id');
    expect(selectedFields).not.toContain('stripe_charge_id');
    expect(selectedFields).not.toContain('checkout_id');
    expect(selectedFields).not.toContain('base_price');
    expect(selectedFields).not.toContain('total_amount');
    expect(selectedFields).not.toContain('paid_at');
    expect(queryState.tables).not.toContain('refunds');
    expect(queryState.tables).not.toContain('provider_earnings');
    expect(queryState.tables).not.toContain('job_cancellation_operations');
  });

  it('requests Admin financial fields and returns payment references for Admin', async () => {
    const details = await fetchJobDetails(job.id, true);
    const selectedFields = queryState.selections.find(({ table }) => table === 'jobs')!.fields.split(', ');

    expect(selectedFields).toEqual([...SUPPORT_SAFE_JOB_DETAIL_FIELDS, ...ADMIN_ONLY_JOB_FINANCIAL_FIELDS]);
    expect(details.job.payment_intent_id).toBe('pi_admin_safe_123');
    expect(details.job.stripe_charge_id).toBe('ch_admin_safe_123');
    expect(details.job.checkout_id).toBe('checkout-a');
    expect(queryState.tables).toContain('refunds');
    expect(queryState.tables).toContain('provider_earnings');
    expect(queryState.tables).toContain('job_cancellation_operations');
  });
});
