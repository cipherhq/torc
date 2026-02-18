# ⚡ QUICK TEST - 5 Minutes

**Want to test FAST? Follow this minimal path:**

---

## Step 1: Check Backend (30 seconds)

```bash
# Check if migrations are applied
# Go to: https://supabase.com/dashboard/project/apojatplmfsbimgcyjoo/editor

# Run this SQL:
SELECT COUNT(*) FROM job_events;

# Should return a number (not an error)
```

✅ If no error → Backend is ready

---

## Step 2: Test Race Conditions (2 minutes)

```bash
cd scripts
node test-job-race.js
```

**Expected:**
```
✅ ALL TESTS PASSED
```

✅ If passes → RPCs working correctly

---

## Step 3: Start Push Worker (30 seconds)

```bash
cd workers
node push-notification-worker.js
```

**Expected:**
```
✅ Connected to PostgreSQL
🎧 Listening for push notification events...
```

✅ Keep this running in background

---

## Step 4: Test Mobile App (2 minutes)

```bash
cd apps/mobile
npm start
```

**Then:**
1. Scan QR code with Expo Go app
2. App opens → tap "Get Started"
3. Sign up as customer or provider
4. Should see home screen

✅ If home screen shows → App works!

---

## 🎉 All Green? You're Ready!

If all 4 steps passed:
- ✅ Backend is configured
- ✅ Race conditions handled
- ✅ Push worker ready
- ✅ Mobile app works

**Next:** Build service booking UI or test full end-to-end flow (see TESTING_GUIDE.md)

---

## ❌ Something Failed?

**Step 1 failed?**
→ Run database migrations: `database/README.md`

**Step 2 failed?**
→ Check error message, verify RPCs exist

**Step 3 failed?**
→ Check DATABASE_URL in `workers/.env`

**Step 4 failed?**
→ Run `npm install` in `apps/mobile` first

**Still stuck?**
→ Check `TESTING_GUIDE.md` for detailed troubleshooting
