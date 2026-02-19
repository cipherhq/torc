import { motion } from 'motion/react';
import { useNavigate, useLocation } from 'react-router';
import { 
  LayoutDashboard, 
  Briefcase, 
  Users, 
  DollarSign, 
  MapPin,
  Wrench,
  BarChart3,
  CreditCard,
  Shield,
  Settings,
  ChevronDown,
  ChevronRight,
  Home,
  Radio,
  LifeBuoy,
  LineChart,
  FileText,
  FileBarChart2
} from 'lucide-react';
import React, { useState } from 'react';

interface NavItem {
  icon: any;
  label: string;
  path: string;
  badge?: string | number;
  children?: NavItem[];
}

export function AdminSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [expandedSections, setExpandedSections] = useState(['operations', 'management']);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => 
      prev.includes(section) 
        ? prev.filter(s => s !== section)
        : [...prev, section]
    );
  };

  const navSections: { title: string; key: string; items: NavItem[] }[] = [
    {
      title: 'OVERVIEW',
      key: 'overview',
      items: [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/admin' },
        { icon: BarChart3, label: 'Analytics', path: '/admin/analytics' },
        { icon: FileBarChart2, label: 'Reporting Hub', path: '/admin/reporting' },
      ],
    },
    {
      title: 'OPERATIONS',
      key: 'operations',
      items: [
        { icon: Radio, label: 'Live Dispatch', path: '/admin/live-dispatch' },
        { icon: LifeBuoy, label: 'Support Tickets', path: '/admin/support' },
        { icon: Briefcase, label: 'Jobs', path: '/admin/jobs' },
        { icon: MapPin, label: 'Directory', path: '/admin/directory' },
        { icon: Wrench, label: 'Services', path: '/admin/services' },
      ],
    },
    {
      title: 'MANAGEMENT',
      key: 'management',
      items: [
        { icon: Users, label: 'Users', path: '/admin/users' },
        { icon: Shield, label: 'Providers', path: '/admin/providers' },
        { icon: Shield, label: 'Provider Approval', path: '/admin/provider-approval' },
      ],
    },
    {
      title: 'FINANCIAL',
      key: 'financial',
      items: [
        { icon: DollarSign, label: 'Payments', path: '/admin/payments' },
        { icon: LineChart, label: 'Finance (P&L)', path: '/admin/finance' },
        { icon: CreditCard, label: 'Payouts', path: '/admin/payouts' },
        { icon: DollarSign, label: 'Payout History', path: '/admin/payout-history' },
      ],
    },
    {
      title: 'SETTINGS',
      key: 'settings',
      items: [
        { icon: Shield, label: 'Team & RBAC', path: '/admin/team' },
        { icon: Settings, label: 'Document Settings', path: '/admin/document-settings' },
        { icon: FileText, label: 'Audit Trail', path: '/admin/audit-trail' },
        { icon: Settings, label: 'Platform Settings', path: '/admin/settings' },
      ],
    },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="w-72 h-screen bg-gradient-to-b from-[#0F1419] to-[#1A1F2E] border-r border-white/10 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-white/10">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/admin')}
          className="flex items-center gap-3 w-full"
        >
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center">
            <span className="text-[#0F1419] font-bold text-xl">T</span>
          </div>
          <div className="text-left">
            <h1 className="text-white font-bold text-xl">TORC Admin</h1>
            <p className="text-white/60 text-xs">Management Console</p>
          </div>
        </motion.button>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {navSections.map((section) => (
          <div key={section.key}>
            <button
              onClick={() => toggleSection(section.key)}
              className="w-full flex items-center justify-between px-3 py-2 mb-2"
            >
              <span className="text-white/40 text-xs font-bold tracking-wider">
                {section.title}
              </span>
              {expandedSections.includes(section.key) ? (
                <ChevronDown className="w-4 h-4 text-white/40" />
              ) : (
                <ChevronRight className="w-4 h-4 text-white/40" />
              )}
            </button>

            {expandedSections.includes(section.key) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="space-y-1"
              >
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.path);

                  return (
                    <motion.button
                      key={item.path}
                      whileHover={{ x: 4 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => navigate(item.path)}
                      className={`w-full flex items-center justify-between px-3 py-3 rounded-2xl transition-all ${
                        active
                          ? 'bg-gradient-to-r from-[#2EFFAF]/20 to-[#007AFF]/20 border border-[#2EFFAF]/30'
                          : 'hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={active ? 'w-5 h-5 text-[#2EFFAF]' : 'w-5 h-5 text-white/60'} />
                        <span className={active ? 'text-white font-semibold' : 'text-white/70'}>
                          {item.label}
                        </span>
                      </div>
                      {item.badge && (
                        <div className="px-2 py-0.5 rounded-full bg-[#2EFFAF]/20 text-[#2EFFAF] text-xs font-bold">
                          {item.badge}
                        </div>
                      )}
                    </motion.button>
                  );
                })}
              </motion.div>
            )}
          </div>
        ))}
      </div>

      {/* Back to Website */}
      <div className="p-4 border-t border-white/10">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/website')}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-white/5"
        >
          <Home className="w-5 h-5 text-white/60" />
          <span className="text-white/70">Back to Website</span>
        </motion.button>
      </div>
    </div>
  );
}