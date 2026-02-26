import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, MessageCircle, Search, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ChatModal } from '../../components/ChatModal';
import { CustomerBottomNav } from '../../components/CustomerBottomNav';
import { loadPlatformSettings } from '../../lib/platformSettings';
import { formatPrivacyName, getInitials, relativeTime } from '../../lib/nameFormat';

interface JobRow {
  id: string;
  status: string;
  created_at: string;
  provider_id: string | null;
  provider_name?: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_sender_role: string | null;
}

export function CustomerMessages() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeChat, setActiveChat] = useState<{ jobId: string; peerName: string; peerInitials: string; jobStatus: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const perPageRef = useRef(20);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load platform settings
  useEffect(() => {
    loadPlatformSettings().then((s) => {
      perPageRef.current = s.chat_conversations_per_page || 20;
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    loadJobs(0, false);
  }, [user?.id]);

  const activeStatuses = ['accepted', 'enroute', 'en_route', 'arrived', 'inprogress', 'in_progress', 'completed'];

  const loadJobs = useCallback(async (pageNum: number, append: boolean) => {
    if (!user) return;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setLoadError(null);

    const perPage = perPageRef.current;
    const from = pageNum * perPage;
    const to = from + perPage - 1;

    let { data, error } = await supabase
      .from('jobs')
      .select('id, status, created_at, provider_id, last_message_at, last_message_preview, last_message_sender_role')
      .eq('customer_id', user.id)
      .not('provider_id', 'is', null)
      .in('status', activeStatuses)
      .order('last_message_at', { ascending: false, nullsFirst: false } as any)
      .order('created_at', { ascending: false })
      .range(from, to);

    // Compatibility fallback
    if (error && String(error.message || '').includes('last_message_at')) {
      const fallback = await supabase
        .from('jobs')
        .select('id, status, created_at, provider_id')
        .eq('customer_id', user.id)
        .not('provider_id', 'is', null)
        .in('status', activeStatuses)
        .order('created_at', { ascending: false })
        .range(from, to);
      data = fallback.data as any;
      error = fallback.error as any;
    }

    if (error) {
      console.warn('Failed to load customer messages jobs:', error);
      setLoadError('Could not load conversations right now.');
      if (!append) setJobs([]);
    } else {
      const rows = ((data || []) as JobRow[]).filter((r) => !!r.provider_id);
      const providerIds = Array.from(new Set(rows.map((r) => r.provider_id).filter(Boolean))) as string[];
      let nameMap: Record<string, { first: string; last: string }> = {};

      if (providerIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name')
          .in('id', providerIds);

        if (profiles) {
          nameMap = profiles.reduce((acc: Record<string, { first: string; last: string }>, p: any) => {
            acc[p.id] = { first: p.first_name || '', last: p.last_name || '' };
            return acc;
          }, {});
        }
      }

      const mapped = rows.map((row) => ({
        ...row,
        provider_name:
          row.provider_id && nameMap[row.provider_id]
            ? formatPrivacyName(nameMap[row.provider_id].first, nameMap[row.provider_id].last, 'Provider')
            : 'Provider',
      }));

      if (append) {
        setJobs((prev) => [...prev, ...mapped]);
      } else {
        setJobs(mapped);
      }
      setHasMore(rows.length === perPage);
      setPage(pageNum);
    }
    setLoading(false);
    setLoadingMore(false);
  }, [user]);

  function getStatusBadge(status: string) {
    switch (status) {
      case 'accepted':
      case 'enroute':
      case 'en_route':
        return { label: 'Active', bg: 'rgba(0,140,229,0.12)', color: '#008CE5' };
      case 'arrived':
      case 'inprogress':
      case 'in_progress':
        return { label: 'In Progress', bg: 'rgba(0,112,184,0.12)', color: '#0070B8' };
      case 'completed':
        return { label: 'Done', bg: 'rgba(34,197,94,0.12)', color: '#22C55E' };
      default:
        return { label: status, bg: 'rgba(107,114,128,0.12)', color: '#6B7280' };
    }
  }

  function isUnread(job: JobRow): boolean {
    if (!job.last_message_at) return false;
    if (job.last_message_sender_role === 'customer') return false;
    const lastRead = localStorage.getItem(`torc_chat_read_${job.id}`);
    if (!lastRead) return true;
    return new Date(job.last_message_at) > new Date(lastRead);
  }

  const handleOpenChat = (job: JobRow) => {
    const peerName = job.provider_name?.trim() || 'Provider';
    const peerInitials = getInitials(peerName);
    localStorage.setItem(`torc_chat_read_${job.id}`, new Date().toISOString());
    setActiveChat({ jobId: job.id, peerName, peerInitials, jobStatus: job.status });
  };

  // Client-side search filter
  const filteredJobs = debouncedSearch
    ? jobs.filter((job) => {
        const name = job.provider_name || '';
        return name.toLowerCase().includes(debouncedSearch.toLowerCase());
      })
    : jobs;

  const textColor = isDark ? '#FFFFFF' : '#1A1F2E';
  const subColor = isDark ? 'rgba(255,255,255,0.55)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E8E4DE';

  return (
    <div className="min-h-screen pb-24" style={{ background: isDark ? '#0F1419' : '#FAF8F5' }}>
      <div className="p-6 flex items-center gap-4" style={{ paddingTop: 'var(--safe-top)' }}>
        <button
          onClick={() => navigate('/customer/home')}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E8E4DE' }}
          title="Back to home"
        >
          <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
        </button>
        <h1 className="text-2xl font-bold" style={{ color: textColor }}>Messages</h1>
      </div>

      {/* Search bar */}
      <div className="px-6 mb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: subColor }} />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl pl-12 pr-4 py-3 text-sm outline-none"
            style={{
              backgroundColor: cardBg,
              border: `1px solid ${cardBorder}`,
              color: textColor,
            }}
          />
        </div>
      </div>

      <div className="px-6 space-y-3">
        {loadError && (
          <div className="rounded-2xl p-4 border border-red-500/30" style={{ backgroundColor: cardBg }}>
            <p className="text-red-400 text-sm">{loadError}</p>
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl p-6 text-sm flex items-center justify-center gap-2" style={{ backgroundColor: cardBg, color: subColor, border: `1px solid ${cardBorder}` }}>
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading conversations...
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="rounded-2xl p-10 text-center" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
            <MessageCircle className="w-12 h-12 mx-auto mb-3" style={{ color: subColor }} />
            <p className="font-semibold mb-1" style={{ color: textColor }}>
              {debouncedSearch ? 'No matching conversations' : 'No conversations yet'}
            </p>
            <p className="text-sm" style={{ color: subColor }}>
              {debouncedSearch ? 'Try a different search term.' : 'Once a provider is assigned to your request, you can chat here.'}
            </p>
          </div>
        ) : (
          filteredJobs.map((job) => {
            const peerName = job.provider_name?.trim() || 'Provider';
            const peerInitials = getInitials(peerName);
            const badge = getStatusBadge(job.status);
            const unread = isUnread(job);
            const timeLabel = job.last_message_at
              ? relativeTime(job.last_message_at)
              : relativeTime(job.created_at);
            return (
              <button
                key={job.id}
                onClick={() => handleOpenChat(job)}
                className="w-full rounded-2xl p-4 text-left active:scale-[0.98] transition-transform"
                style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}`, touchAction: 'manipulation' }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #008CE5, #0070B8)' }}>
                    <span className="text-sm font-bold" style={{ color: '#FFFFFF' }}>{peerInitials}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold truncate" style={{ color: textColor }}>{peerName}</p>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <span className="text-[11px]" style={{ color: subColor }}>{timeLabel}</span>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: badge.bg, color: badge.color }}>
                          {badge.label}
                        </span>
                      </div>
                    </div>
                    {job.last_message_preview ? (
                      <p className="text-xs truncate mt-0.5" style={{ color: subColor, fontWeight: unread ? 600 : 400 }}>
                        {job.last_message_sender_role === 'customer' ? 'You: ' : ''}
                        {job.last_message_preview}
                      </p>
                    ) : (
                      <p className="text-xs truncate mt-0.5" style={{ color: subColor }}>
                        Job #{job.id.slice(0, 8)}
                      </p>
                    )}
                  </div>
                  {unread && (
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#008CE5' }} />
                  )}
                </div>
              </button>
            );
          })
        )}

        {/* Load more */}
        {hasMore && !loading && filteredJobs.length > 0 && !debouncedSearch && (
          <button
            onClick={() => loadJobs(page + 1, true)}
            disabled={loadingMore}
            className="w-full rounded-2xl p-4 text-center text-sm font-semibold"
            style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}`, color: '#008CE5' }}
          >
            {loadingMore ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading...
              </span>
            ) : (
              'Load more conversations'
            )}
          </button>
        )}
      </div>

      <ChatModal
        isOpen={!!activeChat}
        onClose={() => {
          if (activeChat) {
            localStorage.setItem(`torc_chat_read_${activeChat.jobId}`, new Date().toISOString());
          }
          setActiveChat(null);
        }}
        jobId={activeChat?.jobId || ''}
        peerName={activeChat?.peerName || 'Provider'}
        peerInitials={activeChat?.peerInitials || 'P'}
        role="customer"
        jobStatus={activeChat?.jobStatus}
      />

      <CustomerBottomNav />
    </div>
  );
}
