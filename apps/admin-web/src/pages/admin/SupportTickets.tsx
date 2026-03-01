import { motion } from 'motion/react';
import { useEffect, useMemo, useState, useRef } from 'react';
import { AdminLayout } from '../../components/AdminLayout';
import { supabase } from '../../lib/supabase';
import { MessageSquareWarning, RefreshCw, Save, Download, Clock3, AlertTriangle, Send } from 'lucide-react';
import { loadPlatformSettings } from '../../lib/platformSettings';
import { Pagination } from '../../components/Pagination';

interface TicketReply {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_role: 'admin' | 'customer' | 'provider';
  message: string;
  created_at: string;
}

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
  const [currentUserId, setCurrentUserId] = useState(null as string | null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);
  const [tickets, setTickets] = useState([] as TicketRow[]);
  const [profiles, setProfiles] = useState({} as Record<string, ProfileName>);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null as string | null);
  const [selectedId, setSelectedId] = useState(null as string | null);
  const [statusFilter, setStatusFilter] = useState<'all' | TicketStatus>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | TicketPriority>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 20;
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null as string | null);
  const [replies, setReplies] = useState<TicketReply[]>([]);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const repliesEndRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => { setCurrentPage(1); }, [statusFilter, priorityFilter, searchQuery]);

  const paginatedTickets = useMemo(() =>
    filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
  [filtered, currentPage]);

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

      if (currentUserId) {
        const { error: auditError } = await supabase.from('admin_audit_logs').insert({
          actor_id: currentUserId,
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

  async function loadReplies(ticketId: string) {
    try {
      const { data, error } = await supabase
        .from('ticket_replies')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });
      if (error) {
        // Table might not exist yet
        if (error.code === '42P01') { setReplies([]); return; }
        throw error;
      }
      setReplies(data || []);
      setTimeout(() => repliesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (e) {
      console.warn('Failed to load replies:', e);
      setReplies([]);
    }
  }

  async function sendReply() {
    if (!selectedTicket || !replyText.trim() || !currentUserId) return;
    try {
      setSendingReply(true);
      const { error } = await supabase.from('ticket_replies').insert({
        ticket_id: selectedTicket.id,
        sender_id: currentUserId,
        sender_role: 'admin',
        message: replyText.trim(),
      });
      if (error) throw error;
      setReplyText('');
      await loadReplies(selectedTicket.id);
      // Auto-set status to in_progress if still open
      if (selectedTicket.status === 'open') {
        await updateTicket({ status: 'in_progress' });
      }
    } catch (e: any) {
      console.warn('Failed to send reply:', e);
      setFeedback(e?.message || 'Failed to send reply.');
    } finally {
      setSendingReply(false);
    }
  }

  // Load replies when selected ticket changes
  useEffect(() => {
    if (selectedId) {
      loadReplies(selectedId);
    } else {
      setReplies([]);
    }
    setReplyText('');
  }, [selectedId]);

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
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Support Tickets</h1>
            <p className="text-gray-500">Handle customer and provider issues with real ticket data</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadTickets}
              className="rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-900 px-4 py-2 flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <button
              onClick={exportTicketsCsv}
              disabled={filtered.length === 0}
              className="rounded-2xl px-4 py-2 flex items-center gap-2 disabled:opacity-60"
              style={{ backgroundColor: 'rgba(0,140,229,0.2)', border: '1px solid rgba(0,140,229,0.3)', color: '#008CE5' }}
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white shadow-sm border border-gray-100 rounded-[20px] p-4">
            <p className="text-gray-500 text-sm">Open Tickets</p>
            <p className="text-gray-900 text-2xl font-bold">{sla.openCount}</p>
          </div>
          <div className="bg-white shadow-sm border border-gray-100 rounded-[20px] p-4">
            <Clock3 className="w-5 h-5 text-[#0070B8] mb-1" />
            <p className="text-gray-500 text-sm">Avg Open Age</p>
            <p className="text-gray-900 text-2xl font-bold">{sla.avgOpenAgeHours.toFixed(1)}h</p>
          </div>
          <div className="bg-white shadow-sm border border-gray-100 rounded-[20px] p-4">
            <Clock3 className="w-5 h-5 text-[#008CE5] mb-1" />
            <p className="text-gray-500 text-sm">Avg Resolution Time</p>
            <p className="text-gray-900 text-2xl font-bold">{sla.avgResolutionHours.toFixed(1)}h</p>
          </div>
          <div className="bg-white shadow-sm border border-gray-100 rounded-[20px] p-4">
            <AlertTriangle className="w-5 h-5 text-[#FF6B6B] mb-1" />
            <p className="text-gray-500 text-sm">SLA Breaches</p>
            <p className="text-gray-900 text-2xl font-bold">{sla.breached}</p>
            <p className="text-gray-400 text-xs mt-1">
              Thresholds: urgent &gt; {slaThresholds.urgentHours}h, standard &gt; {slaThresholds.standardHours}h
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-1 bg-white shadow-sm border border-gray-100 rounded-[24px] p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-gray-900 font-semibold">Tickets</h2>
              <span className="text-gray-400 text-xs">{filtered.length} shown</span>
            </div>
            <div className="space-y-3 mb-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search subject, description, requester..."
                className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-3 py-2 text-sm placeholder-gray-400"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  title="Filter ticket status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'all' | TicketStatus)}
                  className="bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-3 py-2 text-sm"
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
                  className="bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-3 py-2 text-sm"
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
              <p className="text-gray-500">Loading tickets...</p>
            ) : loadError ? (
              <p className="text-red-500">{loadError}</p>
            ) : filtered.length === 0 ? (
              <p className="text-gray-500">No tickets found.</p>
            ) : (
              <>
                <div className="space-y-2 max-h-[64vh] overflow-y-auto pr-1">
                  {paginatedTickets.map((ticket) => (
                    <motion.button
                      key={ticket.id}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => setSelectedId(ticket.id)}
                      className="w-full text-left rounded-2xl p-3 border"
                      style={selectedId === ticket.id
                        ? { borderColor: 'rgba(0,140,229,0.5)', backgroundColor: 'rgba(0,140,229,0.1)' }
                        : { borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' }
                      }
                    >
                      <p className="text-gray-900 font-semibold text-sm">{ticket.subject}</p>
                      <p className="text-gray-500 text-xs mt-0.5">{nameFor(profiles[ticket.requester_id])}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[11px] px-2 py-1 rounded-full bg-gray-100 text-gray-700">{ticket.status}</span>
                        <span className="text-[11px] px-2 py-1 rounded-full bg-gray-100 text-gray-700">{ticket.priority}</span>
                      </div>
                    </motion.button>
                  ))}
                </div>
                <Pagination currentPage={currentPage} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
              </>
            )}
          </div>

          <div className="col-span-2 bg-white shadow-sm border border-gray-100 rounded-[24px] p-6">
            {!selectedTicket ? (
              <div className="h-full flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <MessageSquareWarning className="w-8 h-8 mx-auto mb-3" />
                  Select a ticket to review
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-gray-900 text-2xl font-bold">{selectedTicket.subject}</h2>
                    <p className="text-gray-500">
                      Requested by {nameFor(profiles[selectedTicket.requester_id])} ({selectedTicket.requester_role})
                    </p>
                    <p className="text-gray-400 text-sm">
                      Created {new Date(selectedTicket.created_at).toLocaleString()}
                    </p>
                  </div>
                  <button
                    disabled={saving}
                    onClick={() => updateTicket({ assigned_to: currentUserId || null })}
                    className="rounded-xl bg-gray-100 hover:bg-gray-200 px-3 py-2 text-gray-900 text-sm disabled:opacity-50"
                  >
                    Assign to me
                  </button>
                </div>

                <div className="rounded-2xl bg-gray-50 border border-gray-200 p-4 mb-4">
                  <p className="text-gray-800 whitespace-pre-wrap">{selectedTicket.description}</p>
                </div>

                {/* Conversation thread */}
                <div className="mb-4">
                  <label className="text-gray-600 text-sm block mb-2 font-semibold">Conversation</label>
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 max-h-[300px] overflow-y-auto">
                    {replies.length === 0 ? (
                      <p className="text-gray-400 text-sm text-center py-6">No replies yet. Send a response below.</p>
                    ) : (
                      <div className="p-3 space-y-3">
                        {replies.map((r) => {
                          const isAdmin = r.sender_role === 'admin';
                          const senderName = isAdmin
                            ? (profiles[r.sender_id] ? nameFor(profiles[r.sender_id]) : 'Admin')
                            : (profiles[r.sender_id] ? nameFor(profiles[r.sender_id]) : (r.sender_role === 'customer' ? 'Customer' : 'Provider'));
                          return (
                            <div key={r.id} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${isAdmin ? 'bg-[#008CE5] text-white' : 'bg-white border border-gray-200 text-gray-800'}`}>
                                <p className={`text-[11px] font-semibold mb-0.5 ${isAdmin ? 'text-blue-100' : 'text-[#008CE5]'}`}>
                                  {senderName} ({r.sender_role})
                                </p>
                                <p className="text-sm whitespace-pre-wrap">{r.message}</p>
                                <p className={`text-[10px] mt-1 ${isAdmin ? 'text-blue-200' : 'text-gray-400'}`}>
                                  {new Date(r.created_at).toLocaleString()}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                        <div ref={repliesEndRef} />
                      </div>
                    )}
                  </div>

                  {/* Reply input */}
                  <div className="flex items-end gap-2 mt-2">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      rows={2}
                      className="flex-1 rounded-xl bg-white border border-gray-200 px-3 py-2 text-gray-900 placeholder-gray-400 text-sm resize-none"
                      placeholder="Type your reply to the user..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); }
                      }}
                    />
                    <button
                      disabled={sendingReply || !replyText.trim()}
                      onClick={sendReply}
                      className="rounded-xl px-4 py-2.5 disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0"
                      style={{ background: 'linear-gradient(to right, #008CE5, #0070B8)', color: '#FFFFFF' }}
                    >
                      <Send className="w-4 h-4" />
                      {sendingReply ? 'Sending...' : 'Reply'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="text-gray-600 text-sm block mb-1">Status</label>
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
                      className="w-full rounded-xl bg-gray-50 border border-gray-200 px-3 py-2 text-gray-900"
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-gray-600 text-sm block mb-1">Priority</label>
                    <select
                      title="Ticket priority"
                      value={selectedTicket.priority}
                      onChange={(e) => {
                        const nextPriority = e.target.value as TicketPriority;
                        setTickets((prev) =>
                          prev.map((t) => (t.id === selectedTicket.id ? { ...t, priority: nextPriority } : t))
                        );
                      }}
                      className="w-full rounded-xl bg-gray-50 border border-gray-200 px-3 py-2 text-gray-900"
                    >
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="text-gray-600 text-sm block mb-1">Admin note</label>
                  <textarea
                    value={selectedTicket.admin_note || ''}
                    onChange={(e) =>
                      setTickets((prev) =>
                        prev.map((t) => (t.id === selectedTicket.id ? { ...t, admin_note: e.target.value } : t))
                      )
                    }
                    rows={5}
                    className="w-full rounded-xl bg-gray-50 border border-gray-200 px-3 py-2 text-gray-900 placeholder-gray-400"
                    placeholder="Internal handling note / resolution summary..."
                  />
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-gray-400 text-sm">
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
                    className="rounded-xl font-semibold px-4 py-2 disabled:opacity-50 flex items-center gap-2"
                    style={{ background: 'linear-gradient(to right, #008CE5, #0070B8)', color: '#FFFFFF' }}
                  >
                    <Save className="w-4 h-4" />
                    Save
                  </button>
                </div>
                {feedback && <p className="text-sm text-gray-600 mt-3">{feedback}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
