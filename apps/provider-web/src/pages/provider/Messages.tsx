import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ChatModal } from '../../components/ChatModal';

interface JobRow {
  id: string;
  status: string;
  created_at: string;
  requester_name: string | null;
}

export function ProviderMessages() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeChat, setActiveChat] = useState<{ jobId: string; peerName: string; peerInitials: string } | null>(null);

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

    const { data, error } = await supabase
      .from('jobs')
      .select('id, status, created_at, requester_name')
      .eq('provider_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.warn('Failed to load provider messages jobs:', error);
      setLoadError('Could not load conversations right now.');
      setJobs([]);
    } else {
      setJobs((data || []) as JobRow[]);
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

  const textColor = isDark ? '#FFFFFF' : '#1A1F2E';
  const subColor = isDark ? 'rgba(255,255,255,0.55)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB';

  return (
    <div className="min-h-screen pb-24" style={{ background: isDark ? '#0F1419' : '#F5F7FA' }}>
      <div className="p-6 flex items-center gap-4">
        <button
          onClick={() => navigate('/home')}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB' }}
          title="Back to home"
        >
          <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
        </button>
        <h1 className="text-2xl font-bold" style={{ color: textColor }}>Messages</h1>
      </div>

      <div className="px-6 space-y-3">
        {loadError && (
          <div className="rounded-2xl p-4 border border-red-500/30" style={{ backgroundColor: cardBg }}>
            <p className="text-red-400 text-sm">{loadError}</p>
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl p-6 text-sm" style={{ backgroundColor: cardBg, color: subColor, border: `1px solid ${cardBorder}` }}>
            Loading conversations...
          </div>
        ) : jobs.length === 0 ? (
          <div className="rounded-2xl p-10 text-center" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
            <MessageCircle className="w-12 h-12 mx-auto mb-3" style={{ color: subColor }} />
            <p className="font-semibold mb-1" style={{ color: textColor }}>No conversations yet</p>
            <p className="text-sm" style={{ color: subColor }}>When you accept jobs, your customer chats will appear here.</p>
          </div>
        ) : (
          jobs.map((job, index) => {
            const { peerName, peerInitials } = getPeer(job);
            return (
              <motion.button
                key={job.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setActiveChat({ jobId: job.id, peerName, peerInitials })}
                className="w-full rounded-2xl p-4 text-left"
                style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(46,255,175,0.14)' }}>
                    <span className="text-sm font-bold" style={{ color: '#2EFFAF' }}>{peerInitials}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate" style={{ color: textColor }}>{peerName}</p>
                    <p className="text-xs truncate" style={{ color: subColor }}>
                      Job #{job.id.slice(0, 8)} • {job.status}
                    </p>
                  </div>
                </div>
              </motion.button>
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
      />
    </div>
  );
}
