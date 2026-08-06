-- DEL-001: Add pending_deletion to profiles_status_check.
--
-- The existing CHECK constraint (from database/migrations/015_soft_delete_profiles.sql)
-- allows: active, suspended, pending, deleted.
-- Account deletion requests set status='pending_deletion' which was rejected.
--
-- This migration drops and recreates the constraint to include pending_deletion.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_status_check
  CHECK (status IN ('active', 'suspended', 'pending', 'pending_deletion', 'deleted'));
