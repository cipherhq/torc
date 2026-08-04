import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'motion/react';
import { AdminLayout } from '../../components/AdminLayout';
import { AdminButton } from '../../components/AdminButton';
import { CardListSkeleton } from '../../components/PageSkeleton';
import { supabase } from '../../lib/supabase';
import { loadPlatformSettings } from '../../lib/platformSettings';
import { logAudit } from '../../lib/auditLog';
import {
  Wrench, Search, RefreshCw, DollarSign, ToggleLeft, ToggleRight,
  Plus, Edit3, Save, Loader2, AlertCircle, Clock, X, Trash2,
  Truck, Zap, KeyRound, Circle, Fuel, Anchor,
  Bike, Sparkles, Plug, AlertTriangle, LifeBuoy,
  Car, Shield, Battery, Gauge, Droplets, Settings,
} from 'lucide-react';

const SERVICE_ICONS: Record<string, any> = {
  Wrench, Truck, Zap, KeyRound, Circle, Fuel, Anchor,
  Bike, Sparkles, Plug, AlertTriangle, LifeBuoy,
  Car, Shield, Battery, Gauge, Droplets, Settings,
};

function getServiceIcon(iconName: string) {
  return SERVICE_ICONS[iconName] || Wrench;
}

interface Service {
  id: string;
  name: string;
  icon: string;
  description: string | null;
  estimated_time: string | null;
  base_price: number;
  is_active: boolean;
  created_at: string;
  totalJobs: number;
}

