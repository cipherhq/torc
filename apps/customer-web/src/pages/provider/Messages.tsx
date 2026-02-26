import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { ChatModal } from '../../components/ChatModal';
import { ProviderBottomNav } from '../../components/ProviderBottomNav';

interface JobRow {
  id: string;
  status: string;
  created_at: string;
  customer_id?: string | null;
  requester_name: string | null;
}

export function ProviderMessages() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeChat, setActiveChat] = useState<{ jobId: string; peerName: string; peerInitials: string; jobStatus: string } | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    loadJobs();
  }, [user]);

  async function loadJobs() {
    if (!user) return;
    setLoading(true);
    setLoadError(null);

    // Only show jobs where messaging is relevant: accepted through completed
    const activeStatuses = ['accepted', 'enroute', 'en_route', 'arrived', 'inprogress', 'in_progress', 'completed'];

    let { data, error } = await supabase
      .from('jobs')
      .select('id, status, created_at, requester_name, customer_id')
      .eq('provider_id', user.id)
      .in('status', activeStatuses)
      .order('created_at', { ascending: false })
      .limit(50);

    // Compatibility fallback for schemas without requester_name.
    if (error && String(error.message || '').includes('requester_name')) {
      const fallback = await supabase
        .from('jobs')
        .select('id, status, created_at, customer_id')
        .eq('provider_id', user.id)
        .in('status', activeStatuses)
        .order('created_at', { ascending: false })
        .limit(50);
      data = fallback.data as any;
      error = fallback.error as any;
    }

    if (error) {
      console.warn('Failed to load provider messages jobs:', error);
      setLoadError('Could not load conversations right now.');
      setJobs([]);
    } else {
      const rows = (data || []) as JobRow[];
      const customerIds = Array.from(new Set(rows.map((row) => row.customer_id).filter(Boolean))) as string[];
      let nameMap: Record<string, string> = {};

      if (customerIds.length > 0) {
        const { data: profiles, error: profileError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name')
          .in('id', customerIds);

        if (!profileError && profiles) {
          nameMap = profiles.reduce((acc: Record<string, string>, profile: any) => {
            const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
            acc[profile.id] = fullName || 'Customer';
            return acc;
          }, {});
        }
      }

      setJobs(
        rows.map((row) => ({
          ...row,
          requester_name: row.requester_name || (row.customer_id ? nameMap[row.customer_id] || 'Customer' : 'Customer'),
        }))
      );
    }
    setLoading(false);
  }

  function getPeer(job: JobRow) {
    const peerName = job.requester_name?.trim() || 'Customer';
    const parts = peerName.split(' ').filter(Boolean);
    const first = parts[0] || 'Customer';
    const last = parts[1] || '';
    const peerInitials = `${first[0] || 'C'}${last[0] || ''}`.toUpperCase();
    return { peerName, peerInitials };
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'accepted':
      case 'enroute':
        return { label: 'Active', bg: 'rgba(78,205,196,0.12)', color: '#008CE5' };
      case 'arrived':
      case 'inprogress':
      case 'in_progress':
        return { label: 'In Progress', bg: 'rgba(42,157,143,0.12)', color: '#0070B8' };
      case 'completed':
        return { label: 'Done', bg: 'rgba(34,197,94,0.12)', color: '#22C55E' };
      case 'cancelled':
        return { label: 'Cancelled', bg: 'rgba(239,68,68,0.12)', color: '#EF4444' };
      default:
        return { label: status, bg: 'rgba(107,114,128,0.12)', color: '#6B7280' };
    }
  }

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: '#FFFFFF' }}>
      <div className="p-6 flex items-center gap-4" style={{ paddingTop: 'calc(env(safe-area-inset-top, 16px) + 20px)' }}>
        <button
          onClick={() => navigate('/provider/home')}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: '#F3F4F6', touchAction: 'manipulation' }}
        >
          <ArrowLeft className="w-5 h-5" style={{ color: '#1A1F2E' }} />
        </button>
        <h1 className="text-2xl font-bold" style={{ color: '#1A1F2E' }}>Messages</h1>
      </div>

      <div className="px-6 space-y-3">
        {loadError && (
          <div className="rounded-2xl p-4 border" style={{ borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.05)' }}>
            <p className="text-sm" style={{ color: '#EF4444' }}>{loadError}</p>
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl p-6 text-sm" style={{ backgroundColor: '#F9FAFB', color: '#6B7280', border: '1px solid #E5E7EB' }}>
            Loading conversations...
          </div>
        ) : jobs.length === 0 ? (
          <div className="rounded-2xl p-10 text-center" style={{ backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB' }}>
            <MessageCircle className="w-12 h-12 mx-auto mb-3" style={{ color: '#9CA3AF' }} />
            <p className="font-semibold mb-1" style={{ color: '#1A1F2E' }}>No conversations yet</p>
            <p className="text-sm" style={{ color: '#6B7280' }}>When you accept jobs, your customer chats will appear here.</p>
          </div>
        ) : (
          jobs.map((job) => {
            const { peerName, peerInitials } = getPeer(job);
            const badge = getStatusBadge(job.status);
            return (
              <button
                key={job.id}
                onClick={() => setActiveChat({ jobId: job.id, peerName, peerInitials, jobStatus: job.status })}
                className="w-full rounded-2xl p-4 text-left"
                style={{ backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', touchAction: 'manipulation' }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #008CE5, #0070B8)' }}>
                    <span className="text-sm font-bold" style={{ color: '#FFFFFF' }}>{peerInitials}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold truncate" style={{ color: '#1A1F2E' }}>{peerName}</p>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ml-2"
                        style={{ backgroundColor: badge.bg, color: badge.color }}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-xs truncate mt-0.5" style={{ color: '#6B7280' }}>
                      Job #{job.id.slice(0, 8)}
                    </p>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      <ChatModal
        isOpen={!!activeChat}
        onClose={() => setActiveChat(null)}
        jobId={activeChat?.jobId || ''}
        peerName={activeChat?.peerName || 'Customer'}
        peerInitials={activeChat?.peerInitials || 'C'}
        role="provider"
        jobStatus={activeChat?.jobStatus}
      />

      <ProviderBottomNav />
    </div>
  );
}
