import { motion } from 'motion/react';
import { AdminLayout } from '../../components/AdminLayout';
import { Search, Download, Filter, Check, Clock, X, DollarSign } from 'lucide-react';
import { useState } from 'react';

interface Payout {
  id: string;
  provider: string;
  providerId: string;
  amount: string;
  status: 'completed' | 'pending' | 'failed';
  method: string;
  date: string;
  jobsCount: number;
  avatar: string;
}

export function AdminPayoutHistory() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  const payouts: Payout[] = [
    {
      id: 'PO-2025-001',
      provider: 'John Driver',
      providerId: 'PR-123',
      amount: '$2,450.00',
      status: 'completed',
      method: 'Bank Transfer',
      date: 'Feb 10, 2025',
      jobsCount: 15,
      avatar: 'JD',
    },
    {
      id: 'PO-2025-002',
      provider: 'Mike Towing',
      providerId: 'PR-124',
      amount: '$3,200.50',
      status: 'completed',
      method: 'Direct Deposit',
      date: 'Feb 9, 2025',
      jobsCount: 22,
      avatar: 'MT',
    },
    {
      id: 'PO-2025-003',
      provider: 'Sarah Rescue',
      providerId: 'PR-125',
      amount: '$1,890.00',
      status: 'pending',
      method: 'PayPal',
      date: 'Feb 8, 2025',
      jobsCount: 12,
      avatar: 'SR',
    },
    {
      id: 'PO-2025-004',
      provider: 'Tom Service',
      providerId: 'PR-126',
      amount: '$4,120.75',
      status: 'completed',
      method: 'Bank Transfer',
      date: 'Feb 7, 2025',
      jobsCount: 28,
      avatar: 'TS',
    },
    {
      id: 'PO-2025-005',
      provider: 'Lisa Helper',
      providerId: 'PR-127',
      amount: '$2,680.00',
      status: 'failed',
      method: 'Direct Deposit',
      date: 'Feb 6, 2025',
      jobsCount: 18,
      avatar: 'LH',
    },
  ];

  const stats = [
    { 
      label: 'Total Payouts (This Month)', 
      value: '$124,500', 
      count: '87 payouts',
      color: 'from-[#2EFFAF] to-[#00D68F]' 
    },
    { 
      label: 'Completed', 
      value: '$118,200', 
      count: '82 payouts',
      color: 'from-[#007AFF] to-[#0051D5]' 
    },
    { 
      label: 'Pending', 
      value: '$5,400', 
      count: '4 payouts',
      color: 'from-[#FFA500] to-[#FF8C00]' 
    },
    { 
      label: 'Failed', 
      value: '$900', 
      count: '1 payout',
      color: 'from-[#FF6B6B] to-[#FF5252]' 
    },
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <Check className="w-4 h-4" />;
      case 'pending': return <Clock className="w-4 h-4" />;
      case 'failed': return <X className="w-4 h-4" />;
      default: return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-[#2EFFAF] bg-[#2EFFAF]/20';
      case 'pending': return 'text-yellow-400 bg-yellow-400/20';
      case 'failed': return 'text-red-400 bg-red-400/20';
      default: return 'text-white/60 bg-white/10';
    }
  };

  return (
    <AdminLayout>
      <div className="p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Payout History</h1>
            <p className="text-white/60">Track all provider payouts</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="px-6 py-3 rounded-[20px] bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0F1419] font-bold flex items-center gap-2 shadow-lg shadow-[#2EFFAF]/30"
          >
            <Download className="w-5 h-5" />
            Export Report
          </motion.button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="glass-light rounded-[24px] p-6"
            >
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${stat.color} flex items-center justify-center mb-4`}>
                <DollarSign className="w-6 h-6 text-white" />
              </div>
              <p className="text-white/60 text-sm mb-1">{stat.label}</p>
              <p className="text-white font-bold text-2xl mb-1">{stat.value}</p>
              <p className="text-white/40 text-xs">{stat.count}</p>
            </motion.div>
          ))}
        </div>

        {/* Search and Filters */}
        <div className="glass-light rounded-[24px] p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
              <input
                type="text"
                placeholder="Search by payout ID, provider name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-[16px] text-white placeholder-white/40 focus:outline-none focus:border-[#2EFFAF]/50"
              />
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-4 py-3 bg-white/5 border border-white/10 rounded-[16px] flex items-center gap-2 text-white hover:bg-white/10"
            >
              <Filter className="w-5 h-5" />
              <span>Filters</span>
            </motion.button>
          </div>

          {/* Status filters */}
          <div className="flex gap-2 mt-4">
            {['all', 'completed', 'pending', 'failed'].map((status) => (
              <motion.button
                key={status}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedStatus(status)}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                  selectedStatus === status
                    ? 'bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0F1419]'
                    : 'bg-white/5 text-white/70 hover:bg-white/10'
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Payouts Table */}
        <div className="glass-light rounded-[24px] overflow-hidden">
          {payouts.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-white/60">No payout history</p>
              <p className="text-white/40 text-sm mt-2">Payout system coming soon</p>
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-white/10">
                <tr>
                  <th className="px-6 py-4 text-left text-white/60 text-sm font-semibold">Payout ID</th>
                  <th className="px-6 py-4 text-left text-white/60 text-sm font-semibold">Provider</th>
                  <th className="px-6 py-4 text-left text-white/60 text-sm font-semibold">Amount</th>
                  <th className="px-6 py-4 text-left text-white/60 text-sm font-semibold">Jobs</th>
                  <th className="px-6 py-4 text-left text-white/60 text-sm font-semibold">Method</th>
                  <th className="px-6 py-4 text-left text-white/60 text-sm font-semibold">Date</th>
                  <th className="px-6 py-4 text-left text-white/60 text-sm font-semibold">Status</th>
                  <th className="px-6 py-4 text-left text-white/60 text-sm font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((payout, index) => (
                  <motion.tr
                    key={payout.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <span className="text-white/70 font-mono text-sm">{payout.id}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center">
                          <span className="text-[#0F1419] font-bold text-sm">{payout.avatar}</span>
                        </div>
                        <div>
                          <p className="text-white font-semibold">{payout.provider}</p>
                          <p className="text-white/50 text-sm">{payout.providerId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[#2EFFAF] font-bold text-lg">{payout.amount}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-white/70">{payout.jobsCount} jobs</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-white/70">{payout.method}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-white/70">{payout.date}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 w-fit ${getStatusColor(payout.status)}`}>
                        {getStatusIcon(payout.status)}
                        {payout.status.charAt(0).toUpperCase() + payout.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="px-4 py-2 rounded-lg bg-white/5 text-white/70 hover:bg-white/10 text-sm"
                      >
                        View Details
                      </motion.button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
