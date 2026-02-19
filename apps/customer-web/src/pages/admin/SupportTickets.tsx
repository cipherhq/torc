import { motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '../../components/AdminLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { MessageSquareWarning, RefreshCw, Save, Download, Clock3, AlertTriangle } from 'lucide-react';
import { loadPlatformSettings } from '../../lib/platformSettings';

type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

interface TicketRow {
  id: string;
  requester_id: string;
  requester_role: 'customer' | 'provider';
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  assigned_to: string | null;
  admin_note: string | null;
  resolved_at?: string | null;
  created_at: string;
  updated_at: string;
}

interface ProfileName {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}

function nameFor(profile?: ProfileName | null) {
  if (!profile) return 'Unknown';
  const full = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
  return full || profile.email || 'Unknown';
}

export function AdminSupportTickets() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState([] as TicketRow[]);
  const [profiles, setProfiles] = useState({} as Record<string, ProfileName>);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null as string | null);
  const [selectedId, setSelectedId] = useState(null as string | null);
  const [statusFilter, setStatusFilter] = useState<'all' | TicketStatus>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | TicketPriority>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null as string | null);
  const [slaThresholds, setSlaThresholds] = useState({
    urgentHours: 2,
    standardHours: 24,
  });

  useEffect(() => {
    loadTickets();
    void loadSlaSettings();
  }, []);

  async function loadSlaSettings() {
    try {
      const settings = await loadPlatformSettings();
      setSlaThresholds({
        urgentHours: settings.urgentSlaHours,
        standardHours: settings.standardSlaHours,
      });
    } catch (error) {
      console.warn('Failed to load SLA settings, using defaults:', error);
      setSlaThresholds({ urgentHours: 2, standardHours: 24 });
    }
  }

  async function loadTickets() {
    try {
      setLoading(true);
      setLoadError(null);
      setFeedback(null);

      const { data, error } = await supabase
        .from('support_tickets')
        .select('id, requester_id, requester_role, subject, description, status, priority, assigned_to, admin_note, resolved_at, created_at, updated_at')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const rows = (data || []) as TicketRow[];
      setTickets(rows);
      if (!selectedId && rows.length > 0) {
        setSelectedId(rows[0].id);
      }

      const profileIds = Array.from(
        new Set(
          rows
            .flatMap((t) => [t.requester_id, t.assigned_to].filter(Boolean) as string[])
        )
      );

      if (profileIds.length > 0) {
        const { data: people, error: peopleError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email')
          .in('id', profileIds);
        if (peopleError) throw peopleError;

        const map: Record<string, ProfileName> = {};
        (people || []).forEach((p: any) => {
          map[p.id] = p;
        });
        setProfiles(map);
      } else {
        setProfiles({});
      }
    } catch (error: any) {
      console.warn('Failed to load support tickets:', error);
      setLoadError(error?.message || 'Could not load support tickets.');
      setTickets([]);
      setProfiles({});
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(
    () => tickets.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        t.subject.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        nameFor(profiles[t.requester_id]).toLowerCase().includes(q)
      );
    }),
    [tickets, statusFilter, priorityFilter, searchQuery, profiles]
  );

  const sla = useMemo(() => {
    const openTickets = tickets.filter((t) => t.status === 'open' || t.status === 'in_progress');
    const resolvedTickets = tickets.filter((t) => t.status === 'resolved' || t.status === 'closed');
    const now = Date.now();

    const avgOpenAgeHours = openTickets.length === 0
      ? 0
      : openTickets.reduce((sum, t) => sum + ((now - new Date(t.created_at).getTime()) / 36e5), 0) / openTickets.length;

    const resolvedHours = resolvedTickets
      .map((t) => {
        const end = new Date(t.resolved_at || t.updated_at).getTime();
        const start = new Date(t.created_at).getTime();
        return (end - start) / 36e5;
      })
      .filter((h) => Number.isFinite(h) && h >= 0);
    const avgResolutionHours = resolvedHours.length === 0
      ? 0
      : resolvedHours.reduce((sum, h) => sum + h, 0) / resolvedHours.length;

    const breached = openTickets.filter((t) => {
      const ageHours = (now - new Date(t.created_at).getTime()) / 36e5;
      return t.priority === 'urgent'
        ? ageHours > slaThresholds.urgentHours
        : ageHours > slaThresholds.standardHours;
    }).length;

    return {
      openCount: openTickets.length,
      avgOpenAgeHours,
      avgResolutionHours,
      breached,
    };
  }, [tickets, slaThresholds]);

  const selectedTicket = tickets.find((t) => t.id === selectedId) || null;

  async function updateTicket(updates: Partial<TicketRow>) {
    if (!selectedTicket) return;
    try {
      setSaving(true);
      setFeedback(null);
      const previous = {
        status: selectedTicket.status,
        priority: selectedTicket.priority,
        assigned_to: selectedTicket.assigned_to,
      };
      const { error } = await supabase
        .from('support_tickets')
        .update(updates)
        .eq('id', selectedTicket.id);
      if (error) throw error;

      if (user?.id) {
        const { error: auditError } = await supabase.from('admin_audit_logs').insert({
          actor_id: user.id,
          action: 'update_support_ticket',
          entity_type: 'support_ticket',
          entity_id: selectedTicket.id,
          details: {
            previous,
            updates,
          },
        });
        if (auditError) {
          console.warn('Audit log write skipped:', auditError.message);
        }
      }
      await loadTickets();
      setFeedback('Ticket updated.');
    } catch (error: any) {
      console.warn('Failed to update ticket:', error);
      setFeedback(error?.message || 'Update failed.');
    } finally {
      setSaving(false);
    }
  }

  function exportTicketsCsv() {
    if (filtered.length === 0) return;
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['id', 'subject', 'requester', 'requester_role', 'status', 'priority', 'assigned_to', 'created_at', 'updated_at', 'resolved_at'],
      ...filtered.map((t) => [
        t.id,
        t.subject,
        nameFor(profiles[t.requester_id]),
        t.requester_role,
        t.status,
        t.priority,
        t.assigned_to ? nameFor(profiles[t.assigned_to]) : '',
        t.created_at,
        t.updated_at,
        t.resolved_at || '',
      ]),
    ];
    const csv = rows.map((r) => r.map(escape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `support-tickets-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Support Tickets</h1>
            <p className="text-white/60">Handle customer and provider issues with real ticket data</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadTickets}
              className="rounded-2xl bg-white/10 hover:bg-white/20 text-white px-4 py-2 flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <button
              onClick={exportTicketsCsv}
              disabled={filtered.length === 0}
              className="rounded-2xl bg-[#2EFFAF]/20 border border-[#2EFFAF]/30 text-[#9FFFD8] px-4 py-2 flex items-center gap-2 disabled:opacity-60"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="glass-light rounded-[20px] p-4">
            <p className="text-white/60 text-sm">Open Tickets</p>
            <p className="text-white text-2xl font-bold">{sla.openCount}</p>
          </div>
          <div className="glass-light rounded-[20px] p-4">
            <Clock3 className="w-5 h-5 text-[#007AFF] mb-1" />
            <p className="text-white/60 text-sm">Avg Open Age</p>
            <p className="text-white text-2xl font-bold">{sla.avgOpenAgeHours.toFixed(1)}h</p>
          </div>
          <div className="glass-light rounded-[20px] p-4">
            <Clock3 className="w-5 h-5 text-[#2EFFAF] mb-1" />
            <p className="text-white/60 text-sm">Avg Resolution Time</p>
            <p className="text-white text-2xl font-bold">{sla.avgResolutionHours.toFixed(1)}h</p>
          </div>
          <div className="glass-light rounded-[20px] p-4">
            <AlertTriangle className="w-5 h-5 text-[#FF6B6B] mb-1" />
            <p className="text-white/60 text-sm">SLA Breaches</p>
            <p className="text-white text-2xl font-bold">{sla.breached}</p>
            <p className="text-white/50 text-xs mt-1">
              Thresholds: urgent &gt; {slaThresholds.urgentHours}h, standard &gt; {slaThresholds.standardHours}h
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-1 glass-light rounded-[24px] p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold">Tickets</h2>
              <span className="text-white/50 text-xs">{filtered.length} shown</span>
            </div>
            <div className="space-y-3 mb-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search subject, description, requester..."
                className="w-full bg-white/10 border border-white/20 text-white rounded-xl px-3 py-2 text-sm placeholder-white/40"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  title="Filter ticket status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'all' | TicketStatus)}
                  className="bg-white/10 border border-white/20 text-white rounded-xl px-3 py-2 text-sm"
                >
                  <option value="all">All Status</option>
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
                <select
                  title="Filter ticket priority"
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value as 'all' | TicketPriority)}
                  className="bg-white/10 border border-white/20 text-white rounded-xl px-3 py-2 text-sm"
                >
                  <option value="all">All Priority</option>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>

            {loading ? (
              <p className="text-white/60">Loading tickets...</p>
            ) : loadError ? (
              <p className="text-red-300">{loadError}</p>
            ) : filtered.length === 0 ? (
              <p className="text-white/60">No tickets found.</p>
            ) : (
              <div className="space-y-2 max-h-[64vh] overflow-y-auto pr-1">
                {filtered.map((ticket) => (
                  <motion.button
                    key={ticket.id}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => setSelectedId(ticket.id)}
                    className={`w-full text-left rounded-2xl p-3 border ${
                      selectedId === ticket.id ? 'border-[#2EFFAF]/50 bg-[#2EFFAF]/10' : 'border-white/10 bg-white/5'
                    }`}
                  >
                    <p className="text-white font-semibold text-sm">{ticket.subject}</p>
                    <p className="text-white/60 text-xs mt-0.5">{nameFor(profiles[ticket.requester_id])}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[11px] px-2 py-1 rounded-full bg-white/10 text-white/80">{ticket.status}</span>
                      <span className="text-[11px] px-2 py-1 rounded-full bg-white/10 text-white/80">{ticket.priority}</span>
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </div>

          <div className="col-span-2 glass-light rounded-[24px] p-6">
            {!selectedTicket ? (
              <div className="h-full flex items-center justify-center text-white/60">
                <div className="text-center">
                  <MessageSquareWarning className="w-8 h-8 mx-auto mb-3" />
                  Select a ticket to review
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-white text-2xl font-bold">{selectedTicket.subject}</h2>
                    <p className="text-white/60">
                      Requested by {nameFor(profiles[selectedTicket.requester_id])} ({selectedTicket.requester_role})
                    </p>
                    <p className="text-white/40 text-sm">
                      Created {new Date(selectedTicket.created_at).toLocaleString()}
                    </p>
                  </div>
                  <button
                    disabled={saving}
                    onClick={() => updateTicket({ assigned_to: user?.id || null })}
                    className="rounded-xl bg-white/10 hover:bg-white/20 px-3 py-2 text-white text-sm disabled:opacity-50"
                  >
                    Assign to me
                  </button>
                </div>

                <div className="rounded-2xl bg-white/5 border border-white/10 p-4 mb-4">
                  <p className="text-white/90 whitespace-pre-wrap">{selectedTicket.description}</p>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="text-white/70 text-sm block mb-1">Status</label>
                    <select
                      title="Ticket status"
                      value={selectedTicket.status}
                      onChange={(e) => {
                        const nextStatus = e.target.value as TicketStatus;
                        setTickets((prev) =>
                          prev.map((t) =>
                            t.id === selectedTicket.id
                              ? { ...t, status: nextStatus, resolved_at: nextStatus === 'resolved' ? new Date().toISOString() : null }
                              : t
                          )
                        );
                      }}
                      className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-white"
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-white/70 text-sm block mb-1">Priority</label>
                    <select
                      title="Ticket priority"
                      value={selectedTicket.priority}
                      onChange={(e) => {
                        const nextPriority = e.target.value as TicketPriority;
                        setTickets((prev) =>
                          prev.map((t) => (t.id === selectedTicket.id ? { ...t, priority: nextPriority } : t))
                        );
                      }}
                      className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-white"
                    >
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="text-white/70 text-sm block mb-1">Admin note</label>
                  <textarea
                    value={selectedTicket.admin_note || ''}
                    onChange={(e) =>
                      setTickets((prev) =>
                        prev.map((t) => (t.id === selectedTicket.id ? { ...t, admin_note: e.target.value } : t))
                      )
                    }
                    rows={5}
                    className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-white placeholder-white/40"
                    placeholder="Internal handling note / resolution summary..."
                  />
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-white/50 text-sm">
                    Assigned to: {selectedTicket.assigned_to ? nameFor(profiles[selectedTicket.assigned_to]) : 'Unassigned'}
                  </p>
                  <button
                    disabled={saving}
                    onClick={() =>
                      updateTicket({
                        status: selectedTicket.status,
                        priority: selectedTicket.priority,
                        admin_note: selectedTicket.admin_note || null,
                        resolved_at: selectedTicket.status === 'resolved' ? new Date().toISOString() : null,
                      })
                    }
                    className="rounded-xl bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0F1419] font-semibold px-4 py-2 disabled:opacity-50 flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    Save
                  </button>
                </div>
                {feedback && <p className="text-sm text-white/70 mt-3">{feedback}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
