import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { useState, useEffect } from 'react';
import { Mail, Lock, AlertCircle, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../lib/supabase';
import { getAuthCallbackUrl } from '../../lib/authRedirectUrl';

export function Login() {
  const navigate = useNavigate();
  const { signIn, isAuthenticated, loading: authLoading } = useAuth();
  const { isDark } = useTheme();

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate('/customer/home', { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailNotVerified, setEmailNotVerified] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [verificationResent, setVerificationResent] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setEmailNotVerified(false);
    setLoading(true);
    try {
      await signIn(email, password);
      navigate('/home');
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.toLowerCase().includes('email not confirmed')) {
        setEmailNotVerified(true);
      } else {
        setError(msg || 'Failed to sign in. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email) return;
    setResendingVerification(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: getAuthCallbackUrl() },
      });
      if (error) throw error;
      setVerificationResent(true);
      setTimeout(() => setVerificationResent(false), 4000);
    } catch (err: any) {
      const msg = (err.message || '').toLowerCase();
      if (msg.includes('already confirmed') || msg.includes('already registered')) {
        setEmailNotVerified(false);
        setError('');
        // Email is already verified — try logging in again
        setLoading(true);
        try {
          await signIn(email, password);
          navigate('/home');
        } catch (loginErr: any) {
          setError(loginErr.message || 'Failed to sign in.');
        } finally {
          setLoading(false);
        }
      } else {
        setError('Failed to resend verification email. Please try again.');
      }
    } finally {
      setResendingVerification(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-hidden"
      style={{
        background: isDark
          ? 'linear-gradient(180deg, #14263D 0%, #0A1626 100%)'
          : 'linear-gradient(180deg, #FFFFFF 0%, #EAF3FF 100%)',
      }}
    >
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full"
          style={{ backgroundColor: '#008CE5', filter: 'blur(180px)', opacity: isDark ? 0.08 : 0.04 }}
        />
      </div>

      <div className="relative z-10 flex-1 flex flex-col px-6 pb-8" style={{ paddingTop: 'var(--safe-top)' }}>
        {/* Logo + Welcome */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <img
            src="/logo.svg"
            alt="Torc"
            className="w-48 h-auto mx-auto object-contain mb-4"
          />
          <h1 className="text-3xl font-bold" style={{ color: isDark ? '#FFFFFF' : '#14263D' }}>
            Welcome Back
          </h1>
          <p className="mt-2" style={{ color: isDark ? 'rgba(255,255,255,0.5)' : '#6B7280' }}>
            Sign in to your account
          </p>
        </motion.div>

        {/* Form */}
        <motion.form
          onSubmit={handleLogin}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="flex-1 flex flex-col max-w-md mx-auto w-full"
        >
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl p-4 mb-5 flex items-center gap-3"
              style={{ backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#FEF2F2', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-red-500 text-sm">{error}</p>
            </motion.div>
          )}

          {emailNotVerified && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl p-4 mb-5"
              style={{ backgroundColor: isDark ? 'rgba(245,158,11,0.1)' : '#FFFBEB', border: '1px solid rgba(245,158,11,0.3)' }}
            >
              <div className="flex items-center gap-3 mb-3">
                <Mail className="w-5 h-5 flex-shrink-0" style={{ color: '#D97706' }} />
                <p className="text-sm font-semibold" style={{ color: isDark ? '#FBBF24' : '#92400E' }}>
                  Email not verified
                </p>
              </div>
              <p className="text-sm mb-3" style={{ color: isDark ? 'rgba(255,255,255,0.6)' : '#78716C' }}>
                Please check your inbox and click the verification link. If you can't find it, resend below.
              </p>
              <button
                type="button"
                onClick={handleResendVerification}
                disabled={resendingVerification || verificationResent}
                className="w-full rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ backgroundColor: isDark ? 'rgba(245,158,11,0.15)' : 'rgba(245,158,11,0.1)', color: '#D97706' }}
              >
                <RefreshCw className={`w-4 h-4 ${resendingVerification ? 'animate-spin' : ''}`} />
                {verificationResent ? 'Verification email sent!' : resendingVerification ? 'Sending...' : 'Resend Verification Email'}
              </button>
            </motion.div>
          )}

          <div className="space-y-4 mb-6">
            {/* Email */}
            <div>
              <label className="text-sm font-medium mb-2 block" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#374151' }}>
                Email Address
              </label>
              <div
                className="flex items-center gap-3 rounded-2xl px-4 py-4 transition-all focus-within:ring-2 focus-within:ring-[#008CE5]/50"
                style={{
                  backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F5F9FF',
                  border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#D3E0F2'}`,
                }}
              >
                <Mail className="w-5 h-5 flex-shrink-0" style={{ color: '#008CE5' }} />
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="flex-1 bg-transparent border-none outline-none text-base"
                  style={{
                    color: isDark ? '#FFFFFF' : '#1F2937',
                    border: 'none',
                    boxShadow: 'none',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                  }}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="text-sm font-medium mb-2 block" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#374151' }}>
                Password
              </label>
              <div
                className="flex items-center gap-3 rounded-2xl px-4 py-4 transition-all focus-within:ring-2 focus-within:ring-[#008CE5]/50"
                style={{
                  backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F5F9FF',
                  border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#D3E0F2'}`,
                }}
              >
                <Lock className="w-5 h-5 flex-shrink-0" style={{ color: '#008CE5' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="flex-1 bg-transparent border-none outline-none text-base"
                  style={{
                    color: isDark ? '#FFFFFF' : '#1F2937',
                    border: 'none',
                    boxShadow: 'none',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                  }}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="p-1">
                  {showPassword
                    ? <EyeOff className="w-5 h-5" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }} />
                    : <Eye className="w-5 h-5" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }} />
                  }
                </button>
              </div>
            </div>
          </div>

          {/* Forgot password */}
          <div className="text-right mb-6">
            <button type="button" onClick={() => navigate('/forgot-password')} className="text-sm font-semibold" style={{ color: '#008CE5' }}>
              Forgot Password?
            </button>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!email || !password || loading}
            className="torc-btn-primary flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-[#081427] border-t-transparent rounded-full animate-spin" />
                Signing In...
              </>
            ) : (
              'Sign In'
            )}
          </button>

          {/* Sign up link */}
          <div className="text-center mt-8">
            <p style={{ color: isDark ? 'rgba(255,255,255,0.5)' : '#6B7280' }}>
              Don't have an account?{' '}
              <button type="button" onClick={() => navigate('/signup')} className="font-bold" style={{ color: '#008CE5' }}>
                Sign Up
              </button>
            </p>
          </div>
        </motion.form>
      </div>
    </div>
  );
}
