import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { Car, Plus, Trash2, Star, Pencil, ChevronDown } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { PageHeader } from '../../components/PageHeader';
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
  customMake: string;
  customModel: string;
  year: string;
  color: string;
  plate: string;
};

const emptyForm: VehicleForm = { make: '', model: '', customMake: '', customModel: '', year: '', color: '', plate: '' };

const CAR_DATA: Record<string, string[]> = {
  'Acura': ['ILX', 'Integra', 'MDX', 'RDX', 'TLX'],
  'Audi': ['A3', 'A4', 'A5', 'A6', 'Q3', 'Q5', 'Q7', 'Q8', 'e-tron'],
  'BMW': ['2 Series', '3 Series', '4 Series', '5 Series', '7 Series', 'X1', 'X3', 'X5', 'X7'],
  'Buick': ['Enclave', 'Encore', 'Envision'],
  'Cadillac': ['CT4', 'CT5', 'Escalade', 'XT4', 'XT5', 'XT6'],
  'Chevrolet': ['Blazer', 'Camaro', 'Colorado', 'Corvette', 'Equinox', 'Malibu', 'Silverado', 'Suburban', 'Tahoe', 'Trailblazer', 'Traverse'],
  'Chrysler': ['300', 'Pacifica'],
  'Dodge': ['Challenger', 'Charger', 'Durango', 'Hornet'],
  'Ford': ['Bronco', 'Edge', 'Escape', 'Expedition', 'Explorer', 'F-150', 'Maverick', 'Mustang', 'Ranger'],
  'Genesis': ['G70', 'G80', 'G90', 'GV70', 'GV80'],
  'GMC': ['Acadia', 'Canyon', 'Sierra', 'Terrain', 'Yukon'],
  'Honda': ['Accord', 'Civic', 'CR-V', 'HR-V', 'Odyssey', 'Passport', 'Pilot', 'Ridgeline'],
  'Hyundai': ['Elantra', 'Ioniq', 'Kona', 'Palisade', 'Santa Fe', 'Sonata', 'Tucson', 'Venue'],
  'Infiniti': ['Q50', 'Q60', 'QX50', 'QX55', 'QX60', 'QX80'],
  'Jeep': ['Cherokee', 'Compass', 'Gladiator', 'Grand Cherokee', 'Renegade', 'Wagoneer', 'Wrangler'],
  'Kia': ['EV6', 'Forte', 'K5', 'Niro', 'Seltos', 'Sorento', 'Soul', 'Sportage', 'Stinger', 'Telluride'],
  'Lexus': ['ES', 'GX', 'IS', 'NX', 'RX', 'TX', 'UX'],
  'Lincoln': ['Aviator', 'Corsair', 'Nautilus', 'Navigator'],
  'Mazda': ['CX-30', 'CX-5', 'CX-50', 'CX-90', 'Mazda3'],
  'Mercedes-Benz': ['A-Class', 'C-Class', 'E-Class', 'GLA', 'GLB', 'GLC', 'GLE', 'GLS', 'S-Class'],
  'Mitsubishi': ['Eclipse Cross', 'Outlander', 'Outlander Sport'],
  'Nissan': ['Altima', 'Frontier', 'Kicks', 'Maxima', 'Murano', 'Pathfinder', 'Rogue', 'Sentra', 'Titan', 'Versa'],
  'Porsche': ['911', 'Cayenne', 'Macan', 'Panamera', 'Taycan'],
  'Ram': ['1500', '2500', '3500'],
  'Subaru': ['Ascent', 'Crosstrek', 'Forester', 'Impreza', 'Legacy', 'Outback', 'WRX'],
  'Tesla': ['Model 3', 'Model S', 'Model X', 'Model Y', 'Cybertruck'],
  'Toyota': ['4Runner', 'Camry', 'Corolla', 'GR86', 'Highlander', 'Prius', 'RAV4', 'Sequoia', 'Supra', 'Tacoma', 'Tundra', 'Venza'],
  'Volkswagen': ['Atlas', 'Golf', 'ID.4', 'Jetta', 'Taos', 'Tiguan'],
  'Volvo': ['S60', 'S90', 'XC40', 'XC60', 'XC90'],
};

const CAR_MAKES = Object.keys(CAR_DATA).sort();

