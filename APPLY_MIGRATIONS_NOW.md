# 🗄️ Apply Database Migrations - DO THIS FIRST

Before the push worker can run, you need to create the tables in Supabase.

## Quick Steps (5 minutes)

### 1. Open Supabase SQL Editor
👉 https://supabase.com/dashboard/project/apojatplmfsbimgcyjoo/sql/new

### 2. Run These 6 SQL Files (in order)

Copy/paste each file from `~/Desktop/torc/database/migrations/` and click **Run**:

#### Migration 1: Job Events Table
```bash
cat ~/Desktop/torc/database/migrations/001_job_events_table.sql
```
Copy output → Paste in SQL Editor → Run ▶️

#### Migration 2: Accept Job RPC
```bash
cat ~/Desktop/torc/database/migrations/002_accept_job_rpc.sql
```
Copy output → Paste in SQL Editor → Run ▶️

#### Migration 3: Cancel Job RPC
```bash
cat ~/Desktop/torc/database/migrations/003_cancel_job_rpc.sql
```
Copy output → Paste in SQL Editor → Run ▶️

#### Migration 4: Device Tokens Table
```bash
cat ~/Desktop/torc/database/migrations/004_device_tokens_table.sql
```
Copy output → Paste in SQL Editor → Run ▶️

#### Migration 5: Push Notifications Log
```bash
cat ~/Desktop/torc/database/migrations/005_push_notifications_log.sql
```
Copy output → Paste in SQL Editor → Run ▶️

#### Migration 6: Add Cancelled By Column
```bash
cat ~/Desktop/torc/database/migrations/006_add_cancelled_by.sql
```
Copy output → Paste in SQL Editor → Run ▶️

---

## ✅ Verify All Migrations Applied

Run this in SQL Editor to check:

```sql
-- Should show all 3 new tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('job_events', 'device_tokens', 'push_notifications');

-- Should show 2 new functions
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('accept_job', 'cancel_job');
```

Expected results:
- 3 tables: job_events, device_tokens, push_notifications
- 2 functions: accept_job, cancel_job

---

## 🎯 After Migrations Complete

Reply "migrations done" and I'll help you test the push worker!