export function AdminServices() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [platformFee, setPlatformFee] = useState(15);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editPriceValue, setEditPriceValue] = useState('');
  const [savingPriceId, setSavingPriceId] = useState<string | null>(null);

  /* Full edit modal state */
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '', estimated_time: '', base_price: '', is_active: true, icon: 'Wrench' });
  const [editSaving, setEditSaving] = useState(false);

  /* Add service modal state */
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ id: '', name: '', description: '', estimated_time: '', base_price: '', is_active: true, icon: 'Wrench' });
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  /* Delete state */
  const [deletingService, setDeletingService] = useState<Service | null>(null);
  const [deleteConfirming, setDeleteConfirming] = useState(false);

  /* Price history state */
  const [priceHistory, setPriceHistory] = useState<Array<{
    id: string;
    service_id: string;
    service_name: string;
    old_price: number;
    new_price: number;
    changed_by: string;
    changed_at: string;
  }>>([]);
  const [showPriceHistory, setShowPriceHistory] = useState(false);

  const loadServices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Load platform settings for fee percentage
      const settings = await loadPlatformSettings();
      setPlatformFee(settings.platformFee);

      // Fetch all services
      const { data: servicesData, error: servicesError } = await supabase
        .from('services')
        .select('id, name, icon, description, estimated_time, base_price, is_active, created_at')
        .order('name', { ascending: true });

      if (servicesError) throw servicesError;

      // Fetch job counts grouped by service_id
      const { data: jobCountData, error: jobCountError } = await supabase
        .from('jobs')
        .select('service_id');

      if (jobCountError) {
        console.warn('Failed to load job counts:', jobCountError.message);
      }

      // Build a map of service_id -> count
      const jobCountMap: Record<string, number> = {};
      (jobCountData || []).forEach((row: any) => {
        if (row.service_id) {
          jobCountMap[row.service_id] = (jobCountMap[row.service_id] || 0) + 1;
        }
      });

      const merged: Service[] = (servicesData || []).map((s: any) => ({
        id: s.id,
        name: s.name || '',
        icon: s.icon || 'Wrench',
        description: s.description,
        estimated_time: s.estimated_time,
        base_price: Number(s.base_price) || 0,
        is_active: s.is_active ?? true,
        created_at: s.created_at,
        totalJobs: jobCountMap[s.id] || 0,
      }));

      setServices(merged);

      // Fetch price history from audit logs (best-effort)
      try {
        const { data: auditData } = await supabase
          .from('admin_audit_logs')
          .select('id, actor_id, entity_id, details, created_at')
          .in('action', ['update_service_price', 'update_service'])
          .order('created_at', { ascending: false })
          .limit(100);

        if (auditData) {
          // Get actor names
          const actorIds = [...new Set(auditData.map((a: any) => a.actor_id))];
          const { data: actors } = actorIds.length > 0
            ? await supabase.from('profiles').select('id, full_name, email').in('id', actorIds)
            : { data: [] };
          const actorMap = new Map((actors || []).map((a: any) => [a.id, a]));

          const history = auditData
            .filter((a: any) => {
              const d = a.details;
              if (!d) return false;
              // Direct price change format: { old_price, new_price }
              if (d.old_price !== undefined || d.old_base_price !== undefined) return true;
              // Full edit format: { changes: { base_price: { old, new } } }
              if (d.changes?.base_price) return true;
              return false;
            })
            .map((a: any) => {
              const actor: any = actorMap.get(a.actor_id);
              const svc = (servicesData || []).find((s: any) => s.id === a.entity_id);
              const d = a.details;

              let oldPrice: number;
              let newPrice: number;

              if (d.changes?.base_price) {
                // Full edit format
                oldPrice = Number(d.changes.base_price.old) || 0;
                newPrice = Number(d.changes.base_price.new) || 0;
              } else {
                // Direct price change format
                oldPrice = Number(d.old_price ?? d.old_base_price) || 0;
                newPrice = Number(d.new_price ?? d.new_base_price) || 0;
              }

              return {
                id: a.id,
                service_id: a.entity_id,
                service_name: d.service_name || svc?.name || a.entity_id,
                old_price: oldPrice,
                new_price: newPrice,
                changed_by: actor?.full_name || actor?.email || a.actor_id.slice(0, 8),
                changed_at: a.created_at,
              };
            });
          setPriceHistory(history);
        }
      } catch {
        // Audit log table may not exist yet - ignore gracefully
      }
    } catch (e: any) {
      console.warn('Failed to load services:', e);
      setError(e?.message || 'Failed to load services');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  // Toggle is_active
  const handleToggleActive = async (serviceId: string, currentActive: boolean) => {
    setTogglingId(serviceId);
    try {
      const { error: updateError } = await supabase
        .from('services')
        .update({ is_active: !currentActive })
        .eq('id', serviceId);

      if (updateError) throw updateError;

      setServices(prev =>
        prev.map(s => s.id === serviceId ? { ...s, is_active: !currentActive } : s)
      );

      logAudit({
        action: 'toggle_service',
        entity_type: 'service',
        entity_id: serviceId,
        details: { is_active: !currentActive },
      });
    } catch (e: any) {
      console.warn('Failed to toggle service:', e);
    } finally {
      setTogglingId(null);
    }
  };

  // Start editing price
  const startEditPrice = (service: Service) => {
    setEditingPriceId(service.id);
    setEditPriceValue(service.base_price.toFixed(2));
  };

  // Cancel editing price
  const cancelEditPrice = () => {
    setEditingPriceId(null);
    setEditPriceValue('');
  };

  // Save edited price
  const savePrice = async (serviceId: string) => {
    const parsed = parseFloat(editPriceValue);
    if (isNaN(parsed) || parsed < 0) return;

    const service = services.find(s => s.id === serviceId);
    const oldPrice = service?.base_price;

    setSavingPriceId(serviceId);
    try {
      const { error: updateError } = await supabase
        .from('services')
        .update({ base_price: parsed })
        .eq('id', serviceId);

      if (updateError) throw updateError;

      setServices(prev =>
        prev.map(s => s.id === serviceId ? { ...s, base_price: parsed } : s)
      );
      setEditingPriceId(null);
      setEditPriceValue('');

      logAudit({
        action: 'update_service_price',
        entity_type: 'service',
        entity_id: serviceId,
        details: { old_price: oldPrice, new_price: parsed, service_name: service?.name },
      });
    } catch (e: any) {
      console.warn('Failed to update price:', e);
    } finally {
      setSavingPriceId(null);
    }
  };

  // Open full edit modal
  const openEditModal = (service: Service) => {
    setEditingService(service);
    setEditForm({
      name: service.name,
      description: service.description || '',
      estimated_time: service.estimated_time || '',
      base_price: service.base_price.toFixed(2),
      is_active: service.is_active,
      icon: service.icon || 'Wrench',
    });
  };

  // Save full edit
  const handleSaveService = async () => {
    if (!editingService) return;
    if (editSaving) return; // Prevent duplicate submissions from rapid clicks
    const parsed = parseFloat(editForm.base_price);
    if (isNaN(parsed) || parsed < 0) return;

    setEditSaving(true);
    try {
      const { error: updateError } = await supabase
        .from('services')
        .update({
          name: editForm.name.trim(),
          description: editForm.description.trim() || null,
          estimated_time: editForm.estimated_time.trim() || null,
          base_price: parsed,
          is_active: editForm.is_active,
          icon: editForm.icon,
        })
        .eq('id', editingService.id);

      if (updateError) throw updateError;

      // Build old vs new for audit
      const changes: Record<string, { old: any; new: any }> = {};
      if (editingService.name !== editForm.name.trim()) changes.name = { old: editingService.name, new: editForm.name.trim() };
      if ((editingService.description || '') !== (editForm.description.trim() || '')) changes.description = { old: editingService.description, new: editForm.description.trim() || null };
      if ((editingService.estimated_time || '') !== (editForm.estimated_time.trim() || '')) changes.estimated_time = { old: editingService.estimated_time, new: editForm.estimated_time.trim() || null };
      if (editingService.base_price !== parsed) changes.base_price = { old: editingService.base_price, new: parsed };
      if (editingService.is_active !== editForm.is_active) changes.is_active = { old: editingService.is_active, new: editForm.is_active };
      if (editingService.icon !== editForm.icon) changes.icon = { old: editingService.icon, new: editForm.icon };

      logAudit({
        action: 'update_service',
        entity_type: 'service',
        entity_id: editingService.id,
        details: { changes, service_name: editingService.name },
      });

      setServices(prev =>
        prev.map(s =>
          s.id === editingService.id
            ? {
                ...s,
                name: editForm.name.trim(),
                description: editForm.description.trim() || null,
                estimated_time: editForm.estimated_time.trim() || null,
                base_price: parsed,
                is_active: editForm.is_active,
                icon: editForm.icon,
              }
            : s,
        ),
      );
      setEditingService(null);
    } catch (e: any) {
      console.warn('Failed to update service:', e);
      alert('Failed to update service: ' + (e.message || 'Unknown error'));
    } finally {
      setEditSaving(false);
    }
  };

  // Add new service
  const handleAddService = async () => {
    if (addSaving) return; // Prevent duplicate submissions from rapid clicks
    const id = addForm.id.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!id || !addForm.name.trim()) {
      setAddError('Service ID and name are required');
      return;
    }
    if (services.some(s => s.id === id)) {
      setAddError('A service with this ID already exists');
      return;
    }
    const parsed = parseFloat(addForm.base_price) || 0;

    setAddSaving(true);
    setAddError(null);
    try {
      const { error: insertError } = await supabase
        .from('services')
        .insert({
          id,
          name: addForm.name.trim(),
          description: addForm.description.trim() || null,
          estimated_time: addForm.estimated_time.trim() || null,
          base_price: parsed,
          is_active: addForm.is_active,
          icon: addForm.icon || 'Wrench',
        });

      if (insertError) throw insertError;

      logAudit({
        action: 'create_service',
        entity_type: 'service',
        entity_id: id,
        details: { name: addForm.name.trim(), base_price: parsed, is_active: addForm.is_active },
      });

      setServices(prev => [...prev, {
        id,
        name: addForm.name.trim(),
        icon: addForm.icon || 'Wrench',
        description: addForm.description.trim() || null,
        estimated_time: addForm.estimated_time.trim() || null,
        base_price: parsed,
        is_active: addForm.is_active,
        created_at: new Date().toISOString(),
        totalJobs: 0,
      }]);
      setShowAddModal(false);
      setAddForm({ id: '', name: '', description: '', estimated_time: '', base_price: '', is_active: true, icon: 'Wrench' });
    } catch (e: any) {
      console.warn('Failed to add service:', e);
      setAddError(e.message || 'Failed to add service');
    } finally {
      setAddSaving(false);
    }
  };

  // Delete service
  const handleDeleteService = async () => {
    if (!deletingService) return;
    if (deleteConfirming) return; // Prevent duplicate submissions from rapid clicks
    setDeleteConfirming(true);
    try {
      const { error: deleteError } = await supabase
        .from('services')
        .delete()
        .eq('id', deletingService.id);

      if (deleteError) throw deleteError;

      logAudit({
        action: 'delete_service',
        entity_type: 'service',
        entity_id: deletingService.id,
        details: { name: deletingService.name, had_jobs: deletingService.totalJobs },
      });

      setServices(prev => prev.filter(s => s.id !== deletingService.id));
      setDeletingService(null);
    } catch (e: any) {
      console.warn('Failed to delete service:', e);
      alert('Failed to delete service: ' + (e.message || 'Unknown error'));
    } finally {
      setDeleteConfirming(false);
    }
  };

  // Filter by search
  const filteredServices = useMemo(() => {
    if (!search.trim()) return services;
    const term = search.toLowerCase();
    return services.filter(s => s.name.toLowerCase().includes(term));
  }, [services, search]);

  // Stat computations
  const totalServices = services.length;
  const activeServices = services.filter(s => s.is_active).length;
  const inactiveServices = services.filter(s => !s.is_active).length;

  const stats = [
    { label: 'Total Services', value: String(totalServices), gradient: 'linear-gradient(135deg, #008CE5, #0070B8)', icon: Wrench },
    { label: 'Active Services', value: String(activeServices), gradient: 'linear-gradient(135deg, #22C55E, #16A34A)', icon: ToggleRight },
    { label: 'Inactive Services', value: String(inactiveServices), gradient: 'linear-gradient(135deg, #6B7280, #4B5563)', icon: ToggleLeft },
    { label: 'Platform Fee', value: `${platformFee}%`, gradient: 'linear-gradient(135deg, #FFA500, #FF8C00)', icon: DollarSign },
  ];

  return (
    <AdminLayout>
      <div className="p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Service Management</h1>
            <p className="text-gray-500">Manage platform services and pricing</p>
          </div>
          <div className="flex items-center gap-3">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => { setShowAddModal(true); setAddForm({ id: '', name: '', description: '', estimated_time: '', base_price: '', is_active: true }); setAddError(null); }}
              style={{ background: 'linear-gradient(to right, #008CE5, #0070B8)' }}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-white font-semibold"
            >
              <Plus className="w-4 h-4" />
              Add Service
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowPriceHistory(!showPriceHistory)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all"
            >
              <Clock className="w-4 h-4" />
              Price History
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={loadServices}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </motion.button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-6 flex items-center gap-3 bg-red-50 border border-red-200 rounded-[20px] px-5 py-4 text-red-600">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6"
              >
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ background: stat.gradient }}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <p className="text-gray-500 text-sm mb-1">{stat.label}</p>
                <p className="text-gray-900 font-bold text-3xl">{stat.value}</p>
              </motion.div>
            );
          })}
        </div>

        {/* Price History Panel */}
        {showPriceHistory && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6 mb-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-[#008CE5]" />
                Price Change History
              </h2>
              <button onClick={() => setShowPriceHistory(false)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            {priceHistory.length === 0 ? (
              <p className="text-gray-500 text-sm py-4 text-center">No price changes recorded yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-gray-500 text-sm font-semibold">Date</th>
                      <th className="px-4 py-3 text-left text-gray-500 text-sm font-semibold">Service</th>
                      <th className="px-4 py-3 text-right text-gray-500 text-sm font-semibold">Old Price</th>
                      <th className="px-4 py-3 text-center text-gray-500 text-sm font-semibold"></th>
                      <th className="px-4 py-3 text-right text-gray-500 text-sm font-semibold">New Price</th>
                      <th className="px-4 py-3 text-right text-gray-500 text-sm font-semibold">Change</th>
                      <th className="px-4 py-3 text-left text-gray-500 text-sm font-semibold">Changed By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceHistory.map((entry) => {
                      const diff = entry.new_price - entry.old_price;
                      const pctChange = entry.old_price > 0 ? ((diff / entry.old_price) * 100).toFixed(1) : 'N/A';
                      return (
                        <tr key={entry.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-600 text-sm">
                            {new Date(entry.changed_at).toLocaleDateString()}{' '}
                            {new Date(entry.changed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="px-4 py-3 text-gray-900 font-medium text-sm">{entry.service_name}</td>
                          <td className="px-4 py-3 text-right text-gray-500 text-sm">${entry.old_price.toFixed(2)}</td>
                          <td className="px-4 py-3 text-center text-gray-400">{'\u2192'}</td>
                          <td className="px-4 py-3 text-right text-gray-900 font-semibold text-sm">${entry.new_price.toFixed(2)}</td>
                          <td className="px-4 py-3 text-right text-sm">
                            <span className={diff > 0 ? 'text-red-500' : diff < 0 ? 'text-green-500' : 'text-gray-400'}>
                              {diff > 0 ? '+' : ''}{diff.toFixed(2)} ({pctChange}%)
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-sm">{entry.changed_by}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}

        {/* Search bar */}
        <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-4 mb-6">
          <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
            <Search className="w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search services by name..."
              aria-label="Search services by name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-gray-900 placeholder-gray-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Service list */}
        {loading ? (
          <CardListSkeleton count={4} />
        ) : filteredServices.length === 0 ? (
          <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-12 text-center">
            <Wrench className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">
              {search ? 'No services match your search' : 'No services found'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredServices.map((service, index) => {
              const isToggling = togglingId === service.id;
              const isEditingPrice = editingPriceId === service.id;
              const isSavingPrice = savingPriceId === service.id;

              return (
                <motion.div
                  key={service.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* Left: Icon + Info */}
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #008CE5, #0070B8)' }}>
                        <Wrench className="w-7 h-7 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="text-gray-900 font-bold text-lg truncate">{service.name}</h3>
                          {service.is_active ? (
                            <span className="px-2.5 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-semibold flex-shrink-0">
                              Active
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs font-semibold flex-shrink-0">
                              Inactive
                            </span>
                          )}
                        </div>
                        {service.description && (
                          <p className="text-gray-500 text-sm mb-3 line-clamp-2">{service.description}</p>
                        )}
                      </div>
                    </div>

                    {/* Right: Edit + Toggle */}
                    <div className="flex items-center gap-2 flex-shrink-0 mt-1">
                      <button
                        onClick={() => openEditModal(service)}
                        className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                        title="Edit service"
                      >
                        <Edit3 className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => setDeletingService(service)}
                        className="p-2 rounded-xl hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                        title="Delete service"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleToggleActive(service.id, service.is_active)}
                        disabled={isToggling}
                        title={service.is_active ? 'Deactivate service' : 'Activate service'}
                        role="switch"
                        aria-checked={service.is_active}
                        aria-label={`Toggle ${service.name} ${service.is_active ? 'off' : 'on'}`}
                        style={{
                          width: 52,
                          height: 28,
                          borderRadius: 9999,
                          position: 'relative',
                          flexShrink: 0,
                          backgroundColor: isToggling ? '#9CA3AF' : service.is_active ? '#111827' : '#D1D5DB',
                          transition: 'background-color 0.2s',
                          opacity: isToggling ? 0.6 : 1,
                        }}
                      >
                        {isToggling ? (
                          <Loader2 className="w-4 h-4 animate-spin text-white absolute" style={{ top: 6, left: 18 }} />
                        ) : (
                          <div
                            style={{
                              position: 'absolute',
                              width: 20,
                              height: 20,
                              borderRadius: 9999,
                              top: 4,
                              backgroundColor: '#FFFFFF',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                              transition: 'left 0.2s, right 0.2s',
                              ...(service.is_active ? { right: 4, left: 'auto' } : { left: 4, right: 'auto' }),
                            }}
                          />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                    {/* Base Price */}
                    <div className="bg-gray-50 rounded-2xl p-3">
                      <p className="text-gray-500 text-xs mb-1">Base Price</p>
                      {isEditingPrice ? (
                        <div className="flex items-center gap-1">
                          <span className="text-gray-900 font-bold text-sm">$</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            aria-label="Base price"
                            value={editPriceValue}
                            onFocus={(e) => { if (e.target.value === '0') e.target.value = ''; }}
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^0-9.]/g, '');
                              setEditPriceValue(val);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') savePrice(service.id);
                              if (e.key === 'Escape') cancelEditPrice();
                            }}
                            autoFocus
                            className="w-20 bg-white border border-gray-300 rounded-lg px-2 py-0.5 text-gray-900 font-bold text-sm focus:outline-none focus:border-[#008CE5]"
                          />
                          <button
                            onClick={() => savePrice(service.id)}
                            disabled={isSavingPrice}
                            className="p-1 rounded-lg hover:bg-green-100 text-green-600 transition-colors"
                          >
                            {isSavingPrice ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Save className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            onClick={cancelEditPrice}
                            className="p-1 rounded-lg hover:bg-gray-200 text-gray-400 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <p className="text-gray-900 font-bold text-sm">
                            ${service.base_price.toFixed(2)}
                          </p>
                          <button
                            onClick={() => startEditPrice(service)}
                            className="p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                            title="Edit price"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Estimated Time */}
                    <div className="bg-gray-50 rounded-2xl p-3">
                      <p className="text-gray-500 text-xs mb-1">Est. Time</p>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        <p className="text-gray-900 font-bold text-sm">
                          {service.estimated_time || 'N/A'}
                        </p>
                      </div>
                    </div>

                    {/* Total Jobs */}
                    <div className="bg-gray-50 rounded-2xl p-3">
                      <p className="text-gray-500 text-xs mb-1">Total Jobs</p>
                      <p className="text-gray-900 font-bold text-sm">{service.totalJobs.toLocaleString()}</p>
                    </div>

                    {/* Platform Fee */}
                    <div className="bg-gray-50 rounded-2xl p-3">
                      <p className="text-gray-500 text-xs mb-1">Platform Fee</p>
                      <p className="text-[#008CE5] font-bold text-sm">{platformFee}%</p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
        {/* Edit Service Modal */}
        {editingService && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-service-title"
            onKeyDown={(e) => { if (e.key === 'Escape') setEditingService(null); }}
            onClick={(e) => { if (e.target === e.currentTarget) setEditingService(null); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-[32px] p-8 max-w-lg w-full shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 id="edit-service-title" className="text-gray-900 font-bold text-2xl">Edit Service</h2>
                <button
                  onClick={() => setEditingService(null)}
                  aria-label="Close edit service dialog"
                  className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label className="text-gray-600 text-sm font-medium mb-1.5 block">Service Name</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-[16px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#008CE5]"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="text-gray-600 text-sm font-medium mb-1.5 block">Description</label>
                  <textarea
                    rows={3}
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-[16px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#008CE5] resize-none"
                    placeholder="Service description..."
                  />
                </div>

                {/* Estimated Time + Base Price row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-gray-600 text-sm font-medium mb-1.5 block">Estimated Time</label>
                    <input
                      type="text"
                      value={editForm.estimated_time}
                      onChange={(e) => setEditForm({ ...editForm, estimated_time: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-[16px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#008CE5]"
                      placeholder="e.g. 30-45 min"
                    />
                  </div>
                  <div>
                    <label className="text-gray-600 text-sm font-medium mb-1.5 block">Base Price ($)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={editForm.base_price}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9.]/g, '');
                        setEditForm({ ...editForm, base_price: val });
                      }}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-[16px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#008CE5]"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                {/* Active toggle */}
                <div className="flex items-center justify-between bg-gray-50 rounded-[16px] px-4 py-3 border border-gray-200">
                  <span className="text-gray-700 text-sm font-medium">Service Active</span>
                  <button
                    onClick={() => setEditForm({ ...editForm, is_active: !editForm.is_active })}
                    role="switch"
                    aria-checked={editForm.is_active}
                    aria-label={`Toggle service ${editForm.is_active ? 'off' : 'on'}`}
                    style={{
                      width: 56,
                      height: 32,
                      borderRadius: 9999,
                      position: 'relative',
                      flexShrink: 0,
                      backgroundColor: editForm.is_active ? '#111827' : '#D1D5DB',
                      transition: 'background-color 0.2s',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        width: 24,
                        height: 24,
                        borderRadius: 9999,
                        top: 4,
                        backgroundColor: '#FFFFFF',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                        transition: 'left 0.2s, right 0.2s',
                        ...(editForm.is_active ? { right: 4, left: 'auto' } : { left: 4, right: 'auto' }),
                      }}
                    />
                  </button>
                </div>
              </div>

              {/* Modal actions */}
              <div className="flex gap-3 mt-6">
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setEditingService(null)}
                  className="flex-1 px-6 py-3 rounded-[20px] bg-gray-100 text-gray-900 font-semibold"
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSaveService}
                  disabled={editSaving || !editForm.name.trim()}
                  style={{ background: 'linear-gradient(to right, #008CE5, #0070B8)', color: '#FFFFFF' }}
                  className="flex-1 px-6 py-3 rounded-[20px] font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {editSaving ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Save className="w-5 h-5" />
                  )}
                  {editSaving ? 'Saving...' : 'Save Changes'}
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
        {/* Add Service Modal */}
        {showAddModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-service-title"
            onKeyDown={(e) => { if (e.key === 'Escape') setShowAddModal(false); }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowAddModal(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-[32px] p-8 max-w-lg w-full shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 id="add-service-title" className="text-gray-900 font-bold text-2xl">Add New Service</h2>
                <button
                  onClick={() => setShowAddModal(false)}
                  aria-label="Close add service dialog"
                  className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {addError && (
                <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {addError}
                </div>
              )}

              <div className="space-y-4">
                {/* Service ID */}
                <div>
                  <label className="text-gray-600 text-sm font-medium mb-1.5 block">Service ID</label>
                  <input
                    type="text"
                    value={addForm.id}
                    onChange={(e) => setAddForm({ ...addForm, id: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-[16px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#008CE5]"
                    placeholder="e.g. flat-tire, oil-change"
                  />
                  <p className="text-gray-400 text-xs mt-1">Lowercase identifier, auto-formatted</p>
                </div>

                {/* Name */}
                <div>
                  <label className="text-gray-600 text-sm font-medium mb-1.5 block">Service Name</label>
                  <input
                    type="text"
                    value={addForm.name}
                    onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-[16px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#008CE5]"
                    placeholder="e.g. Oil Change"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="text-gray-600 text-sm font-medium mb-1.5 block">Description</label>
                  <textarea
                    rows={3}
                    value={addForm.description}
                    onChange={(e) => setAddForm({ ...addForm, description: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-[16px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#008CE5] resize-none"
                    placeholder="Describe this service..."
                  />
                </div>

                {/* Estimated Time + Base Price */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-gray-600 text-sm font-medium mb-1.5 block">Estimated Time</label>
                    <input
                      type="text"
                      value={addForm.estimated_time}
                      onChange={(e) => setAddForm({ ...addForm, estimated_time: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-[16px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#008CE5]"
                      placeholder="e.g. 30-45 min"
                    />
                  </div>
                  <div>
                    <label className="text-gray-600 text-sm font-medium mb-1.5 block">Base Price ($)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={addForm.base_price}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9.]/g, '');
                        setAddForm({ ...addForm, base_price: val });
                      }}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-[16px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#008CE5]"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                {/* Active toggle */}
                <div className="flex items-center justify-between bg-gray-50 rounded-[16px] px-4 py-3 border border-gray-200">
                  <span className="text-gray-700 text-sm font-medium">Service Active</span>
                  <button
                    onClick={() => setAddForm({ ...addForm, is_active: !addForm.is_active })}
                    role="switch"
                    aria-checked={addForm.is_active}
                    aria-label={`Toggle new service ${addForm.is_active ? 'off' : 'on'}`}
                    style={{
                      width: 56,
                      height: 32,
                      borderRadius: 9999,
                      position: 'relative',
                      flexShrink: 0,
                      backgroundColor: addForm.is_active ? '#111827' : '#D1D5DB',
                      transition: 'background-color 0.2s',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        width: 24,
                        height: 24,
                        borderRadius: 9999,
                        top: 4,
                        backgroundColor: '#FFFFFF',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                        transition: 'left 0.2s, right 0.2s',
                        ...(addForm.is_active ? { right: 4, left: 'auto' } : { left: 4, right: 'auto' }),
                      }}
                    />
                  </button>
                </div>
              </div>

              {/* Modal actions */}
              <div className="flex gap-3 mt-6">
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-6 py-3 rounded-[20px] bg-gray-100 text-gray-900 font-semibold"
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleAddService}
                  disabled={addSaving || !addForm.id.trim() || !addForm.name.trim()}
                  style={{ background: 'linear-gradient(to right, #008CE5, #0070B8)', color: '#FFFFFF' }}
                  className="flex-1 px-6 py-3 rounded-[20px] font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {addSaving ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Plus className="w-5 h-5" />
                  )}
                  {addSaving ? 'Adding...' : 'Add Service'}
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deletingService && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-service-title"
            onKeyDown={(e) => { if (e.key === 'Escape') setDeletingService(null); }}
            onClick={(e) => { if (e.target === e.currentTarget) setDeletingService(null); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-[32px] p-8 max-w-md w-full shadow-2xl"
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-red-100 flex-shrink-0">
                  <Trash2 className="w-6 h-6 text-red-500" />
                </div>
                <h2 id="delete-service-title" className="text-gray-900 font-bold text-xl">Delete Service</h2>
              </div>

              <p className="text-gray-600 mb-2">
                Are you sure you want to delete <strong>{deletingService.name}</strong>?
              </p>
              {deletingService.totalJobs > 0 && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-amber-700 text-sm mb-4">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  This service has {deletingService.totalJobs} associated job{deletingService.totalJobs !== 1 ? 's' : ''}. Deleting may fail if jobs reference it.
                </div>
              )}
              <p className="text-gray-400 text-sm mb-6">This action cannot be undone.</p>

              <div className="flex gap-3">
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setDeletingService(null)}
                  className="flex-1 px-6 py-3 rounded-[20px] bg-gray-100 text-gray-900 font-semibold"
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleDeleteService}
                  disabled={deleteConfirming}
                  className="flex-1 px-6 py-3 rounded-[20px] bg-red-500 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {deleteConfirming ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Trash2 className="w-5 h-5" />
                  )}
                  {deleteConfirming ? 'Deleting...' : 'Delete'}
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
