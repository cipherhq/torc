# Push Test (Run Later On Real Devices)

Use this when you finish simulator testing and are ready to validate real push delivery.

## 1. Start worker

```bash
cd /Users/bajideace/Desktop/torc/workers
npm start
```

Expected:
- `✅ Connected to Postgres`
- `🎧 Listening for job events...`

## 2. Confirm device tokens are registered

Run in Supabase SQL editor:

```sql
select user_id, platform, push_token, is_active, updated_at
from device_tokens
order by updated_at desc
limit 20;
```

You should see active rows for your customer/provider test users.

## 3. Get IDs for test payload

```sql
-- Replace these filters with your known test users if needed
select id, customer_id, provider_id, status, created_at
from jobs
where customer_id is not null
  and provider_id is not null
order by created_at desc
limit 10;
```

Pick one row and copy:
- `job_id`
- `customer_id`
- `provider_id`

## 4. Trigger test notification event

```sql
select pg_notify(
  'job_accepted',
  '{"job_id":"<JOB_ID>","provider_id":"<PROVIDER_USER_ID>","customer_id":"<CUSTOMER_USER_ID>"}'
);
```

## 5. Verify push logs

```sql
select user_id, notification_type, status, transport, error_code, created_at
from push_notifications
order by created_at desc
limit 20;
```

Expected:
- new row(s) after trigger
- `status` like `sent`/`delivered`
- `transport` like `expo`/`fcm`/`apns`

## 6. Optional: test other channels

```sql
select pg_notify(
  'provider_arrived',
  '{"job_id":"<JOB_ID>","customer_id":"<CUSTOMER_USER_ID>"}'
);

select pg_notify(
  'job_completed',
  '{"job_id":"<JOB_ID>","customer_id":"<CUSTOMER_USER_ID>"}'
);

select pg_notify(
  'job_cancelled',
  '{"job_id":"<JOB_ID>","actor_type":"provider","customer_id":"<CUSTOMER_USER_ID>","provider_id":"<PROVIDER_USER_ID>","reason":"Test cancel"}'
);
```

## Notes

- Simulator/emulator push behavior is limited; use physical devices for final validation.
- For TestFlight/App Store builds, set:
  - `APNS_USE_SANDBOX=false`
  - `NODE_ENV=production`
