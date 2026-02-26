import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { Lock, AlertCircle, CheckCircle, Eye, EyeOff, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../lib/supabase';

export function ResetPassword() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const textColor = isDark ? '#FFFFFF' : '#1F2937';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      setTimeout(() => navigate('/login', { replace: true }), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password. The link may have expired.');
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
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full"
          style={{ backgroundColor: '#008CE5', filter: 'blur(180px)', opacity: isDark ? 0.08 : 0.04 }}
        />
      </div>

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 pb-8">
        {success ? (
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

            <h1 className="text-3xl font-bold mb-3" style={{ color: textColor }}>
              Password Updated!
            </h1>
            <p className="mb-6" style={{ color: subColor }}>
              Your password has been successfully reset. Redirecting you to login...
            </p>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate('/login', { replace: true })}
              className="w-full bg-gradient-to-r from-[#008CE5] to-[#0070B8] rounded-2xl py-4 font-bold text-white text-lg shadow-lg shadow-[#008CE5]/30"
            >
              Go to Login
            </motion.button>
          </motion.div>
        ) : (
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
              Set New Password
            </h1>
            <p className="mb-8" style={{ color: subColor }}>
              Choose a strong password for your account.
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

            <form onSubmit={handleSubmit} className="space-y-4 text-left">
              <div>
                <label
                  className="text-sm font-medium mb-2 block"
                  style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#374151' }}
                >
                  New Password
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
                    placeholder="Min 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="flex-1 bg-transparent border-none outline-none text-base"
                    style={{ color: textColor }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="p-1"
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }} />
                    ) : (
                      <Eye className="w-5 h-5" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }} />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label
                  className="text-sm font-medium mb-2 block"
                  style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#374151' }}
                >
                  Confirm New Password
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
                    type="password"
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="flex-1 bg-transparent border-none outline-none text-base"
                    style={{ color: textColor }}
                  />
                </div>
              </div>

              {/* Password strength indicator */}
              {password && (
                <div className="space-y-2">
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4].map((level) => {
                      const strength =
                        (password.length >= 6 ? 1 : 0) +
                        (/[A-Z]/.test(password) ? 1 : 0) +
                        (/[0-9]/.test(password) ? 1 : 0) +
                        (/[^A-Za-z0-9]/.test(password) ? 1 : 0);
                      const colors = ['#EF4444', '#F59E0B', '#008CE5', '#008CE5'];
                      return (
                        <div
                          key={level}
                          className="flex-1 h-1.5 rounded-full"
                          style={{
                            backgroundColor: level <= strength
                              ? colors[strength - 1]
                              : (isDark ? 'rgba(255,255,255,0.1)' : '#E8E4DE'),
                          }}
                        />
                      );
                    })}
                  </div>
                  <p className="text-xs" style={{ color: subColor }}>
                    Use uppercase, numbers, and symbols for a stronger password
                  </p>
                </div>
              )}

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={!password || !confirmPassword || loading}
                className="w-full bg-gradient-to-r from-[#008CE5] to-[#0070B8] rounded-2xl py-4 font-bold text-white text-lg shadow-lg shadow-[#008CE5]/30 disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-[#0A0F1E] border-t-transparent rounded-full animate-spin" />
                    Updating...
                  </>
                ) : (
                  'Reset Password'
                )}
              </motion.button>
            </form>
          </motion.div>
        )}
      </div>
    </div>
  );
}
