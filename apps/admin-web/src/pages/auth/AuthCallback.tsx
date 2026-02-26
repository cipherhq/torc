import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { supabase } from '../../lib/supabase';
import { requireAdminSession } from '../../lib/adminAuth';

export function AuthCallback() {
  const navigate = useNavigate();
  const [message, setMessage] = useState('Signing you in...');

  useEffect(() => {
    const finalizeAuth = async () => {
      try {
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const urlParams = new URLSearchParams(window.location.search);

        const hashError = hashParams.get('error_description') || hashParams.get('error');
        if (hashError) {
          throw new Error(decodeURIComponent(hashError.replace(/\+/g, ' ')));
        }

        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const authCode = urlParams.get('code');

        if (accessToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || '',
          });
          if (error) throw error;
        } else if (authCode) {
          const { error } = await supabase.auth.exchangeCodeForSession(authCode);
          if (error) throw error;
        }

        await requireAdminSession();
        navigate('/dashboard', { replace: true });
      } catch (error: any) {
        await supabase.auth.signOut().catch(() => {});
        setMessage(error?.message || 'Authentication failed. Redirecting to login...');
        setTimeout(() => navigate('/login', { replace: true }), 1700);
      }
    };

    finalizeAuth();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[#0A0F1E] flex items-center justify-center px-6">
      <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-3">Admin Authentication</h1>
        <p className="text-gray-600">{message}</p>
      </div>
    </div>
  );
}
