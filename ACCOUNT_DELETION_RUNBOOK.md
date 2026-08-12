# Account Deletion Runbook (Store Compliance)

## Deletion Entry Points

- **In-app** (customer/provider): Account Security → "Request Account Deletion"
  - Calls `request_account_deletion(p_reason)` RPC
  - Sets `profiles.status = 'pending_deletion'`
  - Creates a support ticket automatically
  - Signs user out

- **Website**: https://www.torcapp.com/account-deletion
  - User enters email → receives magic link → verifies identity
  - After verification, calls `request_account_deletion(p_reason)` RPC
  - Same effect as in-app request

## Lifecycle

```
active → pending_deletion → deletion_processing → deleted
```

| Status | Meaning |
|--------|---------|
| `pending_deletion` | User requested deletion. Cannot create/accept jobs. Awaiting admin processing. |
| `deletion_processing` | DB anonymization complete. Auth user deletion pending. |
| `deleted` | Fully deleted. Auth user removed. Personal data anonymized. |

## 1. Find pending deletion requests

```sql
SELECT id, email, role, status, deleted_at
FROM profiles
WHERE status = 'pending_deletion'
ORDER BY deleted_at ASC;
```

## 2. Process deletion via Edge Function (preferred)

```bash
curl -X POST "${SUPABASE_URL}/functions/v1/process-account-deletion" \
  -H "Content-Type: application/json" \
  -H "x-torc-cron-secret: ${CRON_SECRET}" \
  -d '{"user_id": "<USER_ID>"}'
```

The Edge Function performs three steps atomically:

1. **`_internal_process_deletion(user_id)`** — DB anonymization
   - Deletes: device tokens, notifications, push records, GPS locations, payment methods, Stripe mapping, vehicles, payout methods
   - Anonymizes: profile fields, provider profile, job addresses, checkout snapshots, chat messages, support tickets
   - Retains: financial records (earnings, payouts, refunds, tips, cancellation ops, audit logs)
   - Sets status: `deletion_processing`

2. **Supabase Admin Auth DELETE** — removes auth.users row
   - On 404 (already absent): treats as success
   - On timeout/5xx: returns error, stays `deletion_processing`, retryable

3. **`_internal_finalize_deletion(user_id)`** — marks `deleted`
   - Independently verifies auth.users row is absent (not caller-trusted)
   - Only sets `deleted` if auth row is actually gone
   - Creates finalization audit log

## 3. Manual fallback (admin SQL)

If the Edge Function is unavailable:

```sql
-- Step 1: DB anonymization
SELECT _internal_process_deletion('<USER_ID>'::uuid);

-- Step 2: Delete auth user via Admin API
-- curl -X DELETE "${SUPABASE_URL}/auth/v1/admin/users/<USER_ID>" \
--   -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
--   -H "apikey: ${SERVICE_ROLE_KEY}"

-- Step 3: Finalize (verifies auth.users absent)
SELECT _internal_finalize_deletion('<USER_ID>'::uuid);
```

## 4. Retry on failure

- If auth deletion fails: profile stays `deletion_processing`. Re-run the Edge Function.
- If auth user already deleted on retry: step 2 returns 404, treated as success.
- If DB work already done on retry: `_internal_process_deletion` returns `stage: deletion_processing`.
- If already fully deleted: returns `already_deleted: true`.

## 5. Audit verification

```sql
SELECT * FROM admin_audit_logs
WHERE entity_id = '<USER_ID>'
  AND action IN ('account_deletion_processed', 'account_deletion_finalized')
ORDER BY created_at;
```

## Authorization Model

| Function | Who can call |
|----------|-------------|
| `request_account_deletion(reason)` | Authenticated user (self only via auth.uid) |
| `check_deletion_eligibility(user_id)` | Self or admin |
| `_internal_process_deletion(user_id)` | Service role only |
| `_internal_finalize_deletion(user_id)` | Service role only |

## Retention — REVIEW REQUIRED

The following require business/legal policy decisions:

| Category | Status |
|----------|--------|
| Auth deletion timing | REVIEW REQUIRED |
| Provider document storage retention | REVIEW REQUIRED |
| Job photo storage retention | REVIEW REQUIRED |
| Financial record retention duration | REVIEW REQUIRED |
| Stripe customer/payment-method cleanup | REVIEW REQUIRED |

Records may be retained for legitimate legal, accounting, fraud, payment, dispute, security, or audit purposes. Exact durations are business/legal decisions not yet established.
