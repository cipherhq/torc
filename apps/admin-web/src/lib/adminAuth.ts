import { supabase } from './supabase';
import type { AdminRole } from './rbac';

export interface AdminSession {
  userId: string;
  email: string;
  adminRole: AdminRole;
}

/**
 * Verifies that the current Supabase session belongs to an admin user.
 *
 * - Fetches `role` and `admin_role` from the profiles table.
 * - If `admin_role` is not present (column doesn't exist or value is null),
 *   defaults to 'admin' so existing admins are not locked out.
 * - Throws if there is no session or the user is not an admin.
 */
export async function requireAdminSession(): Promise<AdminSession> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const user = sessionData?.session?.user;
  if (!user) {
    throw new Error('No active session. Sign in as an admin and try again.');
  }

  // Select both role and admin_role. If admin_role column doesn't exist in the
  // DB the query will still succeed — the field will simply be absent / null.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, admin_role')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile || profile.role !== 'admin') {
    throw new Error('Signed-in account is not an admin profile.');
  }

  // Determine the granular admin sub-role.
  // Fall back to 'admin' when admin_role is missing or unset.
  const validRoles: AdminRole[] = ['super_admin', 'admin', 'manager', 'support'];
  const adminRole: AdminRole = validRoles.includes(profile.admin_role as AdminRole)
    ? (profile.admin_role as AdminRole)
    : 'admin';

  return {
    userId: user.id,
    email: user.email || '',
    adminRole,
  };
}
