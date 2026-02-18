import { motion } from 'motion/react';
import { AdminLayout } from '../../components/AdminLayout';
import { Plus, Edit, Trash2, Wrench, Zap, Droplet, Gauge, Shield, Key } from 'lucide-react';
import { useState } from 'react';

interface Service {
  id: string;
  name: string;
  icon: any;
  description: string;
  baseRate: string;
  platformFee: string;
  activeProviders: number;
  totalJobs: number;
  enabled: boolean;
  category: string;
}

export function AdminServices() {
  const [services, setServices] = useState<Service[]>([
    {
      id: 'towing',
      name: 'Towing',
      icon: Wrench,
      description: 'Vehicle towing and transportation',
      baseRate: '$75/tow',
      platformFee: '15%',
      activeProviders: 38,
      totalJobs: 1247,
      enabled: true,
      category: 'Emergency',
    },
    {
      id: 'battery',
      name: 'Battery Jumpstart',
      icon: Zap,
      description: 'Dead battery assistance',
      baseRate: '$45/service',
      platformFee: '15%',
      activeProviders: 42,
      totalJobs: 856,
      enabled: true,
      category: 'Quick Fix',
    },
    {
      id: 'tire',
      name: 'Tire Change',
      icon: Shield,
      description: 'Flat tire replacement',
      baseRate: '$50/tire',
      platformFee: '15%',
      activeProviders: 35,
      totalJobs: 643,
      enabled: true,
      category: 'Quick Fix',
    },
    {
      id: 'fuel',
      name: 'Fuel Delivery',
      icon: Droplet,
      description: 'Emergency fuel delivery',
      baseRate: '$35 + fuel',
      platformFee: '10%',
      activeProviders: 28,
      totalJobs: 432,
      enabled: true,
      category: 'Quick Fix',
    },
    {
      id: 'lockout',
      name: 'Lockout Service',
      icon: Key,
      description: 'Vehicle unlock assistance',
      baseRate: '$55/service',
      platformFee: '15%',
      activeProviders: 22,
      totalJobs: 328,
      enabled: true,
      category: 'Quick Fix',
    },
    {
      id: 'winch',
      name: 'Winch Out',
      icon: Gauge,
      description: 'Vehicle recovery from ditch/mud',
      baseRate: '$85/service',
      platformFee: '15%',
      activeProviders: 18,
      totalJobs: 189,
      enabled: true,
      category: 'Emergency',
    },
  ]);

  const [showAddModal, setShowAddModal] = useState(false);

  const stats = [
    { label: 'Total Services', value: '6', color: 'from-[#2EFFAF] to-[#00D68F]' },
    { label: 'Active Services', value: '6', color: 'from-[#007AFF] to-[#0051D5]' },
    { label: 'Total Jobs', value: '3,695', color: 'from-[#FF6B6B] to-[#FF5252]' },
    { label: 'Avg. Platform Fee', value: '14.2%', color: 'from-[#FFA500] to-[#FF8C00]' },
  ];

  return (
    <AdminLayout>
      <div className="p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Service Management</h1>
            <p className="text-white/60">Manage platform services and pricing</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowAddModal(true)}
            className="px-6 py-3 rounded-[20px] bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0F1419] font-bold flex items-center gap-2 shadow-lg shadow-[#2EFFAF]/30"
          >
            <Plus className="w-5 h-5" />
            Add Service
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
                <Wrench className="w-6 h-6 text-white" />
              </div>
              <p className="text-white/60 text-sm mb-1">{stat.label}</p>
              <p className="text-white font-bold text-3xl">{stat.value}</p>
            </motion.div>
          ))}
        </div>

        {/* Services Grid */}
        <div className="grid grid-cols-2 gap-6">
          {services.map((service, index) => {
            const Icon = service.icon;
            return (
              <motion.div
                key={service.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="glass-light rounded-[24px] p-6 border-2 border-[#2EFFAF]/30"
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center flex-shrink-0">
                    <Icon className="w-8 h-8 text-[#0F1419]" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="text-white font-bold text-xl mb-1">{service.name}</h3>
                        <p className="text-white/60 text-sm">{service.description}</p>
                      </div>
                      <div className="px-3 py-1 rounded-full bg-[#2EFFAF]/20 text-[#2EFFAF] text-xs font-semibold">
                        {service.category}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-4 gap-3 mb-4">
                  <div className="glass rounded-2xl p-3">
                    <p className="text-white/50 text-xs mb-1">Base Rate</p>
                    <p className="text-white font-bold text-sm">{service.baseRate}</p>
                  </div>
                  <div className="glass rounded-2xl p-3">
                    <p className="text-white/50 text-xs mb-1">Fee</p>
                    <p className="text-[#2EFFAF] font-bold text-sm">{service.platformFee}</p>
                  </div>
                  <div className="glass rounded-2xl p-3">
                    <p className="text-white/50 text-xs mb-1">Providers</p>
                    <p className="text-white font-bold text-sm">{service.activeProviders}</p>
                  </div>
                  <div className="glass rounded-2xl p-3">
                    <p className="text-white/50 text-xs mb-1">Jobs</p>
                    <p className="text-white font-bold text-sm">{service.totalJobs}</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-4 border-t border-white/10">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex-1 px-4 py-2 rounded-[16px] bg-white/10 text-white hover:bg-white/20 flex items-center justify-center gap-2"
                  >
                    <Edit className="w-4 h-4" />
                    Edit
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="px-4 py-2 rounded-[16px] bg-red-400/20 text-red-400 hover:bg-red-400/30 flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                  </motion.button>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Add Service Modal */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass-light rounded-[32px] p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            >
              <h2 className="text-white font-bold text-2xl mb-6">Add New Service</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="text-white/70 text-sm mb-2 block">Service Name</label>
                  <input
                    type="text"
                    placeholder="e.g., Emergency Roadside Assistance"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-[16px] text-white placeholder-white/40 focus:outline-none focus:border-[#2EFFAF]/50"
                  />
                </div>

                <div>
                  <label className="text-white/70 text-sm mb-2 block">Description</label>
                  <textarea
                    placeholder="Describe the service..."
                    rows={3}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-[16px] text-white placeholder-white/40 focus:outline-none focus:border-[#2EFFAF]/50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-white/70 text-sm mb-2 block">Base Rate</label>
                    <input
                      type="text"
                      placeholder="e.g., $75"
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-[16px] text-white placeholder-white/40 focus:outline-none focus:border-[#2EFFAF]/50"
                    />
                  </div>
                  <div>
                    <label className="text-white/70 text-sm mb-2 block">Platform Fee (%)</label>
                    <input
                      type="text"
                      placeholder="e.g., 15"
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-[16px] text-white placeholder-white/40 focus:outline-none focus:border-[#2EFFAF]/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-white/70 text-sm mb-2 block">Category</label>
                  <select className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-[16px] text-white focus:outline-none focus:border-[#2EFFAF]/50">
                    <option value="emergency">Emergency</option>
                    <option value="quick-fix">Quick Fix</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-6 py-3 rounded-[20px] bg-white/10 text-white font-semibold"
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex-1 px-6 py-3 rounded-[20px] bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0F1419] font-bold"
                >
                  Create Service
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
