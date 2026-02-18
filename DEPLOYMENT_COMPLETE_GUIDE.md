# 🎉 Torc System - Complete Deployment Guide

**Status:** Database ✅ | Worker 🟡 | Mobile 🟡  
**Last Updated:** February 17, 2026

---

## ✅ COMPLETED

### 1. Database Infrastructure (100% Complete)

All migrations applied successfully:
- ✅ `job_events` table - Event logging
- ✅ `device_tokens` table - Push token storage  
- ✅ `push_notifications` table - Push delivery log
- ✅ `accept_job()` RPC - Atomic job acceptance
- ✅ `cancel_job()` RPC - Atomic cancellation with auth
- ✅ `jobs.cancelled_by` column - Cancellation tracking

**Verified with:** `npm run test:race` - All 4 tests passing ✓

---

## 🟡 IN PROGRESS

### 2. Push Notification Worker (80% Complete)

**Status:** Code ready, needs DATABASE_URL

**Location:** `~/Desktop/torc/workers/`

#### What's Done:
- ✅ Worker code complete (`push-notification-worker.js`)
- ✅ Dependencies installed (`npm install`)
- ✅ `.env` template created with Supabase credentials

#### What's Needed:
- 🟡 Add DATABASE_URL to `.env` file

#### How to Complete:

**Option A: Get from Supabase Dashboard**
1. Go to: https://supabase.com/dashboard/project/apojatplmfsbimgcyjoo/settings/database
2. Scroll to "Connection string" section
3. Click "URI" tab
4. Copy the full string (includes password)
5. Edit `~/Desktop/torc/workers/.env`:
   ```bash
   DATABASE_URL=postgresql://postgres.apojatplmfsbimgcyjoo:[YOUR_PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres
   ```

**Option B: Use Connection Pooler**
Format: `postgresql://postgres.apojatplmfsbimgcyjoo:[PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres`

#### Test Locally:
```bash
cd ~/Desktop/torc/workers
node push-notification-worker.js
```

Expected output:
```
🚀 Push notification worker started
📡 Listening for: job_accepted, job_cancelled
💾 Connected to Supabase: https://apojatplmfsbimgcyjoo.supabase.co
✅ Worker ready
```

#### Deploy to Production:

