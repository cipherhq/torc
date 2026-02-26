import { ReactNode, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { AdminSidebar } from './AdminSidebar';
import { supabase } from '../lib/supabase';
import { requireAdminSession } from '../lib/adminAuth';

interface AdminLayoutProps {
  children: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;

    const verifyAccess = async () => {
      try {
        await requireAdminSession();
        if (!cancelled) {
          setHasAccess(true);
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
      verifyAccess();
    });

    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
    };
  }, [location.pathname, navigate]);

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

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      <AdminSidebar />
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
