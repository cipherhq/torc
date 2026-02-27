import { useNavigate } from 'react-router';
import { ArrowLeft, User, Save } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

export function PersonalInformation() {
  const navigate = useNavigate();
  const { user, profile, updateProfile } = useAuth() as any;
  const { isDark } = useTheme();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    first_name: profile?.first_name || '',
    last_name: profile?.last_name || '',
    phone: profile?.phone || '',
    address_line1: profile?.address_line1 || '',
    address_line2: profile?.address_line2 || '',
    city: profile?.city || '',
    state: profile?.state || '',
    postal_code: profile?.postal_code || '',
    country: profile?.country || '',
  });

  const fullName = useMemo(() => {
    const name = `${form.first_name || ''} ${form.last_name || ''}`.trim();
    return name || profile?.full_name || '-';
  }, [form.first_name, form.last_name, profile?.full_name]);

  async function onSave() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await updateProfile({
        first_name: form.first_name.trim() || null,
        last_name: form.last_name.trim() || null,
        phone: form.phone.trim() || null,
        address_line1: form.address_line1.trim() || null,
        address_line2: form.address_line2.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        postal_code: form.postal_code.trim() || null,
        country: form.country.trim() || null,
      });
      setMessage('Profile updated successfully.');
    } catch (e: any) {
      console.warn('Failed to update profile:', e);
      if (e?.message?.includes('address_line1') || e?.message?.includes('postal_code') || e?.message?.includes('column')) {
        setError('Address columns are missing in your profiles table. Run latest migration and try again.');
      } else {
        setError('Could not update profile right now.');
      }
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F5F9FF',
    border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#D3E0F2'}`,
    color: isDark ? '#FFFFFF' : '#1F2937',
  };
  const textColor = isDark ? '#FFFFFF' : '#14263D';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2';

  return (
    <div className="min-h-screen p-6 pb-28" style={{ background: isDark ? 'linear-gradient(180deg, #0A1626 0%, #081427 100%)' : 'linear-gradient(180deg, #F8FBFF 0%, #EAF2FF 100%)', paddingTop: 'var(--safe-top)' }}>
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/profile')}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2' }}
          title="Back to profile"
        >
          <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
        </button>
        <h1 className="text-2xl font-bold" style={{ color: textColor }}>Personal Information</h1>
      </div>

      <div className="rounded-3xl p-6" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}`, boxShadow: isDark ? 'none' : '0 4px 20px rgba(0,0,0,0.05)' }}>
        <div className="flex items-center gap-3 mb-4">
          <User className="w-5 h-5" style={{ color: '#008CE5' }} />
          <p className="font-semibold" style={{ color: textColor }}>Account details</p>
        </div>

        <div className="space-y-4 text-sm">
          <div>
            <p style={{ color: subColor }}>Full name</p>
            <p style={{ color: textColor }}>{fullName || '-'}</p>
          </div>
          <div>
            <p style={{ color: subColor }}>Email</p>
            <p style={{ color: textColor }}>{user?.email || '-'}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <input type="text" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} placeholder="First name" className="rounded-xl px-4 py-3 bg-transparent outline-none" style={inputStyle} />
            <input type="text" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} placeholder="Last name" className="rounded-xl px-4 py-3 bg-transparent outline-none" style={inputStyle} />
          </div>

          <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone number" className="w-full rounded-xl px-4 py-3 bg-transparent outline-none" style={inputStyle} />

          <div className="pt-2">
            <p className="font-semibold mb-2" style={{ color: textColor }}>Address</p>
            <div className="space-y-3">
              <input type="text" value={form.address_line1} onChange={(e) => setForm({ ...form, address_line1: e.target.value })} placeholder="Address line 1" className="w-full rounded-xl px-4 py-3 bg-transparent outline-none" style={inputStyle} />
              <input type="text" value={form.address_line2} onChange={(e) => setForm({ ...form, address_line2: e.target.value })} placeholder="Address line 2 (optional)" className="w-full rounded-xl px-4 py-3 bg-transparent outline-none" style={inputStyle} />
              <div className="grid grid-cols-2 gap-3">
                <input type="text" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="City" className="rounded-xl px-4 py-3 bg-transparent outline-none" style={inputStyle} />
                <input type="text" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="State" className="rounded-xl px-4 py-3 bg-transparent outline-none" style={inputStyle} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="text" value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} placeholder="Postal code" className="rounded-xl px-4 py-3 bg-transparent outline-none" style={inputStyle} />
                <input type="text" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="Country" className="rounded-xl px-4 py-3 bg-transparent outline-none" style={inputStyle} />
              </div>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
          {message && (
            <p className="text-sm text-[#008CE5]">{message}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              onClick={() => navigate('/profile')}
              className="flex-1 rounded-xl py-3 font-medium"
              style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E8F0FB', color: isDark ? '#FFFFFF' : '#6B7280' }}
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              className="flex-1 rounded-xl py-3 font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #008CE5, #0070B8)', color: '#FFFFFF', boxShadow: '0 6px 16px rgba(0,140,229,0.30)' }}
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
