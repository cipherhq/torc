-- Add admin_role column to profiles for granular RBAC
-- Valid values: 'super_admin', 'admin', 'manager', 'support'
-- NULL defaults to 'admin' in application code
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS admin_role text DEFAULT NULL;

-- Add a check constraint to limit valid values
ALTER TABLE profiles ADD CONSTRAINT profiles_admin_role_check
  CHECK (admin_role IS NULL OR admin_role IN ('super_admin', 'admin', 'manager', 'support'));
