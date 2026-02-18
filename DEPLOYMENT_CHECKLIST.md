# 🚀 Torc Deployment Checklist

Complete checklist for deploying atomic job acceptance + push notifications to production.

---

## 📊 Phase 1: Database (RPCs + Tables)

Run these in **Supabase SQL Editor** in order:

- [ ] `database/migrations/001_job_events_table.sql`
- [ ] `database/migrations/002_accept_job_rpc.sql`
- [ ] `database/migrations/003_cancel_job_rpc.sql`
- [ ] `database/migrations/004_device_tokens_table.sql`
- [ ] `database/migrations/005_push_notifications_log.sql`

**Verify:**
```sql
-- Check tables exist
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('job_events', 'device_tokens', 'push_notifications');

-- Check RPCs exist
SELECT proname FROM pg_proc WHERE proname IN ('accept_job', 'cancel_job', 'upsert_device_token');
```

---

## 🧪 Phase 2: Test RPCs Locally

- [ ] Copy `scripts/.env.example` to `scripts/.env`
- [ ] Fill in Supabase URL, service key, test user IDs
- [ ] Run: `cd scripts && npm install && npm run test:race`

**Expected output:**
- ✅ Two providers race to accept → one wins, one rejected
- ✅ Customer cancellation works
- ✅ Provider cancellation works
- ✅ Unauthorized cancel is blocked
- ✅ `job_events` table has 4+ events logged

**If tests fail:**
- Check `jobs` table exists and has required columns
- Verify RLS policies don't block the RPCs
- Check user IDs in `.env` are valid UUIDs from `auth.users`

---

## 📱 Phase 3: Mobile App Updates

### Both Provider and Customer Apps

- [ ] Install dependencies: `npx expo install expo-notifications expo-device expo-constants`
- [ ] Copy `mobile/utils/pushNotifications.js` to `utils/` in each app
- [ ] Update `app.json` with notification config (see `mobile/app.json.example`)
- [ ] Integrate into `App.js` (see `mobile/App.example.js`)
- [ ] Add custom sounds to `assets/sounds/` (see `mobile/sounds/README.md`)
- [ ] Update `supabaseClient.js` to use correct URL and anon key

### Provider App Specific

- [ ] Add `JobRequestScreen` that shows job details and "Accept" button
- [ ] "Accept" button calls `accept_job` RPC (see `mobile/PROVIDER_APP_INTEGRATION.md`)
- [ ] Handle "Job Taken" alert if another provider accepts first
- [ ] Test deep link: tap push → opens JobRequest screen with correct job

### Customer App Specific

- [ ] Update `LiveTrackingScreen` to subscribe to job updates
- [ ] Show "Finding provider..." until job is accepted
- [ ] When job is accepted, show provider details and map
- [ ] Test deep link: tap "Provider found" push → opens LiveTracking

---

## 🔄 Phase 4: Push Notification Worker

