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

## October 8 release-readiness audit (read-only; not a production change)

The production catalog was rechecked on 2026-10-08. The broad `Authenticated
users can view providers` policy and `anon`/`authenticated` table grants are
still present. No `public` view definition references `provider_profiles`, and
the table is not currently in `supabase_realtime`. Therefore the confirmed
direct leakage path is PostgREST/table access under RLS (and any other SQL API
using the same grants/policies), not a view or Realtime publication. Supabase's
GraphQL API also follows PostgreSQL grants and RLS; it is not an RLS bypass.

The effective field scope of that row policy is the entire table: `id`, service
array, vehicle make/model/year/plate, license number, verification/online state,
rating, total job count, earnings, acceptance rate, and timestamps. This audit
did not read or export provider values. The especially sensitive fields are
`vehicle_plate`, `license_number`, `total_earnings`, and `acceptance_rate`.
`documents` and the private `provider-documents` bucket have separate policies;
the migration does not change them.

Related production callable paths checked:

| Path | Current production behavior / proposed handling |
| --- | --- |
| `customer_has_active_job_with_provider(uuid,uuid)` | SECURITY DEFINER owned by `postgres`, `search_path=public`, executable by `anon` and `authenticated`. Body binds arguments to `auth.uid()` as customer or provider and active-job existence. Migration pins search path and removes anonymous execution. |
| `get_nearby_providers(...)` | SECURITY DEFINER, authenticated-only. Current production function accepts caller-provided coordinates/service and returns provider IDs and live coordinates. It is not changed by PR #44 because dispatch authorization is outside provider-profile row privacy. The coordinate-probing risk remains tracked separately at https://github.com/cipherhq/torc/issues/47. |
| `get_job_provider_details(uuid)` | Not present in current production; migration adds it. SECURITY DEFINER, authenticated-only, job owner check from `auth.uid()`, safe allowlist and phone only for active jobs. |
| `accept_job(uuid,uuid)` | SECURITY DEFINER, authenticated-only; checks provider argument equals `auth.uid()` and provider eligibility before acceptance. |
| `approve_provider(uuid)` | SECURITY DEFINER, authenticated-only; admin authorization check. |
| `ensure_provider_setup(...)` | SECURITY DEFINER, authenticated-only; provisions the caller's own provider record. |
| `suspend_expired_document_providers()` | Separate production issue: SECURITY DEFINER owned by `postgres`, no pinned `search_path`, and `EXECUTE` granted to `authenticated`, although repository migration comments say it should be service-role/cron-only. It bulk-mutates verification/suspension state; it does not return profile rows. Do not change it in this PR; create a separate P0 authorization issue and remediate with CTO review. |

Customer source audit found the previous direct provider table reads in job
enrichment and matching. Current web and native source uses
`get_job_provider_details`; only an app-first bridge for a missing RPC selects
an explicit safe-column allowlist, never plate/license/earnings/acceptance.
The stale customer `/shop/:shopId` component that issued another direct query
was unreferenced and has been removed. The remaining customer-context provider
table operation is an UPDATE of rating/job aggregates after a completed job,
not a SELECT. Admin provider-management reads remain in admin-only dashboard
routes; provider-web reads are for the authenticated provider's own profile.
Support's admin-web provider route, dashboard metrics, links, and realtime
subscription are removed/hidden; DB RLS remains the authoritative boundary.

## Controlled rollout checklist (proposal; production gate remains closed)

### Preflight and ordering

1. CTO reviews the exact PR #44 head and the independent PR #43 head. Neither
   head is authorized to merge or deploy by this document.
2. On release day, re-run read-only catalog checks for policy definitions,
   grants, relevant function signatures/definitions/ACLs, dependencies, and
   `supabase_migrations.schema_migrations`. Confirm no schema drift and capture
   the exact SQL/migration checksums. Take/verify the normal recoverable database
   backup and rehearse restore/forward-fix procedures in a non-production clone.
