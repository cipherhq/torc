import { useState } from 'react';
import { motion } from 'motion/react';
import { AdminNav } from '../../components/AdminNav';
import { DollarSign, TrendingUp, Users, Clock, CheckCircle, Send } from 'lucide-react';

export function AdminPayouts() {
  const [selectedPayouts, setSelectedPayouts] = useState<string[]>([]);

  const pendingPayouts = [
    {
      id: 'PO-2001',
      provider: 'Marcus Rodriguez',
      providerId: 'PR-1001',
      jobs: 12,
      totalEarnings: 540.00,
      platformFee: 81.00, // 15%
      payoutAmount: 459.00,
      period: 'Feb 3-9, 2026',
      customer: 'Multiple customers',
      status: 'pending',
    },
    {
      id: 'PO-2002',
      provider: 'Sarah Chen',
      providerId: 'PR-1002',
      jobs: 8,
      totalEarnings: 360.00,
      platformFee: 54.00,
      payoutAmount: 306.00,
      period: 'Feb 3-9, 2026',
      customer: 'Multiple customers',
      status: 'pending',
    },
    {
      id: 'PO-2003',
      provider: 'James Wilson',
      providerId: 'PR-1003',
      jobs: 15,
      totalEarnings: 675.00,
      platformFee: 101.25,
      payoutAmount: 573.75,
      period: 'Feb 3-9, 2026',
      customer: 'Multiple customers',
      status: 'pending',
    },
  ];

  const togglePayout = (payoutId: string) => {
    setSelectedPayouts(prev =>
      prev.includes(payoutId)
        ? prev.filter(id => id !== payoutId)
        : [...prev, payoutId]
    );
  };

  const handleProcessPayouts = () => {
    console.log('Processing payouts:', selectedPayouts);
    // In real app: API call to process payouts
    // This will deduct from customer accounts and pay providers
  };

  const selectedTotal = pendingPayouts
    .filter(p => selectedPayouts.includes(p.id))
    .reduce((sum, p) => sum + p.payoutAmount, 0);

  return (
    <div className="min-h-screen bg-[#0F1419] flex">
      <AdminNav />

      <div className="flex-1 ml-64">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#252B3D] to-[#2F3548] p-8">
          <h1 className="text-3xl font-bold text-white mb-2">Provider Payouts</h1>
          <p className="text-white/60">Process weekly provider earnings</p>
        </div>

        <div className="p-8">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-6 mb-8">
            <div className="glass rounded-[24px] p-6">
              <Clock className="w-8 h-8 text-[#007AFF] mb-3" />
              <p className="text-white/60 text-sm">Pending Payouts</p>
              <p className="text-white text-3xl font-bold">{pendingPayouts.length}</p>
            </div>
            <div className="glass rounded-[24px] p-6">
              <DollarSign className="w-8 h-8 text-[#2EFFAF] mb-3" />
              <p className="text-white/60 text-sm">Total Pending</p>
              <p className="text-white text-3xl font-bold">
                ${pendingPayouts.reduce((sum, p) => sum + p.payoutAmount, 0).toFixed(2)}
              </p>
            </div>
            <div className="glass rounded-[24px] p-6">
              <TrendingUp className="w-8 h-8 text-[#2EFFAF] mb-3" />
              <p className="text-white/60 text-sm">Platform Fees</p>
              <p className="text-white text-3xl font-bold">
                ${pendingPayouts.reduce((sum, p) => sum + p.platformFee, 0).toFixed(2)}
              </p>
            </div>
            <div className="glass rounded-[24px] p-6">
              <CheckCircle className="w-8 h-8 text-[#2EFFAF] mb-3" />
              <p className="text-white/60 text-sm">Paid This Week</p>
              <p className="text-white text-3xl font-bold">$12,450</p>
            </div>
          </div>

          {/* Pending Payouts */}
          <div className="glass rounded-[24px] p-6 mb-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-white font-bold text-xl">Pending Payouts (Week of Feb 3)</h2>
              {selectedPayouts.length > 0 && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleProcessPayouts}
                  className="bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-2xl px-6 py-3 font-semibold text-[#0F1419] flex items-center gap-2"
                >
                  <Send className="w-5 h-5" />
                  Process {selectedPayouts.length} Payout{selectedPayouts.length > 1 ? 's' : ''} (${selectedTotal.toFixed(2)})
                </motion.button>
              )}
            </div>

            {pendingPayouts.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-white/60">No pending payouts</p>
                <p className="text-white/40 text-sm mt-2">Payout system coming soon</p>
              </div>
            ) : (
            <div className="space-y-3">
              {pendingPayouts.map((payout) => (
                <motion.div
                  key={payout.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`bg-white/5 rounded-2xl p-5 cursor-pointer transition-all ${
                    selectedPayouts.includes(payout.id)
                      ? 'ring-2 ring-[#2EFFAF] bg-[#2EFFAF]/10'
                      : 'hover:bg-white/8'
                  }`}
                  onClick={() => togglePayout(payout.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <input
                        type="checkbox"
                        checked={selectedPayouts.includes(payout.id)}
                        onChange={() => togglePayout(payout.id)}
                        className="w-5 h-5 rounded bg-white/10 border-white/20 checked:bg-[#2EFFAF]"
                      />
                      <div>
                        <h3 className="text-white font-bold">{payout.provider}</h3>
                        <p className="text-white/60 text-sm">{payout.providerId} • {payout.period}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-8">
                      <div className="text-right">
                        <p className="text-white/60 text-sm">Jobs Completed</p>
                        <p className="text-white font-semibold">{payout.jobs} jobs</p>
                      </div>
                      <div className="text-right">
                        <p className="text-white/60 text-sm">Total Earnings</p>
                        <p className="text-white font-semibold">${payout.totalEarnings.toFixed(2)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-white/60 text-sm">Platform Fee (15%)</p>
                        <p className="text-red-400 font-semibold">-${payout.platformFee.toFixed(2)}</p>
                      </div>
                      <div className="text-right min-w-[120px]">
                        <p className="text-white/60 text-sm">Payout Amount</p>
                        <p className="text-[#2EFFAF] font-bold text-xl">${payout.payoutAmount.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Breakdown */}
                  <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-white/60">Customer Charges</p>
                      <p className="text-white">${payout.totalEarnings.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-white/60">Provider Receives</p>
                      <p className="text-[#2EFFAF]">${payout.payoutAmount.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-white/60">TORC Platform Revenue</p>
                      <p className="text-white">${payout.platformFee.toFixed(2)}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
            )}
          </div>

          {/* Info Box */}
          <div className="glass rounded-[24px] p-6">
            <h3 className="text-white font-semibold mb-3">💡 Payout Process</h3>
            <ul className="space-y-2 text-white/80 text-sm">
              <li>• Provider earnings are calculated weekly (Monday-Sunday)</li>
              <li>• Platform fee (15%) is automatically deducted from total earnings</li>
              <li>• Funds are withdrawn from customer payment methods on file</li>
              <li>• Providers receive payouts within 2-3 business days</li>
              <li>• All transactions are logged for accounting and tax purposes</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
