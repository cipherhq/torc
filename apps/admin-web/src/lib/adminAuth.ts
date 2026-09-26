import { supabase } from './supabase';

export interface AdminSession {
  userId: string;
  email: string;
  role: 'admin' | 'support';
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
