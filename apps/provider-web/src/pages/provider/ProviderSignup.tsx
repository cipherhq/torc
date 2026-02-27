import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, User, Mail, Phone, Lock, Building2, Eye, EyeOff, AlertCircle, UserCircle, Briefcase } from 'lucide-react';
import { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { getAuthCallbackUrl } from '../../lib/authRedirectUrl';

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
  const inputBg = isDark ? 'rgba(255,255,255,0.05)' : '#F5F9FF';
  const inputBorder = isDark ? 'rgba(255,255,255,0.1)' : '#D3E0F2';

  const inputFieldStyle = {
    color: textColor,
    border: 'none',
    boxShadow: 'none',
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
  };

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
          emailRedirectTo: getAuthCallbackUrl(),
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
      style={{ background: isDark ? 'linear-gradient(180deg, #14263D 0%, #0A1626 100%)' : 'linear-gradient(180deg, #FFFFFF 0%, #EAF3FF 100%)' }}
    >
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full"
          style={{ backgroundColor: '#008CE5', filter: 'blur(180px)', opacity: isDark ? 0.08 : 0.04 }}
        />
      </div>

      <div className="relative z-10 flex-1 flex flex-col px-6 pb-8 overflow-auto" style={{ paddingTop: 'var(--safe-top)' }}>
        {/* Header with back + steps */}
        <div className="flex items-center gap-4 mb-4">
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => step === 1 ? navigate('/login') : setStep(1)}
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}
          >
            <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
          </motion.button>
          <div className="flex-1 flex gap-2">
            {[1, 2].map(s => (
              <div key={s} className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#D3E0F2' }}>
                <div className="h-full rounded-full transition-all duration-500" style={{ width: step >= s ? '100%' : '0%', backgroundColor: '#008CE5' }} />
              </div>
            ))}
          </div>
        </div>

        {/* Logo + Title */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <img src="/logo.svg" alt="Torc" className="w-32 h-auto mx-auto object-contain mb-2" />
          <div className="inline-block px-3 py-1 rounded-full mb-2" style={{ backgroundColor: 'rgba(0,140,229,0.15)' }}>
            <span className="text-xs font-bold tracking-wider" style={{ color: '#008CE5' }}>PROVIDER SIGNUP</span>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: textColor }}>
            {step === 1 ? 'Personal Information' : 'Account Security'}
          </h1>
          <p className="mt-1" style={{ color: subColor }}>
            {step === 1 ? 'Tell us about yourself' : 'Set up your login credentials'}
          </p>
        </motion.div>

        {/* Form */}
        <motion.form
          onSubmit={handleSignup}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="flex-1 flex flex-col max-w-md mx-auto w-full"
        >
          {error && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl p-4 mb-5 flex items-center gap-3"
              style={{ backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#FEF2F2', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-red-500 text-sm">{error}</p>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4 mb-6">
              {/* Account Type */}
              <div>
                <label className="text-sm font-medium mb-2 block" style={{ color: labelColor }}>Account Type</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { type: 'individual' as const, icon: UserCircle, label: 'Individual', desc: 'Solo provider' },
                    { type: 'company' as const, icon: Briefcase, label: 'Company', desc: 'Business entity' },
                  ].map(({ type, icon: Icon, label, desc }) => (
                    <button key={type} type="button" onClick={() => setFormData({ ...formData, accountType: type })}
                      className="flex flex-col items-center gap-2 rounded-2xl px-4 py-4 transition-all"
                      style={{
                        backgroundColor: formData.accountType === type ? (isDark ? 'rgba(0,140,229,0.1)' : 'rgba(0,140,229,0.08)') : inputBg,
                        border: `2px solid ${formData.accountType === type ? '#008CE5' : inputBorder}`,
                      }}
                    >
                      <Icon className="w-8 h-8" style={{ color: formData.accountType === type ? '#008CE5' : subColor }} />
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
                  <label className="text-sm font-medium mb-2 block" style={{ color: labelColor }}>First Name</label>
                  <div className="flex items-center gap-3 rounded-2xl px-4 py-4"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}
                  >
                    <User className="w-5 h-5 flex-shrink-0" style={{ color: '#008CE5' }} />
                    <input type="text" value={formData.firstName} onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      placeholder="First" className="flex-1 bg-transparent border-none outline-none text-base" style={inputFieldStyle} />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block" style={{ color: labelColor }}>Last Name</label>
                  <div className="flex items-center gap-3 rounded-2xl px-4 py-4"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}
                  >
                    <User className="w-5 h-5 flex-shrink-0" style={{ color: '#008CE5' }} />
                    <input type="text" value={formData.lastName} onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      placeholder="Last" className="flex-1 bg-transparent border-none outline-none text-base" style={inputFieldStyle} />
                  </div>
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="text-sm font-medium mb-2 block" style={{ color: labelColor }}>Phone Number</label>
                <div className="flex items-center gap-3 rounded-2xl px-4 py-4"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}
                >
                  <Phone className="w-5 h-5 flex-shrink-0" style={{ color: '#008CE5' }} />
                  <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+1 (555) 000-0000" className="flex-1 bg-transparent border-none outline-none text-base" style={inputFieldStyle} />
                </div>
              </div>

              {/* Company Name */}
              {formData.accountType === 'company' && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                  <label className="text-sm font-medium mb-2 block" style={{ color: labelColor }}>Company Name</label>
                  <div className="flex items-center gap-3 rounded-2xl px-4 py-4"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}
                  >
                    <Building2 className="w-5 h-5 flex-shrink-0" style={{ color: '#008CE5' }} />
                    <input type="text" value={formData.companyName} onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                      placeholder="Your company name" className="flex-1 bg-transparent border-none outline-none text-base" style={inputFieldStyle} />
                  </div>
                </motion.div>
              )}

              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="button"
                onClick={() => { setError(''); setStep(2); }}
                disabled={!formData.firstName || !formData.lastName || !formData.phone}
                className="w-full bg-gradient-to-r from-[#008CE5] to-[#0070B8] rounded-2xl py-4 font-bold text-white text-lg shadow-lg shadow-[#008CE5]/30 mt-2 disabled:opacity-50"
              >
                Continue
              </motion.button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4 mb-6">
              {/* Email */}
              <div>
                <label className="text-sm font-medium mb-2 block" style={{ color: labelColor }}>Email Address</label>
                <div className="flex items-center gap-3 rounded-2xl px-4 py-4"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}
                >
                  <Mail className="w-5 h-5 flex-shrink-0" style={{ color: '#008CE5' }} />
                  <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="provider@example.com" required className="flex-1 bg-transparent border-none outline-none text-base" style={inputFieldStyle} />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="text-sm font-medium mb-2 block" style={{ color: labelColor }}>Password</label>
                <div className="flex items-center gap-3 rounded-2xl px-4 py-4"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}
                >
                  <Lock className="w-5 h-5 flex-shrink-0" style={{ color: '#008CE5' }} />
                  <input type={showPassword ? 'text' : 'password'} value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Min 6 characters" required className="flex-1 bg-transparent border-none outline-none text-base" style={inputFieldStyle} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="p-1">
                    {showPassword
                      ? <EyeOff className="w-5 h-5" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }} />
                      : <Eye className="w-5 h-5" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }} />
                    }
                  </button>
                </div>
              </div>

              {/* Confirm */}
              <div>
                <label className="text-sm font-medium mb-2 block" style={{ color: labelColor }}>Confirm Password</label>
                <div className="flex items-center gap-3 rounded-2xl px-4 py-4"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}
                >
                  <Lock className="w-5 h-5 flex-shrink-0" style={{ color: '#008CE5' }} />
                  <input type="password" value={formData.confirmPassword} onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    placeholder="Confirm password" required className="flex-1 bg-transparent border-none outline-none text-base" style={inputFieldStyle} />
                </div>
              </div>

              <p className="text-xs text-center" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }}>
                By signing up, you agree to Torc's{' '}
                <a href="https://www.torcapp.com/terms" target="_blank" rel="noreferrer" style={{ color: '#008CE5' }}>
                  Provider Agreement
                </a>,{' '}
                <a href="https://www.torcapp.com/terms" target="_blank" rel="noreferrer" style={{ color: '#008CE5' }}>
                  Terms
                </a>{' '}
                and{' '}
                <a href="https://www.torcapp.com/privacy" target="_blank" rel="noreferrer" style={{ color: '#008CE5' }}>
                  Privacy Policy
                </a>.
              </p>

              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit"
                disabled={loading || !formData.email || !formData.password}
                className="w-full bg-gradient-to-r from-[#008CE5] to-[#0070B8] rounded-2xl py-4 font-bold text-white text-lg shadow-lg shadow-[#008CE5]/30 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (<><div className="w-5 h-5 border-2 border-[#0A1626] border-t-transparent rounded-full animate-spin" />Creating Account...</>) : 'Create Provider Account'}
              </motion.button>
            </motion.div>
          )}

          <div className="text-center mt-4 pb-4">
            <p style={{ color: subColor }}>
              Already have an account?{' '}
              <button type="button" onClick={() => navigate('/login')} className="font-bold" style={{ color: '#008CE5' }}>Sign In</button>
            </p>
          </div>
        </motion.form>
      </div>
    </div>
  );
}
