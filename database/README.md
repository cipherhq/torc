# Database Migrations & RPCs for Torc Job Acceptance

This folder contains SQL migrations and RPC functions for **atomic, race-safe job acceptance and cancellation** with mobile push notification support.

---

## 📁 Files

### Migrations (run in order)
1. **`001_job_events_table.sql`** – Creates `job_events` table for immutable event log
2. **`002_accept_job_rpc.sql`** – `accept_job(job_id, provider_id)` function
3. **`003_cancel_job_rpc.sql`** – `cancel_job(job_id, actor_id, actor_type, reason)` function
4. **`004_device_tokens_table.sql`** – Creates `device_tokens` table for push notification tokens
5. **`005_push_notifications_log.sql`** – Creates `push_notifications` table for logging sent pushes
6. **`006_add_cancelled_by.sql`** – Adds `cancelled_by` column to `jobs` table

### Test Script
- **`../scripts/test-job-race.js`** – Node script to simulate race conditions and test RPCs

---

## 🚀 Running Migrations

### Prerequisites
- Supabase project URL and service role key (from Supabase Dashboard → Settings → API)
- Your `jobs` table must exist with at minimum these columns:
  ```sql
  id UUID PRIMARY KEY
  customer_id UUID
  provider_id UUID
  status TEXT
  accepted_at TIMESTAMPTZ
  cancelled_at TIMESTAMPTZ
  cancelled_by UUID
  cancellation_reason TEXT
  updated_at TIMESTAMPTZ
  ```

### Option 1: Supabase SQL Editor (Recommended)
1. Go to your Supabase project → **SQL Editor**
2. Copy/paste each migration file **in order** (001, 002, 003, 004, 005, 006)
3. Click **Run** for each one
4. Check for success messages (no errors)

### Option 2: `psql` (if you have direct Postgres access)
```bash
psql "$DATABASE_URL" -f database/migrations/001_job_events_table.sql
psql "$DATABASE_URL" -f database/migrations/002_accept_job_rpc.sql
psql "$DATABASE_URL" -f database/migrations/003_cancel_job_rpc.sql
```

### Option 3: Supabase CLI (if you use local dev)
```bash
# In your Supabase project folder
cp database/migrations/*.sql supabase/migrations/
supabase db push
```

---

## 🧪 Testing the RPCs

After running migrations, test with the Node script:

```bash
cd scripts
npm install @supabase/supabase-js dotenv
node test-job-race.js
```

