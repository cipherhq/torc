# Get Your Database Connection String

You need the **DATABASE_URL** to connect the push worker to Supabase.

## 🔑 Get Connection String from Supabase

### Option 1: From Supabase Dashboard (Recommended)

1. Go to: https://supabase.com/dashboard/project/apojatplmfsbimgcyjoo/settings/database
2. Scroll to **Connection string** section
3. Select **URI** tab (not Session mode)
4. Click **Copy** next to the connection string

It will look like:
```
postgresql://postgres.apojatplmfsbimgcyjoo:[YOUR-PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres
```

**⚠️ Replace `[YOUR-PASSWORD]` with your actual database password**

### Option 2: Construct It Manually

If you know your database password, the format is:
```
postgresql://postgres.apojatplmfsbimgcyjoo:[YOUR-PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres
```

**Project ref:** `apojatplmfsbimgcyjoo`

---

## ✏️ Once You Have It

Reply with your DATABASE_URL and I'll configure the worker!

Or if you want to do it manually:

```bash
cd ~/Desktop/torc/workers
cp .env.example .env
nano .env
# Paste your connection string and save
```
