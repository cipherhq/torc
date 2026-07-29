import { motion } from 'motion/react';
import { useNavigate, useLocation } from 'react-router';
import {
  LayoutDashboard,
  Briefcase,
  Users,
  UserCheck,
  BarChart3,
  Bell,
  Home,
  Settings,
  DollarSign,
  CreditCard,
  Wallet,
  FileBarChart2,
  MessageSquareWarning,
  Shield,
  Radio,
  Wrench,
  FileCheck,
  Clock,
  UsersRound,
  BookOpen,
} from 'lucide-react';
import { useAdminSession } from './AdminLayout';
import { getVisibleRoutes } from '../lib/rbac';

const navSections = [
  {
    label: 'Overview',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
      { icon: Bell, label: 'Notifications', path: '/notifications' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { icon: Briefcase, label: 'Jobs', path: '/jobs' },
      { icon: Radio, label: 'Live Dispatch', path: '/live-dispatch' },
      { icon: Wrench, label: 'Services', path: '/services' },
    ],
  },
  {
    label: 'People',
    items: [
      { icon: Users, label: 'Users', path: '/users' },
      { icon: UserCheck, label: 'Providers', path: '/providers' },
      { icon: UserCheck, label: 'Provider Approval', path: '/provider-approval' },
      { icon: FileCheck, label: 'Documents', path: '/documents' },
      { icon: UsersRound, label: 'Team', path: '/team' },
      { icon: BookOpen, label: 'Directory', path: '/directory' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { icon: CreditCard, label: 'Payments', path: '/payments' },
      { icon: DollarSign, label: 'Payouts', path: '/payouts' },
      { icon: Clock, label: 'Payout History', path: '/payout-history' },
      { icon: Wallet, label: 'Finance', path: '/finance' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { icon: BarChart3, label: 'Analytics', path: '/analytics' },
      { icon: FileBarChart2, label: 'Reporting', path: '/reporting' },
      { icon: MessageSquareWarning, label: 'Support Tickets', path: '/support-tickets' },
      { icon: Shield, label: 'Audit Trail', path: '/audit-trail' },
    ],
  },
  {
    label: 'System',
    items: [
      { icon: Settings, label: 'Settings', path: '/settings' },
    ],
  },
];

export function AdminSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useAdminSession();

  const visibleRoutes = getVisibleRoutes(session?.adminRole || 'admin');
  const isAllAccess = visibleRoutes.includes('*');

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  // Filter sections: only show items the user has permission for.
  // If a section ends up with zero visible items, hide it entirely.
  const filteredSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => isAllAccess || visibleRoutes.includes(item.path)
      ),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <nav className="w-72 h-screen bg-white border-r border-gray-200 flex flex-col" role="navigation" aria-label="Admin navigation">
      {/* Logo */}
      <div className="p-6 border-b border-gray-200">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-3 w-full"
        >
          <img src="/logo.svg" alt="TORC" className="h-10" />
          <div className="text-left">
            <p className="text-gray-400 text-xs">Management Console</p>
          </div>
        </motion.button>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {filteredSections.map((section) => (
          <div key={section.label}>
            <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <motion.button
                    key={item.path}
                    whileHover={{ x: 4 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => navigate(item.path)}
                    aria-current={active ? 'page' : undefined}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm cursor-pointer"
                    style={active
                      ? { backgroundColor: 'rgba(0,140,229,0.1)', border: '1px solid rgba(0,140,229,0.2)' }
                      : { border: '1px solid transparent' }
                    }
                  >
                    <Icon className="w-4 h-4" style={{ color: active ? '#008CE5' : '#9CA3AF' }} />
                    <span style={{ color: active ? '#008CE5' : '#4B5563', fontWeight: active ? 600 : 400 }}>{item.label}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Back to Website */}
      <div className="p-4 border-t border-gray-200">
        <motion.a
          href="https://www.torcapp.com"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-gray-100"
        >
          <Home className="w-5 h-5 text-gray-400" />
          <span className="text-gray-600">Back to Website</span>
        </motion.a>
      </div>
    </nav>
  );
}
