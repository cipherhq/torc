import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Building, User, ChevronRight, Wrench, FileText, DollarSign, CheckCircle } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export function ProviderOnboarding() {
  const navigate = useNavigate();
  const { isDark } = useTheme();

  const steps = [
    { id: 1, title: 'Select Services', description: 'Choose services you can provide', icon: Wrench, path: '/services' },
    { id: 2, title: 'Upload Documents', description: 'License, insurance & credentials', icon: FileText, path: '/documents' },
    { id: 3, title: 'Setup Payout', description: 'How you want to get paid', icon: DollarSign, path: '/payout' },
  ];

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-hidden"
      style={{
        background: isDark
          ? 'linear-gradient(180deg, #14263D 0%, #0A1626 100%)'
          : 'linear-gradient(180deg, #FFFFFF 0%, #EAF3FF 100%)',
      }}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 right-1/4 w-[400px] h-[400px] rounded-full" style={{ backgroundColor: '#008CE5', filter: 'blur(160px)', opacity: isDark ? 0.06 : 0.03 }} />
      </div>

      {/* Header */}
      <div className="relative z-10 p-6 flex items-center gap-4" style={{ paddingTop: 'var(--safe-top)' }}>
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate('/login')} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}>
          <ArrowLeft className="w-5 h-5" style={{ color: isDark ? '#FFFFFF' : '#1F2937' }} />
        </motion.button>
      </div>

      <div className="relative z-10 flex-1 px-6 pb-8">
        {/* Logo + Title */}
        <motion.div initial={{ opacity: 0, y: -15 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <img src="/logo.svg" alt="Torc" className="w-32 h-auto mx-auto object-contain mb-2" />
          <div className="inline-block px-3 py-1 rounded-full mb-3" style={{ backgroundColor: 'rgba(0,140,229,0.15)' }}>
            <span className="text-xs font-bold" style={{ color: '#008CE5' }}>PROVIDER ONBOARDING</span>
          </div>
          <h1 className="text-3xl font-bold" style={{ color: isDark ? '#FFFFFF' : '#14263D' }}>
            Become a Provider
          </h1>
          <p className="mt-2" style={{ color: isDark ? 'rgba(255,255,255,0.5)' : '#6B7280' }}>
            Help people in need and earn on your schedule
          </p>
        </motion.div>

        {/* Steps */}
        <div className="space-y-4 max-w-md mx-auto mb-8">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <motion.button
                key={step.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + index * 0.1 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate(step.path)}
                className="w-full flex items-center gap-4 rounded-2xl p-5 transition-all group"
                style={{
                  backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF',
                  border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2'}`,
                  boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
                }}
              >
                <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(0,140,229,0.1)' }}>
                  <Icon className="w-6 h-6" style={{ color: '#008CE5' }} />
                </div>
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(0,140,229,0.1)', color: '#008CE5' }}>
                      Step {step.id}
                    </span>
                  </div>
                  <h3 className="font-semibold mt-1" style={{ color: isDark ? '#FFFFFF' : '#14263D' }}>{step.title}</h3>
                  <p className="text-sm" style={{ color: isDark ? 'rgba(255,255,255,0.5)' : '#6B7280' }}>{step.description}</p>
                </div>
                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" style={{ color: '#008CE5' }} />
              </motion.button>
            );
          })}
        </div>

        {/* Requirements card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="max-w-md mx-auto rounded-2xl p-6"
          style={{
            backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F5F9FF',
            border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#D3E0F2'}`,
          }}
        >
          <h3 className="font-semibold mb-3" style={{ color: isDark ? '#FFFFFF' : '#14263D' }}>What you'll need:</h3>
          <ul className="space-y-2">
            {[
              "Valid driver's license",
              'Vehicle registration & insurance',
              'Towing credentials (if applicable)',
              'Background check consent',
              'Bank account for payouts',
            ].map((item, i) => (
              <li key={i} className="flex items-center gap-2 text-sm" style={{ color: isDark ? 'rgba(255,255,255,0.6)' : '#6B7280' }}>
                <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#008CE5' }} />
                {item}
              </li>
            ))}
          </ul>
        </motion.div>
      </div>
    </div>
  );
}
