import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, User, Mail, Phone, Save, AlertCircle, CheckCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../lib/supabase';
import { CustomerBottomNav } from '../../components/CustomerBottomNav';

export function PersonalInfo() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { user, profile } = useAuth();
  const [loading, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    email: '',
  });

  function isMissingColumnError(err: any, columnNames: string[]) {
    const message = String(err?.message || '').toLowerCase();
    return columnNames.some((column) => message.includes(column.toLowerCase()));
  }

  useEffect(() => {
    if (profile) {
      setForm({
        first_name: profile.first_name || user?.user_metadata?.first_name || '',
        last_name: profile.last_name || user?.user_metadata?.last_name || '',
        phone: profile.phone || user?.user_metadata?.phone || '',
        email: user?.email || '',
      });
    }
  }, [profile, user]);

  const handleSave = async () => {
    if (!user?.id) return;

    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      const firstName = form.first_name.trim();
      const lastName = form.last_name.trim();
      const fullName = `${firstName} ${lastName}`.trim();
      const phone = form.phone.trim();
      const phoneFormatted = phone && !phone.startsWith('+') ? `+1${phone.replace(/\D/g, '')}` : phone;

      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: firstName,
          last_name: lastName,
          full_name: fullName,
          phone: phoneFormatted,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) {
        // Backward compatibility for older DB schemas before first_name/last_name existed.
        if (isMissingColumnError(error, ['first_name', 'last_name'])) {
          const { error: legacyError } = await supabase
            .from('profiles')
            .update({
              full_name: fullName || null,
              phone: phoneFormatted || null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', user.id);
          if (legacyError) throw legacyError;
        } else {
          throw error;
        }
      }

      // Keep auth metadata in sync for immediate UI fallback reads.
      await supabase.auth.updateUser({
        data: {
          first_name: firstName,
          last_name: lastName,
          full_name: fullName,
          phone: phoneFormatted,
        },
      }).catch(() => {});

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const inputContainerStyle = {
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F5F9FF',
    border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#D3E0F2'}`,
  };

  const inputStyle = {
    color: isDark ? '#FFFFFF' : '#1F2937',
    border: 'none' as const,
    boxShadow: 'none',
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
  };

  const labelColor = isDark ? 'rgba(255,255,255,0.7)' : '#374151';
  const textColor = isDark ? '#FFFFFF' : '#14263D';

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: isDark
          ? 'linear-gradient(180deg, #0A1626 0%, #081427 100%)'
          : 'linear-gradient(180deg, #F8FBFF 0%, #EAF2FF 100%)',
      }}
    >
      {/* Header */}
      <div className="p-6 flex items-center gap-4" style={{ paddingTop: 'calc(env(safe-area-inset-top, 16px) + 16px)' }}>
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', touchAction: 'manipulation' }}
        >
          <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
        </button>
        <h1 className="text-xl font-bold" style={{ color: textColor }}>Personal Information</h1>
      </div>

      {/* Form Content */}
      <div className="px-6 pb-24 flex-1 flex flex-col max-w-md mx-auto w-full">
        {/* Error message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl p-4 mb-5 flex items-center gap-3"
            style={{ backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#FEF2F2', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-red-500 text-sm">{error}</p>
          </motion.div>
        )}

        {/* Success message */}
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl p-4 mb-5 flex items-center gap-3"
            style={{ backgroundColor: 'rgba(0,140,229,0.1)', border: '1px solid rgba(0,140,229,0.2)' }}
          >
            <CheckCircle className="w-5 h-5" style={{ color: '#008CE5' }} />
            <p className="text-sm" style={{ color: '#008CE5' }}>Profile updated successfully!</p>
          </motion.div>
        )}

        <div className="space-y-4 mb-6">
          {/* First Name */}
          <div>
            <label className="text-sm font-medium mb-2 block" style={{ color: labelColor }}>
              First Name
            </label>
            <div
              className="flex items-center gap-3 rounded-2xl px-4 py-4 transition-all focus-within:ring-2 focus-within:ring-[#008CE5]/50"
              style={inputContainerStyle}
            >
              <User className="w-5 h-5 flex-shrink-0" style={{ color: '#008CE5' }} />
              <input
                type="text"
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                placeholder="Enter your first name"
                className="flex-1 bg-transparent border-none outline-none text-base"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Last Name */}
          <div>
            <label className="text-sm font-medium mb-2 block" style={{ color: labelColor }}>
              Last Name
            </label>
            <div
              className="flex items-center gap-3 rounded-2xl px-4 py-4 transition-all focus-within:ring-2 focus-within:ring-[#008CE5]/50"
              style={inputContainerStyle}
            >
              <User className="w-5 h-5 flex-shrink-0" style={{ color: '#008CE5' }} />
              <input
                type="text"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                placeholder="Enter your last name"
                className="flex-1 bg-transparent border-none outline-none text-base"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Email (read-only) */}
          <div>
            <label className="text-sm font-medium mb-2 block" style={{ color: labelColor }}>
              Email Address
            </label>
            <div
              className="flex items-center gap-3 rounded-2xl px-4 py-4 opacity-60"
              style={inputContainerStyle}
            >
              <Mail className="w-5 h-5 flex-shrink-0" style={{ color: '#0070B8' }} />
              <input
                type="email"
                value={form.email}
                disabled
                className="flex-1 bg-transparent border-none outline-none text-base"
                style={inputStyle}
              />
            </div>
            <p className="text-xs mt-1.5" style={{ color: isDark ? 'rgba(255,255,255,0.3)' : '#9CA3AF' }}>
              Email cannot be changed
            </p>
          </div>

          {/* Phone */}
          <div>
            <label className="text-sm font-medium mb-2 block" style={{ color: labelColor }}>
              Phone Number
            </label>
            <div
              className="flex items-center gap-3 rounded-2xl px-4 py-4 transition-all focus-within:ring-2 focus-within:ring-[#008CE5]/50"
              style={inputContainerStyle}
            >
              <Phone className="w-5 h-5 flex-shrink-0" style={{ color: '#0070B8' }} />
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+1 (555) 000-0000"
                className="flex-1 bg-transparent border-none outline-none text-base"
                style={inputStyle}
              />
            </div>
            <p className="text-xs mt-1.5" style={{ color: isDark ? 'rgba(255,255,255,0.3)' : '#9CA3AF' }}>
              We'll auto-add +1 if you don't include a country code
            </p>
          </div>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={loading}
          className="w-full rounded-2xl py-4 font-bold text-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
          style={{
            background: 'linear-gradient(to right, #008CE5, #0070B8)',
            color: '#FFFFFF',
            boxShadow: '0 8px 24px rgba(0,140,229,0.3)',
            touchAction: 'manipulation',
          }}
        >
          {loading ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-5 h-5" />
              Save Changes
            </>
          )}
        </button>
      </div>
      <CustomerBottomNav />
    </div>
  );
}
