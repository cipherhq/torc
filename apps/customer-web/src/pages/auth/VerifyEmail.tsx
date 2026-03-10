import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { Mail, RefreshCw, CheckCircle } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { getAuthCallbackUrl } from '../../lib/authRedirectUrl';
import { useTheme } from '../../context/ThemeContext';

export function VerifyEmail() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [alreadyVerified, setAlreadyVerified] = useState(false);
  const email = localStorage.getItem('pendingVerificationEmail');

  // Check if user is already verified (has active session with confirmed email)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email_confirmed_at) {
        setAlreadyVerified(true);
        localStorage.removeItem('pendingVerificationEmail');
      }
    });
  }, []);

  const handleResend = async () => {
    if (!email) return;

    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email,
        options: {
          emailRedirectTo: getAuthCallbackUrl(),
        },
      });

      if (error) {
        const msg = (error.message || '').toLowerCase();
        if (msg.includes('already confirmed') || msg.includes('already registered')) {
          setAlreadyVerified(true);
          localStorage.removeItem('pendingVerificationEmail');
          return;
        }
        throw error;
      }
      setResent(true);
      setTimeout(() => setResent(false), 3000);
    } catch (error: any) {
      console.error('Resend error:', error);
      setResent(false);
      alert(error?.message || 'Failed to resend email. Please try again.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col p-6 relative overflow-hidden"
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

      <PageHeader title="Verify Email" onBack={() => navigate('/login')} />

      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col justify-center items-center max-w-md mx-auto w-full text-center" style={{ paddingTop: 'calc(var(--safe-top) + 64px)' }}>
        {alreadyVerified ? (
          <>
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', duration: 0.6 }}
            >
              <div className="w-32 h-32 rounded-full flex items-center justify-center mb-8 mx-auto"
                style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}>
                <CheckCircle className="w-16 h-16 text-white" />
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <h2 className="text-3xl font-bold mb-4" style={{ color: isDark ? '#FFFFFF' : '#14263D' }}>
                Account Verified
              </h2>
              <p className="text-lg mb-8" style={{ color: isDark ? 'rgba(255,255,255,0.6)' : '#6B7280' }}>
                Your account verification is complete. You can now sign in.
              </p>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate('/login')}
                className="torc-btn-primary w-full"
              >
                Continue to Login
              </motion.button>
            </motion.div>
          </>
        ) : (
          <>
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', duration: 0.6 }}
            >
              <div className="w-32 h-32 rounded-full bg-gradient-to-br from-[#008CE5] to-[#0070B8] flex items-center justify-center mb-8 mx-auto">
                <Mail className="w-16 h-16 text-[#081427]" />
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <h2 className="text-3xl font-bold mb-4" style={{ color: isDark ? '#FFFFFF' : '#14263D' }}>
                Check Your Email
              </h2>
              <p className="text-lg mb-2" style={{ color: isDark ? 'rgba(255,255,255,0.6)' : '#6B7280' }}>
                We sent a verification link to
              </p>
              <p className="text-[#008CE5] font-semibold text-lg mb-8">
                {email || 'your email'}
              </p>

              <div className="rounded-[24px] p-6 mb-6 text-left" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2'}` }}>
                <h3 className="font-semibold mb-3" style={{ color: isDark ? '#FFFFFF' : '#14263D' }}>What's next?</h3>
                <ol className="space-y-2 text-sm" style={{ color: isDark ? 'rgba(255,255,255,0.6)' : '#6B7280' }}>
                  <li className="flex gap-3">
                    <span className="text-[#008CE5] font-bold">1.</span>
                    <span>Check your email inbox (and spam folder)</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-[#008CE5] font-bold">2.</span>
                    <span>Click the verification link in the email</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-[#008CE5] font-bold">3.</span>
                    <span>You'll be redirected back to sign in</span>
                  </li>
                </ol>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleResend}
                disabled={resending || resent}
                className="w-full rounded-[32px] py-4 font-semibold flex items-center justify-center gap-2 mb-4 disabled:opacity-50"
                style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', color: isDark ? '#FFFFFF' : '#14263D' }}
              >
                <RefreshCw className={`w-5 h-5 ${resending ? 'animate-spin' : ''}`} />
                {resent ? 'Email Sent!' : resending ? 'Sending...' : 'Resend Email'}
              </motion.button>

              <button
                onClick={() => navigate('/login')}
                className="text-[#008CE5] font-semibold hover:underline"
              >
                Back to Login
              </button>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}
