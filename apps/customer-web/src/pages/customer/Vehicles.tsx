import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { Car, Plus, Trash2, Star } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../lib/supabase';
import { CustomerBottomNav } from '../../components/CustomerBottomNav';


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
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [form, setForm] = useState({ make: '', model: '', year: '', color: '', plate: '' });

  const textColor = isDark ? '#FFFFFF' : '#14263D';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2';

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
    if (actionInProgress) return;
    setActionInProgress(id);
    try {
      const { error } = await supabase.from('vehicles').delete().eq('id', id);
      if (error) throw error;
      await fetchVehicles();
    } catch {
      // Silently handled — vehicle stays in list
    } finally {
      setActionInProgress(null);
    }
  };

  const setDefault = async (id: string) => {
    if (actionInProgress) return;
    setActionInProgress(id);
    try {
      await supabase.from('vehicles').update({ is_default: false }).eq('user_id', user.id);
      await supabase.from('vehicles').update({ is_default: true }).eq('id', id);
      await fetchVehicles();
    } catch {
      // Silently handled
    } finally {
      setActionInProgress(null);
    }
  };

  const inputBg = isDark ? 'rgba(255,255,255,0.05)' : '#F5F9FF';
  const inputBorder = isDark ? 'rgba(255,255,255,0.1)' : '#D3E0F2';
  const labelColor = isDark ? 'rgba(255,255,255,0.6)' : '#4B5563';

  return (
    <div className="min-h-screen" style={{ background: isDark ? 'linear-gradient(180deg, #0A1626 0%, #081427 100%)' : 'linear-gradient(180deg, #F8FBFF 0%, #EAF2FF 100%)' }}>
      <PageHeader
        title="My Vehicles"
        rightAction={
          <button onClick={() => setShowAdd(!showAdd)} className="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-r from-[#008CE5] to-[#0070B8]">
            <Plus className="w-5 h-5 text-white" />
          </button>
        }
      />

      <div className="px-6" style={{ paddingTop: 'calc(var(--safe-top) + 64px)', paddingBottom: 'calc(96px + var(--safe-bottom, 0px))' }}>
        {/* Add Vehicle Form */}
        {showAdd && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            className="rounded-2xl p-5 mb-6" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
          >
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#008CE5] to-[#0070B8] flex items-center justify-center">
                <Car className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-bold text-lg" style={{ color: textColor }}>Add Vehicle</h3>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold mb-1.5 block" style={{ color: labelColor }}>Make <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={form.make}
                    onChange={e => setForm({ ...form, make: e.target.value })}
                    placeholder="e.g. Toyota"
                    className="w-full h-12 px-4 rounded-xl text-base outline-none transition-all focus:ring-2 focus:ring-[#008CE5]/40"
                    style={{ backgroundColor: inputBg, border: `1.5px solid ${inputBorder}`, color: textColor }}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1.5 block" style={{ color: labelColor }}>Model <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={form.model}
                    onChange={e => setForm({ ...form, model: e.target.value })}
                    placeholder="e.g. Camry"
                    className="w-full h-12 px-4 rounded-xl text-base outline-none transition-all focus:ring-2 focus:ring-[#008CE5]/40"
                    style={{ backgroundColor: inputBg, border: `1.5px solid ${inputBorder}`, color: textColor }}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold mb-1.5 block" style={{ color: labelColor }}>Year</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.year}
                  onChange={e => setForm({ ...form, year: e.target.value })}
                  placeholder="e.g. 2024"
                  className="w-full h-12 px-4 rounded-xl text-base outline-none transition-all focus:ring-2 focus:ring-[#008CE5]/40"
                  style={{ backgroundColor: inputBg, border: `1.5px solid ${inputBorder}`, color: textColor }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold mb-1.5 block" style={{ color: labelColor }}>Color</label>
                  <input
                    type="text"
                    value={form.color}
                    onChange={e => setForm({ ...form, color: e.target.value })}
                    placeholder="e.g. Silver"
                    className="w-full h-12 px-4 rounded-xl text-base outline-none transition-all focus:ring-2 focus:ring-[#008CE5]/40"
                    style={{ backgroundColor: inputBg, border: `1.5px solid ${inputBorder}`, color: textColor }}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1.5 block" style={{ color: labelColor }}>License Plate</label>
                  <input
                    type="text"
                    value={form.plate}
                    onChange={e => setForm({ ...form, plate: e.target.value.toUpperCase() })}
                    placeholder="e.g. ABC-1234"
                    className="w-full h-12 px-4 rounded-xl text-base outline-none transition-all focus:ring-2 focus:ring-[#008CE5]/40 uppercase"
                    style={{ backgroundColor: inputBg, border: `1.5px solid ${inputBorder}`, color: textColor }}
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowAdd(false)} className="flex-1 h-12 rounded-xl font-semibold text-sm" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E8F0FB', color: subColor, border: `1.5px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#D1D5DB'}` }}>Cancel</button>
                <button onClick={addVehicle} disabled={!form.make || !form.model || saving} className="flex-1 h-12 bg-gradient-to-r from-[#008CE5] to-[#0070B8] rounded-xl font-bold text-sm text-white disabled:opacity-50" style={{ boxShadow: saving ? 'none' : '0 4px 12px rgba(0,140,229,0.3)' }}>
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
                  <button onClick={() => setDefault(v.id)} disabled={!!actionInProgress} className="p-2 rounded-lg disabled:opacity-40" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#E8F0FB' }}>
                    <Star className="w-4 h-4" style={{ color: subColor }} />
                  </button>
                )}
                <button onClick={() => deleteVehicle(v.id)} disabled={!!actionInProgress} className="p-2 rounded-lg disabled:opacity-40" style={{ backgroundColor: 'rgba(239,68,68,0.08)' }}>
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
      <CustomerBottomNav />
    </div>
  );
}
