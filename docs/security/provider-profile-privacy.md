# Provider profile privacy remediation

## Verified production exposure

On 2026-10-08, read-only catalog inspection of project `apojatplmfsbimgcyjoo`
confirmed that `public.provider_profiles` had a permissive SELECT policy named
`Authenticated users can view providers` with `auth.uid() IS NOT NULL`. Because
PostgreSQL combines permissive policies with OR, that policy allowed every
authenticated account to read every provider row. `anon` and `authenticated`
also had table-level grants; anonymous reads were nevertheless blocked by the
policy predicate because `auth.uid()` is null. No provider field values were
retrieved in the investigation; an aggregate-only role-impersonation query
confirmed five visible rows and five non-null earnings values.

The production schema contains: `id`, `services`, `vehicle_make`,
`vehicle_model`, `vehicle_year`, `vehicle_plate`, `license_number`,
`is_verified`, `is_online`, `rating`, `total_jobs`, `total_earnings`,
`acceptance_rate`, `created_at`, and `updated_at`. Sensitive or operationally
useful exposed fields include license and plate identifiers, vehicle details,
earnings, acceptance rate, online status, verification status, and provider ID.
The `documents` metadata table and private `provider-documents` storage bucket
have separate owner/staff policies and are not changed by this migration.

## Proposed authorization boundary

The migration removes the global authenticated read policy (including the
older `Anyone can view providers` name used in repository history), removes
support's broad provider-profile policy, revokes anonymous table privileges,
and adds a customer read policy that uses the existing
`customer_has_active_job_with_provider` relationship rule. Providers retain
their own row via existing owner policies; administrators retain existing full
access. Support loses provider-profile rows because the support provider page
displays license/plate and financial metrics. Its jobs, user, document metadata,
dispatch, and ticket permissions remain unchanged.

The policy is row-level, not column-level. A customer assigned to a provider's
active job can still select all columns on that provider row, including
`total_earnings` and `acceptance_rate`. This preserves the direct table queries
in currently released customer web and native apps, including legacy `select
('*')`; replacing those queries with a narrow RPC would require an app release
and a separate compatibility rollout. The active-job financial-column exposure
is a known residual risk and an explicit CTO decision point. A future client
upgrade can narrow the returned fields without making this P0 fix break old
installed versions.

## Rollout and rollback

Apply only after exact-head review and after confirming current production
policies still match the read-only audit. No table data is modified. The
migration drops named policies, recreates the job-participant helper with the
same verified body and signature already present in production, adjusts its
execution grant to authenticated users, revokes anon table privileges, and
adds one SELECT policy. Verify admin, provider-owner, active-job customer,
unrelated customer, completed-job customer, and support behavior after apply.

Do not restore the old global SELECT policy as rollback: that recreates the
P0 exposure. If a regression blocks operations, the safer response is a
forward-fix that preserves owner/admin isolation and the active-job boundary.
The provider web and existing native apps do not require an app update for this
migration; customer dispatch reads remain direct and are authorized by the
assigned active job.

## Test limitations

The new PostgreSQL Actions workflow applies the exact migration to a compact
production-shaped fixture and tests direct SQL under distinct authenticated
JWT subjects. It is not a full Supabase schema restore and does not exercise
PostgREST, Realtime, or Storage. Live verification-document policy and private
bucket behavior were separately inspected read-only; neither is changed here.
