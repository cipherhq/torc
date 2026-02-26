import { useEffect, useState, useCallback, useRef } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, MessageCircle, Search, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ChatModal } from '../../components/ChatModal';
import { loadPlatformSettings } from '../../lib/platformSettings';
import { formatPrivacyName, getInitials, relativeTime } from '../../lib/nameFormat';

interface JobRow {
  id: string;
  status: string;
  created_at: string;
  customer_id?: string | null;
  requester_name: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_sender_role: string | null;
}

export function ProviderMessages() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeChat, setActiveChat] = useState<{ jobId: string; peerName: string; peerInitials: string } | null>(null);
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
  }, [user]);

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
      .select('id, status, created_at, requester_name, customer_id, last_message_at, last_message_preview, last_message_sender_role')
      .eq('provider_id', user.id)
      .order('last_message_at', { ascending: false, nullsFirst: false } as any)
      .order('created_at', { ascending: false })
      .range(from, to);

    // Compatibility fallback
    if (error && (String(error.message || '').includes('last_message_at') || String(error.message || '').includes('requester_name'))) {
      const fallback = await supabase
        .from('jobs')
        .select('id, status, created_at, customer_id')
        .eq('provider_id', user.id)
        .order('created_at', { ascending: false })
        .range(from, to);
      data = fallback.data as any;
      error = fallback.error as any;
    }

    if (error) {
      console.warn('Failed to load provider messages jobs:', error);
      setLoadError('Could not load conversations right now.');
      if (!append) setJobs([]);
    } else {
      const rows = (data || []) as JobRow[];
      const customerIds = Array.from(new Set(rows.map((r) => r.customer_id).filter(Boolean))) as string[];
      let nameMap: Record<string, { first: string; last: string }> = {};

      if (customerIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name')
          .in('id', customerIds);

        if (profiles) {
          nameMap = profiles.reduce((acc: Record<string, { first: string; last: string }>, p: any) => {
            acc[p.id] = { first: p.first_name || '', last: p.last_name || '' };
            return acc;
          }, {});
        }
      }

      const mapped = rows.map((row) => ({
        ...row,
        requester_name:
          row.customer_id && nameMap[row.customer_id]
            ? formatPrivacyName(nameMap[row.customer_id].first, nameMap[row.customer_id].last, 'Customer')
            : row.requester_name || 'Customer',
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

  function isUnread(job: JobRow): boolean {
    if (!job.last_message_at) return false;
    if (job.last_message_sender_role === 'provider') return false;
    const lastRead = localStorage.getItem(`torc_chat_read_${job.id}`);
    if (!lastRead) return true;
    return new Date(job.last_message_at) > new Date(lastRead);
  }

  const handleOpenChat = (job: JobRow) => {
    const peerName = job.requester_name?.trim() || 'Customer';
    const peerInitials = getInitials(peerName);
    localStorage.setItem(`torc_chat_read_${job.id}`, new Date().toISOString());
    setActiveChat({ jobId: job.id, peerName, peerInitials });
  };

  // Client-side search filter
  const filteredJobs = debouncedSearch
    ? jobs.filter((job) => {
        const name = job.requester_name || '';
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
          onClick={() => navigate('/home')}
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
              {debouncedSearch ? 'Try a different search term.' : 'When you accept jobs, your customer chats will appear here.'}
            </p>
          </div>
        ) : (
          filteredJobs.map((job, index) => {
            const peerName = job.requester_name?.trim() || 'Customer';
            const peerInitials = getInitials(peerName);
            const unread = isUnread(job);
            const timeLabel = job.last_message_at
              ? relativeTime(job.last_message_at)
              : relativeTime(job.created_at);
            return (
              <motion.button
                key={job.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleOpenChat(job)}
                className="w-full rounded-2xl p-4 text-left"
                style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: 'rgba(0,140,229,0.14)' }}>
                    <span className="text-sm font-bold" style={{ color: '#008CE5' }}>{peerInitials}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className={`font-semibold truncate ${unread ? '' : ''}`} style={{ color: textColor }}>{peerName}</p>
                      <span className="text-[11px] flex-shrink-0 ml-2" style={{ color: subColor }}>{timeLabel}</span>
                    </div>
                    {job.last_message_preview ? (
                      <p className="text-xs truncate mt-0.5" style={{ color: subColor, fontWeight: unread ? 600 : 400 }}>
                        {job.last_message_sender_role === 'provider' ? 'You: ' : ''}
                        {job.last_message_preview}
                      </p>
                    ) : (
                      <p className="text-xs truncate mt-0.5" style={{ color: subColor }}>
                        Job #{job.id.slice(0, 8)} &bull; {job.status}
                      </p>
                    )}
                  </div>
                  {unread && (
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#008CE5' }} />
                  )}
                </div>
              </motion.button>
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
        peerName={activeChat?.peerName || 'Customer'}
        peerInitials={activeChat?.peerInitials || 'C'}
        role="provider"
      />
    </div>
  );
}
