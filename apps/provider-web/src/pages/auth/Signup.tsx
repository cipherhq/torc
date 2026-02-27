import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, User, Mail, Phone, Lock, AlertCircle } from 'lucide-react';
import { useState } from 'react';

export function Signup() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState('');

  const handleSignup = () => {
    if (!acceptedTerms) {
      setError('Please accept the Terms and Privacy Policy to continue.');
      return;
    }
    setError('');
    // Navigate to permissions after signup
    navigate('/permissions');
  };

  return (
    <div className="min-h-screen bg-[#1B2F4A] flex flex-col relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-[#008CE5] opacity-10 blur-[120px] rounded-full" />
        <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-[#0070B8] opacity-10 blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <div className="relative z-10 p-6 flex items-center gap-4">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate('/login')}
          className="glass rounded-full p-3"
        >
          <ArrowLeft className="w-6 h-6 text-white" />
        </motion.button>
        <h1 className="text-2xl font-bold text-white">Create Account</h1>
      </div>

      <div className="relative z-10 flex-1 px-6 pb-6 overflow-auto">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h2 className="text-4xl font-bold text-white mb-3">Join TORC</h2>
          <p className="text-white/60 text-lg">
            Get help when you need it most
          </p>
        </motion.div>

        {/* Form fields */}
        <div className="space-y-4">
          {error && (
            <div className="glass rounded-[20px] p-4 flex items-center gap-2 text-red-300 text-sm">
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-white/80 text-sm mb-2 block">First Name</label>
              <div className="glass rounded-[24px] px-5 py-4 flex items-center gap-3">
                <User className="w-5 h-5 text-[#008CE5]" />
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  placeholder="John"
                  className="flex-1 bg-transparent border-none text-white placeholder-white/40 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="text-white/80 text-sm mb-2 block">Last Name</label>
              <div className="glass rounded-[24px] px-5 py-4">
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  placeholder="Doe"
                  className="w-full bg-transparent border-none text-white placeholder-white/40 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-white/80 text-sm mb-2 block">Email</label>
            <div className="glass rounded-[24px] px-5 py-4 flex items-center gap-3">
              <Mail className="w-5 h-5 text-[#008CE5]" />
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="you@example.com"
                className="flex-1 bg-transparent border-none text-white placeholder-white/40 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-white/80 text-sm mb-2 block">Phone</label>
            <div className="glass rounded-[24px] px-5 py-4 flex items-center gap-3">
              <Phone className="w-5 h-5 text-[#008CE5]" />
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+1 (555) 123-4567"
                className="flex-1 bg-transparent border-none text-white placeholder-white/40 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-white/80 text-sm mb-2 block">Password</label>
            <div className="glass rounded-[24px] px-5 py-4 flex items-center gap-3">
              <Lock className="w-5 h-5 text-[#008CE5]" />
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Create a password"
                className="flex-1 bg-transparent border-none text-white placeholder-white/40 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-white/80 text-sm mb-2 block">Confirm Password</label>
            <div className="glass rounded-[24px] px-5 py-4 flex items-center gap-3">
              <Lock className="w-5 h-5 text-[#008CE5]" />
              <input
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                placeholder="Confirm your password"
                className="flex-1 bg-transparent border-none text-white placeholder-white/40 focus:outline-none"
              />
            </div>
          </div>

          <div className="glass rounded-[20px] p-4 mt-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-1 h-4 w-4 accent-[#008CE5]"
              />
              <p className="text-white/60 text-xs leading-relaxed">
                I agree to TORC&apos;s{' '}
                <a href="https://www.torcapp.com/terms?role=provider" target="_blank" rel="noreferrer" className="text-[#008CE5]">
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href="https://www.torcapp.com/privacy" target="_blank" rel="noreferrer" className="text-[#008CE5]">
                  Privacy Policy
                </a>.
              </p>
            </label>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSignup}
            disabled={!acceptedTerms}
            className="w-full bg-gradient-to-r from-[#008CE5] to-[#0070B8] rounded-[32px] py-5 font-bold text-white text-lg shadow-lg shadow-[#008CE5]/30 mt-6 disabled:opacity-50"
          >
            Create Account
          </motion.button>

          <div className="text-center mt-4">
            <p className="text-white/60 text-sm">
              Already have an account?{' '}
              <button
                onClick={() => navigate('/login')}
                className="text-[#008CE5] font-semibold"
              >
                Log In
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
