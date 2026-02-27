import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../context/ThemeContext';

export function AuthCallback() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Processing...');

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Get the hash from the URL (Supabase sends verification data in the URL hash)
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const type = hashParams.get('type');

        if (!accessToken) {
          throw new Error('Invalid or expired link');
        }

        // Set the session with the tokens
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken || '',
        });

        if (error) throw error;

        if (type === 'recovery') {
          // Password reset flow: redirect to reset password page
          setStatus('success');
          setMessage('Verified! Redirecting to set new password...');
          setTimeout(() => {
            navigate('/reset-password', { replace: true });
          }, 1500);
        } else if (type === 'signup' || type === 'email') {
          // Email verification flow
          setStatus('success');
          setMessage('Email verified successfully!');
          localStorage.removeItem('pendingVerificationEmail');
          setTimeout(() => {
            navigate('/home', { replace: true });
          }, 2000);
        } else {
          // Generic auth callback (magiclink, invite, etc.)
          setStatus('success');
          setMessage('Authentication successful!');
          setTimeout(() => {
            navigate('/home', { replace: true });
          }, 2000);
        }
      } catch (error: any) {
        console.error('Auth callback error:', error);
        setStatus('error');
        setMessage(error.message || 'Verification failed. Please try again.');
        setTimeout(() => {
          navigate('/login', { replace: true });
        }, 3000);
      }
    };

    handleAuthCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden"
      style={{ background: isDark ? 'linear-gradient(180deg, #0A1626 0%, #081427 100%)' : 'linear-gradient(180deg, #F8FBFF 0%, #EAF2FF 100%)' }}>
      {/* Background */}
      <div className="absolute inset-0">
        <motion.div
          className="absolute top-1/4 right-1/4 w-96 h-96 bg-[#008CE5] opacity-10 blur-[120px] rounded-full"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.1, 0.2, 0.1],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
          }}
        />
      </div>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 rounded-[32px] p-8 max-w-md w-full text-center"
        style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2'}` }}
      >
        {status === 'loading' && (
          <>
            <Loader2 className="w-16 h-16 text-[#008CE5] animate-spin mx-auto mb-6" />
            <h2 className="text-2xl font-bold mb-3" style={{ color: isDark ? '#FFFFFF' : '#14263D' }}>{message}</h2>
            <p style={{ color: isDark ? 'rgba(255,255,255,0.6)' : '#6B7280' }}>Please wait...</p>
          </>
        )}

        {status === 'success' && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', duration: 0.5 }}
          >
            <div className="w-20 h-20 rounded-full bg-[#008CE5]/20 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-12 h-12 text-[#008CE5]" />
            </div>
            <h2 className="text-2xl font-bold mb-3" style={{ color: isDark ? '#FFFFFF' : '#14263D' }}>Email Verified!</h2>
            <p className="mb-4" style={{ color: isDark ? 'rgba(255,255,255,0.6)' : '#6B7280' }}>{message}</p>
            <p className="text-sm" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }}>Redirecting to your dashboard...</p>
          </motion.div>
        )}

        {status === 'error' && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', duration: 0.5 }}
          >
            <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-6">
              <XCircle className="w-12 h-12 text-red-400" />
            </div>
            <h2 className="text-2xl font-bold mb-3" style={{ color: isDark ? '#FFFFFF' : '#14263D' }}>Verification Failed</h2>
            <p className="mb-4" style={{ color: isDark ? 'rgba(255,255,255,0.6)' : '#6B7280' }}>{message}</p>
            <p className="text-sm" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }}>Redirecting to login...</p>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
