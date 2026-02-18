import { motion } from 'motion/react';
import { BottomNav } from '../../components/BottomNav';
import { CreditCard, Plus, DollarSign, Gift, Download, Trash2, Check } from 'lucide-react';
import { mockPaymentMethods } from '../../data/mockData';
import { useState } from 'react';

export function Wallet() {
  const [walletBalance, setWalletBalance] = useState(25.00);

  const transactions = [
    { id: '1', date: '2026-02-10', description: 'Jump Start Service', amount: -49.00 },
    { id: '2', date: '2026-02-08', description: 'Promo Credit', amount: 25.00 },
    { id: '3', date: '2026-02-05', description: 'Towing Service', amount: -89.00 },
  ];

  return (
    <div className="min-h-screen bg-[#0A0F1E] pb-24 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#2EFFAF] opacity-10 blur-[120px] rounded-full" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#007AFF] opacity-10 blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <div className="relative z-10 p-6">
        <h1 className="text-3xl font-bold text-white mb-2">Wallet</h1>
        <p className="text-white/60">Manage payments and credits</p>
      </div>

      <div className="relative z-10 px-6">
        {/* Wallet Balance Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[32px] p-8 mb-6 relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #2EFFAF 0%, #007AFF 100%)',
            boxShadow: '0 20px 40px rgba(46, 255, 175, 0.3)',
          }}
        >
          {/* Card pattern */}
          <div className="absolute inset-0 opacity-10">
            <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="card-pattern" width="20" height="20" patternUnits="userSpaceOnUse">
                  <circle cx="10" cy="10" r="1" fill="white" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#card-pattern)" />
            </svg>
          </div>

          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-6">
              <DollarSign className="w-6 h-6 text-[#0A0F1E]" />
              <p className="text-[#0A0F1E] font-semibold">Vanguard Credits</p>
            </div>
            <p className="text-5xl font-bold text-[#0A0F1E] mb-2">${walletBalance.toFixed(2)}</p>
            <p className="text-[#0A0F1E]/80 text-sm">Available balance</p>
          </div>
        </motion.div>

        {/* Payment Methods */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold text-lg">Payment Methods</h2>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="glass rounded-full p-2"
            >
              <Plus className="w-5 h-5 text-[#2EFFAF]" />
            </motion.button>
          </div>

          <div className="space-y-3">
            {mockPaymentMethods.map((method) => (
              <motion.div
                key={method.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="glass rounded-[24px] p-5"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#2EFFAF]/20 to-[#007AFF]/20 flex items-center justify-center">
                    <CreditCard className="w-6 h-6 text-[#2EFFAF]" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-white font-semibold">
                        {method.brand} •••• {method.last4}
                      </p>
                      {method.isDefault && (
                        <div className="px-2 py-0.5 rounded-full bg-[#2EFFAF]/20 text-[#2EFFAF] text-xs font-semibold flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          DEFAULT
                        </div>
                      )}
                    </div>
                    <p className="text-white/60 text-sm">Expires 12/28</p>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className="glass rounded-full p-2"
                  >
                    <Trash2 className="w-5 h-5 text-red-400" />
                  </motion.button>
                </div>
              </motion.div>
            ))}

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full glass rounded-[24px] p-5 flex items-center gap-4 border-2 border-dashed border-white/20"
            >
              <Plus className="w-6 h-6 text-white/40" />
              <p className="text-white/60 font-semibold">Add New Card</p>
            </motion.button>
          </div>
        </div>

        {/* Promotions */}
        <div className="mb-6">
          <h2 className="text-white font-semibold text-lg mb-4">Promotions</h2>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-[24px] p-5"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center">
                <Gift className="w-6 h-6 text-[#0A0F1E]" />
              </div>
              <div className="flex-1">
                <p className="text-white font-semibold mb-1">Have a promo code?</p>
                <p className="text-white/60 text-sm">Enter code to get credits</p>
              </div>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-4 py-2 bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-2xl text-[#0A0F1E] font-semibold text-sm"
              >
                Add Code
              </motion.button>
            </div>
          </motion.div>
        </div>

        {/* Transaction History */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold text-lg">Recent Transactions</h2>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="glass rounded-full p-2"
            >
              <Download className="w-5 h-5 text-[#2EFFAF]" />
            </motion.button>
          </div>

          <div className="space-y-3">
            {transactions.map((transaction, index) => (
              <motion.div
                key={transaction.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="glass rounded-[24px] p-5"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-semibold mb-1">{transaction.description}</p>
                    <p className="text-white/60 text-sm">
                      {new Date(transaction.date).toLocaleDateString()}
                    </p>
                  </div>
                  <p className={`font-bold text-lg ${
                    transaction.amount > 0 ? 'text-[#2EFFAF]' : 'text-white'
                  }`}>
                    {transaction.amount > 0 ? '+' : ''}{transaction.amount.toFixed(2)}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
