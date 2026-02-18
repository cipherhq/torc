import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { Mail, Lock, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

export function ProviderLogin() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const { isDark } = useTheme();
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
      setError(err.message || 'Failed to sign in.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F9FAFB',
    border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB'}`,
    color: isDark ? '#FFFFFF' : '#1F2937',
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
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full"
          style={{ backgroundColor: '#2EFFAF', filter: 'blur(180px)', opacity: isDark ? 0.08 : 0.04 }}
        />
      </div>

      <div className="relative z-10 flex-1 flex flex-col px-6 pt-12 pb-8">
        {/* Logo */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <div className={`inline-block ${isDark ? 'bg-white/95 rounded-2xl p-3' : ''}`}>
            <img src="/logo.png" alt="Torc" className="w-36 h-36 mx-auto object-contain" />
          </div>
          <div className="inline-block px-4 py-1 rounded-full mb-4" style={{ backgroundColor: 'rgba(46,255,175,0.15)' }}>
            <span className="text-sm font-bold" style={{ color: '#2EFFAF' }}>PROVIDER</span>
          </div>
          <h1 className="text-3xl font-bold" style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }}>Welcome Back</h1>
          <p className="mt-2" style={{ color: isDark ? 'rgba(255,255,255,0.5)' : '#6B7280' }}>Sign in to start earning</p>
        </motion.div>

        <motion.form onSubmit={handleLogin} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="flex-1 flex flex-col max-w-md mx-auto w-full">
          {error && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl p-4 mb-5 flex items-center gap-3" style={{ backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#FEF2F2', border: '1px solid rgba(239,68,68,0.2)' }}>
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-red-500 text-sm">{error}</p>
            </motion.div>
          )}

          <div className="space-y-4 mb-6">
            <div>
              <label className="text-sm font-medium mb-2 block" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#374151' }}>Email Address</label>
              <div className="flex items-center gap-3 rounded-2xl px-4 py-4 focus-within:ring-2 focus-within:ring-[#2EFFAF]/50" style={inputStyle}>
                <Mail className="w-5 h-5 flex-shrink-0" style={{ color: '#2EFFAF' }} />
                <input type="email" placeholder="provider@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="flex-1 bg-transparent border-none outline-none text-base" style={{ color: isDark ? '#FFFFFF' : '#1F2937' }} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#374151' }}>Password</label>
              <div className="flex items-center gap-3 rounded-2xl px-4 py-4 focus-within:ring-2 focus-within:ring-[#2EFFAF]/50" style={inputStyle}>
                <Lock className="w-5 h-5 flex-shrink-0" style={{ color: '#2EFFAF' }} />
                <input type={showPassword ? 'text' : 'password'} placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} required className="flex-1 bg-transparent border-none outline-none text-base" style={{ color: isDark ? '#FFFFFF' : '#1F2937' }} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="p-1">
                  {showPassword ? <EyeOff className="w-5 h-5" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }} /> : <Eye className="w-5 h-5" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }} />}
                </button>
              </div>
            </div>
          </div>

          <div className="text-right mb-6">
            <button type="button" onClick={() => navigate('/forgot-password')} className="text-sm font-semibold" style={{ color: '#2EFFAF' }}>Forgot Password?</button>
          </div>

          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" disabled={!email || !password || loading} className="w-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-2xl py-4 font-bold text-[#0F1419] text-lg shadow-lg shadow-[#2EFFAF]/30 disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? (<><div className="w-5 h-5 border-2 border-[#0A0F1E] border-t-transparent rounded-full animate-spin" />Signing In...</>) : 'Sign In'}
          </motion.button>

          <div className="text-center mt-8">
            <p style={{ color: isDark ? 'rgba(255,255,255,0.5)' : '#6B7280' }}>
              Don't have an account?{' '}
              <button type="button" onClick={() => navigate('/signup')} className="font-bold" style={{ color: '#2EFFAF' }}>
                Become a Provider
              </button>
            </p>
          </div>
        </motion.form>
      </div>
    </div>
  );
}
