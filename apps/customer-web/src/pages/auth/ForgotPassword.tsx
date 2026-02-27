import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Mail, AlertCircle, CheckCircle, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../lib/supabase';
import { getAuthCallbackUrl } from '../../lib/authRedirectUrl';

export function ForgotPassword() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const textColor = isDark ? '#FFFFFF' : '#1F2937';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmed = email.trim();
    if (!trimmed) { setError('Please enter your email address'); return; }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: getAuthCallbackUrl(),
      });
      if (error) throw error;
      setSent(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email. Please try again.');
    } finally {
      setLoading(false);
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
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full"
          style={{ backgroundColor: '#008CE5', filter: 'blur(180px)', opacity: isDark ? 0.08 : 0.04 }}
        />
      </div>

      {/* Header */}
      <div className="relative z-10 p-6 flex items-center gap-4" style={{ paddingTop: 'var(--safe-top)' }}>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate('/login')}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}
        >
          <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
        </motion.button>
      </div>

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 pb-8">
        {sent ? (
          /* Success state */
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center max-w-md w-full"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
              className="w-24 h-24 rounded-full mx-auto mb-6 flex items-center justify-center"
              style={{ backgroundColor: 'rgba(0,140,229,0.15)' }}
            >
              <CheckCircle className="w-12 h-12" style={{ color: '#008CE5' }} />
            </motion.div>

            <h1 className="text-3xl font-bold mb-3" style={{ color: textColor }}>Check Your Email</h1>
            <p className="mb-2" style={{ color: subColor }}>
              We sent a password reset link to
            </p>
            <p className="font-semibold text-lg mb-8" style={{ color: '#008CE5' }}>{email}</p>

            <div
              className="rounded-[24px] p-6 mb-6 text-left"
              style={{
                backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F5F9FF',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#D3E0F2'}`,
              }}
            >
              <h3 className="font-semibold mb-3" style={{ color: textColor }}>What's next?</h3>
              <ol className="space-y-2 text-sm" style={{ color: subColor }}>
                <li className="flex gap-3">
                  <span className="font-bold" style={{ color: '#008CE5' }}>1.</span>
                  <span>Check your email inbox (and spam folder)</span>
                </li>
                <li className="flex gap-3">
                  <span className="font-bold" style={{ color: '#008CE5' }}>2.</span>
                  <span>Click the password reset link</span>
                </li>
                <li className="flex gap-3">
                  <span className="font-bold" style={{ color: '#008CE5' }}>3.</span>
                  <span>Set your new password</span>
                </li>
              </ol>
            </div>

            <button
              onClick={() => navigate('/login')}
              className="font-semibold hover:underline"
              style={{ color: '#008CE5' }}
            >
              Back to Login
            </button>
          </motion.div>
        ) : (
          /* Form state */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-md w-full"
          >
            <div
              className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, rgba(0,140,229,0.2), rgba(0,122,255,0.2))' }}
            >
              <KeyRound className="w-10 h-10" style={{ color: '#008CE5' }} />
            </div>

            <h1 className="text-3xl font-bold mb-2" style={{ color: textColor }}>
              Forgot Password?
            </h1>
            <p className="mb-8" style={{ color: subColor }}>
              No worries. Enter your email and we'll send you a reset link.
            </p>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl p-4 mb-5 flex items-center gap-3"
                style={{
                  backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#FEF2F2',
                  border: '1px solid rgba(239,68,68,0.2)',
                }}
              >
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <p className="text-red-500 text-sm">{error}</p>
              </motion.div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="mb-6">
                <label
                  className="text-sm font-medium mb-2 block text-left"
                  style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#374151' }}
                >
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
                    style={{ color: textColor }}
                  />
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={!email.trim() || loading}
                className="w-full bg-gradient-to-r from-[#008CE5] to-[#0070B8] rounded-2xl py-4 font-bold text-white text-lg shadow-lg shadow-[#008CE5]/30 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-[#081427] border-t-transparent rounded-full animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send Reset Link'
                )}
              </motion.button>
            </form>

            <div className="text-center mt-6">
              <button
                onClick={() => navigate('/login')}
                className="font-semibold hover:underline"
                style={{ color: '#008CE5' }}
              >
                Back to Login
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
