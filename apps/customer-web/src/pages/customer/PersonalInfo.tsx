import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, User, Mail, Phone, Save, AlertCircle, CheckCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../lib/supabase';

function IconBadge({ children, color = '#2EFFAF' }: { children: React.ReactNode; color?: string }) {
  return (
    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${color}15` }}>
      {children}
    </div>
  );
}

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
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      const phone = form.phone.trim();
      const phoneFormatted = phone && !phone.startsWith('+') ? `+1${phone.replace(/\D/g, '')}` : phone;

      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          full_name: `${form.first_name.trim()} ${form.last_name.trim()}`.trim(),
          phone: phoneFormatted,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);
      if (error) throw error;
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F9FAFB',
    border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB'}`,
    color: isDark ? '#FFFFFF' : '#1F2937',
  };
  const labelColor = isDark ? 'rgba(255,255,255,0.7)' : '#374151';
  const textColor = isDark ? '#FFFFFF' : '#1A1F2E';

  return (
    <div className="min-h-screen" style={{ background: isDark ? '#0F1419' : '#F5F7FA' }}>
      <div className="p-6 flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}>
          <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
        </button>
        <h1 className="text-xl font-bold" style={{ color: textColor }}>Personal Information</h1>
      </div>

      <div className="px-6 pb-8">
        {error && (
          <div className="rounded-2xl p-4 mb-4 flex items-center gap-3" style={{ backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#FEF2F2', border: '1px solid rgba(239,68,68,0.2)' }}>
            <AlertCircle className="w-5 h-5 text-red-500" />
            <p className="text-red-500 text-sm">{error}</p>
          </div>
        )}
        {success && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl p-4 mb-4 flex items-center gap-3" style={{ backgroundColor: 'rgba(46,255,175,0.1)', border: '1px solid rgba(46,255,175,0.2)' }}>
            <CheckCircle className="w-5 h-5" style={{ color: '#2EFFAF' }} />
            <p className="text-sm" style={{ color: '#2EFFAF' }}>Profile updated successfully!</p>
          </motion.div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block" style={{ color: labelColor }}>First Name</label>
              <div className="flex items-center gap-2.5 rounded-2xl px-3 py-3.5 focus-within:ring-2 focus-within:ring-[#2EFFAF]/50" style={inputStyle}>
                <IconBadge><User className="w-4 h-4" style={{ color: '#2EFFAF' }} /></IconBadge>
                <input type="text" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} placeholder="First" className="flex-1 bg-transparent border-none outline-none text-sm" style={{ color: isDark ? '#FFFFFF' : '#1F2937' }} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block" style={{ color: labelColor }}>Last Name</label>
              <div className="flex items-center gap-2.5 rounded-2xl px-3 py-3.5 focus-within:ring-2 focus-within:ring-[#2EFFAF]/50" style={inputStyle}>
                <IconBadge><User className="w-4 h-4" style={{ color: '#2EFFAF' }} /></IconBadge>
                <input type="text" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} placeholder="Last" className="flex-1 bg-transparent border-none outline-none text-sm" style={{ color: isDark ? '#FFFFFF' : '#1F2937' }} />
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block" style={{ color: labelColor }}>Email</label>
            <div className="flex items-center gap-2.5 rounded-2xl px-3 py-3.5 opacity-60" style={inputStyle}>
              <IconBadge color="#007AFF"><Mail className="w-4 h-4" style={{ color: '#007AFF' }} /></IconBadge>
              <input type="email" value={form.email} disabled className="flex-1 bg-transparent border-none outline-none text-sm" style={{ color: isDark ? '#FFFFFF' : '#1F2937' }} />
            </div>
            <p className="text-xs mt-1" style={{ color: isDark ? 'rgba(255,255,255,0.3)' : '#9CA3AF' }}>Email cannot be changed</p>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block" style={{ color: labelColor }}>Phone Number</label>
            <div className="flex items-center gap-2.5 rounded-2xl px-3 py-3.5 focus-within:ring-2 focus-within:ring-[#2EFFAF]/50" style={inputStyle}>
              <IconBadge color="#007AFF"><Phone className="w-4 h-4" style={{ color: '#007AFF' }} /></IconBadge>
              <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+1 (555) 000-0000" className="flex-1 bg-transparent border-none outline-none text-sm" style={{ color: isDark ? '#FFFFFF' : '#1F2937' }} />
            </div>
            <p className="text-xs mt-1" style={{ color: isDark ? 'rgba(255,255,255,0.3)' : '#9CA3AF' }}>We'll auto-add +1 if you don't include a country code</p>
          </div>
        </div>

        <motion.button whileTap={{ scale: 0.98 }} onClick={handleSave} disabled={loading}
          className="w-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-2xl py-4 font-bold text-[#0F1419] text-lg mt-8 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? (<><div className="w-5 h-5 border-2 border-[#0F1419] border-t-transparent rounded-full animate-spin" />Saving...</>) : (<><Save className="w-5 h-5" />Save Changes</>)}
        </motion.button>
      </div>
    </div>
  );
}
