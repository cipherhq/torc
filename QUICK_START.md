# ⚡ Quick Start: Get Push Notifications Working in 30 Minutes

The fastest path from zero to working push notifications with atomic job acceptance.

---

## 🎯 Goal

- Provider gets "ring" notification when new job arrives (even with app closed)
- Provider taps "Accept" → only one provider wins (no race conditions)
- Customer gets instant "Provider found!" notification
- All events logged for debugging

---

## 📋 30-Minute Setup

### ⏱️ 5 min: Run Database Migrations

1. Open **Supabase Dashboard** → SQL Editor
2. Copy/paste and run **in this order:**
   - `database/migrations/001_job_events_table.sql`
   - `database/migrations/002_accept_job_rpc.sql`
   - `database/migrations/003_cancel_job_rpc.sql`
   - `database/migrations/004_device_tokens_table.sql`
   - `database/migrations/005_push_notifications_log.sql`

3. Verify:
   ```sql
   SELECT tablename FROM pg_tables WHERE tablename IN ('job_events', 'device_tokens');
   ```
   Should return 2 rows.

---

### ⏱️ 10 min: Test RPCs

```bash
cd scripts
npm install
cp .env.example .env
```

Edit `.env`:
- Add your Supabase URL and service key
- Add 3 test user IDs (get from auth.users table)

```bash
npm run test:race
```

**Expected:** All tests pass, no race conditions.

---

### ⏱️ 5 min: Deploy Push Worker

**Option A: Railway (easiest)**
1. Go to Railway.app
2. New Project → GitHub repo
3. Root Directory: `workers/`
4. Add environment variables:
   - `DATABASE_URL` (from Supabase: Settings → Database → Connection string)
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NODE_ENV=production`
5. Deploy

**Option B: Heroku**
```bash
cd workers
heroku create torc-push-worker
heroku config:set DATABASE_URL="..." SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..."
git init && git add . && git commit -m "Initial"
git push heroku main
heroku logs --tail
```

**Verify:** Worker logs show `🎧 Listening for job events...`

---

### ⏱️ 10 min: Update Mobile App

#### Provider App

1. Install deps:
   ```bash
   cd apps/provider-mobile
   npx expo install expo-notifications expo-device expo-constants
   ```

2. Copy `mobile/utils/pushNotifications.js` to `utils/pushNotifications.js`

3. Update `App.js` (add these lines):
   ```js
   import { registerForPushNotifications, setupNotificationListeners } from './utils/pushNotifications';

   useEffect(() => {
     supabase.auth.onAuthStateChange((event, session) => {
       if (event === 'SIGNED_IN') registerForPushNotifications();
     });
     setupNotificationListeners(navigationRef.current);
   }, []);
   ```

4. In JobRequest screen, change "Accept" to call RPC:
   ```js
   const { data } = await supabase.rpc('accept_job', {
     p_job_id: jobId,
     p_provider_id: currentUser.id
   });

   if (data.success) {
     navigation.replace('ActiveJob', { jobId });
   } else if (data.error === 'JOB_ALREADY_ACCEPTED') {
     Alert.alert('Job Taken', 'Another provider was faster.');
   }
   ```

5. Build and install on device:
   ```bash
   npx expo run:ios --device
   # or
   npx expo run:android --device
   ```

#### Customer App

1. Same steps 1-3 as provider app
2. Make sure LiveTracking subscribes to job updates (already done if using the TrackingPage we built)

---

### ⏱️ Final: Test End-to-End

1. **Customer:** Create a job in customer app
2. **Provider:** Check phone → push should arrive with sound
3. **Provider:** Tap notification → JobRequest screen opens
4. **Provider:** Tap "Accept" → Success
5. **Customer:** Check phone → "Provider found!" push arrives
6. **Customer:** LiveTracking shows provider details

**Expected timing:**
- Push arrives within 1-2 seconds
- Accept/update within 1 second
- Customer notified within 2-3 seconds total

---

## ✅ Success Criteria

After 30 minutes you should have:

- [x] Atomic RPCs deployed and tested
- [x] Push worker running and listening
- [x] Mobile apps register push tokens on login
- [x] End-to-end flow works on real device
- [x] Race conditions handled correctly
- [x] All events logged in database

---

## 🐛 Quick Troubleshooting

### "Push doesn't arrive"
→ Check `device_tokens` table has a row for your user  
→ Check worker logs show "Sent push to user X"  
→ Try Expo Push Tool: https://expo.dev/notifications

### "Job Taken" doesn't show for losing provider"
→ Check test script passes race tests  
→ Verify `accept_job` RPC returns `JOB_ALREADY_ACCEPTED`

### "Worker not receiving events"
→ Check `DATABASE_URL` in worker `.env`  
→ Test manually: `SELECT pg_notify('job_accepted', '{"test":true}');`  
→ Check worker logs for connection errors

### "Deep link doesn't work"
→ Verify `setupNotificationListeners()` is called in App.js  
→ Check screen names match navigation stack  
→ Test with a local notification first

---

## 📚 Full Docs

For detailed setup, see:

- **`DEPLOYMENT_CHECKLIST.md`** – Complete deployment guide
- **`database/README.md`** – SQL migrations and RPC details
- **`workers/README.md`** – Push worker deployment and monitoring
- **`mobile/SETUP_GUIDE.md`** – Complete mobile integration guide
- **`mobile/PROVIDER_APP_INTEGRATION.md`** – Provider-specific flows

---

## 🎉 You're Done!

You now have:

✅ **Race-safe job acceptance** (only one provider wins)  
✅ **Instant push notifications** to mobile devices  
✅ **Deep linking** (tap push → correct screen)  
✅ **Custom sounds** for different event types  
✅ **Delivery tracking** (know if pushes were received)  
✅ **Event logging** (full audit trail)

Your mobile app is production-ready for on-demand job matching! 🚀