export function ProviderVehicles() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [form, setForm] = useState<VehicleForm>(emptyForm);

  const textColor = isDark ? '#FFFFFF' : '#14263D';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2';
  const inputStyle = {
    border: `1px solid ${cardBorder}`,
    color: textColor,
    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F5F9FF',
    fontSize: 16,
  };
  const effectiveMake = form.make === '__other__' ? form.customMake.trim() : form.make;
  const effectiveModel = form.model === '__other__' ? form.customModel.trim() : form.model;
  const modelsForMake = form.make && form.make !== '__other__' ? (CAR_DATA[form.make] || []) : [];
  const hasRequiredFields = !!effectiveMake && !!effectiveModel;

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
    const makeInList = CAR_MAKES.includes(v.make || '');
    const modelInList = makeInList && CAR_DATA[v.make]?.includes(v.model || '');
    setForm({
      make: makeInList ? v.make : '__other__',
      model: modelInList ? v.model : '__other__',
      customMake: makeInList ? '' : (v.make || ''),
      customModel: modelInList ? '' : (v.model || ''),
      year: v.year ? String(v.year) : '',
      color: v.color || '',
      plate: v.plate || '',
    });
    setShowForm(true);
  }

  async function saveVehicle() {
    if (!user) return;
    if (!effectiveMake || !effectiveModel) return;

    setSaving(true);
    const payload = {
      make: effectiveMake,
      model: effectiveModel,
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
    if (!user || actionInProgress) return;
    setActionInProgress(id);
    try {
      const { error } = await supabase.from('vehicles').delete().eq('id', id).eq('user_id', user.id);
      if (error) throw error;
      await fetchVehicles();
    } catch {
      // stays unchanged on failure
    } finally {
      setActionInProgress(null);
    }
  }

  async function setDefaultVehicle(id: string) {
    if (!user || actionInProgress) return;
    setActionInProgress(id);
    try {
      await supabase.from('vehicles').update({ is_default: false }).eq('user_id', user.id);
      await supabase.from('vehicles').update({ is_default: true }).eq('id', id).eq('user_id', user.id);
      await fetchVehicles();
    } catch {
      // stays unchanged on failure
    } finally {
      setActionInProgress(null);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: isDark ? 'linear-gradient(180deg, #0A1626 0%, #081427 100%)' : 'linear-gradient(180deg, #F8FBFF 0%, #EAF2FF 100%)' }}>
      <PageHeader
        title="Vehicles"
        onBack={() => navigate('/profile')}
        rightAction={
          <button onClick={beginAdd} className="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-r from-[#008CE5] to-[#0070B8]" title="Add vehicle">
            <Plus className="w-5 h-5 text-white" />
          </button>
        }
      />

      <div className="px-6 pb-8" style={{ paddingTop: 'calc(var(--safe-top) + 64px)' }}>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl p-5 mb-6"
            style={{
              backgroundColor: cardBg,
              border: `1px solid ${cardBorder}`,
              boxShadow: isDark ? 'none' : '0 4px 16px rgba(0,0,0,0.06)',
            }}
          >
            <h3 className="font-bold text-base mb-4" style={{ color: textColor }}>
              {editingVehicleId ? 'Update Vehicle' : 'Add Vehicle'}
            </h3>

            <div className="space-y-4">
              {/* Make */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: subColor }}>Make *</label>
                <div className="relative">
                  <select
                    value={form.make}
                    onChange={(e) => setForm({ ...form, make: e.target.value, model: '', customMake: '', customModel: '' })}
                    className="w-full rounded-xl px-4 py-3 text-sm appearance-none outline-none"
                    style={inputStyle}
                  >
                    <option value="">Select make...</option>
                    {CAR_MAKES.map(make => (
                      <option key={make} value={make}>{make}</option>
                    ))}
                    <option value="__other__">Other</option>
                  </select>
                  <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: subColor }} />
                </div>
                {form.make === '__other__' && (
                  <input
                    type="text"
                    value={form.customMake}
                    onChange={(e) => setForm({ ...form, customMake: e.target.value })}
                    placeholder="Enter car make"
                    className="w-full rounded-xl px-4 py-3 text-sm bg-transparent outline-none mt-2"
                    style={inputStyle}
                    autoFocus
                  />
                )}
              </div>

              {/* Model */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: subColor }}>Model *</label>
                {form.make && form.make !== '__other__' && modelsForMake.length > 0 ? (
                  <>
                    <div className="relative">
                      <select
                        value={form.model}
                        onChange={(e) => setForm({ ...form, model: e.target.value, customModel: '' })}
                        className="w-full rounded-xl px-4 py-3 text-sm appearance-none outline-none"
                        style={inputStyle}
                      >
                        <option value="">Select model...</option>
                        {modelsForMake.map(model => (
                          <option key={model} value={model}>{model}</option>
                        ))}
                        <option value="__other__">Other</option>
                      </select>
                      <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: subColor }} />
                    </div>
                    {form.model === '__other__' && (
                      <input
                        type="text"
                        value={form.customModel}
                        onChange={(e) => setForm({ ...form, customModel: e.target.value })}
                        placeholder="Enter car model"
                        className="w-full rounded-xl px-4 py-3 text-sm bg-transparent outline-none mt-2"
                        style={inputStyle}
                        autoFocus
                      />
                    )}
                  </>
                ) : (
                  <input
                    type="text"
                    value={form.make === '__other__' ? form.customModel : form.model}
                    onChange={(e) => form.make === '__other__'
                      ? setForm({ ...form, customModel: e.target.value })
                      : setForm({ ...form, model: e.target.value })
                    }
                    placeholder={form.make ? 'Enter model' : 'Select make first'}
                    disabled={!form.make}
                    className="w-full rounded-xl px-4 py-3 text-sm bg-transparent outline-none"
                    style={{ ...inputStyle, opacity: form.make ? 1 : 0.5 }}
                  />
                )}
              </div>

              {/* Year */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: subColor }}>Year</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={form.year}
                  onChange={(e) => setForm({ ...form, year: e.target.value.slice(0, 4) })}
                  placeholder="e.g. 2025"
                  className="w-full rounded-xl px-4 py-3 text-sm bg-transparent outline-none"
                  style={inputStyle}
                />
              </div>

              {/* Color */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: subColor }}>Color</label>
                <input
                  type="text"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  placeholder="e.g. Black"
                  className="w-full rounded-xl px-4 py-3 text-sm bg-transparent outline-none"
                  style={inputStyle}
                />
              </div>

              {/* License Plate */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: subColor }}>License Plate</label>
                <input
                  type="text"
                  value={form.plate}
                  onChange={(e) => setForm({ ...form, plate: e.target.value.toUpperCase() })}
                  placeholder="e.g. ABC1234"
                  className="w-full rounded-xl px-4 py-3 text-sm bg-transparent outline-none"
                  style={inputStyle}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setShowForm(false); setEditingVehicleId(null); setForm(emptyForm); }}
                  className="flex-1 rounded-xl py-3.5 font-medium text-sm"
                  style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E8F0FB', color: subColor }}
                >
                  Cancel
                </button>
                <button
                  onClick={saveVehicle}
                  disabled={saving || !hasRequiredFields}
                  className="flex-1 rounded-xl py-3.5 font-bold text-sm text-white disabled:opacity-50"
                  style={{
                    background: hasRequiredFields ? 'linear-gradient(135deg, #008CE5, #0070B8)' : (isDark ? 'rgba(255,255,255,0.1)' : '#C5D5E8'),
                    boxShadow: hasRequiredFields ? '0 6px 16px rgba(0,140,229,0.25)' : 'none',
                  }}
                >
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
          <div className="text-center py-12"><div className="w-8 h-8 border-2 border-[#008CE5] border-t-transparent rounded-full animate-spin mx-auto" /></div>
        ) : vehicles.length === 0 ? (
          <div className="text-center py-16">
            <Car className="w-16 h-16 mx-auto mb-4" style={{ color: subColor }} />
            <p className="font-semibold text-lg mb-1" style={{ color: textColor }}>No vehicles yet</p>
            <p className="text-sm" style={{ color: subColor }}>Add the vehicle you use for services</p>
          </div>
        ) : (
          <div className="space-y-3">
            {vehicles.map((v, i) => (
              <motion.div key={v.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="rounded-2xl p-4 flex items-center gap-4" style={{ backgroundColor: cardBg, border: `1px solid ${v.is_default ? '#008CE5' : cardBorder}`, boxShadow: isDark ? 'none' : '0 1px 2px rgba(0,0,0,0.04)' }}>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(0,140,229,0.1)' }}>
                  <Car className="w-6 h-6" style={{ color: '#008CE5' }} />
                </div>
                <div className="flex-1">
                  <p className="font-semibold" style={{ color: textColor }}>{v.year ? `${v.year} ` : ''}{v.make} {v.model}</p>
                  <p className="text-sm" style={{ color: subColor }}>{[v.color, v.plate].filter(Boolean).join(' • ') || 'No details'}</p>
                </div>
                {v.is_default && <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(0,140,229,0.15)', color: '#008CE5' }}>Default</span>}
                {!v.is_default && (
                  <button onClick={() => setDefaultVehicle(v.id)} disabled={!!actionInProgress} className="p-2 rounded-lg disabled:opacity-40" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#E8F0FB' }} title="Set as default">
                    <Star className="w-4 h-4" style={{ color: subColor }} />
                  </button>
                )}
                <button onClick={() => beginEdit(v)} className="p-2 rounded-lg" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#E8F0FB' }} title="Edit vehicle">
                  <Pencil className="w-4 h-4" style={{ color: subColor }} />
                </button>
                <button onClick={() => deleteVehicle(v.id)} disabled={!!actionInProgress} className="p-2 rounded-lg disabled:opacity-40" style={{ backgroundColor: 'rgba(239,68,68,0.08)' }} title="Delete vehicle">
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
