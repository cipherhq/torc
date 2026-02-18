import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, User, Mail, Phone, Lock, Building2, Eye, EyeOff, AlertCircle, UserCircle, Briefcase } from 'lucide-react';
import { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';

function IconBadge({ children, color = '#2EFFAF' }: { children: React.ReactNode; color?: string }) {
  return (
    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${color}15` }}>
      {children}
    </div>
  );
}

export function ProviderSignup() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const [step, setStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    companyName: '',
    accountType: 'individual' as 'individual' | 'company',
  });

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
            role: 'provider',
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
          role: 'provider',
        }, { onConflict: 'id' });
      }

      localStorage.setItem('pendingVerificationEmail', email);
      navigate('/verify-email');
    } catch (err: any) {
      setError(err.message || 'Failed to create account.');
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
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => step === 1 ? navigate('/login') : setStep(1)}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}
        >
          <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
        </motion.button>
        <div className="flex-1 flex gap-2 px-4">
          {[1, 2].map(s => (
            <div key={s} className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB' }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: step >= s ? '100%' : '0%', backgroundColor: '#2EFFAF' }} />
            </div>
          ))}
        </div>
      </div>

      <div className="relative z-10 flex-1 px-6 pb-8 overflow-auto">
        {/* Logo */}
        <motion.div initial={{ opacity: 0, y: -15 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-6">
          <div className={`inline-block ${isDark ? 'bg-white/95 rounded-2xl p-2' : ''}`}>
            <img src="/logo.png" alt="Torc" className="w-20 h-20 mx-auto object-contain" />
          </div>
          <div className="inline-block px-3 py-1 rounded-full mb-3" style={{ backgroundColor: 'rgba(46,255,175,0.15)' }}>
            <span className="text-xs font-bold tracking-wider" style={{ color: '#2EFFAF' }}>PROVIDER SIGNUP</span>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: textColor }}>
            {step === 1 ? 'Personal Information' : 'Account Security'}
          </h1>
          <p className="mt-1 text-sm" style={{ color: subColor }}>
            {step === 1 ? 'Tell us about yourself' : 'Set up your login credentials'}
          </p>
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
          {step === 1 && (
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-5">
              {/* Account Type */}
              <div>
                <label className="text-sm font-medium mb-2.5 block" style={{ color: labelColor }}>Account Type</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { type: 'individual' as const, icon: UserCircle, label: 'Individual', desc: 'Solo provider' },
                    { type: 'company' as const, icon: Briefcase, label: 'Company', desc: 'Business entity' },
                  ].map(({ type, icon: Icon, label, desc }) => (
                    <button key={type} type="button" onClick={() => setFormData({ ...formData, accountType: type })}
                      className="flex flex-col items-center gap-2 rounded-2xl px-4 py-4 transition-all"
                      style={{
                        backgroundColor: formData.accountType === type
                          ? (isDark ? 'rgba(46,255,175,0.1)' : 'rgba(46,255,175,0.08)')
                          : inputBg,
                        border: `2px solid ${formData.accountType === type ? '#2EFFAF' : inputBorder}`,
                      }}
                    >
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                        style={{
                          backgroundColor: formData.accountType === type ? 'rgba(46,255,175,0.2)' : (isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6'),
                        }}
                      >
                        <Icon className="w-6 h-6" style={{ color: formData.accountType === type ? '#2EFFAF' : subColor }} />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold" style={{ color: textColor }}>{label}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: subColor }}>{desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Names */}
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

              {/* Phone */}
              <div>
                <label className="text-sm font-medium mb-1.5 block" style={{ color: labelColor }}>Phone Number</label>
                <div className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#2EFFAF]/50" style={inputStyle}>
                  <IconBadge color="#007AFF"><Phone className="w-4 h-4" style={{ color: '#007AFF' }} /></IconBadge>
                  <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+1 (555) 000-0000" className="flex-1 bg-transparent border-none outline-none text-sm" style={{ color: textColor }} />
                </div>
              </div>

              {/* Company Name */}
              {formData.accountType === 'company' && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                  <label className="text-sm font-medium mb-1.5 block" style={{ color: labelColor }}>Company Name</label>
                  <div className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#2EFFAF]/50" style={inputStyle}>
                    <IconBadge color="#F59E0B"><Building2 className="w-4 h-4" style={{ color: '#F59E0B' }} /></IconBadge>
                    <input type="text" value={formData.companyName} onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                      placeholder="Your company name" className="flex-1 bg-transparent border-none outline-none text-sm" style={{ color: textColor }} />
                  </div>
                </motion.div>
              )}

              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="button"
                onClick={() => { setError(''); setStep(2); }}
                disabled={!formData.firstName || !formData.lastName || !formData.phone}
                className="w-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-2xl py-4 font-bold text-[#0F1419] text-lg shadow-lg shadow-[#2EFFAF]/20 mt-2 disabled:opacity-50"
              >
                Continue
              </motion.button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-5">
              {/* Email */}
              <div>
                <label className="text-sm font-medium mb-1.5 block" style={{ color: labelColor }}>Email Address</label>
                <div className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#2EFFAF]/50" style={inputStyle}>
                  <IconBadge color="#007AFF"><Mail className="w-4 h-4" style={{ color: '#007AFF' }} /></IconBadge>
                  <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="provider@example.com" required className="flex-1 bg-transparent border-none outline-none text-sm" style={{ color: textColor }} />
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

              {/* Confirm */}
              <div>
                <label className="text-sm font-medium mb-1.5 block" style={{ color: labelColor }}>Confirm Password</label>
                <div className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#2EFFAF]/50" style={inputStyle}>
                  <IconBadge color="#F59E0B"><Lock className="w-4 h-4" style={{ color: '#F59E0B' }} /></IconBadge>
                  <input type="password" value={formData.confirmPassword} onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    placeholder="Confirm password" required className="flex-1 bg-transparent border-none outline-none text-sm" style={{ color: textColor }} />
                </div>
              </div>

              <p className="text-xs text-center" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }}>
                By signing up, you agree to Torc's <span style={{ color: '#2EFFAF' }}>Provider Agreement</span>, <span style={{ color: '#2EFFAF' }}>Terms</span> and <span style={{ color: '#2EFFAF' }}>Privacy Policy</span>.
              </p>

              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit"
                disabled={loading || !formData.email || !formData.password}
                className="w-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-2xl py-4 font-bold text-[#0F1419] text-lg shadow-lg shadow-[#2EFFAF]/20 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (<><div className="w-5 h-5 border-2 border-[#0F1419] border-t-transparent rounded-full animate-spin" />Creating Account...</>) : 'Create Provider Account'}
              </motion.button>
            </motion.div>
          )}

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
