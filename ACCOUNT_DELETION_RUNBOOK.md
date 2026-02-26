# Account Deletion Runbook (App Store Compliance)

Use this process for customer/provider deletion requests submitted from in-app **Account Security**.

## Where requests come from

- Customer app: `apps/customer-web/src/pages/customer/AccountSecurity.tsx`
- Provider app: `apps/provider-web/src/pages/provider/AccountSecurity.tsx`
- Request is stored as a `support_tickets` row:
  - `subject = 'Account deletion request'`
  - `priority = 'high'`
  - `status = 'open'`

## 1. Find open deletion requests

```sql
select id, requester_id, requester_role, subject, description, status, priority, created_at
from support_tickets
where subject = 'Account deletion request'
  and status in ('open', 'in_progress')
order by created_at asc;
```

## 2. Verify requester identity

Minimum checks before deletion:
- Email on ticket matches auth/profile email
- Request originated from authenticated user (`requester_id`)
- Optional: require user to confirm from in-app support chat/email thread

## 3. Soft-delete account (admin action)

Preferred: use admin UI
- Customer/admin surface: **Admin → Users** (set status to `deleted`)
- Customer/admin surface: **Admin → Providers** (set status to `deleted`)

DB effect expected:
- `profiles.status = 'deleted'`
- `profiles.deleted_at = now()`

Equivalent SQL fallback:

```sql
update profiles
set status = 'deleted',
    deleted_at = now()
where id = '<REQUESTER_USER_ID>';
```

## 4. Deactivate push tokens

```sql
update device_tokens
set is_active = false,
    updated_at = now()
where user_id = '<REQUESTER_USER_ID>';
```

## 5. Close ticket with admin note

```sql
update support_tickets
set status = 'resolved',
    admin_note = 'Account deletion processed by admin',
    resolved_at = now(),
    updated_at = now()
where id = '<SUPPORT_TICKET_ID>';
```

## 6. Audit trail check

If action was done in admin UI, confirm an audit record exists:

```sql
select id, actor_id, action, entity_type, entity_id, created_at
from admin_audit_logs
where entity_id = '<REQUESTER_USER_ID>'
order by created_at desc
limit 20;
```

## Notes

- This is a **soft-delete** lifecycle in the platform (`profiles.status='deleted'`).
- If legal/compliance requires hard deletion from `auth.users`, run that through a privileged backend/admin process (not client-side).
- Keep support response templates consistent with App Review language: "Account deletion can be initiated in-app from Account Security."