- [ ] Choose deployment platform (Heroku, Railway, Docker, PM2 on VPS)
- [ ] Copy `workers/.env.example` to `workers/.env`
- [ ] Fill in `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Install dependencies: `cd workers && npm install`
- [ ] Test locally: `npm run dev`

**Verify worker is listening:**
```
🚀 Starting push notification worker...
✅ Connected to Postgres
🎧 Listening for job events...
```

**Test notification:**
In Supabase SQL Editor:
```sql
SELECT pg_notify('job_accepted', '{"job_id":"test-123","provider_id":"provider-456","customer_id":"customer-789"}');
```

Worker should log:
```
📬 Received job_accepted: { job_id: 'test-123', ... }
📤 Sending push to user customer-789 (1 device(s))
✅ Sent 1 push notification(s)
```

### Deploy Worker

**Heroku:**
```bash
cd workers
heroku create torc-push-worker
heroku config:set DATABASE_URL="..." SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..."
git init && git add . && git commit -m "Push worker"
git push heroku main
heroku logs --tail
```

**Railway:**
1. Go to Railway.app → New Project → Deploy from repo
2. Select `workers/` folder
3. Add environment variables
4. Deploy

**PM2 on VPS:**
```bash
ssh your-server
git clone your-repo
cd workers
npm install --production
cp .env.example .env
# Edit .env
npm run pm2:start
pm2 save
pm2 startup
```

---

## 🧪 Phase 5: End-to-End Testing

### Test 1: Provider Accepts Job

1. **Customer:** Create a job in customer app
2. **Provider:** Should receive push notification with sound
3. **Provider:** Tap notification → JobRequest screen opens
4. **Provider:** Tap "Accept" → navigates to ActiveJob
5. **Customer:** Should receive "Provider found!" push
6. **Customer:** LiveTracking screen shows provider details

**Verify:**
- [ ] Provider push arrives within 2 seconds
- [ ] Custom sound plays (`new-request.wav`)
- [ ] Deep link opens JobRequest screen
- [ ] `accept_job` RPC succeeds
- [ ] Customer gets push notification
- [ ] `job_events` table has `job_accepted` event
- [ ] `push_notifications` table has 2 rows (1 for provider, 1 for customer)

### Test 2: Race Condition (Multiple Providers)

1. **Customer:** Create a job
2. **Providers:** 3+ providers receive push at same time
3. **Providers:** All tap "Accept" simultaneously
4. **Expected:** Only 1 gets the job, others see "Job Taken"

**Verify:**
- [ ] Only 1 job row has `provider_id` set
- [ ] Other providers got `JOB_ALREADY_ACCEPTED` response
- [ ] No duplicate assignments
- [ ] Only 1 `job_accepted` event in `job_events`

### Test 3: Cancellation

1. **Customer creates and provider accepts**
2. **Customer:** Cancel the job
3. **Provider:** Should receive "Job Cancelled" push

**Verify:**
- [ ] `cancel_job` RPC succeeds
- [ ] Job status = 'cancelled'
- [ ] Provider gets push notification
- [ ] `job_events` has `job_cancelled` event
- [ ] Provider can't cancel a job they didn't accept (returns `UNAUTHORIZED`)

### Test 4: Background / Killed App

1. **Provider:** Force quit the app (swipe up on iOS, clear from recents on Android)
2. **Customer:** Create a job
3. **Provider:** Push should still arrive on lock screen
4. **Provider:** Tap notification → app launches and opens JobRequest screen

**Verify:**
- [ ] Push arrives even when app is killed
- [ ] Sound plays
- [ ] App launches to correct screen

---

## 🔐 Phase 6: Security & Permissions

### Supabase RLS Check

```sql
-- Verify RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('jobs', 'job_events', 'device_tokens', 'push_notifications');
-- All should show rowsecurity = true

-- Test: Can a provider accept a job via direct UPDATE? (should fail)
-- This should be blocked by RLS; only the RPC should work
```

### API Keys

- [ ] Service role key is only in worker `.env` (not in mobile apps)
- [ ] Mobile apps use anon key only
- [ ] `.env` files are in `.gitignore`
- [ ] No hardcoded keys in source code

### Permissions

- [ ] iOS: `Info.plist` has notification permission request message
- [ ] Android: `AndroidManifest.xml` has `POST_NOTIFICATIONS` permission
- [ ] Test: User can grant/deny push permission

---

## 📊 Phase 7: Monitoring & Alerts

### Database Monitoring

```sql
-- Push delivery rate (last 24 hours)
SELECT 
  COUNT(*) FILTER (WHERE status = 'sent') as sent,
  COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
  COUNT(*) FILTER (WHERE status IN ('failed', 'error')) as failed,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'delivered') / NULLIF(COUNT(*), 0), 1) as delivery_rate_pct
FROM push_notifications
WHERE created_at > NOW() - INTERVAL '24 hours';

-- Inactive tokens (users who uninstalled app)
SELECT COUNT(*) as inactive_tokens
FROM device_tokens
WHERE is_active = false;

