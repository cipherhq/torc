-- Ensure all self-update RLS policies exist for users and providers.
-- Uses DROP IF EXISTS + CREATE for idempotency — safe to run multiple times.
-- This guarantees the production database has all needed policies even if
-- the original schema setup scripts were incomplete.

-- ============================================================
-- 1. PROFILES TABLE
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can view their own profile
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- Anyone can view profiles (needed for name lookups, chat display names, etc.)
DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;
CREATE POLICY "Anyone can view profiles" ON public.profiles
  FOR SELECT USING (true);

-- Users can insert their own profile
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Users can update their own profile
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- ============================================================
-- 2. VEHICLES TABLE
-- ============================================================
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own vehicles" ON public.vehicles;
CREATE POLICY "Users can manage own vehicles" ON public.vehicles
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- 3. PROVIDER_PROFILES TABLE
-- ============================================================
ALTER TABLE public.provider_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Provider can view own profile" ON public.provider_profiles;
CREATE POLICY "Provider can view own profile" ON public.provider_profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Provider can update own profile" ON public.provider_profiles;
CREATE POLICY "Provider can update own profile" ON public.provider_profiles
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Provider can insert own profile" ON public.provider_profiles;
CREATE POLICY "Provider can insert own profile" ON public.provider_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Anyone can view providers" ON public.provider_profiles;
CREATE POLICY "Anyone can view providers" ON public.provider_profiles
  FOR SELECT USING (true);

-- ============================================================
-- 4. DOCUMENTS TABLE
-- ============================================================
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Provider can view own documents" ON public.documents;
CREATE POLICY "Provider can view own documents" ON public.documents
  FOR SELECT USING (auth.uid() = provider_id);

DROP POLICY IF EXISTS "Provider can upsert own documents" ON public.documents;
CREATE POLICY "Provider can upsert own documents" ON public.documents
  FOR INSERT WITH CHECK (auth.uid() = provider_id);

DROP POLICY IF EXISTS "Provider can update own pending documents" ON public.documents;
CREATE POLICY "Provider can update own pending documents" ON public.documents
  FOR UPDATE USING (auth.uid() = provider_id) WITH CHECK (auth.uid() = provider_id);

DROP POLICY IF EXISTS "Provider can delete own documents" ON public.documents;
CREATE POLICY "Provider can delete own documents" ON public.documents
  FOR DELETE USING (auth.uid() = provider_id);
