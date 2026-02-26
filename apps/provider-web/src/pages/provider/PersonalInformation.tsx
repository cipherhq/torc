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
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FDFBF8',
    border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#E8E4DE'}`,
    color: isDark ? '#FFFFFF' : '#1F2937',
  };

  return (
    <div className="min-h-screen p-6" style={{ background: isDark ? '#0F1419' : '#FAF8F5', paddingTop: 'var(--safe-top)' }}>
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/profile')}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E8E4DE' }}
          title="Back to profile"
        >
          <ArrowLeft className="w-5 h-5" style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }} />
        </button>
        <h1 className="text-2xl font-bold" style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }}>Personal Information</h1>
      </div>

      <div className="rounded-2xl p-6" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#E8E4DE'}` }}>
        <div className="flex items-center gap-3 mb-4">
          <User className="w-5 h-5" style={{ color: '#008CE5' }} />
          <p className="font-semibold" style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }}>Account details</p>
        </div>

        <div className="space-y-4 text-sm">
          <div>
            <p style={{ color: isDark ? 'rgba(255,255,255,0.5)' : '#6B7280' }}>Full name</p>
            <p style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }}>{fullName || '-'}</p>
          </div>
          <div>
            <p style={{ color: isDark ? 'rgba(255,255,255,0.5)' : '#6B7280' }}>Email</p>
            <p style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }}>{user?.email || '-'}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <input type="text" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} placeholder="First name" className="rounded-xl px-3 py-2 bg-transparent outline-none" style={inputStyle} />
            <input type="text" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} placeholder="Last name" className="rounded-xl px-3 py-2 bg-transparent outline-none" style={inputStyle} />
          </div>

          <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone number" className="w-full rounded-xl px-3 py-2 bg-transparent outline-none" style={inputStyle} />

          <div className="pt-2">
            <p className="font-semibold mb-2" style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }}>Address</p>
            <div className="space-y-3">
              <input type="text" value={form.address_line1} onChange={(e) => setForm({ ...form, address_line1: e.target.value })} placeholder="Address line 1" className="w-full rounded-xl px-3 py-2 bg-transparent outline-none" style={inputStyle} />
              <input type="text" value={form.address_line2} onChange={(e) => setForm({ ...form, address_line2: e.target.value })} placeholder="Address line 2 (optional)" className="w-full rounded-xl px-3 py-2 bg-transparent outline-none" style={inputStyle} />
              <div className="grid grid-cols-2 gap-3">
                <input type="text" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="City" className="rounded-xl px-3 py-2 bg-transparent outline-none" style={inputStyle} />
                <input type="text" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="State" className="rounded-xl px-3 py-2 bg-transparent outline-none" style={inputStyle} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="text" value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} placeholder="Postal code" className="rounded-xl px-3 py-2 bg-transparent outline-none" style={inputStyle} />
                <input type="text" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="Country" className="rounded-xl px-3 py-2 bg-transparent outline-none" style={inputStyle} />
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
              style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F5F2ED', color: isDark ? '#FFFFFF' : '#6B7280' }}
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              className="flex-1 rounded-xl py-3 font-semibold text-white bg-gradient-to-r from-[#008CE5] to-[#0070B8] disabled:opacity-50 flex items-center justify-center gap-2"
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
