import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export function VerificationPending() {
  const navigate = useNavigate();
  const { isDark } = useTheme();

  const steps = [
    { name: 'Account Created', status: 'completed' },
    { name: 'Documents Uploaded', status: 'completed' },
    { name: 'Background Check', status: 'pending' },
    { name: 'Final Approval', status: 'pending' },
  ];

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden"
      style={{
        background: isDark
          ? 'linear-gradient(180deg, #1A1F2E 0%, #0F1419 100%)'
          : 'linear-gradient(180deg, #FFFFFF 0%, #F0F4F8 100%)',
      }}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] rounded-full" style={{ backgroundColor: '#2EFFAF', filter: 'blur(160px)', opacity: isDark ? 0.06 : 0.03 }} />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo + status */}
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-center mb-8">
          <div className={`inline-block ${isDark ? 'bg-white/95 rounded-2xl p-2' : ''} mb-4`}>
            <img src="/logo.png" alt="Torc" className="w-20 h-20 mx-auto object-contain" />
          </div>
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center mx-auto mb-5">
            <Clock className="w-10 h-10 text-[#0F1419]" />
          </div>
          <h1 className="text-3xl font-bold mb-2" style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }}>Verification Pending</h1>
          <p style={{ color: isDark ? 'rgba(255,255,255,0.5)' : '#6B7280' }}>
            We're reviewing your application. This usually takes 24-48 hours.
          </p>
        </motion.div>

        {/* Status card */}
        <div className="rounded-2xl p-6 mb-6" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB'}`, boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.06)' }}>
          <h3 className="font-semibold mb-4" style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }}>Application Status</h3>
          <div className="space-y-4">
            {steps.map((step, index) => (
              <motion.div key={step.name} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.1 }} className="flex items-center gap-3">
                {step.status === 'completed' && <CheckCircle className="w-5 h-5" style={{ color: '#2EFFAF' }} />}
                {step.status === 'pending' && <Clock className="w-5 h-5" style={{ color: '#007AFF' }} />}
                {step.status === 'rejected' && <AlertCircle className="w-5 h-5 text-red-500" />}
                <div className="flex-1">
                  <p className="font-medium text-sm" style={{ color: step.status === 'completed' ? (isDark ? '#FFFFFF' : '#1A1F2E') : (isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF') }}>
                    {step.name}
                  </p>
                </div>
                <span className="text-xs capitalize px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: step.status === 'completed' ? 'rgba(46,255,175,0.1)' : 'rgba(0,122,255,0.1)',
                    color: step.status === 'completed' ? '#2EFFAF' : '#007AFF',
                  }}
                >
                  {step.status}
                </span>
              </motion.div>
            ))}
          </div>
        </div>

        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/home')}
          className="w-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-2xl py-4 font-bold text-[#0F1419] text-lg mb-4"
        >
          Continue to Dashboard
        </motion.button>

        <p className="text-center text-sm" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }}>
          We'll notify you via email once approved
        </p>
      </div>
    </div>
  );
}
