import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { BottomNav } from '../../components/BottomNav';
import { User, Users, Car, Bell, Shield, HelpCircle, ChevronRight, LogOut, Settings, CreditCard, History, Gift } from 'lucide-react';
import { mockVehicles, mockFamilyMembers } from '../../data/mockData';

export function Profile() {
  const navigate = useNavigate();
  
  const menuItems = [
    {
      section: 'Account',
      items: [
        { icon: User, label: 'Personal Information', count: null, path: '#' },
        { icon: Users, label: 'Family Members', count: mockFamilyMembers.length, path: '#' },
        { icon: Car, label: 'My Vehicles', count: mockVehicles.length, path: '#' },
      ],
    },
    {
      section: 'Services',
      items: [
        { icon: History, label: 'Service History', count: null, path: '/customer/service-history' },
        { icon: CreditCard, label: 'Payment Methods', count: null, path: '/customer/payment-methods' },
        { icon: Gift, label: 'Promo Codes', count: null, path: '#' },
      ],
    },
    {
      section: 'Preferences',
      items: [
        { icon: Bell, label: 'Notifications', count: null, path: '/customer/notifications' },
        { icon: Shield, label: 'Privacy & Security', count: null, path: '#' },
        { icon: Settings, label: 'App Settings', count: null, path: '#' },
      ],
    },
    {
      section: 'Support',
      items: [
        { icon: HelpCircle, label: 'Help Center', count: null, path: '/customer/help-center' },
        { icon: Shield, label: 'Safety', count: null, path: '#' },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-[#0A0F1E] pb-24 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-[#2EFFAF] opacity-10 blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <div className="relative z-10 p-6">
        <h1 className="text-3xl font-bold text-white mb-2">Profile</h1>
        <p className="text-white/60">Manage your account and preferences</p>
      </div>

      <div className="relative z-10 px-6">
        {/* User Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-[32px] p-6 mb-8"
        >
          <div className="flex items-center gap-4 mb-6">
            <div 
              className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center text-3xl font-bold text-[#0A0F1E]"
              style={{
                boxShadow: '0 8px 24px rgba(46, 255, 175, 0.3)',
              }}
            >
              JD
            </div>
            <div className="flex-1">
              <h2 className="text-white font-bold text-2xl">John Doe</h2>
              <p className="text-white/60">+1 (555) 123-4567</p>
              <p className="text-white/60 text-sm">john.doe@email.com</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 pt-6 border-t border-white/10">
            <div className="text-center">
              <p className="text-[#2EFFAF] text-2xl font-bold">12</p>
              <p className="text-white/60 text-xs mt-1">Total Saves</p>
            </div>
            <div className="text-center border-x border-white/10">
              <p className="text-[#2EFFAF] text-2xl font-bold">4.9</p>
              <p className="text-white/60 text-xs mt-1">Your Rating</p>
            </div>
            <div className="text-center">
              <p className="text-[#2EFFAF] text-2xl font-bold">2</p>
              <p className="text-white/60 text-xs mt-1">Years Member</p>
            </div>
          </div>
        </motion.div>

        {/* Menu Sections */}
        {menuItems.map((section, sectionIndex) => (
          <div key={section.section} className="mb-8">
            <h3 className="text-white/60 text-sm font-semibold uppercase tracking-wider mb-3 px-2">
              {section.section}
            </h3>
            <div className="space-y-2">
              {section.items.map((item, itemIndex) => {
                const Icon = item.icon;
                return (
                  <motion.button
                    key={item.label}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: sectionIndex * 0.1 + itemIndex * 0.05 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full glass rounded-[24px] p-5 flex items-center gap-4 group"
                    onClick={() => navigate(item.path)}
                  >
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#2EFFAF]/20 to-[#007AFF]/20 flex items-center justify-center">
                      <Icon className="w-6 h-6 text-[#2EFFAF]" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-white font-semibold">{item.label}</p>
                    </div>
                    {item.count !== null && (
                      <div className="px-3 py-1 rounded-full bg-white/10 text-white/80 text-sm font-semibold">
                        {item.count}
                      </div>
                    )}
                    <ChevronRight className="w-5 h-5 text-white/40 group-hover:text-[#2EFFAF] group-hover:translate-x-1 transition-all" />
                  </motion.button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Logout */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="w-full glass rounded-[24px] p-5 flex items-center gap-4 border border-red-500/30 mb-6"
        >
          <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
            <LogOut className="w-6 h-6 text-red-400" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-red-400 font-semibold">Logout</p>
          </div>
        </motion.button>

        <p className="text-center text-white/40 text-sm mb-6">
          Version 1.0.0 • © 2026 Vanguard
        </p>
      </div>

      <BottomNav />
    </div>
  );
}