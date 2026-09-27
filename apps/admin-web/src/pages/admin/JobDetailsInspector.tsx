import { useState } from 'react';
import {
  BadgeDollarSign, Briefcase, Check, Clipboard, Clock3, CreditCard, ExternalLink,
  MapPin, Navigation, Star, UserRound, Wrench,
} from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../components/ui/sheet';
import {
  buildDirectionsUrl, buildJobTimeline, getCancellationActor, getProfileName, JobDetails,
} from './jobDetails';

interface JobDetailsInspectorProps {
  open: boolean;
  jobId: string | null;
  details: JobDetails | null;
  loading: boolean;
  error: string | null;
  canViewFinancials: boolean;
  onOpenChange: (open: boolean) => void;
  onRetry: () => void;
}

const statusStyles: Record<string, string> = {
  pending: 'bg-yellow-50 text-yellow-700',
  matching: 'bg-blue-50 text-blue-700',
  accepted: 'bg-green-50 text-green-700',
  enroute: 'bg-blue-50 text-blue-700',
  en_route: 'bg-blue-50 text-blue-700',
  arrived: 'bg-purple-50 text-purple-700',
  inprogress: 'bg-orange-50 text-orange-700',
  in_progress: 'bg-orange-50 text-orange-700',
  completed: 'bg-green-50 text-green-700',
  cancelled: 'bg-red-50 text-red-700',
};

function labelStatus(value: string | null | undefined) {
  if (!value) return 'Not available';
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateTime(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function money(value: unknown, currency = 'USD') {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.toUpperCase() }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function valueOrDash(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Briefcase; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.12em] text-slate-700">
        <Icon className="h-4 w-4 text-[#008CE5]" />
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, value, mono = false, wrap = false }: { label: string; value: React.ReactNode; mono?: boolean; wrap?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`mt-1 text-sm text-slate-900 ${mono ? 'font-mono text-xs' : 'font-medium'} ${wrap ? 'whitespace-pre-wrap break-words' : 'truncate'}`}>
        {value ?? '—'}
      </dd>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</dl>;
}

