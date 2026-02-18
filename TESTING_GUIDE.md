# 🧪 COMPLETE TESTING GUIDE

## ✅ Pre-Testing Checklist

### 1. Check Database Migrations
```bash
# Go to Supabase SQL Editor
# Run this to verify all tables exist:
SELECT 
  'jobs' as table_name, COUNT(*) as exists FROM jobs
UNION ALL
SELECT 'job_events', COUNT(*) FROM job_events
UNION ALL
SELECT 'device_tokens', COUNT(*) FROM device_tokens
UNION ALL
SELECT 'push_notifications', COUNT(*) FROM push_notifications;

# Should return 4 rows (one for each table)
```

### 2. Check RPCs
```sql
-- Verify RPCs exist
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_type = 'FUNCTION'
  AND routine_name IN ('accept_job', 'cancel_job', 'upsert_device_token');

-- Should return 3 rows
```

### 3. Check Worker is Running
```bash
cd workers
node push-notification-worker.js

# You should see:
# ✅ Connected to PostgreSQL
# 🎧 Listening for push notification events...
```

**Keep this terminal open!**

---

## 🌐 Test 1: Web Apps (5 minutes)

### Customer Web App

#### Step 1: Start Customer App
```bash
# Terminal 1
cd apps/customer-web
npm run dev

# Should start on: http://localhost:7000
```

#### Step 2: Test Login/Signup
1. Open `http://localhost:7000`
2. Click "Sign Up" or "Sign In"
3. Use test credentials or create new account
4. Verify you're redirected to dashboard

#### Step 3: Test Job Creation (if UI exists)
- If service booking UI exists, create a test job
- Note the job ID for testing

---

### Provider Web App

#### Step 1: Start Provider App
```bash
# Terminal 2
cd apps/provider-web
npm run dev

# Should start on: http://localhost:7001
```

#### Step 2: Test Login
1. Open `http://localhost:7001`
2. Sign in as provider
3. Check for incoming jobs

#### Step 3: Test Job Acceptance
1. If you created a job as customer, you should see it
2. Click "Accept"
3. Check console for success message
4. Verify customer sees "Provider Accepted"

**Expected Result:**
✅ Only ONE provider can accept  
✅ Customer app updates in real-time  
✅ Push worker logs the notification  

---

## 📱 Test 2: Mobile App (10 minutes)

### Prerequisites
- Physical iOS/Android device (recommended)
- OR iOS Simulator/Android Emulator
- Expo Go app installed (for quick testing)

---

### Method 1: Test with Expo Go (Fastest)

#### Step 1: Start Mobile App
```bash
# Terminal 3
cd apps/mobile
npm start

# A QR code will appear
```

#### Step 2: Connect Device
**iOS:**
- Open Camera app
- Scan QR code
- Tap "Open in Expo Go"

**Android:**
- Open Expo Go app
- Tap "Scan QR code"
- Scan the code

#### Step 3: Test Auth Flow
1. App opens → should show "TORC" welcome screen
2. Tap "Get Started" → signup form appears
3. Fill in details, select "Customer" or "Provider"
4. Tap "Sign Up"
5. Go back and tap "Sign In"
6. Enter credentials
7. Should see role-based home screen

**Expected Result:**
✅ Smooth navigation  
✅ Auth state persists  
✅ Home screen shows correct role  

#### Step 4: Test Push Notifications (Provider)

**Sign up/in as Provider:**

1. After login, check console logs
2. Should see: `📱 Got push token: ExponentPushToken[...]`
3. Check Supabase: `device_tokens` table should have your token

**Simulate a job request:**

Go to Supabase SQL Editor and run:
```sql
-- Create a test job
INSERT INTO jobs (
  customer_id, 
  service_id, 
  pickup_latitude, 
  pickup_longitude, 
  pickup_address,
  status,
  base_price,
  total_amount
)
VALUES (
  'YOUR_CUSTOMER_USER_ID',
  (SELECT id FROM services LIMIT 1),
  37.7749,
  -122.4194,
  '123 Market St, San Francisco',
  'pending',
  50.00,
  60.00
)
RETURNING id;

-- Note the job ID, then simulate acceptance by another provider
-- This will trigger pg_notify
```

**Better: Use the race test script:**
```bash
cd scripts
node test-job-race.js

# This will:
# 1. Create a job
# 2. Trigger notifications
# 3. Test race conditions
```

