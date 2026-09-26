import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { AdminSidebar } from './AdminSidebar';
import { supabase } from '../lib/supabase';
import { requireAdminSession, clearAdminSessionCache } from '../lib/adminAuth';
import { canAccessAdminPath } from '../lib/adminAuth';
import { ShieldCheck } from 'lucide-react';

interface AdminLayoutProps {
  children: ReactNode;
}

export const AdminRoleContext = createContext<'admin' | 'support' | null>(null);
export function useAdminRole(): 'admin' | 'support' {
  const providedRole = useContext(AdminRoleContext);
  const [resolvedRole, setResolvedRole] = useState<'admin' | 'support'>('support');
  useEffect(() => {
    if (providedRole) return;
    requireAdminSession().then(session => setResolvedRole(session.role)).catch(() => undefined);
  }, [providedRole]);
  return providedRole || resolvedRole;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [role, setRole] = useState<'admin' | 'support'>('admin');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;

    const verifyAccess = async () => {
      try {
        const session = await requireAdminSession();
        if (!cancelled) {
          setHasAccess(true);
          setRole(session.role);
        }
      } catch {
        if (!cancelled) {
          setHasAccess(false);
          navigate('/login', {
            replace: true,
            state: { from: location.pathname },
          });
        }
      } finally {
        if (!cancelled) {
          setCheckingAccess(false);
        }
      }
    };

    verifyAccess();

    const { data: authSub } = supabase.auth.onAuthStateChange(() => {
      clearAdminSessionCache();
      verifyAccess();
    });

    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
    };
  }, [navigate]);

  useEffect(() => {
    if (!checkingAccess && hasAccess && !canAccessAdminPath(role, location.pathname)) {
      navigate('/dashboard', { replace: true });
    }
  }, [checkingAccess, hasAccess, role, location.pathname, navigate]);

  if (checkingAccess) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-gray-500">Checking admin access...</p>
      </div>
    );
  }

  if (!hasAccess) {
    return null;
  }

  if (!canAccessAdminPath(role, location.pathname)) return null;

  return (
    <AdminRoleContext.Provider value={role}>
      <div className="admin-shell flex h-screen overflow-hidden">
        <AdminSidebar role={role} />
        <div className="admin-main flex-1 overflow-y-auto">
        <header className="admin-topbar sticky top-0 z-30 flex items-center justify-between px-5 sm:px-8 py-4">
          <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">TORC Operations</p><p className="text-sm text-slate-500 truncate">{location.pathname === '/dashboard' ? 'Overview' : location.pathname.slice(1).replaceAll('-', ' ')}</p></div>
          <div className="flex items-center gap-3"><span className={`admin-role-pill ${role === 'admin' ? 'admin-role-pill--admin' : 'admin-role-pill--support'}`}><ShieldCheck className="h-3.5 w-3.5" />{role === 'admin' ? 'Administrator' : 'Support'}</span><div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-xs font-bold text-white">{role === 'admin' ? 'AD' : 'SU'}</div></div>
        </header>
        <main className="min-h-[calc(100vh-73px)]">{children}</main>
        </div>
      </div>
    </AdminRoleContext.Provider>
  );
}
