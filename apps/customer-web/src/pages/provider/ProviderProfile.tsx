import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ProviderBottomNav } from '../../components/ProviderBottomNav';
import { ArrowLeft, User, Star, FileText, CreditCard, Bell, HelpCircle, LogOut, ChevronRight, Wrench, Building2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useState, useEffect } from 'react';

export function ProviderProfile() {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const [providerData, setProviderData] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from('provider_profiles').select('*').eq('id', user.id).single()
      .then(({ data }) => { if (data) setProviderData(data); });
  }, [user]);

  const displayName = profile?.first_name
    ? `${profile.first_name} ${profile.last_name || ''}`.trim()
    : user?.email?.split('@')[0] || 'Provider';
  const initials = profile?.first_name
    ? `${profile.first_name[0]}${(profile.last_name || '')[0] || ''}`.toUpperCase()
    : (user?.email?.[0] || 'P').toUpperCase();
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : '-';
  const pRating = providerData?.rating || 0;
  const pJobs = providerData?.total_jobs || 0;
  const pAccept = providerData?.acceptance_rate || 0;

  const profileSections = [
    {
      title: 'Account',
      items: [
        { icon: User, label: 'Personal Information', path: '#' },
        { icon: Wrench, label: 'My Services', path: '/provider/services-list', badge: providerData?.services?.length ? `${providerData.services.length} Active` : null },
        { icon: FileText, label: 'Documents & Verification', path: '/provider/documents', badge: providerData?.is_verified ? 'Verified' : 'Pending' },
        { icon: Star, label: 'Ratings & Reviews', path: '#', value: pRating > 0 ? pRating.toFixed(1) : '-' },
      ],
    },
    {
      title: 'Payments',
      items: [
        { icon: Building2, label: 'Bank Accounts', path: '/provider/bank-accounts', badge: null },
        { icon: CreditCard, label: 'Payout Methods', path: '#' },
        { icon: FileText, label: 'Tax Documents', path: '#' },
      ],
    },
    {
      title: 'Settings',
      items: [
        { icon: Bell, label: 'Notifications', path: '#' },
        { icon: HelpCircle, label: 'Help & Support', path: '#' },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-[#252B3D] relative overflow-hidden pb-24">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-[#2EFFAF] opacity-10 blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <div className="relative z-10 p-6 flex items-center gap-4">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate(-1)}
          className="glass rounded-full p-3"
        >
          <ArrowLeft className="w-6 h-6 text-white" />
        </motion.button>
        <h1 className="text-2xl font-bold text-white">Profile</h1>
      </div>

      {/* Profile card */}
      <div className="relative z-10 px-6 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-[32px] p-6 text-center"
        >
          <div 
            className="w-24 h-24 rounded-full bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center mx-auto mb-4"
            style={{
              boxShadow: '0 10px 30px rgba(46, 255, 175, 0.3)',
            }}
          >
            <span className="text-[#0F1419] font-bold text-3xl">{initials}</span>
          </div>
          <h2 className="text-white font-bold text-2xl mb-1">{displayName}</h2>
          <p className="text-white/60 mb-4">Provider since {memberSince}</p>

          <div className="grid grid-cols-3 gap-3">
            <div className="glass rounded-2xl p-3">
              <p className="text-[#2EFFAF] font-bold text-xl">{pRating > 0 ? pRating.toFixed(1) : '-'}</p>
              <p className="text-white/60 text-xs">Rating</p>
            </div>
            <div className="glass rounded-2xl p-3">
              <p className="text-[#2EFFAF] font-bold text-xl">{pJobs}</p>
              <p className="text-white/60 text-xs">Jobs</p>
            </div>
            <div className="glass rounded-2xl p-3">
              <p className="text-[#2EFFAF] font-bold text-xl">{pAccept > 0 ? `${Math.round(pAccept)}%` : '-'}</p>
              <p className="text-white/60 text-xs">Accept</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Profile sections */}
      <div className="relative z-10 px-6 space-y-6">
        {profileSections.map((section, sectionIndex) => (
          <motion.div
            key={section.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + sectionIndex * 0.1 }}
          >
            <h3 className="text-white/60 text-sm font-semibold mb-3 px-2">{section.title}</h3>
            <div className="glass rounded-[24px] overflow-hidden">
              {section.items.map((item, index) => {
                const Icon = item.icon;
                return (
                  <motion.button
                    key={item.label}
                    whileHover={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => navigate(item.path)}
                    className={`w-full p-5 flex items-center justify-between ${
                      index !== section.items.length - 1 ? 'border-b border-white/10' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="w-5 h-5 text-white/60" />
                      <span className="text-white font-medium">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.badge && (
                        <span className="px-3 py-1 rounded-full bg-[#2EFFAF]/20 text-[#2EFFAF] text-xs font-semibold">
                          {item.badge}
                        </span>
                      )}
                      {item.value && (
                        <span className="text-white/60 text-sm">{item.value}</span>
                      )}
                      <ChevronRight className="w-5 h-5 text-white/40" />
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Logout button */}
      <div className="relative z-10 px-6 mt-6">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={async () => { await signOut(); navigate('/'); }}
          className="w-full glass rounded-[24px] p-5 flex items-center justify-center gap-3 text-red-400"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-semibold">Log Out</span>
        </motion.button>
      </div>

      {/* Bottom navigation */}
      <ProviderBottomNav />
    </div>
  );
}