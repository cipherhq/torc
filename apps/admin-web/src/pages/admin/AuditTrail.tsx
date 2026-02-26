import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Search, Filter, Shield, Clock3, Download, RefreshCw } from 'lucide-react';
import { AdminLayout } from '../../components/AdminLayout';
import { supabase } from '../../lib/supabase';
import { Pagination } from '../../components/Pagination';

interface AuditLogRow {
  id: string;
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, any> | null;
  created_at: string;
}

interface AuditLogView extends AuditLogRow {
  actorName: string;
  actorEmail: string;
}

function formatAction(action: string) {
  return action
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (s) => s.toUpperCase());
}

function formatEntity(entityType: string) {
  return entityType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (s) => s.toUpperCase());
}

export function AdminAuditTrail() {
  const [logs, setLogs] = useState([] as AuditLogView[]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null as string | null);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');
  const [bulkOnly, setBulkOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 20;

  async function loadAuditLogs() {
    try {
      setLoading(true);
      setLoadError(null);

      const { data, error } = await supabase
        .from('admin_audit_logs')
        .select('id, actor_id, action, entity_type, entity_id, details, created_at')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;

      const rows = (data || []) as AuditLogRow[];
      const actorIds = Array.from(new Set(rows.map((r) => r.actor_id).filter(Boolean)));

      const { data: actors } = actorIds.length === 0
        ? { data: [] as any[] }
        : await supabase
            .from('profiles')
            .select('id, full_name, email')
            .in('id', actorIds);

      const actorMap = new Map((actors || []).map((a: any) => [a.id, a]));
      const merged = rows.map((row) => {
        const actor = actorMap.get(row.actor_id);
        return {
          ...row,
          actorName: actor?.full_name || actor?.email || row.actor_id.slice(0, 8),
          actorEmail: actor?.email || '-',
        };
      });

      setLogs(merged);
    } catch (error: any) {
      console.warn('Failed to load admin audit logs:', error);
      setLogs([]);
      setLoadError(
        error?.message?.includes('admin_audit_logs')
          ? 'Audit log table is not available yet. Run migration 014 and refresh.'
          : (error?.message || 'Could not load audit logs.')
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAuditLogs();
  }, []);

  const actionOptions = useMemo(
    () => Array.from(new Set(logs.map((l) => l.action))).sort(),
    [logs]
  );

  const entityOptions = useMemo(
    () => Array.from(new Set(logs.map((l) => l.entity_type))).sort(),
    [logs]
  );

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const fromDate = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const toDate = dateTo ? new Date(`${dateTo}T23:59:59`) : null;
    return logs.filter((log) => {
      if (actionFilter !== 'all' && log.action !== actionFilter) return false;
      if (entityFilter !== 'all' && log.entity_type !== entityFilter) return false;
      if (bulkOnly && !log.details?.bulk_action) return false;
      if (fromDate && new Date(log.created_at) < fromDate) return false;
      if (toDate && new Date(log.created_at) > toDate) return false;
      if (!q) return true;

      const detailsText = JSON.stringify(log.details || {}).toLowerCase();
      return (
        log.actorName.toLowerCase().includes(q) ||
        log.actorEmail.toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q) ||
        log.entity_type.toLowerCase().includes(q) ||
        log.entity_id.toLowerCase().includes(q) ||
        detailsText.includes(q)
      );
    });
  }, [logs, searchQuery, actionFilter, entityFilter, bulkOnly, dateFrom, dateTo]);

  useEffect(() => { setCurrentPage(1); }, [searchQuery, actionFilter, entityFilter, bulkOnly, dateFrom, dateTo]);

  const paginatedLogs = useMemo(() =>
    filteredLogs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
  [filteredLogs, currentPage]);

  const bulkCount = useMemo(
    () => filteredLogs.filter((log) => !!log.details?.bulk_action).length,
    [filteredLogs]
  );

  function exportCsv() {
    if (filteredLogs.length === 0) return;
    const escape = (value: unknown) => {
      const raw = String(value ?? '');
      return `"${raw.replace(/"/g, '""')}"`;
    };
    const rows = [
      ['timestamp', 'actor_name', 'actor_email', 'action', 'entity_type', 'entity_id', 'bulk_action', 'details_json'],
      ...filteredLogs.map((log) => [
        log.created_at,
        log.actorName,
        log.actorEmail,
        log.action,
        log.entity_type,
        log.entity_id,
        Boolean(log.details?.bulk_action),
        JSON.stringify(log.details || {}),
      ]),
    ];
    const csv = rows.map((row) => row.map(escape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Audit Trail</h1>
            <p className="text-gray-500">Track admin actions and entity changes</p>
          </div>
          <div className="px-4 py-2 rounded-2xl bg-gray-50 border border-gray-200 text-gray-700 text-sm">
            {filteredLogs.length} entries
          </div>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => void loadAuditLogs()}
            className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 text-gray-800 text-sm flex items-center gap-2 hover:bg-gray-100"
            title="Refresh audit entries"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={exportCsv}
            disabled={filteredLogs.length === 0}
            className="px-4 py-2 rounded-xl text-sm flex items-center gap-2 disabled:opacity-60"
            style={{ backgroundColor: 'rgba(0,140,229,0.2)', border: '1px solid rgba(0,140,229,0.3)', color: '#008CE5' }}
            title="Export filtered entries to CSV"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6">
            <Shield className="w-8 h-8 text-[#008CE5] mb-3" />
            <p className="text-gray-500 text-sm">Total Logged Actions</p>
            <p className="text-gray-900 text-3xl font-bold">{logs.length}</p>
          </div>
          <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6">
            <Clock3 className="w-8 h-8 text-[#0070B8] mb-3" />
            <p className="text-gray-500 text-sm">Unique Actors</p>
            <p className="text-gray-900 text-3xl font-bold">{new Set(logs.map((l) => l.actor_id)).size}</p>
          </div>
          <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6">
            <Filter className="w-8 h-8 text-[#FF6B6B] mb-3" />
            <p className="text-gray-500 text-sm">Entity Types</p>
            <p className="text-gray-900 text-3xl font-bold">{entityOptions.length}</p>
          </div>
          <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6">
            <Filter className="w-8 h-8 text-[#FFA500] mb-3" />
            <p className="text-gray-500 text-sm">Bulk Actions (Filtered)</p>
            <p className="text-gray-900 text-3xl font-bold">{bulkCount}</p>
          </div>
        </div>

        <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search actor, action, entity, details..."
                className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-[16px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#008CE5]/50"
              />
            </div>
            <div className="md:col-span-2 grid grid-cols-2 gap-3">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                title="Filter start date"
                className="px-3 py-3 bg-gray-50 border border-gray-200 rounded-[16px] text-gray-900 focus:outline-none focus:border-[#008CE5]/50"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                title="Filter end date"
                className="px-3 py-3 bg-gray-50 border border-gray-200 rounded-[16px] text-gray-900 focus:outline-none focus:border-[#008CE5]/50"
              />
            </div>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              title="Filter by action"
              className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-[16px] text-gray-900 focus:outline-none focus:border-[#008CE5]/50"
            >
              <option value="all">All actions</option>
              {actionOptions.map((action) => (
                <option key={action} value={action}>
                  {formatAction(action)}
                </option>
              ))}
            </select>
            <select
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value)}
              title="Filter by entity type"
              className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-[16px] text-gray-900 focus:outline-none focus:border-[#008CE5]/50"
            >
              <option value="all">All entities</option>
              {entityOptions.map((entity) => (
                <option key={entity} value={entity}>
                  {formatEntity(entity)}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 px-3 py-3 rounded-[16px] bg-gray-50 border border-gray-200 text-gray-800">
              <input
                type="checkbox"
                checked={bulkOnly}
                onChange={(e) => setBulkOnly(e.target.checked)}
                className="w-4 h-4"
                title="Show only bulk actions"
              />
              <span className="text-sm">Bulk only</span>
            </label>
          </div>
        </div>

        <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <p className="text-gray-500">Loading audit entries...</p>
            </div>
          ) : loadError ? (
            <div className="p-12 text-center">
              <p className="text-red-500">{loadError}</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-500">No audit entries found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-gray-500 text-sm font-semibold">Timestamp</th>
                    <th className="px-6 py-4 text-left text-gray-500 text-sm font-semibold">Actor</th>
                    <th className="px-6 py-4 text-left text-gray-500 text-sm font-semibold">Action</th>
                    <th className="px-6 py-4 text-left text-gray-500 text-sm font-semibold">Entity</th>
                    <th className="px-6 py-4 text-left text-gray-500 text-sm font-semibold">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLogs.map((log, index) => (
                    <motion.tr
                      key={log.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.02 }}
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors align-top"
                    >
                      <td className="px-6 py-4 text-gray-700 text-sm whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-gray-900 font-medium">{log.actorName}</p>
                        <p className="text-gray-400 text-xs">{log.actorEmail}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: 'rgba(0,140,229,0.2)', color: '#008CE5' }}>
                          {formatAction(log.action)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-gray-900">{formatEntity(log.entity_type)}</p>
                        <p className="text-gray-400 text-xs">{log.entity_id}</p>
                      </td>
                      <td className="px-6 py-4">
                        <pre className="text-gray-600 text-xs whitespace-pre-wrap break-words max-w-md">
                          {JSON.stringify(log.details || {}, null, 2)}
                        </pre>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
              <Pagination currentPage={currentPage} totalItems={filteredLogs.length} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
