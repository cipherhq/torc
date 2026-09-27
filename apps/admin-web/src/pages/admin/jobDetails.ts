import { supabase } from '../../lib/supabase';

export interface AdminProfileSummary {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}

export interface JobDetailRecord {
  id: string;
  customer_id: string | null;
  provider_id: string | null;
  service_id: string | null;
  vehicle_id: string | null;
  status: string;
  pickup_latitude: number | null;
  pickup_longitude: number | null;
  pickup_address: string | null;
  destination_latitude: number | null;
  destination_longitude: number | null;
  destination_address: string | null;
  provider_latitude: number | null;
  provider_longitude: number | null;
  scheduled_for: string | null;
  accepted_at: string | null;
  started_at: string | null;
  customer_completed_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  cancelled_by: string | null;
  cancellation_fee?: number | null;
  cancellation_fee_pct?: number | null;
  customer_notes: string | null;
  requester_type: string | null;
  requester_name: string | null;
  requester_phone: string | null;
  base_price?: number | null;
  service_fee?: number | null;
  tax?: number | null;
  tip?: number | null;
  total_amount?: number | null;
  payment_status: string | null;
  payment_currency?: string | null;
  payment_intent_id?: string | null;
  stripe_charge_id?: string | null;
  checkout_id?: string | null;
  paid_at?: string | null;
  rating: number | null;
  review: string | null;
  reviewed_at: string | null;
  provider_rating: number | null;
  provider_review: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface JobDetails {
  job: JobDetailRecord;
  serviceName: string;
  customer: AdminProfileSummary | null;
  provider: AdminProfileSummary | null;
  refunds: any[];
  earnings: any[];
  payouts: any[];
  cancellationOperation: any | null;
  statusAudit: any[];
  relatedWarnings: string[];
}

export const SUPPORT_SAFE_JOB_DETAIL_FIELDS = [
  'id', 'customer_id', 'provider_id', 'service_id', 'vehicle_id', 'status',
  'pickup_latitude', 'pickup_longitude', 'pickup_address',
  'destination_latitude', 'destination_longitude', 'destination_address',
  'provider_latitude', 'provider_longitude', 'scheduled_for', 'accepted_at',
  'started_at', 'customer_completed_at', 'completed_at', 'cancelled_at', 'cancellation_reason',
  'cancelled_by', 'customer_notes', 'requester_type', 'requester_name',
  'requester_phone', 'payment_status', 'rating',
  'review', 'reviewed_at', 'provider_rating', 'provider_review', 'created_at', 'updated_at',
] as const;

export const ADMIN_ONLY_JOB_FINANCIAL_FIELDS = [
  'base_price', 'service_fee', 'tax', 'tip', 'total_amount', 'cancellation_fee',
  'cancellation_fee_pct', 'payment_currency', 'paid_at', 'payment_intent_id',
  'stripe_charge_id', 'checkout_id',
] as const;

export function getJobDetailFields(includeFinancials: boolean) {
  return [
    ...SUPPORT_SAFE_JOB_DETAIL_FIELDS,
    ...(includeFinancials ? ADMIN_ONLY_JOB_FINANCIAL_FIELDS : []),
  ].join(', ');
}

function warning(result: { error?: { message?: string } | null }, label: string) {
  return result.error ? `${label}: ${result.error.message || 'Not available'}` : null;
}

export async function fetchJobDetails(jobId: string, includeFinancials: boolean): Promise<JobDetails> {
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select(getJobDetailFields(includeFinancials))
    .eq('id', jobId)
    .single();

  if (jobError) throw jobError;
  if (!job) throw new Error('Job not found. It may have been removed.');

  const profileIds = [job.customer_id, job.provider_id].filter(Boolean) as string[];
  const profilesPromise = profileIds.length
    ? supabase.from('profiles').select('id, full_name, first_name, last_name, email, phone').in('id', profileIds)
    : Promise.resolve({ data: [], error: null });
  const servicePromise = job.service_id
    ? supabase.from('services').select('id, name').eq('id', job.service_id).maybeSingle()
    : Promise.resolve({ data: null, error: null });
  const auditPromise = supabase
    .from('job_status_audit')
    .select('id, previous_status, new_status, actor_id, actor_type, reason, created_at')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true });

  const refundsPromise = includeFinancials
    ? supabase.from('refunds').select('id, amount, reason, status, processed_at, created_at').eq('job_id', jobId).order('created_at', { ascending: false })
    : Promise.resolve({ data: [], error: null });
  const earningsPromise = includeFinancials
    ? supabase.from('provider_earnings').select('id, base_earnings, tip, commission_pct, platform_fee, provider_net, entry_type, payout_id, created_at').eq('job_id', jobId).order('created_at', { ascending: true })
    : Promise.resolve({ data: [], error: null });
  const cancellationPromise = includeFinancials
    ? supabase.from('job_cancellation_operations').select('id, actor_id, actor_type, reason, job_status_at_cancel, original_amount, cancellation_fee_pct, cancellation_fee, refund_amount, provider_compensation, platform_fee_on_cancel, stripe_refund_id, stripe_refund_status, status, created_at, completed_at').eq('job_id', jobId).maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const [profilesResult, serviceResult, auditResult, refundsResult, earningsResult, cancellationResult] = await Promise.all([
    profilesPromise,
    servicePromise,
    auditPromise,
    refundsPromise,
    earningsPromise,
    cancellationPromise,
  ]);

  const earnings = earningsResult.data || [];
  const payoutIds = Array.from(new Set(earnings.map((row: any) => row.payout_id).filter(Boolean)));
  const payoutsResult = includeFinancials && payoutIds.length
    ? await supabase.from('provider_payouts').select('id, status, reference_id, net_payout, paid_at, created_at').in('id', payoutIds)
    : { data: [], error: null };

  const profiles = (profilesResult.data || []) as AdminProfileSummary[];
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  const warnings = [
    warning(profilesResult, 'Profiles'),
    warning(serviceResult, 'Service'),
    warning(auditResult, 'Status audit'),
    warning(refundsResult, 'Refunds'),
    warning(earningsResult, 'Provider earnings'),
    warning(cancellationResult, 'Cancellation operation'),
    warning(payoutsResult, 'Payout'),
  ].filter(Boolean) as string[];

  return {
    job: job as JobDetailRecord,
    serviceName: serviceResult.data?.name || job.service_id || 'Unknown service',
    customer: job.customer_id ? byId.get(job.customer_id) || null : null,
    provider: job.provider_id ? byId.get(job.provider_id) || null : null,
    refunds: refundsResult.data || [],
    earnings,
    payouts: payoutsResult.data || [],
    cancellationOperation: cancellationResult.data || null,
    statusAudit: auditResult.data || [],
    relatedWarnings: warnings,
  };
}

