# Provider-profile privacy: staged compatibility plan

## Confirmed production issue

Read-only catalog inspection on 2026-10-08 found a `public.provider_profiles`
SELECT policy named `Authenticated users can view providers` with predicate
`auth.uid() IS NOT NULL`. Permissive policies are OR-combined, so every signed-in
account could read every provider row. The table also granted SELECT to
`anon` and `authenticated`; anonymous users were blocked by the RLS predicate
because `auth.uid()` is null. An impersonated authenticated subject with no
profile/job relationship saw five rows and five non-null earnings fields; only
aggregate counts were read.

Production columns are `id`, `services`, `vehicle_make`, `vehicle_model`,
`vehicle_year`, `vehicle_plate`, `license_number`, `is_verified`, `is_online`,
`rating`, `total_jobs`, `total_earnings`, `acceptance_rate`, `created_at`, and
`updated_at`. The private identifier/financial values at issue are vehicle
plate, license number, total earnings, and acceptance rate. The `documents`
metadata table and private `provider-documents` bucket have separate owner/staff
policies; this change does not alter either.

## Why this must be staged

The public TORC customer Android listing is package `com.torc.customer`; the
current repository source declares Android 1.1.0/build 3. The Torc User iOS
listing corresponds to the Capacitor customer app, whose repository source is
also 1.1.0/build 3. A separate Expo target, `com.torc.mobile` version 1.0.0,
also contains customer code, but no public listing for that identifier was
found. Store listing metadata does not establish which binary versions are
currently installed or their adoption. Store-account access and device/version
telemetry are needed for that.

Both customer code paths currently fetch `provider_profiles` directly; one uses
`select('*')`. The live-tracking screen displays vehicle plate and license
number. PostgreSQL RLS can restrict rows but cannot redact selected columns per
customer. Column grants apply to the shared `authenticated` database role, so
they would also break provider/admin reads or make legacy `select('*')` fail.
Keeping the legacy response fully compatible and withholding the same values
from an assigned customer are mutually incompatible requirements. This PR uses
a two-stage cutover rather than claiming otherwise.

## Stage 1 in this PR: bridge and app preparation

The migration removes the global read policy, revokes anonymous table access,
removes Support's provider-profile access, and limits legacy customer table
reads to the provider on their own active job. This preserves currently shipped
client behavior while closing unrelated-account enumeration.

It also adds `get_job_provider_details(job_id)`, a narrow, authenticated,
job-owner-checked function. Updated customer web, Capacitor iOS/Android, and
Expo customer code use it for matching/tracking/history. Its result includes
provider identity/contact needed for that job, service/vehicle make/model/year,
verification state, rating, and job count. It does not include `vehicle_plate`,
`license_number`, `total_earnings`, or `acceptance_rate`. Customer tracking no
longer renders plate/license fields. Provider-owner and admin direct reads stay
on the existing table policies; Support loses the dashboard/page that exposes
provider financial and identity fields.

**Stage 1 is not the final privacy fix.** Legacy or modified customer clients
can still query the active provider's full row until Stage 2. No production
migration or app release is authorized by this PR.

## Stage 2: separate reviewed cutover

After the updated customer web build is live and updated iOS/Android builds are
approved and available, verify adoption and decide whether to enforce a minimum
supported app version. Exercise both the old released binary and new binary on
real devices against a staging Supabase project. Confirm active booking,
matching, contact, map/live tracking, job history, completion, and review flows.
The legacy query's expected Stage 2 result is zero provider-profile rows; the
application must continue its supported flow using the profile/job fallback,
without plate/license/earnings fields.

Only then prepare/apply a separately reviewed migration equivalent to:

```sql
DROP POLICY IF EXISTS "Customer can view assigned active provider profile"
  ON public.provider_profiles;
```

Keep the safe RPC executable by `authenticated`; retain provider-owner and
admin policies. The PR's integration test simulates this Stage 2 policy removal
inside a transaction and verifies direct customer reads return zero while the
scoped RPC remains functional. This SQL is deliberately not a second executable
migration in this PR, so an ordinary migration deploy cannot cut off older
clients before the store rollout decision.

If the old binary does not meet the Stage 2 fallback criteria, do not apply the
cutover until a minimum-version gate or other supported upgrade mechanism is
deployed. A force-upgrade gate does not exist in the current-main customer apps.

## Authorization contract

- Customers: safe RPC only after Stage 2; it requires a job ID owned by `auth.uid()`
  and returns no private identifiers or provider financial metrics.
- Providers: direct access to their own full profile remains unchanged.
- Administrators: existing full provider-profile access remains unchanged.
- Support: no provider-profile reads; jobs/users, dispatch, support tickets, and
  document metadata permissions remain as before.
- Provider documents: customer reads remain denied; no Storage policy changes.

The RPC is `SECURITY DEFINER` because customers will not have direct provider
table access after Stage 2. It is pinned to `pg_catalog, public`, fully
qualifies table references, derives identity only from `auth.uid()`, accepts a
job ID rather than arbitrary provider ID, and has EXECUTE revoked from
`PUBLIC`/`anon` then granted only to `authenticated`.

## Test evidence and limitations

The dedicated PostgreSQL 15 workflow applies Stage 1 and tests direct SQL as
different JWT subjects: unrelated and assigned customers, completed jobs,
provider owners, Support, Admin, documents, safe-RPC result fields, and a
transactional Stage 2 simulation. Repository CI additionally validates the
migration chain, app builds, unit tests, E2E, native config, and secret scan.
These are not a full Supabase restore or store-distributed binary tests;
Stage 2 still requires device testing and store-version/adoption confirmation.

## Rollback

Stage 1 does not modify provider data. If the RPC/client bridge regresses,
rollback the app release while retaining row-scoped RLS; do not restore the
global authenticated policy. Stage 2 is a separate policy-only cutover and can
be paused before applying. After Stage 2, do not recreate a broad policy to
restore old-client behavior; fix forward or roll back only to the safe
active-job row boundary while the upgrade path is corrected.
