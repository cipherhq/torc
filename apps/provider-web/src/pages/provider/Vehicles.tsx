import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Car, Plus, Trash2, Star, Calendar, Palette, Hash, Pencil } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../lib/supabase';

interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number | null;
  color: string | null;
  plate: string | null;
  is_default: boolean;
}

type VehicleForm = {
  make: string;
  model: string;
  year: string;
  color: string;
  plate: string;
};

const emptyForm: VehicleForm = { make: '', model: '', year: '', color: '', plate: '' };

export function ProviderVehicles() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [form, setForm] = useState<VehicleForm>(emptyForm);

  const textColor = isDark ? '#FFFFFF' : '#1A1F2E';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB';

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    fetchVehicles();
  }, [user]);

  async function fetchVehicles() {
    if (!user) return;
    setLoading(true);
    setLoadError(null);

    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Failed to load vehicles:', error);
      if ((error as any).code === '42P01') {
        setLoadError('Vehicles table is missing. Please run your SQL schema/migrations.');
      } else {
        setLoadError('Could not load vehicles right now.');
      }
      setVehicles([]);
    } else {
      setVehicles((data || []) as Vehicle[]);
    }
    setLoading(false);
  }

  function beginAdd() {
    setEditingVehicleId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function beginEdit(v: Vehicle) {
    setEditingVehicleId(v.id);
    setForm({
      make: v.make || '',
      model: v.model || '',
      year: v.year ? String(v.year) : '',
      color: v.color || '',
      plate: v.plate || '',
    });
    setShowForm(true);
  }

  async function saveVehicle() {
    if (!user) return;
    if (!form.make.trim() || !form.model.trim()) return;

    setSaving(true);
    const payload = {
      make: form.make.trim(),
      model: form.model.trim(),
      year: form.year ? parseInt(form.year, 10) : null,
      color: form.color.trim() || null,
      plate: form.plate.trim() || null,
    };

    let error: any = null;
    if (editingVehicleId) {
      const res = await supabase.from('vehicles').update(payload).eq('id', editingVehicleId).eq('user_id', user.id);
      error = res.error;
    } else {
      const res = await supabase.from('vehicles').insert({
        user_id: user.id,
        ...payload,
        is_default: vehicles.length === 0,
      });
      error = res.error;
    }

    if (error) {
      console.warn('Failed to save vehicle:', error);
      alert('Unable to save vehicle right now.');
      setSaving(false);
      return;
    }

    setShowForm(false);
    setForm(emptyForm);
    setEditingVehicleId(null);
    await fetchVehicles();
    setSaving(false);
  }

  async function deleteVehicle(id: string) {
    if (!user) return;
    const { error } = await supabase.from('vehicles').delete().eq('id', id).eq('user_id', user.id);
    if (error) {
      console.warn('Failed to delete vehicle:', error);
      alert('Unable to delete vehicle right now.');
      return;
    }
    await fetchVehicles();
  }

  async function setDefaultVehicle(id: string) {
    if (!user) return;
    const clearRes = await supabase.from('vehicles').update({ is_default: false }).eq('user_id', user.id);
    if (clearRes.error) {
      console.warn('Failed to clear default vehicle:', clearRes.error);
      return;
    }
    const setRes = await supabase.from('vehicles').update({ is_default: true }).eq('id', id).eq('user_id', user.id);
    if (setRes.error) {
      console.warn('Failed to set default vehicle:', setRes.error);
      return;
    }
    await fetchVehicles();
  }

  return (
    <div className="min-h-screen" style={{ background: isDark ? '#0F1419' : '#F5F7FA' }}>
      <div className="p-6 flex items-center gap-4">
        <button onClick={() => navigate('/profile')} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }} title="Back to profile">
          <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
        </button>
        <h1 className="text-xl font-bold flex-1" style={{ color: textColor }}>Vehicles</h1>
        <button onClick={beginAdd} className="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-r from-[#2EFFAF] to-[#007AFF]" title="Add vehicle">
          <Plus className="w-5 h-5 text-[#0F1419]" />
        </button>
      </div>

      <div className="px-6 pb-8">
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="rounded-2xl p-5 mb-6" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
            <h3 className="font-semibold mb-4" style={{ color: textColor }}>{editingVehicleId ? 'Update Vehicle' : 'Add Vehicle'}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input type="text" value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} placeholder="Make (e.g. Toyota)" className="rounded-xl px-3 py-2 text-sm bg-transparent outline-none" style={{ border: `1px solid ${cardBorder}`, color: textColor, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F9FAFB' }} />
                <input type="text" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="Model (e.g. Camry)" className="rounded-xl px-3 py-2 text-sm bg-transparent outline-none" style={{ border: `1px solid ${cardBorder}`, color: textColor, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F9FAFB' }} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <input type="text" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} placeholder="Year" className="rounded-xl px-3 py-2 text-sm bg-transparent outline-none" style={{ border: `1px solid ${cardBorder}`, color: textColor, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F9FAFB' }} />
                <input type="text" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} placeholder="Color" className="rounded-xl px-3 py-2 text-sm bg-transparent outline-none" style={{ border: `1px solid ${cardBorder}`, color: textColor, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F9FAFB' }} />
                <input type="text" value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} placeholder="Plate" className="rounded-xl px-3 py-2 text-sm bg-transparent outline-none" style={{ border: `1px solid ${cardBorder}`, color: textColor, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F9FAFB' }} />
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setShowForm(false); setEditingVehicleId(null); setForm(emptyForm); }} className="flex-1 rounded-xl py-3 font-medium text-sm" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F3F4F6', color: subColor }}>Cancel</button>
                <button onClick={saveVehicle} disabled={!form.make.trim() || !form.model.trim() || saving} className="flex-1 bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-xl py-3 font-bold text-sm text-[#0F1419] disabled:opacity-50">
                  {saving ? 'Saving...' : editingVehicleId ? 'Update Vehicle' : 'Add Vehicle'}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {loadError && (
          <div className="rounded-2xl p-4 mb-4 border border-red-500/30" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF' }}>
            <p className="text-red-400 text-sm">{loadError}</p>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12"><div className="w-8 h-8 border-2 border-[#2EFFAF] border-t-transparent rounded-full animate-spin mx-auto" /></div>
        ) : vehicles.length === 0 ? (
          <div className="text-center py-16">
            <Car className="w-16 h-16 mx-auto mb-4" style={{ color: subColor }} />
            <p className="font-semibold text-lg mb-1" style={{ color: textColor }}>No vehicles yet</p>
            <p className="text-sm" style={{ color: subColor }}>Add the vehicle you use for services</p>
          </div>
        ) : (
          <div className="space-y-3">
            {vehicles.map((v, i) => (
              <motion.div key={v.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="rounded-2xl p-4 flex items-center gap-4" style={{ backgroundColor: cardBg, border: `1px solid ${v.is_default ? '#2EFFAF' : cardBorder}`, boxShadow: isDark ? 'none' : '0 1px 2px rgba(0,0,0,0.04)' }}>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(46,255,175,0.1)' }}>
                  <Car className="w-6 h-6" style={{ color: '#2EFFAF' }} />
                </div>
                <div className="flex-1">
                  <p className="font-semibold" style={{ color: textColor }}>{v.year ? `${v.year} ` : ''}{v.make} {v.model}</p>
                  <p className="text-sm" style={{ color: subColor }}>{[v.color, v.plate].filter(Boolean).join(' • ') || 'No details'}</p>
                </div>
                {v.is_default && <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(46,255,175,0.15)', color: '#2EFFAF' }}>Default</span>}
                {!v.is_default && (
                  <button onClick={() => setDefaultVehicle(v.id)} className="p-2 rounded-lg" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6' }} title="Set as default">
                    <Star className="w-4 h-4" style={{ color: subColor }} />
                  </button>
                )}
                <button onClick={() => beginEdit(v)} className="p-2 rounded-lg" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6' }} title="Edit vehicle">
                  <Pencil className="w-4 h-4" style={{ color: subColor }} />
                </button>
                <button onClick={() => deleteVehicle(v.id)} className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(239,68,68,0.08)' }} title="Delete vehicle">
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