3. Current production migration history ends at `20261003163907`; PR #44's
   `20261008090000` migration sorts before PR #43's
   `20261008135507` migration. If both are approved, merge both reviewed PRs
   before one controlled migration push so the CLI applies them in timestamp
   order. Do not apply #43 first and then introduce an older pending #44
   migration. If only #44 is approved, it can be applied alone; keep #43 pending.
4. Prefer application code first: release updated web and native apps, then
   apply the Stage 1 migration after compatibility gates. The safe RPC caller
   falls back only on a missing-function/schema-cache error and only to
   explicitly selected non-sensitive fields. It fails closed on other RPC
   errors. Recheck PostgREST schema cache after migration. Do not change Site
   URL, email templates, production Auth settings, or Vercel project state.

### Compatibility evidence required before Stage 1

Repository source currently declares Capacitor customer iOS/Android
`1.1.0` / build `3`; the separate Expo target is `1.0.0` / `com.torc.mobile`.
These are source versions, **not verified minimum installed versions**. Public
store listings do not show adoption. App Store Connect, Play Console, release
artifacts, crash/telemetry version breakdown, and at least one real device per
platform are required to establish the deployed population. The Expo target's
release status must also be determined. Do not label any binary compatibility
as verified from HTTP 200 or repository builds.

Stage 1's temporary policy permits legacy full-row reads only for an active
assigned job. Older clients may lose direct provider details on completed job
history after the migration; this is an acknowledged compatibility risk and
must be exercised against the exact currently distributed binaries before
release. Do not promise completed-history compatibility until that test passes.
The app-first safe-column fallback supports the bridge before RPC deployment,
but it is not evidence that an already-installed older binary uses the bridge.

### Customer identification and end-to-end acceptance

The written product roadmap asks for provider photo, rating, and “vehicle info”;
it does not specify license plate or license number. Updated tracking shows
provider name, verified state, rating, year/make/model, live map, and in active
jobs the contact action. These are not a unique vehicle identifier. Product
must confirm whether make/model/year plus live location/contact is sufficient
for roadside arrival identification. If unique matching is required, prefer a
job-scoped one-time arrival code over exposing plate/license broadly; that
alternative is not implemented or yet approved.

Before production release, test with real customer/provider accounts and an
actual accepted job on iOS and Android (including the exact store-distributed
old build and candidate new build): create request, matching waves, provider
acceptance, customer/provider live tracking, contact, arrival confirmation,
completion, history, review, and cancellation. Verify customer cannot retrieve
another customer's details; completed jobs omit phone; direct table probes do
not enumerate unrelated providers; legacy behavior matches the documented
Stage 1 boundary; RPC and Realtime paths behave correctly. Validate email/login
and provider onboarding remain unchanged. A successful build or HTTP 200 alone
is insufficient.

### Stage 2 cutover plan (separate tracked change)

Stage 2 must be a separate migration/PR that drops only
`Customer can view assigned active provider profile`; it must retain provider
self and admin policies and the safe RPC. Engineering should target completion
within 14 days of Stage 1 release, with Product/CTO assigning the accountable
owners and confirming the date. Do not execute the policy drop until all active
supported client versions use the RPC, or a minimum-version gate blocks older
versions before tracking/job flows. If adoption cannot be proven, require a
forced-upgrade decision rather than assuming store update equals installation.

Stage 2 acceptance: production-safe direct customer selects return zero rows for
active and completed provider jobs; scoped RPC returns only its contract for
the caller's jobs; provider self/admin access is retained; unrelated and
zero-job customer tests pass; old app binaries are either proven non-active or
blocked by the minimum-version gate; new iOS, Android, Expo (if released), and
web pass the real-device workflow above. Store version/adoption dashboard
screenshots or export and test records are release artifacts. Roll back only by
restoring the active-job scoped customer policy if required; never restore the
global policy.

### Migration rollback and monitoring

This migration does not alter provider data. If the RPC or app bridge fails,
pause Stage 2, roll back the app if necessary, keep the global policy removed,
and use a reviewed forward fix or the narrow active-job policy. Monitor Postgres
permission/RLS errors, PostgREST RPC errors, matching completion/acceptance,
tracking loads, and support contacts. Do not re-enable broad authenticated reads
as an emergency compatibility workaround.