**Expected Result:**
✅ Push notification arrives on your phone  
✅ Notification shows job details  
✅ Tapping opens Job Request screen  

---

### Method 2: Test on iOS Simulator

```bash
cd apps/mobile
npm run ios

# Simulator will launch automatically
```

**Note:** Push notifications won't work in simulator. Test other features instead.

---

### Method 3: Test on Android Emulator

```bash
cd apps/mobile
npm run android

# Emulator will launch automatically
```

---

## 🔄 Test 3: End-to-End Customer Flow (15 minutes)

### You'll need:
- 2 devices OR 1 device + 1 web browser
- 1 customer account
- 1 provider account

---

### Scenario: Customer Requests Help, Provider Responds

#### Customer Side (Mobile App):

1. **Login as Customer**
   - Open mobile app
   - Sign in as customer

2. **Create Job Request** (when UI is ready)
   - Select service (e.g., "Towing")
   - Set pickup location
   - Tap "Request Service"
   - Should navigate to "Matching" screen
   - See "Finding Provider..." message

3. **Wait for Provider**
   - Timer should count up
   - Real-time subscription is active
   - App should NOT freeze

4. **Provider Accepts**
   - Matching screen auto-navigates to Tracking
   - See provider details
   - See provider stats (rating, jobs completed)
   - Map shows pickup/destination markers

5. **Confirm Actions**
   - Tap "Confirm Provider Arrived" → status changes to "in_progress"
   - Tap "Confirm Job Complete" → status changes to "completed"

6. **Rate Provider**
   - 5-star rating appears
   - Tap stars to rate
   - Should see "Thank You" message

---

#### Provider Side (Mobile App or Web):

1. **Login as Provider**
   - Open mobile app (or web at localhost:7001)
   - Sign in as provider

2. **Receive Job Request**
   - **Push notification arrives** (mobile only)
   - Notification says "New Job Request"
   - Tap notification → opens Job Request screen
   - OR: Navigate manually to job request

3. **View Job Details**
   - See pickup address
   - See destination (if any)
   - See customer notes
   - See payout amount
   - Map shows locations

4. **Accept Job**
   - Tap "Accept"
   - Should see success message
   - Navigate to Active Job screen
   - Customer is notified instantly

5. **Manage Job**
   - See job status: "Accepted"
   - Tap "Start Job" → status: "In Progress"
   - Tap "Complete Job" → status: "Completed"

6. **Check Stats**
   - Job should appear in completed count
   - If customer rated, see new average rating

---

## 🏁 Test 4: Race Condition Test (5 minutes)

**This is CRITICAL - tests that only ONE provider can accept.**

### Run the Test Script:

```bash
cd scripts
node test-job-race.js
```

**What it does:**
1. Creates a test job
2. Simulates 3 providers accepting simultaneously
3. Verifies only 1 succeeds
4. Tests unauthorized cancellation
5. Tests authorized cancellation

**Expected Output:**
```
🧪 Testing Job Acceptance Race Conditions
==========================================

Creating test job...
✅ Job created: abc-123-def

Testing concurrent acceptance (3 providers)...
✅ Race condition handled correctly
   - 1 provider accepted successfully
   - 2 providers received "already taken" error

Testing cancellation...
✅ Unauthorized cancellation blocked (Provider 2)
✅ Authorized cancellation succeeded (Provider 1)

✅ ALL TESTS PASSED
```

**If tests fail:**
- Check database migrations are applied
- Verify RPCs exist
- Check RLS policies

---

## 📊 Test 5: Real-Time Updates (5 minutes)

### Test Customer Real-Time Updates:

1. **Open customer web app** (localhost:7000)
2. **Create a job** (or use existing pending job)
3. **Open Supabase Dashboard** → Table Editor → `jobs`
4. **Manually change job status** from "pending" to "accepted"
5. **Add a provider_id** (use any valid UUID)

**Expected Result:**
✅ Customer app updates INSTANTLY  
✅ No page refresh needed  
✅ UI shows new status  

---

### Test Provider Real-Time Updates:

1. **Open provider web app** (localhost:7001)
2. **Accept a job**
3. **Open Supabase Dashboard** → `jobs` table
4. **Change status** to "in_progress"

**Expected Result:**
✅ Provider app updates INSTANTLY  
✅ Status badge changes color  

---

## 🔔 Test 6: Push Notification Delivery (10 minutes)

### Prerequisites:
- Physical device with mobile app
- Push worker running

