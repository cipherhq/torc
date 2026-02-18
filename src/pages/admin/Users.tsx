import { motion } from 'motion/react';
import { AdminLayout } from '../../components/AdminLayout';
import { Search, Filter, UserPlus, MoreVertical, Mail, Phone, Ban, CheckCircle, X } from 'lucide-react';
import { useState } from 'react';

interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: 'active' | 'suspended' | 'pending';
  joinedDate: string;
  totalJobs: number;
  totalSpent: string;
  avatar: string;
}

export function AdminUsers() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  const users: User[] = [
    {
      id: '1',
      name: 'Sarah Johnson',
      email: 'sarah.j@email.com',
      phone: '+1 (555) 123-4567',
      status: 'active',
      joinedDate: 'Jan 15, 2025',
      totalJobs: 12,
      totalSpent: '$1,245',
      avatar: 'SJ',
    },
    {
      id: '2',
      name: 'Michael Chen',
      email: 'michael.c@email.com',
      phone: '+1 (555) 234-5678',
      status: 'active',
      joinedDate: 'Jan 18, 2025',
      totalJobs: 8,
      totalSpent: '$890',
      avatar: 'MC',
    },
    {
      id: '3',
      name: 'Emily Rodriguez',
      email: 'emily.r@email.com',
      phone: '+1 (555) 345-6789',
      status: 'active',
      joinedDate: 'Jan 20, 2025',
      totalJobs: 15,
      totalSpent: '$1,680',
      avatar: 'ER',
    },
    {
      id: '4',
      name: 'David Kim',
      email: 'david.k@email.com',
      phone: '+1 (555) 456-7890',
      status: 'suspended',
      joinedDate: 'Dec 28, 2024',
      totalJobs: 3,
      totalSpent: '$340',
      avatar: 'DK',
    },
    {
      id: '5',
      name: 'Jessica Taylor',
      email: 'jessica.t@email.com',
      phone: '+1 (555) 567-8901',
      status: 'active',
      joinedDate: 'Feb 1, 2025',
      totalJobs: 6,
      totalSpent: '$720',
      avatar: 'JT',
    },
  ];

  const stats = [
    { label: 'Total Users', value: '2,847', change: '+12%', color: 'from-[#2EFFAF] to-[#00D68F]' },
    { label: 'Active Users', value: '2,654', change: '+8%', color: 'from-[#007AFF] to-[#0051D5]' },
    { label: 'New This Month', value: '187', change: '+23%', color: 'from-[#FF6B6B] to-[#FF5252]' },
    { label: 'Suspended', value: '193', change: '-5%', color: 'from-[#FFA500] to-[#FF8C00]' },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-[#2EFFAF] bg-[#2EFFAF]/20';
      case 'suspended': return 'text-red-400 bg-red-400/20';
      case 'pending': return 'text-yellow-400 bg-yellow-400/20';
      default: return 'text-white/60 bg-white/10';
    }
  };

  return (
    <AdminLayout>
      <div className="p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">User Management</h1>
            <p className="text-white/60">Manage all customer accounts</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="px-6 py-3 rounded-[20px] bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0F1419] font-bold flex items-center gap-2 shadow-lg shadow-[#2EFFAF]/30"
          >
            <UserPlus className="w-5 h-5" />
            Add User
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
                <span className="text-white font-bold text-xl">{stat.value.slice(0, 1)}</span>
              </div>
              <p className="text-white/60 text-sm mb-1">{stat.label}</p>
              <div className="flex items-end justify-between">
                <p className="text-white font-bold text-2xl">{stat.value}</p>
                <span className="text-[#2EFFAF] text-sm font-semibold">{stat.change}</span>
              </div>
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
                placeholder="Search users by name, email, or phone..."
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
            {['all', 'active', 'suspended', 'pending'].map((status) => (
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

        {/* Users Table */}
        <div className="glass-light rounded-[24px] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-white/10">
                <tr>
                  <th className="px-6 py-4 text-left text-white/60 text-sm font-semibold">User</th>
                  <th className="px-6 py-4 text-left text-white/60 text-sm font-semibold">Contact</th>
                  <th className="px-6 py-4 text-left text-white/60 text-sm font-semibold">Status</th>
                  <th className="px-6 py-4 text-left text-white/60 text-sm font-semibold">Joined</th>
                  <th className="px-6 py-4 text-left text-white/60 text-sm font-semibold">Jobs</th>
                  <th className="px-6 py-4 text-left text-white/60 text-sm font-semibold">Total Spent</th>
                  <th className="px-6 py-4 text-left text-white/60 text-sm font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user, index) => (
                  <motion.tr
                    key={user.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center">
                          <span className="text-[#0F1419] font-bold text-sm">{user.avatar}</span>
                        </div>
                        <div>
                          <p className="text-white font-semibold">{user.name}</p>
                          <p className="text-white/50 text-sm">ID: {user.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-white/70 text-sm">
                          <Mail className="w-4 h-4" />
                          {user.email}
                        </div>
                        <div className="flex items-center gap-2 text-white/70 text-sm">
                          <Phone className="w-4 h-4" />
                          {user.phone}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(user.status)}`}>
                        {user.status.charAt(0).toUpperCase() + user.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-white/70">{user.joinedDate}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-white font-semibold">{user.totalJobs}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[#2EFFAF] font-bold">{user.totalSpent}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {user.status === 'active' ? (
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            className="p-2 rounded-lg bg-red-400/20 text-red-400 hover:bg-red-400/30"
                            title="Suspend User"
                          >
                            <Ban className="w-4 h-4" />
                          </motion.button>
                        ) : (
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            className="p-2 rounded-lg bg-[#2EFFAF]/20 text-[#2EFFAF] hover:bg-[#2EFFAF]/30"
                            title="Activate User"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </motion.button>
                        )}
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          className="p-2 rounded-lg bg-white/5 text-white/60 hover:bg-white/10"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </motion.button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
