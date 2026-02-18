import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { CustomerBottomNav } from '../../components/CustomerBottomNav';
import { User, Car, Bell, HelpCircle, ChevronRight, LogOut, CreditCard, History } from 'lucide-react';
import { ThemeToggle } from '../../components/ThemeToggle';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useState, useEffect } from 'react';

export function Profile() {
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();
  const { user, profile, signOut } = useAuth();
  const [vehicleCount, setVehicleCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('vehicles')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .then(({ count }) => setVehicleCount(count || 0));
  }, [user]);

  const getInitials = () => {
    if (profile?.first_name && profile?.last_name) {
      return `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase();
    }
    if (profile?.full_name) {
      const parts = profile.full_name.split(' ');
      return parts.map((p: string) => p[0]).join('').toUpperCase().slice(0, 2);
    }
    if (user?.email) return user.email[0].toUpperCase();
    return 'U';
  };

  const getFullName = () => {
    if (profile?.first_name && profile?.last_name) return `${profile.first_name} ${profile.last_name}`;
    if (profile?.full_name) return profile.full_name;
    if (user?.email) return user.email.split('@')[0];
    return 'User';
  };

  const getPhone = () => {
    if (profile?.phone) return profile.phone;
    if (user?.user_metadata?.phone) return user.user_metadata.phone;
    return 'No phone added';
  };

  const getMemberYears = () => {
    const dateStr = profile?.member_since || profile?.created_at || user?.created_at;
    if (!dateStr) return 'New';
    const memberDate = new Date(dateStr);
    const now = new Date();
    const years = Math.floor((now.getTime() - memberDate.getTime()) / (1000 * 60 * 60 * 24 * 365));
    return years > 0 ? years.toString() : 'New';
  };

  const handleLogout = async () => {
    try {
      await signOut();
      navigate('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const menuItems = [
    {
      section: 'Account',
      items: [
        { icon: User, label: 'Personal Information', count: null, path: '/customer/personal-info' },
        { icon: Car, label: 'My Vehicles', count: vehicleCount, path: '/customer/vehicles' },
      ],
    },
    {
      section: 'Services',
      items: [
        { icon: History, label: 'Service History', count: null, path: '/customer/service-history' },
        { icon: CreditCard, label: 'Payment Methods', count: null, path: '/customer/payment-methods' },
      ],
    },
    {
      section: 'Preferences',
      items: [
        { icon: Bell, label: 'Notifications', count: null, path: '/customer/notifications' },
      ],
    },
    {
      section: 'Support',
      items: [
        { icon: HelpCircle, label: 'Help Center', count: null, path: '/customer/help-center' },
      ],
    },
  ];

  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB';
  const textColor = isDark ? '#FFFFFF' : '#1A1F2E';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';

  return (
    <div className="min-h-screen pb-24" style={{ background: isDark ? '#0F1419' : '#F5F7FA' }}>
      {/* Header */}
      <div className="p-6">
        <h1 className="text-3xl font-bold mb-1" style={{ color: textColor }}>Profile</h1>
        <p style={{ color: subColor }}>Manage your account and preferences</p>
      </div>

      <div className="px-6">
        {/* User Card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-6 mb-8"
          style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}`, boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.06)' }}
        >
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center text-2xl font-bold text-[#0A0F1E]">
              {getInitials()}
            </div>
            <div className="flex-1">
              <h2 className="font-bold text-xl" style={{ color: textColor }}>{getFullName()}</h2>
              <p className="text-sm" style={{ color: subColor }}>{getPhone()}</p>
              <p className="text-sm" style={{ color: subColor }}>{user?.email}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-5 border-t" style={{ borderColor: cardBorder }}>
            <div className="text-center">
              <p className="text-xl font-bold" style={{ color: '#2EFFAF' }}>{profile?.total_jobs ?? 0}</p>
              <p className="text-xs mt-0.5" style={{ color: subColor }}>Total Saves</p>
            </div>
            <div className="text-center border-x" style={{ borderColor: cardBorder }}>
              <p className="text-xl font-bold" style={{ color: '#2EFFAF' }}>{profile?.rating || '-'}</p>
              <p className="text-xs mt-0.5" style={{ color: subColor }}>Your Rating</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold" style={{ color: '#2EFFAF' }}>{getMemberYears()}</p>
              <p className="text-xs mt-0.5" style={{ color: subColor }}>Years Member</p>
            </div>
          </div>
        </motion.div>

        {/* Menu Sections */}
        {menuItems.map((section, si) => (
          <div key={section.section} className="mb-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3 px-1" style={{ color: subColor }}>
              {section.section}
            </h3>
            <div className="space-y-2">
              {section.items.map((item, ii) => {
                const Icon = item.icon;
                return (
                  <motion.button key={item.label}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: si * 0.08 + ii * 0.04 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full rounded-2xl p-4 flex items-center gap-4"
                    style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}`, boxShadow: isDark ? 'none' : '0 1px 2px rgba(0,0,0,0.04)' }}
                    onClick={() => navigate(item.path)}
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(46,255,175,0.1)' }}>
                      <Icon className="w-5 h-5" style={{ color: '#2EFFAF' }} />
                    </div>
                    <p className="flex-1 text-left font-medium" style={{ color: textColor }}>{item.label}</p>
                    {item.count !== null && (
                      <span className="text-sm font-semibold px-2.5 py-0.5 rounded-full" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6', color: subColor }}>{item.count}</span>
                    )}
                    <ChevronRight className="w-4 h-4" style={{ color: subColor }} />
                  </motion.button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Theme Toggle */}
        <div className="mb-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-3 px-1" style={{ color: subColor }}>Appearance</h3>
          <button
            className="w-full rounded-2xl p-4 flex items-center gap-4"
            style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
            onClick={toggleTheme}
          >
            <ThemeToggle
              size="md"
              className="pointer-events-none bg-transparent border-0 text-[#2EFFAF]"
            />
            <div className="flex-1 text-left">
              <p className="font-medium" style={{ color: textColor }}>{isDark ? 'Dark Mode' : 'Light Mode'}</p>
            </div>
            <div className="w-12 h-7 rounded-full p-0.5 transition-colors" style={{ backgroundColor: isDark ? '#2EFFAF' : '#D1D5DB' }}>
              <motion.div className="w-6 h-6 rounded-full bg-white shadow-sm" animate={{ x: isDark ? 20 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }} />
            </div>
          </button>
        </div>

        {/* Logout */}
        <button className="w-full rounded-2xl p-4 flex items-center gap-4 mb-6" style={{ backgroundColor: isDark ? 'rgba(239,68,68,0.08)' : '#FEF2F2', border: '1px solid rgba(239,68,68,0.2)' }} onClick={handleLogout}>
          <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
            <LogOut className="w-5 h-5 text-red-500" />
          </div>
          <p className="flex-1 text-left font-medium text-red-500">Logout</p>
        </button>

        <p className="text-center text-xs mb-6" style={{ color: subColor }}>Version 1.0.0</p>
      </div>

      <CustomerBottomNav />
    </div>
  );
}
