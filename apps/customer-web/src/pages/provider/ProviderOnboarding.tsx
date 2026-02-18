import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Building, User, ChevronRight } from 'lucide-react';

export function ProviderOnboarding() {
  const navigate = useNavigate();

  const accountTypes = [
    {
      id: 'individual',
      title: 'Individual Provider',
      description: 'I operate as an independent contractor',
      icon: User,
    },
    {
      id: 'company',
      title: 'Company',
      description: 'I represent a business with multiple providers',
      icon: Building,
    },
  ];

  return (
    <div className="min-h-screen bg-[#1A1F2E] flex flex-col relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-[#2EFFAF] opacity-10 blur-[120px] rounded-full" />
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
        <h1 className="text-2xl font-bold text-white">Join TORC</h1>
      </div>

      <div className="relative z-10 flex-1 px-6 pb-6 flex flex-col justify-center">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl font-bold text-white mb-3">Become a Provider</h2>
          <p className="text-white/60 text-lg">
            Help people in need and earn money on your schedule
          </p>
        </motion.div>

        <div className="space-y-4">
          {accountTypes.map((type, index) => {
            const Icon = type.icon;
            return (
              <motion.button
                key={type.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + index * 0.1 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate('/provider/services')}
                className="w-full glass rounded-[32px] p-6 flex items-center gap-4 group"
              >
                <div 
                  className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#2EFFAF]/20 to-[#007AFF]/20 flex items-center justify-center flex-shrink-0"
                >
                  <Icon className="w-8 h-8 text-[#2EFFAF]" />
                </div>
                <div className="flex-1 text-left">
                  <h3 className="text-white font-semibold text-lg">{type.title}</h3>
                  <p className="text-white/60 text-sm">{type.description}</p>
                </div>
                <ChevronRight className="w-6 h-6 text-[#2EFFAF] group-hover:translate-x-2 transition-transform" />
              </motion.button>
            );
          })}
        </div>

        <div className="mt-12 glass rounded-[24px] p-6">
          <h3 className="text-white font-semibold mb-3">What you'll need:</h3>
          <ul className="space-y-2 text-white/80 text-sm">
            <li>• Valid driver's license</li>
            <li>• Vehicle registration & insurance</li>
            <li>• Towing credentials (if applicable)</li>
            <li>• Background check consent</li>
            <li>• Bank account for payouts</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
