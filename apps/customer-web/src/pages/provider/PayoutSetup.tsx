import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, DollarSign, CreditCard, ChevronRight } from 'lucide-react';

export function PayoutSetup() {
  const navigate = useNavigate();

  const payoutMethods = [
    {
      id: 'stripe',
      name: 'Bank Account (Stripe)',
      description: 'Instant payouts available • Most popular',
      icon: DollarSign,
      badge: 'Recommended',
    },
    {
      id: 'paypal',
      name: 'PayPal',
      description: 'Fast & secure PayPal transfers',
      icon: CreditCard,
      badge: null,
    },
  ];

  return (
    <div className="min-h-screen bg-[#1A1F2E] flex flex-col relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#008CE5] opacity-10 blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <div className="relative z-10 p-6 flex items-center gap-4">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate(-1)}
          className="glass rounded-full p-3"
        >
          <ArrowLeft className="w-6 h-6 text-white" />
        </motion.button>
        <h1 className="text-2xl font-bold text-white">Payout Setup</h1>
      </div>

      <div className="relative z-10 flex-1 px-6 pb-6 flex flex-col justify-center">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div 
            className="w-24 h-24 rounded-full bg-gradient-to-br from-[#008CE5] to-[#0070B8] flex items-center justify-center mx-auto mb-6"
            style={{
              boxShadow: '0 20px 40px rgba(46, 255, 175, 0.3)',
            }}
          >
            <DollarSign className="w-12 h-12 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-3">Get Paid Fast</h2>
          <p className="text-white/60">
            Choose how you want to receive your earnings
          </p>
        </motion.div>

        <div className="space-y-4">
          {payoutMethods.map((method, index) => {
            const Icon = method.icon;
            return (
              <motion.button
                key={method.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + index * 0.1 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate('/provider/verification-pending')}
                className="w-full glass rounded-[32px] p-6 flex items-center gap-4 group relative overflow-hidden"
              >
                {method.badge && (
                  <div className="absolute top-4 right-4 px-3 py-1 rounded-full bg-[#008CE5]/20 text-[#008CE5] text-xs font-semibold">
                    {method.badge}
                  </div>
                )}
                <div 
                  className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#008CE5]/20 to-[#0070B8]/20 flex items-center justify-center flex-shrink-0"
                >
                  <Icon className="w-8 h-8 text-[#008CE5]" />
                </div>
                <div className="flex-1 text-left">
                  <h3 className="text-white font-semibold text-lg">{method.name}</h3>
                  <p className="text-white/60 text-sm">{method.description}</p>
                </div>
                <ChevronRight className="w-6 h-6 text-[#008CE5] group-hover:translate-x-2 transition-transform" />
              </motion.button>
            );
          })}
        </div>

        <div className="mt-8 glass rounded-[24px] p-6">
          <h3 className="text-white font-semibold mb-3">💰 Payout Options</h3>
          <ul className="space-y-2 text-white/80 text-sm">
            <li>• Instant payout: Get paid within minutes (small fee)</li>
            <li>• Daily payout: Free automatic daily transfers</li>
            <li>• Weekly payout: Free weekly batch transfers</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
