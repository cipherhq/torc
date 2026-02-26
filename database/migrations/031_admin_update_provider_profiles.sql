-- Allow admins full access to provider_profiles and update access to profiles
-- Without these policies, admin operations (approve, reject, suspend) silently
-- affect 0 rows because RLS blocks updates from non-owner users.

-- 1) Admin full access on provider_profiles (approve/reject verification)
DROP POLICY IF EXISTS "admin_full_access_provider_profiles" ON public.provider_profiles;
CREATE POLICY "admin_full_access_provider_profiles" ON public.provider_profiles
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 2) Admin can update any profile (suspend/unsuspend, set is_verified, etc.)
DROP POLICY IF EXISTS "admin_can_update_profiles" ON public.profiles;
CREATE POLICY "admin_can_update_profiles" ON public.profiles
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
