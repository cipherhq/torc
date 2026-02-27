import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, User, Star, FileText, CreditCard, Bell, HelpCircle, LogOut, ChevronRight, Wrench, Building2, Sun, Moon, Car, Shield, Camera, BarChart3 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../lib/supabase';
import { useState, useEffect, useRef } from 'react';

export function ProviderProfile() {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [providerData, setProviderData] = useState<any>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from('provider_profiles').select('*').eq('id', user.id).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setProviderData(data);
          if (data.avatar_url) setAvatarUrl(data.avatar_url);
        }
      });
  }, [user]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be under 5MB');
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const filePath = `${user.id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('provider-documents')
        .upload(filePath, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage
        .from('provider-documents')
        .getPublicUrl(filePath);
      const publicUrl = urlData.publicUrl + '?t=' + Date.now();
      await supabase.from('provider_profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);
      setAvatarUrl(publicUrl);
    } catch (err) {
      console.error('Avatar upload error:', err);
      alert('Failed to upload photo. Please try again.');
    } finally {
      setUploading(false);
    }
  };

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

  const textColor = isDark ? '#FFFFFF' : '#14263D';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2';
  const sectionLabelColor = isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF';
  const dividerColor = isDark ? 'rgba(255,255,255,0.06)' : '#E8F0FB';

  const profileSections = [
    {
      title: 'Account',
      items: [
        { icon: User, label: 'Personal Information', path: '/provider/personal-information', iconColor: '#008CE5' },
        { icon: Car, label: 'Vehicles', path: '/provider/vehicles', iconColor: '#0070B8' },
        { icon: Shield, label: 'Account Security', path: '/provider/account-security', iconColor: '#0070B8' },
        { icon: Wrench, label: 'My Services', path: '/services-list', badge: providerData?.services?.length ? `${providerData.services.length} Active` : null, iconColor: '#0070B8' },
        { icon: FileText, label: 'Documents & Verification', path: '/provider/documents', badge: providerData?.is_verified ? 'Verified' : 'Pending', iconColor: '#F59E0B' },
        { icon: Star, label: 'Ratings & Reviews', path: '/provider/ratings-reviews', value: pRating > 0 ? pRating.toFixed(1) : '-', iconColor: '#008CE5' },
      ],
    },
    {
      title: 'Payments',
      items: [
        { icon: Building2, label: 'Bank Accounts', path: '/provider/payout', badge: null, iconColor: '#0070B8' },
        { icon: CreditCard, label: 'Payout Methods', path: '/provider/payout', iconColor: '#008CE5' },
        { icon: BarChart3, label: 'Reporting', path: '/provider/reporting', iconColor: '#008CE5' },
        { icon: FileText, label: 'Tax Documents', path: '/provider/tax-documents', iconColor: '#F59E0B' },
      ],
    },
    {
      title: 'Settings',
      items: [
        { icon: Bell, label: 'Notifications', path: '/provider/notifications', iconColor: '#0070B8' },
        { icon: HelpCircle, label: 'Help & Support', path: '/provider/help-support', iconColor: '#008CE5' },
      ],
    },
  ];

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: isDark ? 'linear-gradient(180deg, #0A1626 0%, #081427 100%)' : 'linear-gradient(180deg, #F8FBFF 0%, #EAF2FF 100%)', paddingBottom: 'calc(96px + env(safe-area-inset-bottom, 0px))' }}>
      {/* Header */}
      <div className="relative z-10 p-6 flex items-center gap-4" style={{ paddingTop: 'max(calc(24px + env(safe-area-inset-top, 0px)), 60px)' }}>
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}
          title="Go back"
        >
          <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
        </button>
        <h1 className="text-2xl font-bold" style={{ color: textColor }}>Profile</h1>
      </div>

      {/* Profile card */}
      <div className="relative z-10 px-6 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-6 text-center"
          style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}`, boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.06)' }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleAvatarUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="relative w-28 h-28 rounded-full mx-auto mb-3"
          >
            {/* Blue circle background */}
            <div
              className="w-full h-full rounded-full overflow-hidden"
              style={{
                background: avatarUrl ? 'none' : 'linear-gradient(135deg, #008CE5 0%, #0070B8 100%)',
                boxShadow: '0 8px 24px rgba(0,140,229,0.25)',
              }}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                  <User className="w-10 h-10 text-white/80" />
                  <span className="text-white/90 text-[10px] font-semibold">Add Photo</span>
                </div>
              )}
            </div>
            {/* Camera badge */}
            <div
              className="absolute bottom-0 right-0 w-9 h-9 rounded-full flex items-center justify-center border-[3px]"
              style={{
                background: 'linear-gradient(135deg, #008CE5, #0070B8)',
                borderColor: isDark ? '#0B1F35' : '#FFFFFF',
                boxShadow: '0 2px 8px rgba(0,140,229,0.4)',
              }}
            >
              {uploading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Camera className="w-4 h-4 text-white" />
              )}
            </div>
          </button>
          <h2 className="font-bold text-xl mb-0.5" style={{ color: textColor }}>{displayName}</h2>
          <p className="text-sm mb-5" style={{ color: subColor }}>Provider since {memberSince}</p>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Rating', value: pRating > 0 ? pRating.toFixed(1) : '-' },
              { label: 'Jobs', value: pJobs },
              { label: 'Accept', value: pAccept > 0 ? `${Math.round(pAccept)}%` : '-' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl p-3" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F5F9FF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#D3E0F2'}` }}>
                <p className="font-bold text-lg" style={{ color: '#008CE5' }}>{s.value}</p>
                <p className="text-xs" style={{ color: subColor }}>{s.label}</p>
              </div>
            ))}
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
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3 px-1" style={{ color: sectionLabelColor }}>
              {section.title}
            </h3>
            <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}`, boxShadow: isDark ? 'none' : '0 1px 2px rgba(0,0,0,0.04)' }}>
              {section.items.map((item, index) => {
                const Icon = item.icon;
                return (
                  <motion.button
                    key={item.label}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => navigate(item.path)}
                    className="w-full p-4 flex items-center justify-between"
                    style={{ borderBottom: index !== section.items.length - 1 ? `1px solid ${dividerColor}` : 'none' }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${item.iconColor}15` }}>
                        <Icon className="w-5 h-5" style={{ color: item.iconColor }} />
                      </div>
                      <span className="font-medium" style={{ color: textColor }}>{item.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.badge && (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: 'rgba(0,140,229,0.12)', color: '#008CE5' }}>
                          {item.badge}
                        </span>
                      )}
                      {item.value && (
                        <span className="text-sm" style={{ color: subColor }}>{item.value}</span>
                      )}
                      <ChevronRight className="w-4 h-4" style={{ color: isDark ? 'rgba(255,255,255,0.2)' : '#D1D5DB' }} />
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        ))}

        {/* Appearance / Dark Mode Toggle */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-3 px-1" style={{ color: sectionLabelColor }}>
            Appearance
          </h3>
          <button
            className="w-full rounded-2xl p-4 flex items-center gap-3"
            style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}`, boxShadow: isDark ? 'none' : '0 1px 2px rgba(0,0,0,0.04)' }}
            onClick={toggleTheme}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(0,140,229,0.12)' }}>
              {isDark ? <Moon className="w-5 h-5" style={{ color: '#008CE5' }} /> : <Sun className="w-5 h-5" style={{ color: '#008CE5' }} />}
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium" style={{ color: textColor }}>{isDark ? 'Dark Mode' : 'Light Mode'}</p>
              <p className="text-xs" style={{ color: subColor }}>Tap to switch appearance</p>
            </div>
            <div className="w-12 h-7 rounded-full p-0.5 transition-colors" style={{ backgroundColor: isDark ? '#008CE5' : '#D1D5DB' }}>
              <motion.div
                className="w-6 h-6 rounded-full bg-white shadow-sm"
                animate={{ x: isDark ? 20 : 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            </div>
          </button>
        </motion.div>
      </div>

      {/* Logout button */}
      <div className="relative z-10 px-6 mt-6">
        <button
          onClick={async () => { await signOut(); navigate('/'); }}
          className="w-full rounded-2xl p-4 flex items-center justify-center gap-3"
          style={{ backgroundColor: isDark ? 'rgba(239,68,68,0.08)' : '#FEF2F2', border: '1px solid rgba(239,68,68,0.2)' }}
        >
          <LogOut className="w-5 h-5 text-red-500" />
          <span className="font-semibold text-red-500">Log Out</span>
        </button>

        <p className="text-center text-xs mt-4 mb-6" style={{ color: subColor }}>Version 1.0.0</p>
      </div>

    </div>
  );
}
