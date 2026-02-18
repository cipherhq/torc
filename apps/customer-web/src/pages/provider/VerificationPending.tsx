import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { CheckCircle, Clock, AlertCircle } from 'lucide-react';

export function VerificationPending() {
  const navigate = useNavigate();

  const steps = [
    { name: 'Account Created', status: 'completed' },
    { name: 'Documents Uploaded', status: 'completed' },
    { name: 'Background Check', status: 'pending' },
    { name: 'Final Approval', status: 'pending' },
  ];

  return (
    <div className="min-h-screen bg-[#1A1F2E] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#2EFFAF] opacity-10 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center mb-12"
        >
          <div className="w-32 h-32 rounded-full bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center mx-auto mb-6">
            <Clock className="w-16 h-16 text-[#0F1419]" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-3">Verification Pending</h1>
          <p className="text-white/60 text-lg">
            We're reviewing your application. This usually takes 24-48 hours.
          </p>
        </motion.div>

        <div className="glass rounded-[32px] p-6 mb-6">
          <h3 className="text-white font-semibold mb-4">Application Status</h3>
          <div className="space-y-4">
            {steps.map((step, index) => (
              <motion.div
                key={step.name}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-center gap-3"
              >
                {step.status === 'completed' && (
                  <CheckCircle className="w-6 h-6 text-[#2EFFAF]" />
                )}
                {step.status === 'pending' && (
                  <Clock className="w-6 h-6 text-[#007AFF]" />
                )}
                {step.status === 'rejected' && (
                  <AlertCircle className="w-6 h-6 text-red-400" />
                )}
                <div className="flex-1">
                  <p className={`font-semibold ${step.status === 'completed' ? 'text-white' : 'text-white/60'}`}>
                    {step.name}
                  </p>
                  <p className="text-white/40 text-sm capitalize">{step.status}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/provider/home')}
          className="w-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-[32px] py-5 font-bold text-[#0F1419] text-lg mb-4"
        >
          Continue to Provider Dashboard
        </motion.button>

        <p className="text-center text-white/60 text-sm">
          We'll notify you via email once your application is approved
        </p>
      </div>
    </div>
  );
}
