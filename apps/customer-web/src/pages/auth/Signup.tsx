import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { User, Mail, Phone, Lock, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { getAuthCallbackUrl } from '../../lib/authRedirectUrl';

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
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [termsVersion, setTermsVersion] = useState('v1.0.0');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    import('../../lib/supabase')
      .then(async ({ supabase }) => {
        const { data } = await supabase
          .from('platform_settings')
          .select('value')
          .eq('key', 'terms_version')
          .maybeSingle();
        if (active && data?.value) {
          setTermsVersion(String(data.value));
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  const textColor = isDark ? '#FFFFFF' : '#1F2937';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const labelColor = isDark ? 'rgba(255,255,255,0.7)' : '#374151';
  const inputBg = isDark ? 'rgba(255,255,255,0.05)' : '#F5F9FF';
  const inputBorder = isDark ? 'rgba(255,255,255,0.1)' : '#D3E0F2';

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const email = String(formData.email).trim();
    const password = String(formData.password);
    const confirmPassword = String(formData.confirmPassword);

    if (!email || !password) { setError('Email and password are required'); return; }
    if (!String(formData.phone).trim()) { setError('Phone number is required'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (!acceptedTerms) { setError('Please accept the Terms and Privacy Policy to continue.'); return; }

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
            role: 'customer',
            accepted_terms: true,
            terms_version: termsVersion,
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
          terms_accepted_at: new Date().toISOString(),
          terms_version: termsVersion,
        }, { onConflict: 'id' });
      }

      // Send welcome email (fire-and-forget)
      import('../../services/email.service').then(({ sendWelcomeEmail }) => {
        sendWelcomeEmail(email, String(formData.firstName).trim() || 'there');
      });

      localStorage.setItem('pendingVerificationEmail', email);
      navigate('/verify-email');
    } catch (err: any) {
      setError(err.message || 'Failed to create account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputFieldStyle = {
    color: textColor,
    border: 'none',
    boxShadow: 'none',
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
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

      <PageHeader title="Create Account" onBack={() => navigate('/login')} />

      <div className="relative z-10 flex-1 flex flex-col px-6 pb-8 overflow-auto" style={{ paddingTop: 'calc(var(--safe-top) + 64px)' }}>
        {/* Logo + Title */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <img src="/logo.svg" alt="Torc" className="w-32 h-auto mx-auto object-contain mb-2" />
          <p className="mt-2" style={{ color: subColor }}>Get roadside help when you need it</p>
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

          <div className="space-y-4 mb-6">
            {/* Name row */}
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

            {/* Email */}
            <div>
              <label className="text-sm font-medium mb-2 block" style={{ color: labelColor }}>Email Address</label>
              <div className="flex items-center gap-3 rounded-2xl px-4 py-4"
                style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}
              >
                <Mail className="w-5 h-5 flex-shrink-0" style={{ color: '#008CE5' }} />
                <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="you@example.com" required className="flex-1 bg-transparent border-none outline-none text-base" style={inputFieldStyle} />
              </div>
            </div>

            {/* Phone */}
            <div>
              <label className="text-sm font-medium mb-2 block" style={{ color: labelColor }}>Phone Number <span className="text-red-500">*</span></label>
              <div className="flex items-center gap-3 rounded-2xl px-4 py-4"
                style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}
              >
                <Phone className="w-5 h-5 flex-shrink-0" style={{ color: '#008CE5' }} />
                <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+1 (555) 000-0000" required className="flex-1 bg-transparent border-none outline-none text-base" style={inputFieldStyle} />
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

            {/* Confirm Password */}
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
          </div>

          <div className="mb-6">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-1 h-4 w-4 accent-[#008CE5]"
              />
              <span className="text-xs" style={{ color: isDark ? 'rgba(255,255,255,0.55)' : '#6B7280' }}>
                I agree to TORC&apos;s{' '}
                <a href="https://www.torcapp.com/terms" target="_blank" rel="noreferrer" style={{ color: '#008CE5' }}>
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href="https://www.torcapp.com/privacy" target="_blank" rel="noreferrer" style={{ color: '#008CE5' }}>
                  Privacy Policy
                </a>.
              </span>
            </label>
          </div>

          {/* Submit */}
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit"
            disabled={loading || !formData.email || !formData.phone.trim() || !formData.password || !acceptedTerms}
            className="w-full bg-gradient-to-r from-[#008CE5] to-[#0070B8] rounded-2xl py-4 font-bold text-white text-lg shadow-lg shadow-[#008CE5]/30 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (<><div className="w-5 h-5 border-2 border-[#0A1626] border-t-transparent rounded-full animate-spin" />Creating Account...</>) : 'Create Account'}
          </motion.button>

          {/* Sign in link */}
          <div className="text-center mt-8 pb-4">
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
