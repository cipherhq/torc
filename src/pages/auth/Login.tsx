import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { useState } from 'react';
import { ArrowLeft, Smartphone, Mail } from 'lucide-react';

export function Login() {
  const navigate = useNavigate();
  const [method, setMethod] = useState<'phone' | 'email'>('phone');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'input' | 'verify'>('input');

  const handleSendCode = () => {
    setStep('verify');
  };

  const handleVerify = () => {
    navigate('/permissions');
  };

  return (
    <div className="min-h-screen bg-[#0A0F1E] flex flex-col p-6 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-[#2EFFAF] opacity-10 blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <div className="relative z-10 flex items-center gap-4 mb-8">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate('/role-selection')}
          className="glass rounded-full p-3"
        >
          <ArrowLeft className="w-6 h-6 text-white" />
        </motion.button>
        <h1 className="text-2xl font-bold text-white">Sign In</h1>
      </div>

      <div className="relative z-10 flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
        {step === 'input' ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {/* Method toggle */}
            <div className="glass rounded-[32px] p-2 flex mb-8">
              <button
                onClick={() => setMethod('phone')}
                className={`flex-1 py-3 rounded-[24px] font-semibold transition-all ${
                  method === 'phone'
                    ? 'bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0A0F1E]'
                    : 'text-white/60'
                }`}
              >
                Phone
              </button>
              <button
                onClick={() => setMethod('email')}
                className={`flex-1 py-3 rounded-[24px] font-semibold transition-all ${
                  method === 'email'
                    ? 'bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0A0F1E]'
                    : 'text-white/60'
                }`}
              >
                Email
              </button>
            </div>

            {method === 'phone' ? (
              <div className="glass rounded-[32px] p-8 mb-6">
                <div className="flex items-center gap-3 mb-4">
                  <Smartphone className="w-6 h-6 text-[#2EFFAF]" />
                  <h2 className="text-white font-semibold text-lg">Phone Number</h2>
                </div>
                <input
                  type="tel"
                  placeholder="+1 (555) 123-4567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-4 text-white text-lg placeholder-white/40 focus:outline-none focus:border-[#2EFFAF] transition-colors"
                />
                <p className="text-white/40 text-sm mt-3">
                  We'll send you a verification code
                </p>
              </div>
            ) : (
              <div className="glass rounded-[32px] p-8 mb-6">
                <div className="flex items-center gap-3 mb-4">
                  <Mail className="w-6 h-6 text-[#2EFFAF]" />
                  <h2 className="text-white font-semibold text-lg">Email Address</h2>
                </div>
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-4 text-white text-lg placeholder-white/40 focus:outline-none focus:border-[#2EFFAF] transition-colors"
                />
                <p className="text-white/40 text-sm mt-3">
                  Optional: Use email instead of phone
                </p>
              </div>
            )}

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSendCode}
              disabled={method === 'phone' ? !phone : !email}
              className="w-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-[32px] py-5 font-bold text-[#0A0F1E] text-lg shadow-lg shadow-[#2EFFAF]/30 disabled:opacity-50"
            >
              Send Code
            </motion.button>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="glass rounded-[32px] p-8 mb-6">
              <h2 className="text-white font-semibold text-lg mb-4">
                Enter Verification Code
              </h2>
              <p className="text-white/60 text-sm mb-6">
                Sent to {method === 'phone' ? phone : email}
              </p>
              <input
                type="text"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={6}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-4 text-white text-center text-3xl font-bold tracking-widest placeholder-white/40 focus:outline-none focus:border-[#2EFFAF] transition-colors"
              />
              <button
                onClick={() => setStep('input')}
                className="text-[#2EFFAF] text-sm mt-4 hover:underline"
              >
                Resend code
              </button>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleVerify}
              disabled={code.length !== 6}
              className="w-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-[32px] py-5 font-bold text-[#0A0F1E] text-lg shadow-lg shadow-[#2EFFAF]/30 disabled:opacity-50"
            >
              Verify & Continue
            </motion.button>
          </motion.div>
        )}

        <div className="text-center mt-8">
          <p className="text-white/60">
            Don't have an account?{' '}
            <button
              onClick={() => navigate('/signup')}
              className="text-[#2EFFAF] font-semibold"
            >
              Sign Up
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}