### Test 1: New Job Notification (Provider)

1. **Provider logged into mobile app**
2. **Close the app** (don't just minimize - fully close)
3. **Create a job as customer** (web or mobile)
4. **Wait 5-10 seconds**

**Expected Result:**
✅ Push notification arrives on locked screen  
✅ Shows job details  
✅ Tapping opens Job Request screen  

**Check Worker Logs:**
```
📬 Received job_created event: { job_id: 'abc-123' }
📲 Sending notification to 1 device(s)
✅ Push sent successfully
```

---

### Test 2: Job Accepted Notification (Customer)

1. **Customer logged into mobile app**
2. **Close the app**
3. **Have provider accept the job**
4. **Wait 5-10 seconds**

**Expected Result:**
✅ Notification: "Provider Accepted!"  
✅ Tapping opens Tracking screen  

---

### Test 3: Job Cancelled Notification

1. **Provider has active job**
2. **Close provider app**
3. **Customer cancels the job**

**Expected Result:**
✅ Provider receives cancellation notification  

---

## 🐛 Troubleshooting

### Push Notifications Not Arriving

**Check 1: Worker Running?**
```bash
cd workers
ps aux | grep push-notification-worker
# Should show the process
```

**Check 2: Device Token Registered?**
```sql
SELECT * FROM device_tokens WHERE user_id = 'YOUR_USER_ID';
# Should return your token
```

**Check 3: Worker Logs**
Look for errors in worker terminal:
- Database connection errors?
- Expo API errors?
- No devices found?

**Check 4: Test Device is Physical**
- Push notifications don't work in simulator
- Must use real iOS/Android device

---

### Real-Time Updates Not Working

**Check 1: Supabase Realtime Enabled**
1. Go to Supabase Dashboard
2. Database → Replication
3. Ensure `jobs` table is enabled

**Check 2: Check Console**
Look for subscription errors:
```
Error: subscription failed
```

**Check 3: Network**
- Realtime uses WebSockets
- Some networks block WebSockets

---

### Race Condition Test Fails

**Check 1: Migrations Applied**
```sql
SELECT * FROM job_events LIMIT 1;
# Should NOT error
```

**Check 2: RPC Exists**
```sql
SELECT accept_job('test-id', 'test-provider-id');
# Should error with "Job not found" (good!)
# NOT "function does not exist" (bad!)
```

---

## ✅ Success Criteria

After testing, you should have verified:

### Backend
- ✅ All migrations applied
- ✅ RPCs exist and work
- ✅ Push worker running and connected

### Web Apps
- ✅ Customer app works
- ✅ Provider app works
- ✅ Real-time updates work
- ✅ Job acceptance is race-safe

### Mobile App
- ✅ Auth flow works
- ✅ Navigation works
- ✅ Push notifications arrive
- ✅ Deep linking works
- ✅ Screens load correctly

### End-to-End
- ✅ Customer can create jobs
- ✅ Provider receives notification
- ✅ Provider can accept (race-safe)
- ✅ Customer sees real-time updates
- ✅ Job status updates work
- ✅ Rating system works

---

## 📝 Test Results Template

Use this to track your testing:

```
TORC Testing - [Date]
======================

[ ] Database migrations verified
[ ] RPCs exist and work
[ ] Push worker running

[ ] Customer web app - login works
[ ] Customer web app - real-time works
[ ] Provider web app - login works
[ ] Provider web app - job acceptance works

[ ] Mobile app - auth works
[ ] Mobile app - navigation works
[ ] Mobile app - push token registers

[ ] End-to-end customer flow
[ ] End-to-end provider flow
[ ] Race condition test passes
[ ] Push notifications deliver

Issues Found:
1. 
2. 
3. 

Notes:

```

---

## 🚀 Next Steps After Testing

Once testing is complete:

1. **If everything works:**
   - ✅ Start building service booking UI
   - ✅ Add payment integration
   - ✅ Deploy to production

2. **If issues found:**
   - 🐛 Note specific errors
   - 🔍 Check logs
   - 📝 Report issues with details

---

## 🆘 Need Help?

**Common Issues:**
- Push not working? → Check worker logs
- Real-time not working? → Check Supabase Realtime settings
- Race test fails? → Verify migrations
- App crashes? → Check console logs

**Documentation:**
- Mobile: `apps/mobile/README.md`
- Database: `database/README.md`
- Workers: `workers/README.md`

Happy Testing! 🧪
