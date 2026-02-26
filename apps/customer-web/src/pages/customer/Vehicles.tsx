import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Car, Plus, Trash2, Star, Calendar, Palette, Hash } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../lib/supabase';

function IconBadge({ children, color = '#008CE5' }: { children: React.ReactNode; color?: string }) {
  return (
    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${color}15` }}>
      {children}
    </div>
  );
}

interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number | null;
  color: string;
  plate: string;
  is_default: boolean;
}

export function Vehicles() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ make: '', model: '', year: '', color: '', plate: '' });

  const textColor = isDark ? '#FFFFFF' : '#1A1F2E';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E8E4DE';

  useEffect(() => {
    if (user) fetchVehicles();
  }, [user]);

  const fetchVehicles = async () => {
    const { data } = await supabase.from('vehicles').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    setVehicles(data || []);
    setLoading(false);
  };

  const addVehicle = async () => {
    if (!form.make || !form.model) return;
    setSaving(true);
    const { error } = await supabase.from('vehicles').insert({
      user_id: user.id,
      make: form.make,
      model: form.model,
      year: form.year ? parseInt(form.year) : null,
      color: form.color || null,
      plate: form.plate || null,
      is_default: vehicles.length === 0,
    });
    if (!error) {
      setForm({ make: '', model: '', year: '', color: '', plate: '' });
      setShowAdd(false);
      fetchVehicles();
    }
    setSaving(false);
  };

  const deleteVehicle = async (id: string) => {
    await supabase.from('vehicles').delete().eq('id', id);
    fetchVehicles();
  };

  const setDefault = async (id: string) => {
    await supabase.from('vehicles').update({ is_default: false }).eq('user_id', user.id);
    await supabase.from('vehicles').update({ is_default: true }).eq('id', id);
    fetchVehicles();
  };

  const inputStyle = {
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FDFBF8',
    border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#E8E4DE'}`,
    color: isDark ? '#FFFFFF' : '#1F2937',
  };

  return (
    <div className="min-h-screen" style={{ background: isDark ? '#0F1419' : '#FAF8F5' }}>
      <div className="p-6 flex items-center gap-4" style={{ paddingTop: 'var(--safe-top)' }}>
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}>
          <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
        </button>
        <h1 className="text-xl font-bold flex-1" style={{ color: textColor }}>My Vehicles</h1>
        <button onClick={() => setShowAdd(!showAdd)} className="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-r from-[#008CE5] to-[#0070B8]">
          <Plus className="w-5 h-5 text-white" />
        </button>
      </div>

      <div className="px-6 pb-8">
        {/* Add Vehicle Form */}
        {showAdd && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            className="rounded-2xl p-5 mb-6" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
          >
            <h3 className="font-semibold mb-4" style={{ color: textColor }}>Add Vehicle</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={inputStyle}>
                  <IconBadge><Car className="w-4 h-4" style={{ color: '#008CE5' }} /></IconBadge>
                  <input type="text" value={form.make} onChange={e => setForm({ ...form, make: e.target.value })} placeholder="Make (e.g. Toyota)" className="flex-1 bg-transparent border-none outline-none text-sm" style={{ color: isDark ? '#FFFFFF' : '#1F2937' }} />
                </div>
                <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={inputStyle}>
                  <IconBadge><Car className="w-4 h-4" style={{ color: '#008CE5' }} /></IconBadge>
                  <input type="text" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} placeholder="Model (e.g. Camry)" className="flex-1 bg-transparent border-none outline-none text-sm" style={{ color: isDark ? '#FFFFFF' : '#1F2937' }} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={inputStyle}>
                  <IconBadge color="#0070B8"><Calendar className="w-4 h-4" style={{ color: '#0070B8' }} /></IconBadge>
                  <input type="text" value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} placeholder="Year" className="flex-1 bg-transparent border-none outline-none text-sm" style={{ color: isDark ? '#FFFFFF' : '#1F2937' }} />
                </div>
                <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={inputStyle}>
                  <IconBadge color="#F59E0B"><Palette className="w-4 h-4" style={{ color: '#F59E0B' }} /></IconBadge>
                  <input type="text" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} placeholder="Color" className="flex-1 bg-transparent border-none outline-none text-sm" style={{ color: isDark ? '#FFFFFF' : '#1F2937' }} />
                </div>
                <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={inputStyle}>
                  <IconBadge color="#0070B8"><Hash className="w-4 h-4" style={{ color: '#0070B8' }} /></IconBadge>
                  <input type="text" value={form.plate} onChange={e => setForm({ ...form, plate: e.target.value })} placeholder="Plate" className="flex-1 bg-transparent border-none outline-none text-sm" style={{ color: isDark ? '#FFFFFF' : '#1F2937' }} />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowAdd(false)} className="flex-1 rounded-xl py-3 font-medium text-sm" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F5F2ED', color: subColor }}>Cancel</button>
                <button onClick={addVehicle} disabled={!form.make || !form.model || saving} className="flex-1 bg-gradient-to-r from-[#008CE5] to-[#0070B8] rounded-xl py-3 font-bold text-sm text-white disabled:opacity-50">
                  {saving ? 'Adding...' : 'Add Vehicle'}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Vehicles list */}
        {loading ? (
          <div className="text-center py-12"><div className="w-8 h-8 border-2 border-[#008CE5] border-t-transparent rounded-full animate-spin mx-auto" /></div>
        ) : vehicles.length === 0 ? (
          <div className="text-center py-16">
            <Car className="w-16 h-16 mx-auto mb-4" style={{ color: subColor }} />
            <p className="font-semibold text-lg mb-1" style={{ color: textColor }}>No vehicles yet</p>
            <p className="text-sm" style={{ color: subColor }}>Add your first vehicle to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {vehicles.map((v, i) => (
              <motion.div key={v.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="rounded-2xl p-4 flex items-center gap-4"
                style={{ backgroundColor: cardBg, border: `1px solid ${v.is_default ? '#008CE5' : cardBorder}`, boxShadow: isDark ? 'none' : '0 1px 2px rgba(0,0,0,0.04)' }}
              >
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(0,140,229,0.1)' }}>
                  <Car className="w-6 h-6" style={{ color: '#008CE5' }} />
                </div>
                <div className="flex-1">
                  <p className="font-semibold" style={{ color: textColor }}>{v.year ? `${v.year} ` : ''}{v.make} {v.model}</p>
                  <p className="text-sm" style={{ color: subColor }}>{[v.color, v.plate].filter(Boolean).join(' • ') || 'No details'}</p>
                </div>
                {v.is_default && <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(0,140,229,0.15)', color: '#008CE5' }}>Default</span>}
                {!v.is_default && (
                  <button onClick={() => setDefault(v.id)} className="p-2 rounded-lg" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F5F2ED' }}>
                    <Star className="w-4 h-4" style={{ color: subColor }} />
                  </button>
                )}
                <button onClick={() => deleteVehicle(v.id)} className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(239,68,68,0.08)' }}>
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