-- Recent job events
SELECT event_type, COUNT(*) as count
FROM job_events
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY event_type
ORDER BY count DESC;
```

### Worker Health

- [ ] Set up uptime monitoring (UptimeRobot, BetterStack, etc.)
- [ ] Monitor worker logs for errors
- [ ] Set up alerts for:
  - Worker process exits
  - No heartbeat for 10+ minutes
  - Delivery rate < 90%
  - High error rate (> 5% pushes fail)

### Expo Push Dashboard

Check your Expo dashboard for:
- Push volume
- Delivery errors
- Rate limit warnings

---

## 🎯 Phase 8: Update Client Code (Remove Old Logic)

Now that you have atomic RPCs, you can remove:

### In Provider App
- [ ] Remove client-side "check if job is still pending" logic before accept
- [ ] Replace direct `UPDATE jobs SET provider_id = ...` with `rpc('accept_job', ...)`
- [ ] Remove broadcasts for accept (RPCs handle it server-side)

### In Customer App
- [ ] Keep realtime subscription for UI updates (that's fine)
- [ ] Remove any client-side accept/cancel logic
- [ ] Use `rpc('cancel_job', ...)` instead of `UPDATE jobs SET status = 'cancelled'`

---

## ✅ Go-Live Checklist

### Pre-Launch
- [ ] All migrations run successfully in Supabase
- [ ] Test script passes all race condition tests
- [ ] Push worker deployed and running (check logs)
- [ ] Mobile apps built and tested on real devices (iOS + Android)
- [ ] Push notifications arrive within 2 seconds
- [ ] Deep links work (tap notification → correct screen)
- [ ] Custom sounds play
- [ ] "Job Taken" alert works when provider is too slow
- [ ] Cancellation works from customer and provider
- [ ] `push_notifications` and `job_events` tables are logging correctly

### Launch Day
- [ ] Monitor worker logs for first hour
- [ ] Check push delivery rate (should be > 95%)
- [ ] Watch for RPC errors in Supabase logs
- [ ] Have rollback plan (disable push worker, revert migrations if critical issue)

### Week 1
- [ ] Review `job_events` for unexpected patterns
- [ ] Check for inactive tokens (users who uninstalled)
- [ ] Monitor average time from job creation → acceptance
- [ ] Gather feedback from providers on notification UX

---

## 🎉 Success Metrics

After deployment, these should improve:

- **Time to acceptance:** < 30 seconds (vs minutes with polling)
- **Race condition errors:** 0 duplicate assignments
- **Push delivery rate:** > 95%
- **Provider satisfaction:** "Instantly notified of new jobs"
- **Customer satisfaction:** "Fast provider matching"

---

## 🆘 Rollback Plan

If critical issues arise:

1. **Stop push worker:**
   ```bash
   pm2 stop torc-push-worker
   # or kill Heroku dyno
   ```

2. **Revert mobile apps** to previous version (if needed)

3. **Disable RPCs temporarily** (if they're causing issues):
   ```sql
   REVOKE EXECUTE ON FUNCTION accept_job FROM authenticated;
   REVOKE EXECUTE ON FUNCTION cancel_job FROM authenticated;
   ```

4. **Investigate and fix**, then re-enable

---

## 📚 Additional Documentation

- `database/README.md` – Full SQL migration guide
- `workers/README.md` – Push worker setup and debugging
- `mobile/SETUP_GUIDE.md` – Mobile app push integration
- `mobile/PROVIDER_APP_INTEGRATION.md` – Provider-specific flows
- `INTEGRATION_GUIDE.md` – High-level overview

---

## 🎯 What's Next

After push notifications are live:

1. **Location tracking** – Real-time provider location updates
2. **In-app messaging** – Chat between provider and customer
3. **Payment integration** – Stripe/Paystack for automatic charging
4. **Analytics dashboard** – Monitor acceptance rates, cancellations, earnings
5. **Provider ratings** – Track and display provider performance

You're building a production-ready rideshare/on-demand platform! 🚗✨
