import { supabase } from './supabase';

export interface AdminSession {
  userId: string;
  email: string;
  role: 'admin' | 'support';
}

// Support is an operational read/triage role. Financial, configuration,
// approval, team-management, analytics and audit mutation surfaces remain
// administrator-only at the route layer (DB policies remain authoritative).
export const SUPPORT_ALLOWED_PATHS = new Set([
  '/dashboard', '/jobs', '/live-dispatch',
  '/users', '/documents', '/support-tickets',
]);

export function canAccessAdminPath(role: AdminSession['role'], pathname: string): boolean {
  if (role === 'admin') return true;
  const path = pathname.replace(/\/$/, '') || '/';
  return SUPPORT_ALLOWED_PATHS.has(path);
}

export function clearAdminSessionCache() {
  // Kept as a public hook for auth listeners. Page guards intentionally
  // perform a fresh profile check so permission changes take effect promptly.
}

export async function requireAdminSession(): Promise<AdminSession> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const user = sessionData?.session?.user;
  if (!user) {
    throw new Error('No active session. Sign in as an admin and try again.');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile || !['admin', 'support'].includes(profile.role)) {
    throw new Error('Signed-in account is not an admin profile.');
  }

  return {
    userId: user.id,
    email: user.email || '',
    role: profile.role,
  };
}