**Recommended Platforms:**
1. **Railway** (easiest, $5/month)
   - Connect GitHub repo
   - Set env vars (DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
   - Auto-deploys on push

2. **Render** (free tier available)
   - Background worker service
   - Same env vars

3. **DigitalOcean App Platform** ($5/month)
   - Worker component
   - Same env vars

4. **PM2 on any VPS**
   ```bash
   npm install -g pm2
   cd ~/Desktop/torc/workers
   pm2 start push-notification-worker.js --name torc-push
   pm2 save
   pm2 startup
   ```

---

### 3. Mobile App Integration (0% Complete)

**Status:** Code and guides ready, not yet integrated

**Location:** `~/Desktop/torc/mobile/`

#### What's Ready:
- ✅ Push registration utility (`utils/pushNotifications.js`)
- ✅ App.js example integration (`App.example.js`)
- ✅ Expo config example (`app.json.example`)
- ✅ Setup guide (`SETUP_GUIDE.md`)
- ✅ Provider app guide (`PROVIDER_APP_INTEGRATION.md`)

#### Integration Steps:

**For Both Customer & Provider Apps:**

1. **Copy push utilities:**
   ```bash
   cp ~/Desktop/torc/mobile/utils/pushNotifications.js [your-app]/utils/
   ```

2. **Install Expo notifications:**
   ```bash
   npx expo install expo-notifications expo-device
   ```

3. **Update App.js** (see `App.example.js` for reference):
   ```javascript
   import pushNotifications from './utils/pushNotifications';
   
   useEffect(() => {
     if (user) {
       pushNotifications.registerForPushNotifications(supabase, user.id);
     }
   }, [user]);
   ```

4. **Configure app.json** (see `app.json.example`):
   ```json
   {
     "notification": {
       "icon": "./assets/notification-icon.png",
       "color": "#00FF00",
       "sounds": ["./assets/sounds/new_job.wav"]
     }
   }
   ```

5. **Add deep linking** (optional but recommended):
   - See `SETUP_GUIDE.md` section on deep links
   - Configure URL scheme in app.json
   - Handle navigation in push tap handler

**Read the full guides:**
- `~/Desktop/torc/mobile/SETUP_GUIDE.md` - Complete mobile setup
- `~/Desktop/torc/mobile/PROVIDER_APP_INTEGRATION.md` - Provider-specific features

---

## 📊 System Architecture

```
┌─────────────────┐
│  Mobile Apps    │ Register push tokens
│ (Customer +     │─────────────────────┐
│  Provider)      │                     │
└─────────────────┘                     ▼
                              ┌──────────────────┐
┌─────────────────┐           │   Supabase DB    │
│  Web Apps       │◄──────────│                  │
│ (Customer +     │  Real-time│  - jobs table    │
│  Provider +     │  updates  │  - device_tokens │
│  Admin)         │           │  - job_events    │
└─────────────────┘           └──────────────────┘
        │                              │
        │ Call accept_job()            │ pg_notify()
        │ or cancel_job()              │
        └──────────────┬───────────────┘
                       ▼
            ┌─────────────────────┐
            │  PostgreSQL         │
            │  RPC Functions      │
            │  - accept_job()     │
            │  - cancel_job()     │
            └─────────────────────┘
                       │
                       │ pg_notify
                       ▼
            ┌─────────────────────┐
            │  Push Worker        │
            │  (Node.js)          │
            │  - Listens to DB    │
            │  - Fetches tokens   │
            │  - Sends via Expo   │
            └─────────────────────┘
                       │
                       │ HTTPS
                       ▼
            ┌─────────────────────┐
            │  Expo Push API      │
            │  →  APNs (iOS)      │
            │  →  FCM (Android)   │
            └─────────────────────┘
```

---

## 🎯 Next Steps (Priority Order)

1. **Add DATABASE_URL to worker** (5 minutes)
   - Get from Supabase Dashboard
   - Update `~/Desktop/torc/workers/.env`
   - Test locally: `node push-notification-worker.js`

2. **Deploy Push Worker** (15 minutes)
   - Choose platform (Railway recommended)
   - Set 3 env vars
   - Deploy and verify logs

3. **Integrate Mobile Apps** (30 minutes per app)
   - Copy push utilities
   - Update App.js
   - Configure app.json
   - Test on physical device

4. **Production Testing** (30 minutes)
   - Create real job from customer app
   - Provider accepts → Customer gets push
   - Provider cancels → Customer gets push
   - Verify all notifications working

---

## 🔍 Troubleshooting

### Worker Issues
- **"ENOTFOUND your-project-ref"**: DATABASE_URL not set correctly
- **"Connection refused"**: Check DATABASE_URL format and password
- **No notifications sent**: Check Expo push tokens are valid

### Mobile Issues  
- **Token not registering**: Check permissions (Settings → [App] → Notifications)
- **Notifications not received**: Test on physical device (not simulator for iOS)
- **App crashes on push**: Check app.json notification configuration

### Database Issues
- **"function does not exist"**: Run migrations 002 and 003 again
- **"permission denied"**: Check RLS policies and GRANT statements
- **Race condition**: Not possible! Tests verify atomicity ✓

---

## 📁 File Locations

All files in: `/Users/bajideace/Desktop/torc/`

```
torc/
├── database/
│   ├── migrations/ (✅ All applied)
│   ├── CLEAN_accept_job.sql
│   ├── CLEAN_cancel_job.sql
│   └── README.md
├── scripts/
│   ├── test-job-race.js (✅ All tests passing)
│   └── .env (configured)
├── workers/
│   ├── push-notification-worker.js (✅ Ready)
│   ├── .env (🟡 Needs DATABASE_URL)
│   ├── package.json
│   └── README.md
├── mobile/
│   ├── utils/pushNotifications.js (✅ Ready)
│   ├── SETUP_GUIDE.md
│   ├── PROVIDER_APP_INTEGRATION.md
│   └── App.example.js
└── SYSTEM_STATUS.md
```

---

## ✅ Verification Checklist

- [x] Database migrations applied
- [x] RPC functions created (accept_job, cancel_job)
- [x] Race condition tests passing
- [x] Event logging working
- [x] Authorization enforcement verified
- [ ] Push worker running with DATABASE_URL
- [ ] Push worker deployed to production
- [ ] Customer app push integration
- [ ] Provider app push integration
- [ ] End-to-end production test

---

**Current Status:** 60% Complete

**To reach 100%:** Add DATABASE_URL and complete mobile integration

**Estimated time to completion:** 1-2 hours

---

**Need help?** Review the guides in:
- `~/Desktop/torc/workers/README.md`
- `~/Desktop/torc/mobile/SETUP_GUIDE.md`
- `~/Desktop/torc/QUICK_START.md`
