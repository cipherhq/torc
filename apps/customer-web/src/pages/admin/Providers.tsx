import { motion } from 'motion/react';
import { Search, CheckCircle, Clock, Ban, RotateCcw, Trash2 } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { AdminLayout } from '../../components/AdminLayout';

interface Provider {
  id: string;
  name: string;
  email: string;
  status: string;
  rating: number;
  jobs: number;
  joined: string;
  verification: string;
  online: boolean;
}

export function AdminProviders() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null);
  const [actioningProviderId, setActioningProviderId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'pending' | 'suspended' | 'deleted'>('all');
  const [selectedProviderIds, setSelectedProviderIds] = useState<string[]>([]);
  const [bulkActioning, setBulkActioning] = useState(false);

  useEffect(() => {
    async function loadCurrentAdmin() {
      const { data } = await supabase.auth.getUser();
      setCurrentAdminId(data.user?.id || null);
    }
    void loadCurrentAdmin();
  }, []);

  useEffect(() => {
    void loadProviders();
  }, []);

  async function loadProviders() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('provider_profiles')
        .select(`
          id,
          is_verified,
          is_online,
          total_jobs,
          rating,
          created_at,
          user:profiles(full_name, email, status)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formattedProviders: Provider[] = (data || []).map((provider: any) => {
        const name = provider.user?.full_name || provider.user?.email?.split('@')[0] || 'Unknown';
        const joined = new Date(provider.created_at).toLocaleDateString('en-US', {
          month: 'short',
          year: 'numeric',
        });
        const rawStatus = provider.user?.status || 'active';

        return {
          id: provider.id,
          name,
          email: provider.user?.email || '-',
          status: rawStatus,
          rating: provider.rating || 0,
          jobs: provider.total_jobs || 0,
          joined,
          verification: provider.is_verified ? 'verified' : 'pending',
          online: !!provider.is_online,
        };
      });

      setProviders(formattedProviders);
    } catch (error) {
      console.warn('Failed to load providers:', error);
      setProviders([]);
    } finally {
      setLoading(false);
    }
  }

  async function writeAuditLog(action: string, targetProviderId: string, details: Record<string, unknown>) {
    if (!currentAdminId) return;
    const { error } = await supabase.from('admin_audit_logs').insert({
      actor_id: currentAdminId,
      action,
      entity_type: 'provider',
      entity_id: targetProviderId,
      details,
    });
    if (error) {
      console.warn('Audit log write skipped:', error.message);
    }
  }

  async function writeAuditLogs(rows: Array<{ action: string; entity_id: string; details: Record<string, unknown> }>) {
    if (!currentAdminId || rows.length === 0) return;
    const payload = rows.map((row) => ({
      actor_id: currentAdminId,
      action: row.action,
      entity_type: 'provider',
      entity_id: row.entity_id,
      details: row.details,
    }));
    const { error } = await supabase.from('admin_audit_logs').insert(payload);
    if (error) {
      console.warn('Audit log write skipped:', error.message);
    }
  }

  async function setProviderStatus(provider: Provider, nextStatus: 'active' | 'suspended') {
    const intent = nextStatus === 'suspended' ? 'suspend' : 'activate';
    const confirmed = window.confirm(`Are you sure you want to ${intent} ${provider.name}?`);
    if (!confirmed) return;

    try {
      setActionError(null);
      setActionMessage(null);
      setActioningProviderId(provider.id);

      const { error } = await supabase
        .from('profiles')
        .update({
          status: nextStatus,
          suspended_at: nextStatus === 'suspended' ? new Date().toISOString() : null,
        })
        .eq('id', provider.id);

      if (error) throw error;

      setProviders((prev) => prev.map((p) => (
        p.id === provider.id ? { ...p, status: nextStatus } : p
      )));
      setSelectedProviderIds((prev) => prev.filter((id) => id !== provider.id));

      await writeAuditLog(
        nextStatus === 'suspended' ? 'suspend_provider' : 'activate_provider',
        provider.id,
        {
          target_provider_name: provider.name,
          target_provider_email: provider.email,
          previous_status: provider.status,
          next_status: nextStatus,
        }
      );

      setActionMessage(`${provider.name} is now ${nextStatus}.`);
    } catch (error: any) {
      console.warn('Failed to update provider status:', error);
      setActionError(error?.message || 'Could not update provider status.');
    } finally {
      setActioningProviderId(null);
    }
  }

  async function softDeleteProvider(provider: Provider) {
    const confirmed = window.confirm(
      `Soft-delete ${provider.name}? This disables account access while preserving records.`
    );
    if (!confirmed) return;

    try {
      setActionError(null);
      setActionMessage(null);
      setActioningProviderId(provider.id);

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          status: 'deleted',
          deleted_at: new Date().toISOString(),
          suspended_at: null,
        })
        .eq('id', provider.id);

      if (profileError) throw profileError;

      // Force provider offline when soft-deleted.
      const { error: providerError } = await supabase
        .from('provider_profiles')
        .update({ is_online: false })
        .eq('id', provider.id);
      if (providerError) throw providerError;

      setProviders((prev) => prev.map((p) => (
        p.id === provider.id ? { ...p, status: 'deleted', online: false } : p
      )));
      setSelectedProviderIds((prev) => prev.filter((id) => id !== provider.id));

      await writeAuditLog('delete_provider', provider.id, {
        target_provider_name: provider.name,
        target_provider_email: provider.email,
        previous_status: provider.status,
        next_status: 'deleted',
      });

      setActionMessage(`${provider.name} was soft-deleted.`);
    } catch (error: any) {
      console.warn('Failed to soft-delete provider:', error);
      setActionError(error?.message || 'Could not soft-delete provider.');
    } finally {
      setActioningProviderId(null);
    }
  }

  async function restoreProvider(provider: Provider) {
    const confirmed = window.confirm(`Restore ${provider.name} to active status?`);
    if (!confirmed) return;

    try {
      setActionError(null);
      setActionMessage(null);
      setActioningProviderId(provider.id);

      const { error } = await supabase
        .from('profiles')
        .update({
          status: 'active',
          deleted_at: null,
          suspended_at: null,
        })
        .eq('id', provider.id);

      if (error) throw error;

      setProviders((prev) => prev.map((p) => (
        p.id === provider.id ? { ...p, status: 'active' } : p
      )));
      setSelectedProviderIds((prev) => prev.filter((id) => id !== provider.id));

      await writeAuditLog('restore_provider', provider.id, {
        target_provider_name: provider.name,
        target_provider_email: provider.email,
        previous_status: provider.status,
        next_status: 'active',
      });

      setActionMessage(`${provider.name} has been restored.`);
    } catch (error: any) {
      console.warn('Failed to restore provider:', error);
      setActionError(error?.message || 'Could not restore provider.');
    } finally {
      setActioningProviderId(null);
    }
  }

  const filteredProviders = useMemo(
    () => providers.filter((p) => {
      const q = searchQuery.trim().toLowerCase();
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q);
    }),
    [providers, searchQuery, statusFilter]
  );

  const allFilteredSelected = filteredProviders.length > 0 && filteredProviders.every((p) => selectedProviderIds.includes(p.id));

  function toggleProviderSelection(providerId: string) {
    setSelectedProviderIds((prev) => (
      prev.includes(providerId) ? prev.filter((id) => id !== providerId) : [...prev, providerId]
    ));
  }

  function toggleSelectAllFiltered() {
    if (allFilteredSelected) {
      setSelectedProviderIds((prev) => prev.filter((id) => !filteredProviders.some((p) => p.id === id)));
      return;
    }
    setSelectedProviderIds((prev) => Array.from(new Set([...prev, ...filteredProviders.map((p) => p.id)])));
  }

  async function runBulkProviderStatus(nextStatus: 'active' | 'suspended' | 'deleted') {
    if (selectedProviderIds.length === 0) return;
    const confirmed = window.confirm(`Apply "${nextStatus}" to ${selectedProviderIds.length} selected provider(s)?`);
    if (!confirmed) return;

    try {
      setActionError(null);
      setActionMessage(null);
      setBulkActioning(true);

      const updatePayload: Record<string, unknown> = { status: nextStatus };
      if (nextStatus === 'suspended') {
        updatePayload.suspended_at = new Date().toISOString();
        updatePayload.deleted_at = null;
      } else if (nextStatus === 'deleted') {
        updatePayload.deleted_at = new Date().toISOString();
        updatePayload.suspended_at = null;
      } else {
        updatePayload.deleted_at = null;
        updatePayload.suspended_at = null;
      }

      const { error } = await supabase
        .from('profiles')
        .update(updatePayload)
        .in('id', selectedProviderIds);
      if (error) throw error;

      if (nextStatus === 'deleted') {
        const { error: onlineError } = await supabase
          .from('provider_profiles')
          .update({ is_online: false })
          .in('id', selectedProviderIds);
        if (onlineError) throw onlineError;
      }

      const selectedSet = new Set(selectedProviderIds);
      const affectedProviders = providers.filter((p) => selectedSet.has(p.id));
      setProviders((prev) => prev.map((p) => (
        selectedSet.has(p.id)
          ? { ...p, status: nextStatus, online: nextStatus === 'deleted' ? false : p.online }
          : p
      )));

      const actionName = nextStatus === 'suspended'
        ? 'suspend_provider'
        : nextStatus === 'deleted'
          ? 'delete_provider'
          : 'activate_provider';

      await writeAuditLogs(
        affectedProviders.map((p) => ({
          action: actionName,
          entity_id: p.id,
          details: {
            target_provider_name: p.name,
            target_provider_email: p.email,
            previous_status: p.status,
            next_status: nextStatus,
            bulk_action: true,
          },
        }))
      );

      setSelectedProviderIds([]);
      setActionMessage(`Updated ${affectedProviders.length} provider(s) to ${nextStatus}.`);
    } catch (error: any) {
      console.warn('Bulk provider update failed:', error);
      setActionError(error?.message || 'Bulk provider update failed.');
    } finally {
      setBulkActioning(false);
    }
  }

  return (
    <AdminLayout>
      <div className="p-8">
      <div className="bg-gradient-to-r from-[#1A1F2E] to-[#2F3548] p-8 rounded-3xl mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Provider Management</h1>
        </div>
      </div>

        <div className="bg-white rounded-3xl p-6 shadow-lg">
          {actionError && (
            <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
              {actionError}
            </div>
          )}
          {actionMessage && (
            <div className="mb-4 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
              {actionMessage}
            </div>
          )}

          <div className="flex items-center gap-3 mb-4">
            <Search className="w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search providers by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent text-gray-900 placeholder-gray-400 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-2 mb-6">
            {(['all', 'active', 'pending', 'suspended', 'deleted'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-full text-sm font-semibold ${
                  statusFilter === status
                    ? 'bg-[#0070B8] text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                title={`Filter providers by ${status}`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
          {selectedProviderIds.length > 0 && (
            <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-3 flex flex-wrap items-center gap-2">
              <span className="text-gray-700 text-sm">{selectedProviderIds.length} selected</span>
              <button
                onClick={() => void runBulkProviderStatus('suspended')}
                disabled={bulkActioning}
                className="px-3 py-1.5 rounded-lg bg-red-100 text-red-700 text-sm font-semibold disabled:opacity-60"
                title="Suspend selected providers"
              >
                Suspend
              </button>
              <button
                onClick={() => void runBulkProviderStatus('active')}
                disabled={bulkActioning}
                className="px-3 py-1.5 rounded-lg bg-green-100 text-green-700 text-sm font-semibold disabled:opacity-60"
                title="Activate selected providers"
              >
                Activate
              </button>
              <button
                onClick={() => void runBulkProviderStatus('deleted')}
                disabled={bulkActioning}
                className="px-3 py-1.5 rounded-lg bg-gray-200 text-gray-700 text-sm font-semibold disabled:opacity-60"
                title="Delete selected providers"
              >
                Delete
              </button>
            </div>
          )}

          {loading ? (
            <div className="p-12 text-center">
              <p className="text-gray-600">Loading providers...</p>
            </div>
          ) : filteredProviders.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-600">No providers found</p>
            </div>
          ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={toggleSelectAllFiltered}
                className="w-4 h-4 rounded border-gray-300"
                title="Select all filtered providers"
              />
              <span className="text-sm text-gray-600">Select all filtered providers</span>
            </div>
            {filteredProviders.map((provider) => (
              <div key={provider.id} className="p-5 rounded-2xl bg-gray-50 hover:bg-gray-100 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <input
                      type="checkbox"
                      checked={selectedProviderIds.includes(provider.id)}
                      onChange={() => toggleProviderSelection(provider.id)}
                      className="w-4 h-4 rounded border-gray-300"
                      title={`Select ${provider.name}`}
                    />
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#008CE5] to-[#0070B8] flex items-center justify-center">
                      <span className="text-white font-bold">{provider.name[0]}</span>
                    </div>
                    <div>
                      <h3 className="text-gray-900 font-semibold">{provider.name}</h3>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-sm text-gray-600">{provider.email}</span>
                        <span className="text-sm text-gray-600">{provider.jobs} jobs</span>
                        {provider.rating > 0 && (
                          <span className="text-sm text-gray-600">⭐ {provider.rating}</span>
                        )}
                        <span className={`text-xs font-semibold ${provider.online ? 'text-green-600' : 'text-gray-500'}`}>
                          {provider.online ? 'Online' : 'Offline'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {provider.status === 'deleted' ? (
                      <span className="px-3 py-1 rounded-full bg-gray-200 text-gray-700 text-sm font-semibold">
                        Deleted
                      </span>
                    ) : provider.status === 'suspended' ? (
                      <span className="px-3 py-1 rounded-full bg-red-100 text-red-700 text-sm font-semibold">
                        Suspended
                      </span>
                    ) : provider.verification === 'verified' ? (
                      <span className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-sm font-semibold flex items-center gap-1">
                        <CheckCircle className="w-4 h-4" /> Verified
                      </span>
                    ) : (
                      <span className="px-3 py-1 rounded-full bg-yellow-100 text-yellow-700 text-sm font-semibold flex items-center gap-1">
                        <Clock className="w-4 h-4" /> Pending
                      </span>
                    )}
                    {provider.status === 'deleted' ? (
                      <motion.button
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => restoreProvider(provider)}
                        disabled={actioningProviderId === provider.id}
                        className="px-3 py-2 rounded-xl bg-blue-100 text-blue-700 text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
                        title={`Restore ${provider.name}`}
                      >
                        <RotateCcw className="w-4 h-4" />
                        {actioningProviderId === provider.id ? 'Saving...' : 'Restore'}
                      </motion.button>
                    ) : provider.status === 'suspended' ? (
                      <motion.button
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setProviderStatus(provider, 'active')}
                        disabled={actioningProviderId === provider.id}
                        className="px-3 py-2 rounded-xl bg-green-100 text-green-700 text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
                        title={`Activate ${provider.name}`}
                      >
                        <RotateCcw className="w-4 h-4" />
                        {actioningProviderId === provider.id ? 'Saving...' : 'Activate'}
                      </motion.button>
                    ) : (
                      <motion.button
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setProviderStatus(provider, 'suspended')}
                        disabled={actioningProviderId === provider.id}
                        className="px-3 py-2 rounded-xl bg-red-100 text-red-700 text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
                        title={`Suspend ${provider.name}`}
                      >
                        <Ban className="w-4 h-4" />
                        {actioningProviderId === provider.id ? 'Saving...' : 'Suspend'}
                      </motion.button>
                    )}
                    {provider.status !== 'deleted' && (
                      <motion.button
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => softDeleteProvider(provider)}
                        disabled={actioningProviderId === provider.id}
                        className="px-3 py-2 rounded-xl bg-gray-200 text-gray-700 text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
                        title={`Soft-delete ${provider.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                        {actioningProviderId === provider.id ? 'Saving...' : 'Delete'}
                      </motion.button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
