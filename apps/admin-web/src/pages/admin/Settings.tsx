import { motion } from 'motion/react';
import { AdminLayout } from '../../components/AdminLayout';
import { Settings as SettingsIcon, DollarSign, Bell, Shield, Mail, Globe } from 'lucide-react';
import { useState } from 'react';

export function AdminSettings() {
  const [settings, setSettings] = useState({
    platformFee: 15,
    currency: 'USD',
    emailNotifications: true,
    smsNotifications: true,
    autoApproveProviders: false,
    maintenanceMode: false,
    maxJobRadius: 50,
    providerTimeout: 5,
  });

  const handleToggle = (key: string) => {
    setSettings(prev => ({
      ...prev,
      [key]: !prev[key as keyof typeof prev],
    }));
  };

  const settingSections = [
    {
      title: 'Financial Settings',
      icon: DollarSign,
      color: 'from-[#2EFFAF] to-[#00D68F]',
      items: [
        {
          label: 'Platform Fee Percentage',
          description: 'Default commission on all transactions',
          type: 'number',
          key: 'platformFee',
          suffix: '%',
        },
        {
          label: 'Currency',
          description: 'Platform default currency',
          type: 'select',
          key: 'currency',
          options: ['USD', 'EUR', 'GBP', 'CAD'],
        },
      ],
    },
    {
      title: 'Notifications',
      icon: Bell,
      color: 'from-[#007AFF] to-[#0051D5]',
      items: [
        {
          label: 'Email Notifications',
          description: 'Send email alerts to users',
          type: 'toggle',
          key: 'emailNotifications',
        },
        {
          label: 'SMS Notifications',
          description: 'Send SMS alerts to users',
          type: 'toggle',
          key: 'smsNotifications',
        },
      ],
    },
    {
      title: 'Provider Management',
      icon: Shield,
      color: 'from-[#FF6B6B] to-[#FF5252]',
      items: [
        {
          label: 'Auto-Approve Providers',
          description: 'Automatically verify new providers',
          type: 'toggle',
          key: 'autoApproveProviders',
        },
        {
          label: 'Provider Response Timeout',
          description: 'Minutes before reassigning job',
          type: 'number',
          key: 'providerTimeout',
          suffix: 'min',
        },
      ],
    },
    {
      title: 'Platform Operations',
      icon: Globe,
      color: 'from-[#FFA500] to-[#FF8C00]',
      items: [
        {
          label: 'Maintenance Mode',
          description: 'Disable new job requests',
          type: 'toggle',
          key: 'maintenanceMode',
        },
        {
          label: 'Max Job Search Radius',
          description: 'Maximum distance for provider matching',
          type: 'number',
          key: 'maxJobRadius',
          suffix: 'miles',
        },
      ],
    },
  ];

  return (
    <AdminLayout>
      <div className="p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Platform Settings</h1>
          <p className="text-white/60">Configure system-wide preferences</p>
        </div>

        {/* Settings Sections */}
        <div className="space-y-6">
          {settingSections.map((section, sectionIndex) => {
            const Icon = section.icon;
            return (
              <motion.div
                key={section.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: sectionIndex * 0.1 }}
                className="glass-light rounded-[24px] p-6"
              >
                <div className="flex items-center gap-4 mb-6">
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${section.color} flex items-center justify-center`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <h2 className="text-white font-bold text-xl">{section.title}</h2>
                </div>

                <div className="space-y-4">
                  {section.items.map((item) => (
                    <div key={item.key} className="glass rounded-[20px] p-5">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="text-white font-semibold mb-1">{item.label}</h3>
                          <p className="text-white/60 text-sm">{item.description}</p>
                        </div>

                        <div className="ml-4">
                          {item.type === 'toggle' && (
                            <motion.button
                              whileTap={{ scale: 0.9 }}
                              onClick={() => handleToggle(item.key)}
                              className={`w-14 h-8 rounded-full relative transition-all ${
                                settings[item.key as keyof typeof settings]
                                  ? 'bg-gradient-to-r from-[#2EFFAF] to-[#007AFF]'
                                  : 'bg-white/10'
                              }`}
                            >
                              <div
                                className={`absolute w-6 h-6 bg-white rounded-full top-1 transition-all shadow-lg ${
                                  settings[item.key as keyof typeof settings] ? 'right-1' : 'left-1'
                                }`}
                              />
                            </motion.button>
                          )}

                          {item.type === 'number' && (
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                value={settings[item.key as keyof typeof settings]}
                                onChange={(e) => setSettings(prev => ({ ...prev, [item.key]: Number(e.target.value) }))}
                                className="w-20 px-3 py-2 bg-white/5 border border-white/10 rounded-[12px] text-white text-center focus:outline-none focus:border-[#2EFFAF]/50"
                              />
                              {item.suffix && (
                                <span className="text-white/60 text-sm">{item.suffix}</span>
                              )}
                            </div>
                          )}

                          {item.type === 'select' && (
                            <select
                              value={settings[item.key as keyof typeof settings]}
                              onChange={(e) => setSettings(prev => ({ ...prev, [item.key]: e.target.value }))}
                              className="px-4 py-2 bg-white/5 border border-white/10 rounded-[12px] text-white focus:outline-none focus:border-[#2EFFAF]/50"
                            >
                              {item.options?.map((option) => (
                                <option key={option} value={option} className="bg-[#1A1F2E]">
                                  {option}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Save Button */}
        <div className="mt-8">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="px-8 py-4 rounded-[24px] bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0F1419] font-bold text-lg shadow-lg shadow-[#2EFFAF]/30"
          >
            Save All Changes
          </motion.button>
        </div>
      </div>
    </AdminLayout>
  );
}