Set these environment variables (create `.env` in `scripts/`):
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
TEST_CUSTOMER_ID=a-valid-customer-uuid
TEST_PROVIDER_1_ID=a-valid-provider-uuid
TEST_PROVIDER_2_ID=another-provider-uuid
TEST_SERVICE_ID=a-valid-service-uuid
```

The script will:
1. Create a test job
2. Simulate two providers racing to accept
3. Show which one wins, which one gets rejected
4. Test cancellation by customer and provider

---

## 📋 What Each RPC Does

### `accept_job(job_id, provider_id)`

**Purpose:** Atomically claim a job so only one provider can accept.

**Flow:**
1. Locks the job row (`SELECT ... FOR UPDATE`)
2. Checks if status is `pending`
3. If yes: updates `provider_id`, `status = 'accepted'`, `accepted_at`
4. Logs to `job_events`
5. Emits `pg_notify('job_accepted', {...})` for push worker
6. Returns `{ success: true, job_id, provider_id, ... }`

**If job already accepted:**
- Returns `{ success: false, error: 'JOB_ALREADY_ACCEPTED', ... }`

**Race safety:** `FOR UPDATE` lock ensures only one provider wins.

### `cancel_job(job_id, actor_id, actor_type, reason)`

**Purpose:** Let customer or provider cancel a job.

**Flow:**
1. Locks the job row
2. Checks if job is not already `completed` or `cancelled`
3. Verifies actor is authorized (customer who created it, or assigned provider)
4. Updates `status = 'cancelled'`, `cancelled_at`, `cancelled_by`, `cancellation_reason`
5. Logs to `job_events`
6. Emits `pg_notify('job_cancelled', {...})`
7. Returns `{ success: true, job_id, cancelled_by, ... }`

**Authorization:**
- Customer can cancel if `customer_id = actor_id`
- Provider can cancel if `provider_id = actor_id` (and provider is assigned)

---

## 🔔 Push Notification Integration

### How events reach your push worker

Both RPCs emit `pg_notify`:
- `accept_job` → `pg_notify('job_accepted', json)`
- `cancel_job` → `pg_notify('job_cancelled', json)`

### What to do next

1. **Set up a Postgres listener** (Node.js, Python, Edge Function, etc.) that connects to Supabase and listens for `job_accepted` and `job_cancelled` channels.

2. **When event fires:**
   - Parse the JSON payload
   - Look up push tokens for the target user(s) from `device_tokens` table
   - Send push via Expo Push API, FCM, or APNs

3. **Example listener (Node.js):**
   ```js
   const { Client } = require('pg');
   const client = new Client({ connectionString: process.env.DATABASE_URL });
   
   await client.connect();
   await client.query('LISTEN job_accepted');
   await client.query('LISTEN job_cancelled');
   
   client.on('notification', async (msg) => {
     const data = JSON.parse(msg.payload);
     if (msg.channel === 'job_accepted') {
       // Send push to customer: "Provider X accepted your request!"
       await sendPushToUser(data.customer_id, { ... });
     }
     if (msg.channel === 'job_cancelled') {
       // Send push to provider or customer
       await sendPushToUser(data.provider_id || data.customer_id, { ... });
     }
   });
   ```

4. **Alternative: Supabase Edge Function + Database Webhooks**
   - Trigger on `job_events` INSERT
   - Call Edge Function that sends push
   - See [Supabase Database Webhooks](https://supabase.com/docs/guides/database/webhooks)

---

## 🛡️ Security & RLS

### `job_events` table
- **SELECT:** Users can view events for jobs they're involved in (customer or assigned provider)
- **INSERT:** Only service role (via RPCs)

### RPCs
- `accept_job` and `cancel_job` use `SECURITY DEFINER` so they run with elevated permissions
- **Authorization checks inside the functions** ensure only valid actors can cancel
- Granted to `authenticated` role so logged-in users can call them

### Client usage (from mobile/web app)
```js
import { supabase } from './supabaseClient';

// Provider accepts a job
const { data, error } = await supabase.rpc('accept_job', {
  p_job_id: jobId,
  p_provider_id: currentUser.id
});

if (data.success) {
  console.log('Job accepted!', data);
} else {
  console.error('Failed:', data.error, data.message);
}

// Customer cancels a job
const { data, error } = await supabase.rpc('cancel_job', {
  p_job_id: jobId,
  p_actor_id: currentUser.id,
  p_actor_type: 'customer',
  p_reason: 'Changed my mind'
});
```

---

## 📊 Monitoring & Debugging

### Check job events
```sql
SELECT * FROM job_events
WHERE job_id = 'your-job-id'
ORDER BY created_at DESC;
```

### Check which jobs were accepted by which provider
```sql
SELECT id, status, provider_id, accepted_at
FROM jobs
WHERE status = 'accepted'
ORDER BY accepted_at DESC
LIMIT 20;
```

### See recent notifications sent
```sql
-- After you add a push_notifications table to log sent pushes
SELECT * FROM push_notifications
ORDER BY sent_at DESC
LIMIT 20;
```

---

## ✅ Next Steps After Running Migrations

1. **Run test script** to verify RPCs work and handle races correctly
2. **Set up push notification listener** (Node worker or Edge Function)
3. **Create `device_tokens` table** to store provider/customer push tokens
4. **Update mobile app** to register push tokens on login
5. **Add deep links** in push payloads so tapping opens the right screen

See `../scripts/test-job-race.js` for race condition tests.
See mobile push integration guide (coming next) for token registration.
