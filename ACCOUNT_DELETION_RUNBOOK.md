# Account Deletion Runbook (Store Compliance)

Use this process for customer/provider deletion requests submitted from:
- **In-app**: Account Security (customer and provider apps)
- **Web**: https://www.torcapp.com/account-deletion

## Where requests come from

- Customer app: `apps/customer-web/src/pages/customer/AccountSecurity.tsx`
- Provider app: `apps/provider-web/src/pages/provider/AccountSecurity.tsx`
- Website: `apps/website/src/pages/AccountDeletion.jsx`
- All stored as `support_tickets` rows with `subject LIKE 'Account deletion request%'`

## Lifecycle

```
active → pending_deletion → deletion_processing → deleted
```

- `pending_deletion`: User initiated request. Cannot create/accept new jobs.
- `deletion_processing`: Admin triggered server-side deletion RPC. In progress.
- `deleted`: Personal data removed/anonymized. Financial records retained anonymized.

## 1. Find open deletion requests

```sql
select id, requester_id, requester_role, subject, description, status, priority, created_at
from support_tickets
where subject like 'Account deletion request%'
  and status in ('open', 'in_progress')
order by created_at asc;
```

## 2. Verify requester identity

- Email on ticket matches auth/profile email
- For in-app requests: `requester_id` is the authenticated user
- For web requests: verify email ownership before proceeding
- If uncertain: require email verification reply

## 3. Check eligibility

Run the eligibility check before processing:

```sql
select process_account_deletion('<REQUESTER_USER_ID>'::uuid);
```

The RPC will fail closed if:
- User has active (non-completed/cancelled) jobs
- User has pending refunds
- Provider has pending/processing payouts

Resolve blockers before retrying.

## 4. Process deletion (server-authoritative)

The `process_account_deletion` RPC handles everything atomically:

```sql
select process_account_deletion('<REQUESTER_USER_ID>'::uuid);
```

This performs:

### Category A — DELETE (personal data removed)
- Device tokens
- Notifications and push delivery records
- Provider GPS locations
- Saved payment methods and Stripe customer mapping
- Vehicles
- Provider payout method details (bank/PayPal/Venmo)
- Provider job dismissals

### Category B — ANONYMIZE (records retained with personal data removed)
- Profile: name → "Deleted User", email/phone → NULL
- Provider profile: vehicle info, license, avatar → NULL
- Jobs: addresses, requester name/phone, notes → NULL
- Checkouts: booking snapshot personal fields removed
- Chat messages: sender name anonymized, message → "[deleted]"
- Support tickets: description → "[account deleted]"

### Category C — RETAIN (financial/audit records kept for legal compliance)
- provider_earnings (amounts, commission snapshots)
- provider_payouts (payout amounts and status)
- job_cancellation_operations (refund amounts, Stripe references)
- job_tips (tip amounts, payment references)
- checkouts (financial amounts — personal fields anonymized)
- refunds (amounts and status)
- job_events / job_status_audit (audit trail)
- admin_audit_logs
- payment_attempts / processed_webhook_events

### Category D — REVIEW REQUIRED (needs business/legal decision)
- `auth.users` row deletion (recommended after grace period; requires Supabase Admin API)
- Provider uploaded documents in storage (may need fraud/dispute retention policy)
- Job photos in storage (may need dispute retention policy)
- Exact retention periods for financial records

## 5. Post-deletion: auth.users removal

After the profile is `deleted` and personal data anonymized, the `auth.users` row should be deleted to prevent re-authentication:

```sql
-- Via Supabase Admin API (not direct SQL in production)
-- DELETE FROM auth.users WHERE id = '<REQUESTER_USER_ID>';
```

**REVIEW REQUIRED**: Determine appropriate grace period before auth deletion. Recommended: 30 days after deletion processing to allow support escalation.

## 6. Post-deletion: storage cleanup

**REVIEW REQUIRED**: Determine retention policy for:

```sql
-- Provider documents
-- Storage path: provider-documents/<provider_id>/
-- Job photos
-- Storage path: job-photos/<job_id>/
```

## 7. Audit trail

Deletion creates an `admin_audit_logs` entry automatically:
```sql
select * from admin_audit_logs
where entity_id = '<USER_ID>' and action = 'account_deletion_processed';
```

## Notes

- The `process_account_deletion` RPC is idempotent — safe to retry.
- Only admin or service_role can execute it.
- The RPC closes any open deletion support tickets automatically.
- `auth.users` deletion requires a separate privileged step (Supabase Admin API).
- Items marked REVIEW REQUIRED need business/legal policy decisions.
