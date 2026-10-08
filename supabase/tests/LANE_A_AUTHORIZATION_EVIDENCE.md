# Lane A authorization evidence and integration-test scope

This note accompanies the privileged-signup migration. It records what the
disposable PostgreSQL test does and does not establish; it is not a substitute
for a production migration review.

## Why CI does not run a full local Supabase reset

The repository's `supabase/migrations` directory is not a complete baseline
schema. Its earliest migration (`20260304231100_job_photo_columns.sql`) alters
an existing `jobs` table and writes to the Storage schema. The repository does
not include the initial DDL for those objects, `auth.users`, `profiles`, or the
production `user_role` type. Therefore `supabase db reset` against a clean
local Supabase stack cannot reproduce the deployed project from this checkout;
it fails before reaching the Lane A migration. CI instead creates the minimum
database fixtures needed to apply the actual Lane A migration and exercise its
trigger, role mapping, grants, and a real PostgreSQL RLS policy. The fixture is
not represented as the full Supabase production schema.

## Deployed-object compatibility review

Read-only inspection of the deployed project found the existing function
signature `public.handle_new_user() RETURNS trigger`, attached to
`auth.users` by `on_auth_user_created`. The migration uses `CREATE OR REPLACE`
with the same signature, language, trigger return type, and profile columns.
It does not drop or recreate the existing trigger. PostgreSQL checks permission
to execute a trigger function when creating the trigger; the test creates the
trigger as its database owner after the API-role revocations and confirms that
subsequent inserts still invoke it successfully.

The migration removes `PUBLIC`, `anon`, and `authenticated` execution grants.
It does not revoke a pre-existing explicit `service_role` grant; that trusted
server role is intentionally outside the public-signup boundary. The database
test asserts the API roles cannot invoke the function directly and the trigger
continues to work.

## Provider signup and authorization boundaries

Provider web and mobile onboarding currently select `provider` at signup,
then call `ensure_provider_setup` for the authenticated user's own profile.
That RPC rejects conversion of an already assigned non-provider role and
creates the provider profile unverified. A separate verification guard
prevents the provider from setting `is_verified`; administrative approval is
required. The production job-acceptance and matching paths check verification,
and job and payout records are scoped to the authenticated provider's own ID.
Changing public `provider` role mapping to `customer` in this migration would
break the existing onboarding contract and would require a coordinated
client/RPC redesign, so this migration preserves that onboarding role while
removing `admin` and `support` assignment from public metadata.

Important separate production finding: the current `provider_profiles` SELECT
policy allows any authenticated user to read provider profiles, including
sensitive fields such as license and vehicle identifiers. This is not caused
by selecting the provider role (the policy applies to customers too), but it
means the current production system does not satisfy a broad claim that
sensitive provider information is protected from customers. It needs a
separately scoped privacy remediation and must not be treated as fixed by Lane
A. This Lane A change does not alter that policy.

## Coverage

The disposable PostgreSQL test now covers attempted `admin` and `support`
signup, valid customer/provider onboarding roles, invalid and missing role
metadata, existing admin/support role preservation on trigger conflict,
`is_admin` and RLS denial for attempted admin signup, API-role function grants,
trigger invocation after revocation, and atomic failure when profile creation
fails. It does not emulate Supabase Auth's full GoTrue signup or JWT issuance,
all production RLS policies, or the provider approval/payment stack. The
deployed RPC/policy review above is read-only compatibility evidence, not an
end-to-end integration test.
