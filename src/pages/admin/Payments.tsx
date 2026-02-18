import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, DollarSign, TrendingUp, Download } from 'lucide-react';

export function AdminPayments() {
  const navigate = useNavigate();

  const transactions = [
    { id: 'TXN-1234', type: 'charge', amount: 120, customer: 'Sarah J.', provider: 'Mike R.', status: 'completed', time: '2:30 PM' },
    { id: 'TXN-1235', type: 'payout', amount: 96, customer: '-', provider: 'Emma W.', status: 'processing', time: '1:15 PM' },
    { id: 'TXN-1236', type: 'refund', amount: 45, customer: 'John D.', provider: '-', status: 'completed', time: '11:20 AM' },
  ];

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <div className="bg-gradient-to-r from-[#1A1F2E] to-[#2F3548] p-8">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate('/admin')}
            className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center"
          >
            <ArrowLeft className="w-6 h-6 text-white" />
          </motion.button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-white">Payments & Transactions</h1>
          </div>
          <button className="px-6 py-3 rounded-2xl bg-white text-gray-900 font-semibold flex items-center gap-2">
            <Download className="w-5 h-5" />
            Export
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-8">
        <div className="grid grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-3xl p-6 shadow-lg">
            <DollarSign className="w-10 h-10 text-[#2EFFAF] mb-3" />
            <p className="text-gray-600 text-sm">Today's Revenue</p>
            <p className="text-3xl font-bold text-gray-900">$12,450</p>
          </div>
          <div className="bg-white rounded-3xl p-6 shadow-lg">
            <TrendingUp className="w-10 h-10 text-[#007AFF] mb-3" />
            <p className="text-gray-600 text-sm">Pending Payouts</p>
            <p className="text-3xl font-bold text-gray-900">$3,280</p>
          </div>
          <div className="bg-white rounded-3xl p-6 shadow-lg">
            <DollarSign className="w-10 h-10 text-green-500 mb-3" />
            <p className="text-gray-600 text-sm">Processing</p>
            <p className="text-3xl font-bold text-gray-900">$1,120</p>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Transaction ID</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Type</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Amount</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Customer</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Provider</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Status</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {transactions.map((txn) => (
                <tr key={txn.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-mono text-sm">{txn.id}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                      txn.type === 'charge' ? 'bg-green-100 text-green-700' :
                      txn.type === 'payout' ? 'bg-blue-100 text-blue-700' :
                      'bg-orange-100 text-orange-700'
                    }`}>
                      {txn.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-semibold">${txn.amount}</td>
                  <td className="px-6 py-4 text-gray-600">{txn.customer}</td>
                  <td className="px-6 py-4 text-gray-600">{txn.provider}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                      txn.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {txn.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-600 text-sm">{txn.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