export interface TimelineEvent {
  key: string;
  label: string;
  timestamp: string;
  detail?: string;
}

export function buildJobTimeline(details: JobDetails): TimelineEvent[] {
  const job = details.job;
  const timestampEvents: Array<[string, string, string | null]> = [
    ['created', 'Created', job.created_at],
    ['accepted', 'Accepted', job.accepted_at],
    ['started', 'Service started', job.started_at],
    ['customer-completed', 'Customer completed', job.customer_completed_at],
    ['completed', 'Completed', job.completed_at],
    ['cancelled', 'Cancelled', job.cancelled_at],
  ];

  const directEvents = timestampEvents
    .filter((event): event is [string, string, string] => Boolean(event[2]))
    .map(([key, label, timestamp]) => ({ key, label, timestamp }));
  const auditEvents = details.statusAudit
    .filter((row) => row.created_at)
    .map((row) => ({
      key: `audit-${row.id}`,
      label: `${row.previous_status || 'Initial'} → ${row.new_status}`,
      timestamp: row.created_at,
      detail: [row.actor_type, row.reason].filter(Boolean).join(' · ') || undefined,
    }));

  return [...directEvents, ...auditEvents].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

export function getProfileName(profile: AdminProfileSummary | null, fallback = 'Unknown profile') {
  if (!profile) return fallback;
  return profile.full_name
    || [profile.first_name, profile.last_name].filter(Boolean).join(' ')
    || profile.email
    || fallback;
}

export function getCancellationActor(details: JobDetails) {
  const actorId = details.cancellationOperation?.actor_id || details.job.cancelled_by;
  const actorType = details.cancellationOperation?.actor_type;
  if (actorType) return actorType;
  if (!actorId) return 'Not available';
  if (actorId === details.job.customer_id) return 'Customer';
  if (actorId === details.job.provider_id) return 'Provider';
  return 'Admin / system';
}

export function buildDirectionsUrl(job: JobDetailRecord) {
  const origin = job.pickup_latitude != null && job.pickup_longitude != null
    ? `${job.pickup_latitude},${job.pickup_longitude}`
    : job.pickup_address;
  const destination = job.destination_latitude != null && job.destination_longitude != null
    ? `${job.destination_latitude},${job.destination_longitude}`
    : job.destination_address;
  if (!origin && !destination) return null;
  const params = new URLSearchParams({ api: '1' });
  if (origin && destination) {
    params.set('origin', origin);
    params.set('destination', destination);
  } else {
    params.set('query', origin || destination || '');
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
