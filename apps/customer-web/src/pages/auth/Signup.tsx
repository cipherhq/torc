import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, User, Mail, Phone, Lock, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

function IconBadge({ children, color = '#2EFFAF' }: { children: React.ReactNode; color?: string }) {
  return (
    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${color}15` }}>
      {children}
    </div>
  );
}

export function Signup() {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const { isDark } = useTheme();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const textColor = isDark ? '#FFFFFF' : '#1F2937';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const labelColor = isDark ? 'rgba(255,255,255,0.7)' : '#374151';
  const inputBg = isDark ? 'rgba(255,255,255,0.05)' : '#F9FAFB';
  const inputBorder = isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB';
  const inputStyle = { backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textColor };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const email = String(formData.email).trim();
    const password = String(formData.password);
    const confirmPassword = String(formData.confirmPassword);

    if (!email || !password) { setError('Email and password are required'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }

    setLoading(true);
    try {
      const { supabase } = await import('../../lib/supabase');
      const phone = String(formData.phone).trim();
      const phoneFormatted = phone && !phone.startsWith('+') ? `+1${phone.replace(/\D/g, '')}` : phone;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: String(formData.firstName).trim(),
            last_name: String(formData.lastName).trim(),
            full_name: `${String(formData.firstName).trim()} ${String(formData.lastName).trim()}`.trim(),
            phone: phoneFormatted,
            role: 'customer',
          },
        },
      });
      if (error) throw error;

      if (data.user) {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          email: email,
          first_name: String(formData.firstName).trim(),
          last_name: String(formData.lastName).trim(),
          full_name: `${String(formData.firstName).trim()} ${String(formData.lastName).trim()}`.trim(),
          phone: phoneFormatted,
          role: 'customer',
        }, { onConflict: 'id' });
      }

      localStorage.setItem('pendingVerificationEmail', email);
      navigate('/verify-email');
    } catch (err: any) {
      setError(err.message || 'Failed to create account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden"
      style={{ background: isDark ? 'linear-gradient(180deg, #1A1F2E 0%, #0F1419 100%)' : 'linear-gradient(180deg, #FFFFFF 0%, #F0F4F8 100%)' }}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-1/4 w-[400px] h-[400px] rounded-full" style={{ backgroundColor: '#2EFFAF', filter: 'blur(160px)', opacity: isDark ? 0.06 : 0.03 }} />
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] rounded-full" style={{ backgroundColor: '#007AFF', filter: 'blur(160px)', opacity: isDark ? 0.06 : 0.03 }} />
      </div>

      {/* Header */}
      <div className="relative z-10 p-6 flex items-center gap-4">
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate('/login')}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}
        >
          <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
        </motion.button>
      </div>

      <div className="relative z-10 flex-1 px-6 pb-8 overflow-auto">
        {/* Logo + Title */}
        <motion.div initial={{ opacity: 0, y: -15 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-7">
          <div className={`inline-block ${isDark ? 'bg-white/95 rounded-2xl p-2' : ''}`}>
            <img src="/logo.png" alt="Torc" className="w-24 h-24 mx-auto object-contain" />
          </div>
          <h1 className="text-3xl font-bold" style={{ color: textColor }}>Create Account</h1>
          <p className="mt-1" style={{ color: subColor }}>Get roadside help when you need it</p>
        </motion.div>

        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl p-4 mb-4 flex items-center gap-3 max-w-md mx-auto"
            style={{ backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#FEF2F2', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-red-500 text-sm">{error}</p>
          </motion.div>
        )}

        <form onSubmit={handleSignup} className="max-w-md mx-auto w-full">
          <div className="space-y-4">
            {/* Name row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block" style={{ color: labelColor }}>First Name</label>
                <div className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#2EFFAF]/50" style={inputStyle}>
                  <IconBadge><User className="w-4 h-4" style={{ color: '#2EFFAF' }} /></IconBadge>
                  <input type="text" value={formData.firstName} onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    placeholder="First" className="flex-1 bg-transparent border-none outline-none text-sm" style={{ color: textColor }} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block" style={{ color: labelColor }}>Last Name</label>
                <div className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#2EFFAF]/50" style={inputStyle}>
                  <IconBadge><User className="w-4 h-4" style={{ color: '#2EFFAF' }} /></IconBadge>
                  <input type="text" value={formData.lastName} onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    placeholder="Last" className="flex-1 bg-transparent border-none outline-none text-sm" style={{ color: textColor }} />
                </div>
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="text-sm font-medium mb-1.5 block" style={{ color: labelColor }}>Email</label>
              <div className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#2EFFAF]/50" style={inputStyle}>
                <IconBadge color="#007AFF"><Mail className="w-4 h-4" style={{ color: '#007AFF' }} /></IconBadge>
                <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="you@example.com" required className="flex-1 bg-transparent border-none outline-none text-sm" style={{ color: textColor }} />
              </div>
            </div>

            {/* Phone */}
            <div>
              <label className="text-sm font-medium mb-1.5 block" style={{ color: labelColor }}>Phone</label>
              <div className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#2EFFAF]/50" style={inputStyle}>
                <IconBadge color="#007AFF"><Phone className="w-4 h-4" style={{ color: '#007AFF' }} /></IconBadge>
                <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+1 (555) 000-0000" className="flex-1 bg-transparent border-none outline-none text-sm" style={{ color: textColor }} />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="text-sm font-medium mb-1.5 block" style={{ color: labelColor }}>Password</label>
              <div className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#2EFFAF]/50" style={inputStyle}>
                <IconBadge color="#F59E0B"><Lock className="w-4 h-4" style={{ color: '#F59E0B' }} /></IconBadge>
                <input type={showPassword ? 'text' : 'password'} value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Min 6 characters" required className="flex-1 bg-transparent border-none outline-none text-sm" style={{ color: textColor }} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="p-1 rounded-lg" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6' }}>
                  {showPassword ? <EyeOff className="w-4 h-4" style={{ color: subColor }} /> : <Eye className="w-4 h-4" style={{ color: subColor }} />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="text-sm font-medium mb-1.5 block" style={{ color: labelColor }}>Confirm Password</label>
              <div className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#2EFFAF]/50" style={inputStyle}>
                <IconBadge color="#F59E0B"><Lock className="w-4 h-4" style={{ color: '#F59E0B' }} /></IconBadge>
                <input type="password" value={formData.confirmPassword} onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  placeholder="Confirm password" required className="flex-1 bg-transparent border-none outline-none text-sm" style={{ color: textColor }} />
              </div>
            </div>
          </div>

          <p className="text-xs mt-5 text-center" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }}>
            By signing up, you agree to Torc's{' '}
            <span style={{ color: '#2EFFAF' }}>Terms of Service</span> and{' '}
            <span style={{ color: '#2EFFAF' }}>Privacy Policy</span>.
          </p>

          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit"
            disabled={loading || !formData.email || !formData.password}
            className="w-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-2xl py-4 font-bold text-[#0F1419] text-lg shadow-lg shadow-[#2EFFAF]/20 mt-6 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (<><div className="w-5 h-5 border-2 border-[#0F1419] border-t-transparent rounded-full animate-spin" />Creating Account...</>) : 'Create Account'}
          </motion.button>

          <div className="text-center mt-6 pb-4">
            <p style={{ color: subColor }}>
              Already have an account?{' '}
              <button type="button" onClick={() => navigate('/login')} className="font-bold" style={{ color: '#2EFFAF' }}>Sign In</button>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
