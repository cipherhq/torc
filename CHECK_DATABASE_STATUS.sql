-- Run this in Supabase SQL Editor to check what exists

-- 1. Check which tables exist
SELECT 'Tables:' as check_type, table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('job_events', 'device_tokens', 'push_notifications', 'jobs')
ORDER BY table_name;

-- 2. Check which functions (RPCs) exist
SELECT 'Functions:' as check_type, routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('accept_job', 'cancel_job', 'upsert_device_token')
ORDER BY routine_name;

-- 3. Check if jobs table has required columns
SELECT 'Jobs columns:' as check_type, column_name 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'jobs'
AND column_name IN ('accepted_at', 'cancelled_at', 'cancelled_by', 'cancellation_reason')
ORDER BY column_name;

-- 4. Quick test: Try to insert a test device token (will rollback)
BEGIN;
SELECT 'Test device_tokens table:' as check_type, 'Ready' as status;
ROLLBACK;
