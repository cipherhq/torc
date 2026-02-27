import { useNavigate } from 'react-router';
import { ArrowLeft, HelpCircle } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useEffect, useState } from 'react';

export function HelpSupport() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { user, profile } = useAuth();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    loadTickets();
  }, [user]);

  async function loadTickets() {
    if (!user) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('support_tickets')
        .select('id, subject, status, priority, created_at, admin_note')
        .eq('requester_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      setTickets(data || []);
    } catch (error) {
      console.warn('Failed to load provider support tickets:', error);
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }

  async function submitTicket() {
    if (!user) return;
    const cleanSubject = subject.trim();
    const cleanDescription = description.trim();
    if (!cleanSubject || !cleanDescription) {
      setMessage('Please add subject and description.');
      return;
    }
    try {
      setSubmitting(true);
      setMessage(null);
      const requesterRole = profile?.role === 'customer' ? 'customer' : 'provider';
      const { error } = await supabase.from('support_tickets').insert({
        requester_id: user.id,
        requester_role: requesterRole,
        subject: cleanSubject,
        description: cleanDescription,
        priority,
        status: 'open',
      });
      if (error) throw error;
      setSubject('');
      setDescription('');
      setPriority('normal');
      setMessage('Support request submitted successfully.');
      await loadTickets();
    } catch (error: any) {
      console.warn('Failed to submit provider support ticket:', error);
      setMessage(error?.message || 'Could not submit support request.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="min-h-screen p-6"
      style={{
        background: isDark ? 'linear-gradient(180deg, #0A1626 0%, #081427 100%)' : 'linear-gradient(180deg, #F8FBFF 0%, #EAF2FF 100%)',
        paddingBottom: 'calc(120px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/profile')}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2' }}
          title="Back to profile"
        >
          <ArrowLeft className="w-5 h-5" style={{ color: isDark ? '#FFFFFF' : '#14263D' }} />
        </button>
        <h1 className="text-2xl font-bold" style={{ color: isDark ? '#FFFFFF' : '#14263D' }}>Help & Support</h1>
      </div>

      <div className="rounded-2xl p-6 mb-4" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2'}` }}>
        <div className="flex items-center gap-3 mb-2">
          <HelpCircle className="w-5 h-5" style={{ color: '#008CE5' }} />
          <p className="font-semibold" style={{ color: isDark ? '#FFFFFF' : '#14263D' }}>Support center</p>
        </div>
        <p style={{ color: isDark ? 'rgba(255,255,255,0.6)' : '#6B7280' }}>
          Need help with jobs, onboarding, documents, payouts, or account issues? Submit a support request below.
        </p>
      </div>

      <div className="rounded-2xl p-6 mb-4" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2'}` }}>
        <h2 className="text-lg font-semibold mb-3" style={{ color: isDark ? '#FFFFFF' : '#14263D' }}>Create Support Request</h2>
        <div className="space-y-3">
          <div>
            <label className="text-sm block mb-1" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#6B7280' }}>Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g., Payout not received"
              className="w-full px-4 py-3 rounded-xl border focus:outline-none"
              style={{
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F5F9FF',
                borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#D3E0F2',
                color: isDark ? '#FFFFFF' : '#14263D',
              }}
            />
          </div>
          <div>
            <label className="text-sm block mb-1" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#6B7280' }}>Priority</label>
            <select
              title="Ticket priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as 'low' | 'normal' | 'high' | 'urgent')}
              className="w-full px-4 py-3 rounded-xl border focus:outline-none"
              style={{
                backgroundColor: isDark ? '#14263D' : '#F5F9FF',
                borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#D3E0F2',
                color: isDark ? '#FFFFFF' : '#14263D',
              }}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div>
            <label className="text-sm block mb-1" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#6B7280' }}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the issue..."
              rows={4}
              className="w-full px-4 py-3 rounded-xl border focus:outline-none"
              style={{
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F5F9FF',
                borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#D3E0F2',
                color: isDark ? '#FFFFFF' : '#14263D',
              }}
            />
          </div>
          <button
            onClick={submitTicket}
            disabled={submitting}
            className="w-full py-3 rounded-xl font-semibold"
            style={{
              background: 'linear-gradient(90deg, #008CE5 0%, #0070B8 100%)',
              color: '#0A1626',
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? 'Submitting...' : 'Submit Support Request'}
          </button>
          {message && (
            <p className="text-sm" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#6B7280' }}>
              {message}
            </p>
          )}
        </div>
      </div>

      <div className="rounded-2xl p-6" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2'}` }}>
        <h2 className="text-lg font-semibold mb-3" style={{ color: isDark ? '#FFFFFF' : '#14263D' }}>My Support Requests</h2>
        {loading ? (
          <p style={{ color: isDark ? 'rgba(255,255,255,0.6)' : '#6B7280' }}>Loading requests...</p>
        ) : tickets.length === 0 ? (
          <p style={{ color: isDark ? 'rgba(255,255,255,0.6)' : '#6B7280' }}>No support requests yet.</p>
        ) : (
          <div className="space-y-3">
            {tickets.map((ticket) => (
              <div
                key={ticket.id}
                className="rounded-xl p-3"
                style={{
                  backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F5F9FF',
                  border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2'}`,
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold" style={{ color: isDark ? '#FFFFFF' : '#14263D' }}>{ticket.subject}</p>
                  <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#D3E0F2', color: isDark ? '#FFFFFF' : '#14263D' }}>
                    {ticket.status}
                  </span>
                </div>
                <p className="text-xs mt-1" style={{ color: isDark ? 'rgba(255,255,255,0.6)' : '#6B7280' }}>
                  Priority: {ticket.priority} • {new Date(ticket.created_at).toLocaleString()}
                </p>
                {ticket.admin_note && (
                  <p className="text-sm mt-2" style={{ color: isDark ? 'rgba(255,255,255,0.75)' : '#4B5563' }}>
                    Admin note: {ticket.admin_note}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
