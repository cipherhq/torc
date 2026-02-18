# Push Notification Worker

This Node.js worker listens for Postgres `pg_notify` events and sends push notifications to mobile devices via Expo Push API.

---

## 🚀 Quick Start

### 1. Install dependencies
```bash
cd workers
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your Supabase credentials
```

**Required environment variables:**
- `DATABASE_URL` – Postgres connection string (get from Supabase: Settings → Database → Connection string → URI)
- `SUPABASE_URL` – Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` – Service role key (Settings → API)
- `NODE_ENV` – `production` or `development`

### 3. Run the worker

**Development (with auto-restart):**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

**Using PM2 (recommended for production):**
```bash
npm run pm2:start    # Start worker as background process
npm run pm2:logs     # View logs
npm run pm2:restart  # Restart worker
npm run pm2:stop     # Stop worker
```

---

## 📋 What It Does

1. **Connects to Postgres** and listens for these channels:
   - `job_accepted` – Provider accepted a job → notify customer
   - `job_cancelled` – Job cancelled → notify the other party
   - `job_completed` – Job finished → notify customer (ask for rating)
   - `provider_arrived` – Provider at location → notify customer

2. **Fetches push tokens** from `device_tokens` table for target user(s)

3. **Sends push notifications** via Expo Push API
   - Supports iOS and Android
   - Handles custom sounds
   - Includes deep link data (screen, jobId, etc.)

4. **Logs everything** to `push_notifications` table:
   - Status: `sent`, `failed`, `error`, `delivered`
   - Expo ticket IDs for tracking delivery
   - Error codes for debugging (e.g. `DeviceNotRegistered`)

5. **Checks delivery receipts** periodically (every 15 min):
   - Verifies pushes were delivered
   - Marks invalid tokens as inactive

---

## 🔔 Notification Types

### job_accepted
**Sent to:** Customer  
**Title:** "Provider Found! 🚗"  
**Body:** "[Provider Name] accepted your request and is on the way."  
**Deep link:** LiveTracking screen  
**Sound:** `accepted.wav`

### job_cancelled
**Sent to:** Customer (if provider cancelled) OR Provider (if customer cancelled)  
**Title:** "Job Cancelled"  
**Body:** "[Actor] cancelled the request. Reason: [reason]"  
**Deep link:** Home screen  
**Sound:** `cancelled.wav`

### job_completed
**Sent to:** Customer  
**Title:** "Service Completed ✅"  
**Body:** "How was your experience? Tap to rate your provider."  
**Deep link:** LiveTracking screen (shows rating UI)  
**Sound:** `default`

### provider_arrived
**Sent to:** Customer  
**Title:** "Provider Arrived 📍"  
**Body:** "Your provider has arrived at your location."  
**Deep link:** LiveTracking screen  
**Sound:** `default`

---

## 🐛 Debugging

### Check worker is running
```bash
npm run pm2:logs
# or if running directly:
# check console output
```

### Test push manually
Use the Expo Push Tool: https://expo.dev/notifications

Get a test token from your device and send a test notification.

### Check database logs
```sql
-- See recent push notifications sent
SELECT * FROM push_notifications
ORDER BY created_at DESC
LIMIT 20;

-- Check for failed pushes
SELECT * FROM push_notifications
WHERE status IN ('failed', 'error')
ORDER BY created_at DESC;

-- See which devices have active tokens
SELECT u.email, dt.platform, dt.is_active, dt.last_used_at
FROM device_tokens dt
JOIN auth.users u ON u.id = dt.user_id
WHERE dt.is_active = true
ORDER BY dt.last_used_at DESC;
```

### Common issues

**"No active push tokens for user X"**
- User hasn't logged in to the mobile app yet
- User denied push permissions
- User's token wasn't registered (check `registerForPushNotifications()` runs on login)

**"Invalid Expo push token"**
- Token format is wrong (should start with `ExponentPushToken[...]`)
- Using a simulator instead of real device (Expo push only works on real devices)

**"DeviceNotRegistered" error**
- User uninstalled the app
- Token expired
- Worker automatically marks these tokens as `is_active = false`

**Worker not receiving pg_notify events**
- Check `DATABASE_URL` is correct and SSL is enabled in production
- Verify RPCs are emitting `pg_notify` (check SQL: `PERFORM pg_notify(...)`)
- Test with `psql`: `LISTEN job_accepted; NOTIFY job_accepted, '{"test": true}';`

---

## 🌐 Deployment

### Option 1: Heroku
```bash
# Install Heroku CLI, then:
heroku create torc-push-worker
heroku config:set DATABASE_URL="postgresql://..."
heroku config:set SUPABASE_URL="https://..."
heroku config:set SUPABASE_SERVICE_ROLE_KEY="..."
heroku config:set NODE_ENV=production
git push heroku main
```

### Option 2: Railway
1. Go to Railway.app
2. New Project → Deploy from GitHub repo
3. Add environment variables in Railway dashboard
4. Deploy automatically on push

### Option 3: Docker (any VPS/cloud)
Create `Dockerfile`:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
CMD ["node", "push-notification-worker.js"]
```

Build and run:
```bash
docker build -t torc-push-worker .
docker run -d --env-file .env --restart unless-stopped torc-push-worker
```

### Option 4: PM2 on VPS
```bash
# SSH to your server
git clone your-repo
cd workers
npm install --production
npm run pm2:start
pm2 save
pm2 startup  # Enable auto-start on boot
```

---

## 📊 Monitoring

### Health check
The worker logs a heartbeat every 5 minutes:
```
💓 Worker alive - 2026-02-16T23:00:00.000Z
```

If logs stop, the worker crashed. Check PM2 logs or restart the worker.

### Metrics to track
- Push delivery rate: `delivered / sent`
- Failed tokens: `SELECT COUNT(*) FROM device_tokens WHERE is_active = false`
- Average delivery time: `delivered_at - sent_at`

### Alerting
Set up alerts (e.g. PagerDuty, Sentry) for:
- Worker process exits unexpectedly
- Delivery rate drops below 90%
- High error rate (> 10% pushes fail)

---

## 🔐 Security

- **Never commit `.env`** to Git (it contains sensitive keys)
- **Use SSL** for Postgres connection in production (`rejectUnauthorized: false` is ok for Supabase managed DB)
- **Service role key** should only be on server, never in mobile/web client
- **Rate limiting:** Expo has rate limits (~600 pushes/sec per app). Worker handles this via chunking.

---

## ✅ Testing

### Manual test
1. Start the worker: `npm run dev`
2. In another terminal, create a test job and accept it (use the test script from `scripts/`)
3. Watch worker logs - you should see:
   ```
   📬 Received job_accepted: { job_id: '...', provider_id: '...', customer_id: '...' }
   📤 Sending push to user abc123... (1 device(s))
   ✅ Sent 1 push notification(s)
   ```
4. Check your mobile device - push should arrive

### Automated test (coming soon)
We'll add a test suite that:
- Mocks pg_notify events
- Verifies correct pushes are sent
- Tests error handling (invalid tokens, failed deliveries, etc.)

---

## 🎯 Next Steps

After deploying the worker:

1. **Test on real devices** – Send a test push to your phone
2. **Add more event types** – Edit `handleJobEvent()` to add custom notifications
3. **Customize sounds** – Add custom `.wav` files to mobile app and reference in `sound` parameter
4. **Monitor delivery** – Check `push_notifications` table daily for failed pushes
5. **Scale** – If you have high volume, run multiple worker instances (they can all listen to the same channels)

See `../mobile/` for mobile app integration (push registration, deep links, custom sounds).
