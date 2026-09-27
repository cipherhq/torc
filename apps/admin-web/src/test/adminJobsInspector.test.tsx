import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';

vi.mock('../components/AdminLayout', () => ({
  AdminLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAdminRole: () => 'admin',
}));

vi.mock('../components/ui/sheet', () => ({
  Sheet: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? <div>{children}</div> : null,
  SheetContent: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div role="dialog" {...props}>{children}</div>,
  SheetHeader: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  SheetTitle: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => <h2 {...props}>{children}</h2>,
  SheetDescription: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => <p {...props}>{children}</p>,
}));

const supabaseMocks = vi.hoisted(() => {
  const channelState: { on?: ReturnType<typeof vi.fn>; subscribe?: ReturnType<typeof vi.fn> } = {};
  channelState.subscribe = vi.fn();
  channelState.on = vi.fn(() => channelState);
  return {
    channelState,
    channel: vi.fn(() => channelState),
    removeChannel: vi.fn(),
  };
});
vi.mock('../lib/supabase', () => ({
  supabase: { channel: supabaseMocks.channel, removeChannel: supabaseMocks.removeChannel },
}));

import { AdminJobs, JobRow } from '../pages/admin/Jobs';
import { JobDetailRecord, JobDetails } from '../pages/admin/jobDetails';

const NOW = '2026-09-27T12:00:00.000Z';

function listJob(overrides: Partial<JobRow> = {}): JobRow {
  return {
    id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
    service_id: 'towing',
    customer_id: 'customer-a',
    provider_id: 'provider-a',
    status: 'completed',
    pickup_address: '123 Very Long Pickup Avenue, Baltimore, Maryland 21201',
    destination_address: '987 Complete Destination Boulevard, Towson, Maryland 21204',
    total_amount: 145.5,
    payment_status: 'paid',
    created_at: NOW,
    started_at: '2026-09-27T12:30:00.000Z',
    completed_at: '2026-09-27T13:00:00.000Z',
    cancelled_at: null,
    rating: 5,
    customer_name: 'Ada Customer',
    provider_name: 'Pat Provider',
    service_name: 'Towing',
    ...overrides,
  };
}

function detailRecord(overrides: Partial<JobDetailRecord> = {}): JobDetailRecord {
  return {
    id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', customer_id: 'customer-a', provider_id: 'provider-a',
    service_id: 'towing', vehicle_id: 'vehicle-a', status: 'completed',
    pickup_latitude: 39.2904, pickup_longitude: -76.6122,
    pickup_address: '123 Very Long Pickup Avenue, Baltimore, Maryland 21201',
    destination_latitude: 39.4015, destination_longitude: -76.6019,
    destination_address: '987 Complete Destination Boulevard, Towson, Maryland 21204',
    provider_latitude: null, provider_longitude: null, scheduled_for: null,
    accepted_at: '2026-09-27T12:10:00.000Z', provider_arrived_at: '2026-09-27T12:20:00.000Z',
    customer_confirmed_arrival_at: null, provider_started_service_at: null,
    started_at: '2026-09-27T12:30:00.000Z', provider_marked_completed_at: null,
    customer_confirmed_completion_at: null, customer_completed_at: null,
    completed_at: '2026-09-27T13:00:00.000Z', cancelled_at: null,
    cancellation_reason: null, cancelled_by: null, cancellation_fee: 0, cancellation_fee_pct: 0,
    customer_notes: 'Vehicle is in the lower garage.', requester_type: 'self', requester_name: null,
    requester_phone: null, base_price: 100, service_fee: 20, tax: 10, tip: 15.5, total_amount: 145.5,
    payment_status: 'paid', payment_currency: 'USD', payment_intent_id: 'pi_admin_safe_123',
    stripe_charge_id: 'ch_admin_safe_123', checkout_id: 'checkout-a', paid_at: '2026-09-27T12:02:00.000Z',
    rating: 5, review: 'Fast and professional.', reviewed_at: '2026-09-27T13:10:00.000Z',
    provider_rating: 5, provider_review: 'Customer was ready.', created_at: NOW, updated_at: '2026-09-27T13:10:00.000Z',
    ...overrides,
  };
}

