import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { useState, useEffect } from 'react';
import { Mail, Lock, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(email, password);
      navigate('/home');
    } catch (err: any) {
      setError(err.message || 'Failed to sign in. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-hidden"
      style={{
        background: isDark
          ? 'linear-gradient(180deg, #1A1F2E 0%, #0F1419 100%)'
          : 'linear-gradient(180deg, #FFFFFF 0%, #F0F4F8 100%)',
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
          <h1 className="text-3xl font-bold" style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }}>
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

          <div className="space-y-4 mb-6">
            {/* Email */}
            <div>
              <label className="text-sm font-medium mb-2 block" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#374151' }}>
                Email Address
              </label>
              <div
                className="flex items-center gap-3 rounded-2xl px-4 py-4 transition-all focus-within:ring-2 focus-within:ring-[#008CE5]/50"
                style={{
                  backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FDFBF8',
                  border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#E8E4DE'}`,
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
                  backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FDFBF8',
                  border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#E8E4DE'}`,
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
                <div className="w-5 h-5 border-2 border-[#0A0F1E] border-t-transparent rounded-full animate-spin" />
                Signing In...
              </>
            ) : (
              'Sign In'
            )}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#E8E4DE' }} />
            <span className="text-xs font-medium" style={{ color: isDark ? 'rgba(255,255,255,0.3)' : '#9CA3AF' }}>OR</span>
            <div className="flex-1 h-px" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#E8E4DE' }} />
          </div>

          {/* Social login placeholders */}
          <div className="space-y-3">
            <button
              type="button"
              className="w-full flex items-center justify-center gap-3 rounded-2xl py-4 font-semibold text-sm transition-all"
              style={{
                backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#E8E4DE'}`,
                color: isDark ? '#FFFFFF' : '#1F2937',
              }}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              Continue with Google
            </button>
            <button
              type="button"
              className="w-full flex items-center justify-center gap-3 rounded-2xl py-4 font-semibold text-sm transition-all"
              style={{
                backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#000000',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#000000'}`,
                color: isDark ? '#FFFFFF' : '#FFFFFF',
              }}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
              Continue with Apple
            </button>
          </div>

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
