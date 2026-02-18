import { motion } from 'motion/react';
import { useNavigate, useLocation } from 'react-router';
import { LayoutDashboard, Briefcase, Users, CreditCard, MapPin, CheckSquare, DollarSign, FileText } from 'lucide-react';

export function AdminNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { path: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/admin/jobs', label: 'Jobs', icon: Briefcase },
    { path: '/admin/providers', label: 'Providers', icon: Users },
    { path: '/admin/provider-approval', label: 'Approvals', icon: CheckSquare },
    { path: '/admin/payouts', label: 'Payouts', icon: DollarSign },
    { path: '/admin/payments', label: 'Payments', icon: CreditCard },
    { path: '/admin/directory', label: 'Directory', icon: MapPin },
    { path: '/admin/document-settings', label: 'Documents', icon: FileText },
  ];

  return (
    <div className="fixed left-0 top-0 bottom-0 w-64 bg-[#1A1F2E] border-r border-white/10 z-50">
      {/* Logo */}
      <div className="p-6 border-b border-white/10">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] bg-clip-text text-transparent">
          TORC
        </h1>
        <p className="text-white/60 text-sm mt-1">Admin Panel</p>
      </div>

      {/* Navigation */}
      <nav className="p-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;

          return (
            <motion.button
              key={item.path}
              whileHover={{ scale: 1.02, x: 4 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl mb-2 transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0F1419] font-semibold'
                  : 'text-white/70 hover:bg-white/5'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </motion.button>
          );
        })}
      </nav>
    </div>
  );
}