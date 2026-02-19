import { motion } from 'motion/react';
import { AdminLayout } from '../../components/AdminLayout';
import { Plus, Edit, Trash2, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import * as LucideIcons from 'lucide-react';

interface ServiceRow {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  base_price: number | null;
  is_active: boolean | null;
}

interface FormState {
  name: string;
  description: string;
  base_price: string;
  icon: string;
  is_active: boolean;
}

const DEFAULT_FORM: FormState = {
  name: '',
  description: '',
  base_price: '',
  icon: 'Wrench',
  is_active: true,
};

const ICON_OPTIONS = ['Wrench', 'Truck', 'Zap', 'Fuel', 'CircleDot', 'KeyRound', 'Anchor', 'AlertTriangle', 'Bike', 'Plug'];

const formatMoney = (amount: number | null | undefined) => `$${Number(amount || 0).toFixed(2)}`;

export function AdminServices() {
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    fetchServices();
  }, []);

  async function fetchServices() {
    try {
      setLoading(true);
      setLoadError(null);
      const { data, error } = await supabase
        .from('services')
        .select('id, name, description, icon, base_price, is_active')
        .order('name');

      if (error) throw error;
      setServices((data || []) as ServiceRow[]);
    } catch (error: any) {
      console.warn('Failed to load services:', error);
      setLoadError(error?.message || 'Could not load services.');
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setFeedback(null);
    setShowModal(true);
  }

  function openEdit(service: ServiceRow) {
    setEditingId(service.id);
    setForm({
      name: service.name || '',
      description: service.description || '',
      base_price: service.base_price != null ? String(service.base_price) : '',
      icon: service.icon || 'Wrench',
      is_active: service.is_active !== false,
    });
    setFeedback(null);
    setShowModal(true);
  }

  function closeModal() {
    if (saving) return;
    setShowModal(false);
    setEditingId(null);
    setForm(DEFAULT_FORM);
  }

  async function saveService() {
    const trimmedName = form.name.trim();
    const numericPrice = Number(form.base_price);

    if (!trimmedName) {
      setFeedback('Service name is required.');
      return;
    }
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      setFeedback('Base price must be a valid positive number.');
      return;
    }

    try {
      setSaving(true);
      setFeedback(null);
      const payload = {
        name: trimmedName,
        description: form.description.trim() || null,
        base_price: numericPrice,
        icon: form.icon || 'Wrench',
        is_active: form.is_active,
      };

      if (editingId) {
        const { error } = await supabase.from('services').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('services').insert(payload);
        if (error) throw error;
      }

      await fetchServices();
      closeModal();
    } catch (error: any) {
      console.warn('Failed to save service:', error);
      setFeedback(error?.message || 'Could not save service.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(service: ServiceRow) {
    try {
      const { error } = await supabase
        .from('services')
        .update({ is_active: !(service.is_active !== false) })
        .eq('id', service.id);
      if (error) throw error;
      await fetchServices();
    } catch (error: any) {
      console.warn('Failed to update service status:', error);
      setLoadError(error?.message || 'Could not update service status.');
    }
  }

  async function removeService(serviceId: string) {
    const confirmed = window.confirm('Delete this service? Existing jobs may still reference it.');
    if (!confirmed) return;

    try {
      const { error } = await supabase.from('services').delete().eq('id', serviceId);
      if (error) throw error;
      await fetchServices();
    } catch (error: any) {
      console.warn('Failed to delete service:', error);
      setLoadError(error?.message || 'Could not delete service.');
    }
  }

  const stats = useMemo(() => {
    const total = services.length;
    const active = services.filter((s) => s.is_active !== false).length;
    const avgPrice = total > 0 ? services.reduce((sum, s) => sum + Number(s.base_price || 0), 0) / total : 0;
    const highestPrice = services.reduce((max, s) => Math.max(max, Number(s.base_price || 0)), 0);
    return [
      { label: 'Total Services', value: String(total), color: 'from-[#2EFFAF] to-[#00D68F]' },
      { label: 'Active Services', value: String(active), color: 'from-[#007AFF] to-[#0051D5]' },
      { label: 'Avg Base Price', value: formatMoney(avgPrice), color: 'from-[#FF6B6B] to-[#FF5252]' },
      { label: 'Highest Price', value: formatMoney(highestPrice), color: 'from-[#FFA500] to-[#FF8C00]' },
    ];
  }, [services]);

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Service Management</h1>
            <p className="text-white/60">Create services, set base prices, and control availability</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={openCreate}
            className="px-6 py-3 rounded-[20px] bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0F1419] font-bold flex items-center gap-2 shadow-lg shadow-[#2EFFAF]/30"
          >
            <Plus className="w-5 h-5" />
            Add Service
          </motion.button>
        </div>

        <div className="grid grid-cols-4 gap-6 mb-8">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="glass-light rounded-[24px] p-6"
            >
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${stat.color} flex items-center justify-center mb-4`}>
                <Wrench className="w-6 h-6 text-white" />
              </div>
              <p className="text-white/60 text-sm mb-1">{stat.label}</p>
              <p className="text-white font-bold text-3xl">{stat.value}</p>
            </motion.div>
          ))}
        </div>

        {loading ? (
          <div className="glass-light rounded-[24px] p-8 text-white/70">Loading services...</div>
        ) : loadError ? (
          <div className="glass-light rounded-[24px] p-8 text-red-300">{loadError}</div>
        ) : services.length === 0 ? (
          <div className="glass-light rounded-[24px] p-8 text-white/70">No services found. Add your first service.</div>
        ) : (
          <div className="grid grid-cols-2 gap-6">
            {services.map((service, index) => {
              const Icon = (LucideIcons as any)[service.icon || 'Wrench'] || Wrench;
              const enabled = service.is_active !== false;
              return (
                <motion.div
                  key={service.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`glass-light rounded-[24px] p-6 border-2 ${enabled ? 'border-[#2EFFAF]/30' : 'border-white/10'}`}
                >
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center flex-shrink-0">
                      <Icon className="w-8 h-8 text-[#0F1419]" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <h3 className="text-white font-bold text-xl mb-1">{service.name}</h3>
                          <p className="text-white/60 text-sm">{service.description || 'No description'}</p>
                        </div>
                        <button
                          onClick={() => toggleActive(service)}
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${enabled ? 'bg-[#2EFFAF]/20 text-[#2EFFAF]' : 'bg-white/10 text-white/70'}`}
                        >
                          {enabled ? 'Active' : 'Disabled'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="glass rounded-2xl p-3">
                      <p className="text-white/50 text-xs mb-1">Base Price</p>
                      <p className="text-white font-bold text-sm">{formatMoney(service.base_price)}</p>
                    </div>
                    <div className="glass rounded-2xl p-3">
                      <p className="text-white/50 text-xs mb-1">Icon</p>
                      <p className="text-[#2EFFAF] font-bold text-sm">{service.icon || 'Wrench'}</p>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-4 border-t border-white/10">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => openEdit(service)}
                      className="flex-1 px-4 py-2 rounded-[16px] bg-white/10 text-white hover:bg-white/20 flex items-center justify-center gap-2"
                    >
                      <Edit className="w-4 h-4" />
                      Edit
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => removeService(service.id)}
                      className="px-4 py-2 rounded-[16px] bg-red-400/20 text-red-400 hover:bg-red-400/30 flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                    </motion.button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass-light rounded-[32px] p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            >
              <h2 className="text-white font-bold text-2xl mb-6">{editingId ? 'Edit Service' : 'Add New Service'}</h2>

              <div className="space-y-4">
                <div>
                  <label className="text-white/70 text-sm mb-2 block">Service Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Emergency Roadside Assistance"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-[16px] text-white placeholder-white/40 focus:outline-none focus:border-[#2EFFAF]/50"
                  />
                </div>

                <div>
                  <label className="text-white/70 text-sm mb-2 block">Description</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Describe the service..."
                    rows={3}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-[16px] text-white placeholder-white/40 focus:outline-none focus:border-[#2EFFAF]/50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-white/70 text-sm mb-2 block">Base Price (USD)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.base_price}
                      onChange={(e) => setForm((prev) => ({ ...prev, base_price: e.target.value }))}
                      placeholder="e.g., 75"
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-[16px] text-white placeholder-white/40 focus:outline-none focus:border-[#2EFFAF]/50"
                    />
                  </div>
                  <div>
                    <label className="text-white/70 text-sm mb-2 block">Icon</label>
                    <select
                      title="Service icon"
                      value={form.icon}
                      onChange={(e) => setForm((prev) => ({ ...prev, icon: e.target.value }))}
                      className="w-full px-4 py-3 bg-[#1A1F2E] border border-white/10 rounded-[16px] text-white focus:outline-none focus:border-[#2EFFAF]/50"
                    >
                      {ICON_OPTIONS.map((icon) => (
                        <option key={icon} value={icon}>
                          {icon}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <label className="flex items-center gap-3 text-white/80">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                    className="w-4 h-4"
                  />
                  Service is active and bookable
                </label>

                {feedback && <p className="text-sm text-red-300">{feedback}</p>}
              </div>

              <div className="flex gap-3 mt-6">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={closeModal}
                  disabled={saving}
                  className="flex-1 px-6 py-3 rounded-[20px] bg-white/10 text-white font-semibold disabled:opacity-60"
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={saveService}
                  disabled={saving}
                  className="flex-1 px-6 py-3 rounded-[20px] bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0F1419] font-bold disabled:opacity-60"
                >
                  {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Service'}
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
