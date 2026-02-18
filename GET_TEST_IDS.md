# How to Get Test IDs for the Race Test Script

You need 4 UUIDs to run the test script. Here's how to get them:

---

## 1️⃣ Get User IDs (Customer + 2 Providers)

### Option A: From Supabase Dashboard (Easiest)

1. Go to **Supabase Dashboard**: https://supabase.com/dashboard
2. Select your project (apojatplmfsbimgcyjoo)
3. Go to **Authentication** → **Users**
4. You'll see a list of users with their UUIDs

**Copy 3 user IDs:**
- One user who is a **customer** → use for `TEST_CUSTOMER_ID`
- Two users who are **providers** → use for `TEST_PROVIDER_1_ID` and `TEST_PROVIDER_2_ID`

If you don't have 3 users yet, create them:
- Click **"Add user"** → Email + Password → Create
- Or just use the same UUID for all 3 (the test will still work)

### Option B: From Supabase SQL Editor

Run this query in **SQL Editor**:

```sql
-- Get any 3 users
SELECT id, email, raw_user_meta_data 
FROM auth.users 
LIMIT 3;
```

Copy the 3 UUIDs from the results.

---

## 2️⃣ Get Service ID

### Option A: From Table Editor

1. Go to **Table Editor** → **services** table
2. You'll see a list of services (Towing, Jump Start, etc.)
3. Copy any service's `id` (UUID)

### Option B: From SQL Editor

```sql
-- Get any service
SELECT id, name 
FROM services 
LIMIT 1;
```

Copy the UUID.

---

## 3️⃣ Update scripts/.env

Open `/Users/bajideace/Desktop/torc/scripts/.env` and replace:

```bash
TEST_CUSTOMER_ID=YOUR_CUSTOMER_UUID_HERE
TEST_PROVIDER_1_ID=YOUR_PROVIDER_1_UUID_HERE
TEST_PROVIDER_2_ID=YOUR_PROVIDER_2_UUID_HERE
TEST_SERVICE_ID=YOUR_SERVICE_UUID_HERE
```

---

## 4️⃣ Run the Test

```bash
cd ~/Desktop/torc/scripts
npm run test:race
```

**Expected output:**
```
📝 Creating test job...
✅ Created job: abc-123-def

🏁 Testing race condition...
🏆 Provider 1 won!
❌ Provider 2 was rejected (as expected)
✅ Loser got correct error: JOB_ALREADY_ACCEPTED

✅ All tests completed successfully!
```

---

## 🚨 If You Don't Have Users or Services Yet

**Quick fix - create dummy data:**

Run this in **Supabase SQL Editor**:

```sql
-- Create a test service if you don't have one
INSERT INTO services (id, name, description, base_price, category)
VALUES (
  gen_random_uuid(),
  'Test Towing Service',
  'For testing only',
  50.00,
  'towing'
)
RETURNING id;
-- Copy the returned UUID

-- Create 3 test users (will appear in Authentication → Users)
-- (Skip this if you already have users)
```

Or just use **the same UUID 3 times** for testing:

```bash
# In .env, use any existing user ID:
TEST_CUSTOMER_ID=some-real-user-uuid
TEST_PROVIDER_1_ID=some-real-user-uuid
TEST_PROVIDER_2_ID=some-real-user-uuid
TEST_SERVICE_ID=some-real-service-uuid
```

The test will still work (though both "providers" will be the same person).

---

## ✅ After You Update .env

Run: `npm run test:race` and you should see all tests pass! 🎉
