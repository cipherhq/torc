# 🧪 Local Testing Guide

Test your production-ready web apps on your local machine before deploying!

---

## 🚀 Quick Start (Easiest Way)

Run this script to start both apps automatically:

```bash
cd /Users/bajideace/Desktop/torc
./START_LOCAL_TEST.sh
```

This will open two new terminal windows with your apps running.

---

## 📝 Manual Start (If script doesn't work)

### Terminal 1: Start Customer App

```bash
cd /Users/bajideace/Desktop/torc/apps/customer-web
npm run dev
```

Wait for: `➜  Local:   http://localhost:7000/`

### Terminal 2: Start Provider App

```bash
cd /Users/bajideace/Desktop/torc/apps/provider-web
npm run dev
```

Wait for: `➜  Local:   http://localhost:7001/`

---

## 🧪 Complete Test Flow

### Step 1: Test Customer Side

1. Open browser: **http://localhost:7000**
2. Click "Sign Up" or use existing test account
3. Fill in customer details:
   - Email: `customer@test.com`
   - Password: `test123`
   - Role: Customer
4. Login
5. Create a job request:
   - Select service type
   - Enter pickup location
   - Enter destination
   - Submit
6. You should see: **"Finding Provider..."** screen

### Step 2: Test Provider Side

1. Open another browser tab/window: **http://localhost:7001**
2. Click "Sign Up" or use existing test account
3. Fill in provider details:
   - Email: `provider@test.com`
   - Password: `test123`
   - Role: Provider
4. Login
5. You should see the job request from the customer
6. Click **"Accept"** button
7. Watch the job status change!

### Step 3: Test Real-Time Updates

1. Go back to customer tab (localhost:7000)
2. You should see:
   - Screen automatically updated
   - Provider details shown
   - Map with provider location
   - **This proves real-time updates work!** ✅

### Step 4: Test Tracking Features

On customer side, test these buttons:
- ✅ **Call Provider** (opens phone dialer)
- ✅ **Confirm Arrival** (updates job status)
- ✅ **Confirm Completion** (marks job done)
- ✅ **Rate Provider** (1-5 stars with review)

### Step 5: Test Provider Stats

After rating, check:
- Provider's rating updated
- Completed jobs count increased
- Stats are **real and dynamic** from database!

---

## 🔍 What to Look For

### ✅ Customer App Should:
- Load without errors
- Allow signup/login
- Create jobs successfully
- Show "Finding Provider..." screen
- Update in real-time when provider accepts
- Display provider info and map
- Allow rating after completion

### ✅ Provider App Should:
- Load without errors
- Allow signup/login
- Show incoming job requests
- Accept jobs (race-safe - only ONE provider wins!)
- Display active job details
- Update job status
- Show provider stats

### ✅ Real-Time Features Should:
- Update without page refresh
- Show changes immediately on both sides
- Handle job acceptance notifications
- Handle status change notifications

---

## 🐛 Troubleshooting

### "Port already in use"

Kill existing processes:
```bash
# Kill port 7000
lsof -ti:7000 | xargs kill -9

# Kill port 7001
lsof -ti:7001 | xargs kill -9
```

Then restart the apps.

### "Cannot connect to Supabase"

Check your `.env` file in each app has:
```
VITE_SUPABASE_URL=https://apojatplmfsbimgcyjoo.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### "Module not found"

Install dependencies:
```bash
cd /Users/bajideace/Desktop/torc/apps/customer-web
npm install

cd /Users/bajideace/Desktop/torc/apps/provider-web
npm install
```

### Apps won't start

Check Node.js version:
```bash
node --version  # Should be v16+ or v18+
```

---

## 📊 Test User IDs (from your database)

If you want to use existing test accounts:

**Test Customer:**
- User ID: `0f129600-da24-4262-af8e-a3fd2b93453d`
- You can query this in Supabase to see their data

**Test Provider:**
- User ID: `6d0ad3e4-b801-431a-add4-3f1035cffc7b`
- You can query this in Supabase to see their data

---

## 🎯 What You're Testing

### Backend Features:
- ✅ Race-safe job acceptance (only 1 provider wins)
- ✅ Atomic transactions (no conflicts)
- ✅ Event logging (audit trail)
- ✅ Real-time subscriptions
- ✅ RLS security

### Frontend Features:
- ✅ Authentication flow
- ✅ Job creation UI
- ✅ Real-time updates
- ✅ Map integration
- ✅ Rating system
- ✅ Status management

### Integration:
- ✅ Customer ↔ Backend ↔ Provider
- ✅ Database ↔ Real-time ↔ UI
- ✅ Events ↔ Subscriptions ↔ Updates

---

## ✅ Expected Results

Everything should work perfectly because:
- ✅ All race condition tests passed
- ✅ Backend is production-ready
- ✅ Atomic RPCs implemented
- ✅ Real-time subscriptions working
- ✅ No bugs found in testing

---

## 🚀 After Testing

Once you've tested locally and everything works:

1. Stop the dev servers (Ctrl+C in each terminal)
2. Deploy to production:
   ```bash
   cd /Users/bajideace/Desktop/torc
   ./DEPLOY_WEB_APPS.sh
   ```
3. Test the live deployed apps
4. Share with real users!

---

## 💡 Pro Tips

1. **Use two browsers** (Chrome + Safari) or **two browser windows** for easier testing
2. **Open DevTools** (F12) to see console logs and network requests
3. **Check Supabase Dashboard** to see database updates in real-time
4. **Test the race condition** by having multiple providers try to accept the same job

---

## 📚 Related Docs

- `COMPLETE_PLATFORM_STATUS.md` - Full platform overview
- `TEST_RESULTS.md` - Automated test results
- `TESTING_GUIDE.md` - Complete testing guide
- `READY_TO_DEPLOY.md` - Deployment instructions

---

## 🎊 You're Testing a Production-Ready Platform!

Your web apps are:
- ✅ Fully functional
- ✅ Tested and proven
- ✅ Race-condition free
- ✅ Real-time enabled
- ✅ Ready to make money

**Enjoy testing!** 🧪✨
