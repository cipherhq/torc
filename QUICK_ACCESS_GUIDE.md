# 🚀 Quick Access Guide

**Last Updated:** Feb 17, 2026 12:53 AM

---

## ✅ Currently Running

### Customer Web App
**URL:** http://localhost:7000  
**Status:** ✅ RUNNING

To view in browser:
```
open http://localhost:7000
```

Or just reload your browser tab at localhost:7000

---

## 🔗 Get DATABASE_URL (For Push Worker)

### From Supabase Dashboard:

1. **You're already on the right page!** (Database Settings)
2. Scroll down to **"Connection string"** section
3. Click the **"URI"** tab (not "Transaction" or "Session")
4. Copy the full string that looks like:
   ```
   postgresql://postgres.apojatplmfsbimgcyjoo:[PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres
   ```

### Add to Worker:

```bash
cd ~/Desktop/torc/workers
nano .env
```

Update the `DATABASE_URL` line with what you copied.  
Save: `Ctrl+X`, then `Y`, then `Enter`

### Test the Worker:

```bash
cd ~/Desktop/torc/workers
node push-notification-worker.js
```

**Expected output:**
```
🚀 Push notification worker started
📡 Listening for: job_accepted, job_cancelled
💾 Connected to Supabase
✅ Worker ready
```

---

## 📱 Quick Links

### Your Apps (Local):
- **Customer Web:** http://localhost:7000 ✅ Running
- **Provider Web:** http://localhost:7001 (if running)
- **Admin Web:** http://localhost:7002 (if running)

### Supabase Dashboard:
- **Database:** https://supabase.com/dashboard/project/apojatplmfsbimgcyjoo/editor
- **Database Settings:** https://supabase.com/dashboard/project/apojatplmfsbimgcyjoo/settings/database
- **SQL Editor:** https://supabase.com/dashboard/project/apojatplmfsbimgcyjoo/sql/new
- **API Logs:** https://supabase.com/dashboard/project/apojatplmfsbimgcyjoo/logs/explorer

---

## 🧪 Test Everything

### 1. Test Database RPCs:
```bash
cd ~/Desktop/torc/scripts
npm run test:race
```
✅ All tests should pass (4/4)

### 2. Test Customer App:
Open: http://localhost:7000

### 3. Test Push Worker (once DATABASE_URL is added):
```bash
cd ~/Desktop/torc/workers
node push-notification-worker.js
```

---

## 📁 All Project Files

```
~/Desktop/torc/
├── database/           ✅ Migrations (all applied)
├── scripts/            ✅ Tests (all passing)
├── workers/            🟡 Needs DATABASE_URL
├── mobile/             📱 Ready to integrate
├── apps/
│   ├── customer-web/   ✅ Running on :7000
│   ├── provider-web/   (start if needed)
│   └── admin-web/      (start if needed)
└── *.md files          📖 Guides & docs
```

---

## 🎯 Current Status

- [x] Database migrations applied
- [x] RPC functions working (accept_job, cancel_job)
- [x] Race condition tests passing
- [x] Customer app running
- [ ] Push worker configured (needs DATABASE_URL)
- [ ] Mobile apps integrated (code ready)

---

## 🆘 Quick Commands

### Start Customer App:
```bash
cd ~/Desktop/torc/apps/customer-web
npm run dev
```

### Start Provider App:
```bash
cd ~/Desktop/torc/apps/provider-web
npm run dev
```

### View Test Results:
```bash
cd ~/Desktop/torc/scripts
npm run test:race
```

### Configure Push Worker:
```bash
cd ~/Desktop/torc/workers
nano .env  # Add DATABASE_URL
node push-notification-worker.js
```

---

**Next:** Get DATABASE_URL from Supabase → Test push worker → Go live! 🚀