export function JobDetailsInspector({
  open, jobId, details, loading, error, canViewFinancials, onOpenChange, onRetry,
}: JobDetailsInspectorProps) {
  const [copied, setCopied] = useState(false);

  const copyJobId = async () => {
    if (!jobId) return;
    await navigator.clipboard?.writeText(jobId);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const job = details?.job;
  const directionsUrl = job ? buildDirectionsUrl(job) : null;
  const timeline = details ? buildJobTimeline(details) : [];
  const cancellation = details?.cancellationOperation;
  const currency = job?.payment_currency || 'USD';
  const hasCancellation = job?.status === 'cancelled' || Boolean(job?.cancelled_at || job?.cancellation_reason || cancellation);
  const hasRequesterMetadata = Boolean(job?.requester_type || job?.requester_name || job?.requester_phone || job?.customer_notes || job?.vehicle_id);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-screen max-w-none gap-0 overflow-hidden border-l border-slate-200 bg-slate-50 p-0 sm:w-[min(720px,100vw)] sm:max-w-[720px]"
        aria-label={jobId ? `Job details for ${jobId}` : 'Job details'}
      >
        <SheetHeader className="border-b border-slate-200 bg-white px-5 py-5 pr-12 sm:px-7">
          <div className="flex flex-wrap items-center gap-2">
            <SheetTitle className="text-xl font-bold text-slate-950">Job Details</SheetTitle>
            {job && (
              <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${statusStyles[job.status] || 'bg-slate-100 text-slate-700'}`}>
                {labelStatus(job.status)}
              </span>
            )}
          </div>
          <SheetDescription className="font-mono text-xs text-slate-500">
            {jobId || 'Select a job to inspect'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-7">
          {loading && (
            <div className="flex min-h-64 items-center justify-center" role="status">
              <div className="text-center">
                <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-[#008CE5]" />
                <p className="text-sm text-slate-500">Loading selected job…</p>
              </div>
            </div>
          )}

          {!loading && error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5" role="alert">
              <p className="font-semibold text-red-800">Could not load this job</p>
              <p className="mt-1 text-sm text-red-700">{error}</p>
              <button onClick={onRetry} className="mt-4 rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white">Try again</button>
            </div>
          )}

          {!loading && !error && details && job && (
            <div className="space-y-4 pb-8">
              {details.relatedWarnings.length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  Some related records were unavailable. Core job details are shown.
                </div>
              )}

              <Section title="Overview" icon={Briefcase}>
                <Grid>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Full Job ID</dt>
                    <dd className="mt-1 flex items-center gap-2">
                      <span className="break-all font-mono text-xs font-semibold text-slate-900">{job.id}</span>
                      <button onClick={copyJobId} className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[#008CE5]" aria-label="Copy Job ID">
                        {copied ? <Check className="h-4 w-4 text-green-600" /> : <Clipboard className="h-4 w-4" />}
                      </button>
                    </dd>
                  </div>
                  <Field label="Service" value={details.serviceName} />
                  <Field label="Assignment" value={job.provider_id ? 'Assigned' : 'Unassigned'} />
                  <Field label="Status" value={labelStatus(job.status)} />
                  <Field label="Payment status" value={labelStatus(job.payment_status)} />
                  <Field label="Created" value={dateTime(job.created_at)} />
                  <Field label="Scheduled / requested" value={dateTime(job.scheduled_for)} />
                </Grid>
              </Section>

              <Section title="Route / Location" icon={MapPin}>
                <dl className="space-y-4">
                  <Field label="Pickup address" value={valueOrDash(job.pickup_address)} wrap />
                  <Field label="Destination / drop-off" value={valueOrDash(job.destination_address)} wrap />
                  <Grid>
                    <Field label="Pickup coordinates" value={job.pickup_latitude != null && job.pickup_longitude != null ? `${job.pickup_latitude}, ${job.pickup_longitude}` : '—'} mono />
                    <Field label="Destination coordinates" value={job.destination_latitude != null && job.destination_longitude != null ? `${job.destination_latitude}, ${job.destination_longitude}` : '—'} mono />
                    <Field label="Provider coordinates" value={job.provider_latitude != null && job.provider_longitude != null ? `${job.provider_latitude}, ${job.provider_longitude}` : '—'} mono />
                  </Grid>
                </dl>
                {directionsUrl && (
                  <a href={directionsUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#008CE5] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0070B8] focus:outline-none focus:ring-2 focus:ring-[#008CE5] focus:ring-offset-2">
                    <Navigation className="h-4 w-4" /> Open directions <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </Section>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Section title="Customer" icon={UserRound}>
                  <dl className="space-y-4">
                    <Field label="Name" value={getProfileName(details.customer, job.customer_id ? 'Unknown / deleted customer' : 'Not available')} wrap />
                    <Field label="Phone" value={valueOrDash(details.customer?.phone)} />
                    <Field label="Email" value={valueOrDash(details.customer?.email)} wrap />
                    <Field label="Customer ID" value={valueOrDash(job.customer_id)} mono wrap />
                  </dl>
                </Section>
                <Section title="Provider" icon={UserRound}>
                  <dl className="space-y-4">
                    <Field label="Assignment" value={job.provider_id ? 'Assigned' : 'Unassigned'} />
                    <Field label="Name" value={job.provider_id ? getProfileName(details.provider, 'Unknown / deleted provider') : 'Not assigned'} wrap />
                    <Field label="Phone" value={valueOrDash(details.provider?.phone)} />
                    <Field label="Email" value={valueOrDash(details.provider?.email)} wrap />
                    <Field label="Provider ID" value={valueOrDash(job.provider_id)} mono wrap />
                  </dl>
                </Section>
              </div>

              <Section title="Job Timeline" icon={Clock3}>
                {timeline.length === 0 ? <p className="text-sm text-slate-500">No lifecycle timestamps available.</p> : (
                  <ol className="space-y-4">
                    {timeline.map((event, index) => (
                      <li key={event.key} className="relative flex gap-3">
                        <div className="flex flex-col items-center">
                          <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[#008CE5]" />
                          {index < timeline.length - 1 && <span className="mt-1 h-full w-px bg-slate-200" />}
                        </div>
                        <div className="pb-1">
                          <p className="text-sm font-semibold text-slate-900">{event.label}</p>
                          <p className="text-xs text-slate-500">{dateTime(event.timestamp)}</p>
                          {event.detail && <p className="mt-1 text-xs text-slate-600">{event.detail}</p>}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </Section>

              {hasCancellation && (
                <Section title="Cancellation" icon={Clock3}>
                  <Grid>
                    <Field label="Reason" value={valueOrDash(cancellation?.reason || job.cancellation_reason)} wrap />
                    <Field label="Actor / source" value={getCancellationActor(details)} />
                    <Field label="Cancelled" value={dateTime(job.cancelled_at || cancellation?.created_at)} />
                    <Field label="State" value={labelStatus(cancellation?.status || (job.payment_status === 'refunded' ? 'refunded' : null))} />
                    {canViewFinancials && <Field label="Refund amount" value={money(cancellation?.refund_amount, currency)} />}
                    {canViewFinancials && <Field label="Refund status" value={labelStatus(cancellation?.stripe_refund_status)} />}
                    {canViewFinancials && <Field label="Refund reference" value={valueOrDash(cancellation?.stripe_refund_id)} mono wrap />}
                  </Grid>
                </Section>
              )}

              {canViewFinancials && (
                <Section title="Pricing & Payment" icon={CreditCard}>
                  <Grid>
                    <Field label="Base price" value={money(job.base_price, currency)} />
                    <Field label="Service fee" value={money(job.service_fee, currency)} />
                    <Field label="Tax" value={money(job.tax, currency)} />
                    <Field label="Tip" value={money(job.tip, currency)} />
                    <Field label="Cancellation fee" value={money(job.cancellation_fee, currency)} />
                    <Field label="Total" value={money(job.total_amount, currency)} />
                    <Field label="Payment status" value={labelStatus(job.payment_status)} />
                    <Field label="Paid" value={dateTime(job.paid_at)} />
                    <Field label="Payment reference" value={valueOrDash(job.payment_intent_id)} mono wrap />
                    <Field label="Charge reference" value={valueOrDash(job.stripe_charge_id)} mono wrap />
                  </Grid>
                  {details.refunds.length > 0 && (
                    <div className="mt-5 border-t border-slate-100 pt-4">
                      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Refund records</p>
                      <div className="space-y-3">
                        {details.refunds.map((refund) => (
                          <div key={refund.id} className="rounded-xl bg-slate-50 p-3 text-sm">
                            <div className="flex justify-between gap-3"><span className="font-semibold text-slate-900">{money(refund.amount, currency)}</span><span>{labelStatus(refund.status)}</span></div>
                            <p className="mt-1 text-slate-600">{valueOrDash(refund.reason)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Section>
              )}

              {canViewFinancials && details.earnings.length > 0 && (
                <Section title="Provider Earnings / Payout" icon={BadgeDollarSign}>
                  <div className="space-y-3">
                    {details.earnings.map((earning) => {
                      const payout = details.payouts.find((row) => row.id === earning.payout_id);
                      return (
                        <div key={earning.id} className="rounded-xl bg-slate-50 p-3">
                          <Grid>
                            <Field label="Entry" value={labelStatus(earning.entry_type)} />
                            <Field label="Provider net" value={money(earning.provider_net, currency)} />
                            <Field label="Platform commission" value={`${valueOrDash(earning.commission_pct)}% · ${money(earning.platform_fee, currency)}`} />
                            <Field label="Payout status" value={payout ? labelStatus(payout.status) : 'Not linked'} />
                            <Field label="Payout reference" value={valueOrDash(payout?.reference_id || earning.payout_id)} mono wrap />
                            <Field label="Payout date" value={dateTime(payout?.paid_at)} />
                          </Grid>
                        </div>
                      );
                    })}
                  </div>
                </Section>
              )}

              <Section title="Rating / Review" icon={Star}>
                {job.rating == null && job.provider_rating == null && !job.review && !job.provider_review ? (
                  <p className="text-sm text-slate-500">No rating or review has been submitted.</p>
                ) : (
                  <Grid>
                    <Field label="Customer → provider" value={job.rating != null ? `${job.rating} / 5 stars` : '—'} />
                    <Field label="Provider → customer" value={job.provider_rating != null ? `${job.provider_rating} / 5 stars` : '—'} />
                    <Field label="Customer review" value={valueOrDash(job.review)} wrap />
                    <Field label="Provider review" value={valueOrDash(job.provider_review)} wrap />
                    <Field label="Reviewed" value={dateTime(job.reviewed_at)} />
                  </Grid>
                )}
              </Section>

              {hasRequesterMetadata && (
                <Section title="Service-Specific Metadata" icon={Wrench}>
                  <Grid>
                    <Field label="Requester type" value={labelStatus(job.requester_type)} />
                    <Field label="Requester name" value={valueOrDash(job.requester_name)} wrap />
                    <Field label="Requester phone" value={valueOrDash(job.requester_phone)} />
                    <Field label="Vehicle reference" value={valueOrDash(job.vehicle_id)} mono wrap />
                    <div className="sm:col-span-2"><Field label="Service / requester notes" value={valueOrDash(job.customer_notes)} wrap /></div>
                  </Grid>
                </Section>
              )}

              <details className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                <summary className="cursor-pointer text-sm font-bold uppercase tracking-[0.12em] text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#008CE5]">
                  Technical / Audit Metadata
                </summary>
                <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Job ID" value={job.id} mono wrap />
                  <Field label="Service ID" value={valueOrDash(job.service_id)} mono wrap />
                  <Field label="Customer ID" value={valueOrDash(job.customer_id)} mono wrap />
                  <Field label="Provider ID" value={valueOrDash(job.provider_id)} mono wrap />
                  <Field label="Vehicle ID" value={valueOrDash(job.vehicle_id)} mono wrap />
                  <Field label="Checkout reference" value={canViewFinancials ? valueOrDash(job.checkout_id) : 'Restricted'} mono wrap />
                  <Field label="Created" value={dateTime(job.created_at)} />
                  <Field label="Updated" value={dateTime(job.updated_at)} />
                </dl>
              </details>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
