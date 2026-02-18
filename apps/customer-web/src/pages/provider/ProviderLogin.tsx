import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Phone, Mail, Lock } from 'lucide-react';
import { useState } from 'react';

export function ProviderLogin() {
  const navigate = useNavigate();
  const [loginMethod, setLoginMethod] = useState<'phone' | 'email'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = () => {
    // Navigate to provider home (simulated login)
    navigate('/provider/home');
  };

  return (
    <div className="min-h-screen bg-[#1A1F2E] flex flex-col relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-[#2EFFAF] opacity-10 blur-[120px] rounded-full" />
        <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-[#007AFF] opacity-10 blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <div className="relative z-10 p-6 flex items-center gap-4">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate('/role-selection')}
          className="glass rounded-full p-3"
        >
          <ArrowLeft className="w-6 h-6 text-white" />
        </motion.button>
        <h1 className="text-2xl font-bold text-white">Provider Login</h1>
      </div>

      <div className="relative z-10 flex-1 px-6 pb-6 flex flex-col justify-center">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h2 className="text-4xl font-bold text-white mb-3">Welcome Back</h2>
          <p className="text-white/60 text-lg">
            Log in to start earning with TORC
          </p>
        </motion.div>

        {/* Login method toggle */}
        <div className="glass rounded-[32px] p-2 mb-6 flex">
          <button
            onClick={() => setLoginMethod('phone')}
            className={`flex-1 py-3 rounded-[24px] font-semibold transition-all ${
              loginMethod === 'phone'
                ? 'bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0F1419]'
                : 'text-white/60'
            }`}
          >
            Phone
          </button>
          <button
            onClick={() => setLoginMethod('email')}
            className={`flex-1 py-3 rounded-[24px] font-semibold transition-all ${
              loginMethod === 'email'
                ? 'bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0F1419]'
                : 'text-white/60'
            }`}
          >
            Email
          </button>
        </div>

        {/* Login form */}
        <div className="space-y-4">
          {loginMethod === 'phone' ? (
            <div>
              <label className="text-white/80 text-sm mb-2 block">Phone Number</label>
              <div className="glass rounded-[24px] px-5 py-4 flex items-center gap-3">
                <Phone className="w-5 h-5 text-[#2EFFAF]" />
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+1 (555) 123-4567"
                  className="flex-1 bg-transparent border-none text-white placeholder-white/40 focus:outline-none"
                />
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="text-white/80 text-sm mb-2 block">Email</label>
                <div className="glass rounded-[24px] px-5 py-4 flex items-center gap-3">
                  <Mail className="w-5 h-5 text-[#2EFFAF]" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="provider@example.com"
                    className="flex-1 bg-transparent border-none text-white placeholder-white/40 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-white/80 text-sm mb-2 block">Password</label>
                <div className="glass rounded-[24px] px-5 py-4 flex items-center gap-3">
                  <Lock className="w-5 h-5 text-[#2EFFAF]" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="flex-1 bg-transparent border-none text-white placeholder-white/40 focus:outline-none"
                  />
                </div>
              </div>
            </>
          )}

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleLogin}
            className="w-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-[32px] py-5 font-bold text-[#0F1419] text-lg shadow-lg shadow-[#2EFFAF]/30 mt-6"
          >
            {loginMethod === 'phone' ? 'Send Code' : 'Log In'}
          </motion.button>

          <div className="text-center mt-4">
            <button className="text-[#2EFFAF] text-sm font-semibold">
              Forgot Password?
            </button>
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-white/60 text-sm mb-3">Don't have an account?</p>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/provider/signup')}
            className="glass rounded-[32px] px-8 py-4 font-semibold text-white"
          >
            Sign Up as Provider
          </motion.button>
        </div>
      </div>
    </div>
  );
}
