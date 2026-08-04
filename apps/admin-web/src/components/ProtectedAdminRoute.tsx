import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { supabase } from '../lib/supabase';

interface Props {
  children: ReactNode;
}

/**
 * Route guard for admin pages.
 * Verifies the user has an active session with role=admin before rendering children.
 */
export function ProtectedAdminRoute({ children }: Props) {
  const [status, setStatus] = useState<'checking' | 'allowed' | 'denied'>('checking');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;

    async function verify() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error('no session');

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .maybeSingle();

        if (cancelled) return;

        if (profile?.role === 'admin') {
          setStatus('allowed');
        } else {
          setStatus('denied');
          navigate('/login', { replace: true, state: { from: location.pathname } });
        }
      } catch {
        if (!cancelled) {
          setStatus('denied');
          navigate('/login', { replace: true, state: { from: location.pathname } });
        }
      }
    }

    verify();

    return () => { cancelled = true; };
  }, [navigate, location.pathname]);

  if (status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (status === 'denied') return null;

  return <>{children}</>;
}
