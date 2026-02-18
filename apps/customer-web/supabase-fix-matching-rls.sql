-- ============================================
-- TORC - Fix Jobs RLS for Provider Matching
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/apojatplmfsbimgcyjoo/sql
-- ============================================

-- Problem: Providers can't see pending jobs because RLS only allows
-- access when auth.uid() = customer_id OR auth.uid() = provider_id.
-- New pending jobs have provider_id = NULL, so providers are blocked.

-- Fix: Allow any authenticated user to see pending unassigned jobs,
-- and allow providers to claim (update) pending unassigned jobs.

-- 1. Drop the restrictive SELECT policy
DROP POLICY IF EXISTS "Customers can view own jobs" ON public.jobs;

-- 2. Create separate SELECT policies
-- Users can always see their own jobs (as customer or provider)
CREATE POLICY "Users can view own jobs" ON public.jobs
  FOR SELECT USING (auth.uid() = customer_id OR auth.uid() = provider_id);

-- Any authenticated user can see pending unassigned jobs (for matching)
CREATE POLICY "Anyone can view pending unassigned jobs" ON public.jobs
  FOR SELECT USING (status = 'pending' AND provider_id IS NULL);

-- 3. Drop the restrictive UPDATE policy
DROP POLICY IF EXISTS "Participants can update jobs" ON public.jobs;

-- 4. Create separate UPDATE policies
-- Participants (customer or assigned provider) can update their jobs
CREATE POLICY "Participants can update own jobs" ON public.jobs
  FOR UPDATE USING (auth.uid() = customer_id OR auth.uid() = provider_id);

-- Any authenticated user can claim a pending unassigned job
CREATE POLICY "Providers can claim pending jobs" ON public.jobs
  FOR UPDATE USING (status = 'pending' AND provider_id IS NULL);

-- 5. Ensure realtime is enabled for jobs table
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE jobs;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Verify
SELECT 'Jobs RLS fixed for matching!' AS status;