function details(overrides: Partial<JobDetails> & { job?: Partial<JobDetailRecord> } = {}): JobDetails {
  const jobOverrides = overrides.job || {};
  return {
    job: detailRecord(jobOverrides),
    serviceName: 'Towing',
    customer: { id: 'customer-a', full_name: 'Ada Customer', first_name: 'Ada', last_name: 'Customer', email: 'ada@example.com', phone: '+15550000001' },
    provider: { id: 'provider-a', full_name: 'Pat Provider', first_name: 'Pat', last_name: 'Provider', email: 'pat@example.com', phone: '+15550000002' },
    refunds: [],
    earnings: [{ id: 'earning-a', base_earnings: 100, tip: 15.5, commission_pct: 15, platform_fee: 15, provider_net: 85, entry_type: 'service_earning', payout_id: 'payout-a', created_at: NOW }],
    payouts: [{ id: 'payout-a', status: 'paid', reference_id: 'payout-ref-a', net_payout: 100.5, paid_at: '2026-09-28T10:00:00.000Z', created_at: NOW }],
    cancellationOperation: null,
    statusAudit: [],
    relatedWarnings: [],
    ...overrides,
    job: detailRecord(jobOverrides),
  };
}

function renderJobs(rows: JobRow[], detailsLoader = vi.fn(async (id: string) => details({ job: { id } }))) {
  const jobsLoader = vi.fn(async () => rows);
  render(<MemoryRouter><AdminJobs jobsLoader={jobsLoader} detailsLoader={detailsLoader} /></MemoryRouter>);
  return { jobsLoader, detailsLoader };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Admin Jobs details inspector', () => {
  it('opens the correct job on click and shows complete pickup and destination addresses', async () => {
    const row = listJob();
    const loader = vi.fn(async () => details());
    renderJobs([row], loader);

    fireEvent.click(await screen.findByRole('button', { name: 'View job J-AAAAAA' }));

    const dialog = await screen.findByRole('dialog');
    expect(loader).toHaveBeenCalledWith(row.id, true);
    expect(within(dialog).getAllByText(row.id).length).toBeGreaterThan(0);
    expect(within(dialog).getByText('123 Very Long Pickup Avenue, Baltimore, Maryland 21201')).toBeInTheDocument();
    expect(within(dialog).getByText('987 Complete Destination Boulevard, Towson, Maryland 21204')).toBeInTheDocument();
  });

  it.each(['Enter', ' '])('opens a selected job with the %s key', async (key) => {
    const row = listJob();
    const loader = vi.fn(async () => details());
    renderJobs([row], loader);

    fireEvent.keyDown(await screen.findByRole('button', { name: 'View job J-AAAAAA' }), { key });
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(loader).toHaveBeenCalledWith(row.id, true);
  });

  it('renders an unassigned legacy job and missing optional data without undefined text or crashes', async () => {
    const row = listJob({ provider_id: null, provider_name: null, destination_address: null, payment_status: null, rating: null });
    const loader = vi.fn(async () => details({
      job: {
        provider_id: null, destination_address: null, destination_latitude: null, destination_longitude: null,
        payment_status: null, payment_intent_id: null, stripe_charge_id: null, rating: null, review: null,
        reviewed_at: null, provider_rating: null, provider_review: null, vehicle_id: null, customer_notes: null,
        requester_type: null, requester_name: null, requester_phone: null,
      },
      provider: null, earnings: [], payouts: [],
    }));
    renderJobs([row], loader);

    fireEvent.click(await screen.findByRole('button', { name: 'View job J-AAAAAA' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByText('Unassigned').length).toBeGreaterThan(0);
    expect(within(dialog).getByText('No rating or review has been submitted.')).toBeInTheDocument();
    expect(dialog.textContent).not.toContain('undefined');
  });

  it('renders completed lifecycle, payment, payout, and rating/review evidence', async () => {
    renderJobs([listJob()], vi.fn(async () => details()));
    fireEvent.click(await screen.findByRole('button', { name: 'View job J-AAAAAA' }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getAllByText('Completed').length).toBeGreaterThan(0);
    expect(within(dialog).getByText('Service started')).toBeInTheDocument();
    expect(within(dialog).getByText('$145.50')).toBeInTheDocument();
    expect(within(dialog).getByText('pi_admin_safe_123')).toBeInTheDocument();
    expect(within(dialog).getByText('payout-ref-a')).toBeInTheDocument();
    expect(within(dialog).getByText('Fast and professional.')).toBeInTheDocument();
    expect(within(dialog).getByText('Customer was ready.')).toBeInTheDocument();
  });

  it('renders cancelled job actor, reason, refund state, amount, and reference', async () => {
    const cancelled = details({
      job: {
        status: 'cancelled', completed_at: null, cancelled_at: '2026-09-27T12:25:00.000Z',
        cancellation_reason: 'Customer no longer needs service', cancelled_by: 'customer-a', payment_status: 'refunded',
      },
      earnings: [], payouts: [],
      cancellationOperation: {
        id: 'cancel-a', actor_id: 'customer-a', actor_type: 'customer', reason: 'Customer no longer needs service',
        refund_amount: 120, stripe_refund_status: 'succeeded', stripe_refund_id: 're_safe_123', status: 'completed',
        created_at: '2026-09-27T12:25:00.000Z', completed_at: '2026-09-27T12:26:00.000Z',
      },
    });
    renderJobs([listJob({ status: 'cancelled', completed_at: null, cancelled_at: cancelled.job.cancelled_at })], vi.fn(async () => cancelled));
    fireEvent.click(await screen.findByRole('button', { name: 'View job J-AAAAAA' }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getAllByText('Customer no longer needs service').length).toBeGreaterThan(0);
    expect(within(dialog).getByText('Customer')).toBeInTheDocument();
    expect(within(dialog).getByText('$120.00')).toBeInTheDocument();
    expect(within(dialog).getByText('re_safe_123')).toBeInTheDocument();
  });

  it('never shows Job A metadata after Job B is selected, even if A resolves late', async () => {
    let resolveA!: (value: JobDetails) => void;
    const jobA = listJob({ id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', pickup_address: 'Pickup A' });
    const jobB = listJob({ id: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', pickup_address: 'Pickup B' });
    const loader = vi.fn((id: string) => {
      if (id === jobA.id) return new Promise<JobDetails>((resolve) => { resolveA = resolve; });
      return Promise.resolve(details({ job: { id: jobB.id, pickup_address: 'Pickup B', destination_address: 'Destination B' } }));
    });
    renderJobs([jobA, jobB], loader);

    fireEvent.click(await screen.findByRole('button', { name: 'View job J-AAAAAA' }));
    fireEvent.click(screen.getByRole('button', { name: 'View job J-BBBBBB' }));
    expect(await screen.findByText('Pickup B')).toBeInTheDocument();

    resolveA(details({ job: { id: jobA.id, pickup_address: 'Pickup A', destination_address: 'Destination A' } }));
    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(within(dialog).queryByText('Pickup A')).not.toBeInTheDocument());
    expect(within(dialog).getAllByText(jobB.id).length).toBeGreaterThan(0);
  });

  it('preserves search, status filtering, and pagination while rows remain selectable', async () => {
    const rows = Array.from({ length: 17 }, (_, index) => listJob({
      id: `${String(index).padStart(6, '0')}aa-1111-4111-8111-aaaaaaaaaaaa`,
      customer_name: index === 16 ? 'Needle Customer' : `Customer ${index}`,
      status: index === 0 ? 'cancelled' : 'completed',
      completed_at: index === 0 ? null : NOW,
      cancelled_at: index === 0 ? NOW : null,
    }));
    renderJobs(rows);

    expect(await screen.findByRole('button', { name: 'View job J-000000' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(screen.getByRole('button', { name: 'View job J-000015' })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search jobs...'), { target: { value: 'Needle Customer' } });
    expect(screen.getByRole('button', { name: 'View job J-000016' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View job J-000000' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search jobs...'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Cancelled/ }));
    expect(screen.getByRole('button', { name: 'View job J-000000' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View job J-000001' })).not.toBeInTheDocument();
  });
});
