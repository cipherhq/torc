import { motion } from 'motion/react';
import { AdminLayout } from '../../components/AdminLayout';
import {
  Bell, Send, Loader2, CheckCircle, AlertCircle, Users, Megaphone,
  MapPin, DollarSign, Gift, Star, Info, Clock, Hash,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface BroadcastEntry {
  id: string;
  title: string;
  message: string;
  type: string;
  audience: string;
  action_url: string | null;
  recipient_count: number;
  created_at: string;
}

const NOTIFICATION_TYPES = [
  { value: 'info', label: 'Info', icon: Info, gradient: 'linear-gradient(135deg, #007AFF, #0051D5)' },
  { value: 'alert', label: 'Alert', icon: AlertCircle, gradient: 'linear-gradient(135deg, #FF6B6B, #FF5252)' },
  { value: 'promo', label: 'Promotion', icon: Gift, gradient: 'linear-gradient(135deg, #8B5CF6, #7C3AED)' },
  { value: 'service', label: 'Service', icon: MapPin, gradient: 'linear-gradient(135deg, #007AFF, #0070B8)' },
  { value: 'payment', label: 'Payment', icon: DollarSign, gradient: 'linear-gradient(135deg, #008CE5, #0070B8)' },
  { value: 'rating', label: 'Rating', icon: Star, gradient: 'linear-gradient(135deg, #FFA500, #FF8C00)' },
];

const AUDIENCES = [
  { value: 'all', label: 'All Users', icon: Users },
  { value: 'customers', label: 'Customers Only', icon: Users },
  { value: 'providers', label: 'Providers Only', icon: Users },
];

function timeAgo(date: string): string {
  const now = new Date();
  const d = new Date(date);
  const seconds = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return d.toLocaleDateString();
}

export function AdminNotifications() {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState('info');
  const [audience, setAudience] = useState('all');
  const [actionUrl, setActionUrl] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [history, setHistory] = useState<BroadcastEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Load broadcast history
  useEffect(() => {
    async function loadHistory() {
      try {
        const { data, error } = await supabase
          .from('broadcast_log')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (!error && data) {
          setHistory(data);
        }
      } catch (e) {
        console.warn('Failed to load broadcast history:', e);
      } finally {
        setHistoryLoading(false);
      }
    }
    loadHistory();
  }, []);

  const handleSend = async () => {
    setConfirmOpen(false);
    setSending(true);
    setError('');
    setSent(false);

    try {
      const { data, error: rpcError } = await supabase.rpc('send_broadcast_notification', {
        p_title: title.trim(),
        p_message: message.trim(),
        p_type: type,
        p_audience: audience,
        p_action_url: actionUrl.trim() || null,
      });

      if (rpcError) throw rpcError;

      setSentCount(data || 0);
      setSent(true);

      // Refresh history
      const { data: newHistory } = await supabase
        .from('broadcast_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (newHistory) setHistory(newHistory);

      // Reset form
      setTitle('');
      setMessage('');
      setType('info');
      setAudience('all');
      setActionUrl('');

      setTimeout(() => setSent(false), 5000);
    } catch (e: any) {
      setError(e.message || 'Failed to send notification');
    } finally {
      setSending(false);
    }
  };

  const canSend = title.trim().length > 0 && message.trim().length > 0;

  const getTypeConfig = (t: string) => NOTIFICATION_TYPES.find(nt => nt.value === t) || NOTIFICATION_TYPES[0];
  const getAudienceLabel = (a: string) => AUDIENCES.find(au => au.value === a)?.label || a;

  return (
    <AdminLayout>
      <div className="p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Notifications</h1>
          <p className="text-gray-500">Send broadcast notifications to your users</p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Compose Broadcast */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6"
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #008CE5, #0070B8)' }}>
                <Megaphone className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-gray-900 font-bold text-xl">Compose Broadcast</h2>
                <p className="text-gray-400 text-sm">Send a notification to targeted users</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="text-gray-600 text-sm font-medium mb-2 block">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Notification title..."
                  maxLength={100}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-[16px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#008CE5]/50 transition-colors"
                />
              </div>

              {/* Message */}
              <div>
                <label className="text-gray-600 text-sm font-medium mb-2 block">Message</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Write your notification message..."
                  maxLength={500}
                  rows={4}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-[16px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#008CE5]/50 transition-colors resize-none"
                />
                <p className="text-gray-400 text-xs mt-1 text-right">{message.length}/500</p>
              </div>

              {/* Type & Audience Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-gray-600 text-sm font-medium mb-2 block">Type</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-[16px] text-gray-900 focus:outline-none focus:border-[#008CE5]/50 transition-colors"
                  >
                    {NOTIFICATION_TYPES.map((nt) => (
                      <option key={nt.value} value={nt.value} className="bg-white">
                        {nt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-gray-600 text-sm font-medium mb-2 block">Audience</label>
                  <select
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-[16px] text-gray-900 focus:outline-none focus:border-[#008CE5]/50 transition-colors"
                  >
                    {AUDIENCES.map((a) => (
                      <option key={a.value} value={a.value} className="bg-white">
                        {a.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Action URL */}
              <div>
                <label className="text-gray-600 text-sm font-medium mb-2 block">
                  Action URL <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={actionUrl}
                  onChange={(e) => setActionUrl(e.target.value)}
                  placeholder="/customer/wallet or deep link..."
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-[16px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#008CE5]/50 transition-colors"
                />
              </div>

              {/* Preview */}
              {title.trim() && (
                <div className="bg-gray-50 rounded-[20px] p-4">
                  <p className="text-gray-400 text-xs font-medium mb-3 uppercase tracking-wider">Preview</p>
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: getTypeConfig(type).gradient }}>
                      {(() => { const Icon = getTypeConfig(type).icon; return <Icon className="w-5 h-5 text-white" />; })()}
                    </div>
                    <div>
                      <h4 className="text-gray-900 font-bold text-sm">{title}</h4>
                      <p className="text-gray-500 text-sm mt-1">{message || 'Message body...'}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-[12px] bg-red-500/10 border border-red-500/20">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              {/* Success */}
              {sent && (
                <div className="flex items-center gap-2 p-3 rounded-[12px] bg-green-500/10 border border-green-500/20">
                  <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                  <p className="text-green-400 text-sm">Sent to {sentCount} user{sentCount !== 1 ? 's' : ''}!</p>
                </div>
              )}

              {/* Send Button */}
              <motion.button
                whileHover={{ scale: canSend ? 1.02 : 1 }}
                whileTap={{ scale: canSend ? 0.98 : 1 }}
                onClick={() => setConfirmOpen(true)}
                disabled={!canSend || sending}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-[20px] font-bold text-lg transition-all"
                style={{
                  background: canSend
                    ? 'linear-gradient(to right, #008CE5, #0070B8)'
                    : '#E5E7EB',
                  color: canSend ? '#FFFFFF' : '#9CA3AF',
                  opacity: sending ? 0.7 : 1,
                }}
              >
                {sending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
                {sending ? 'Sending...' : 'Send Notification'}
              </motion.button>
            </div>
          </motion.div>

          {/* Broadcast History */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6"
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)' }}>
                <Clock className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-gray-900 font-bold text-xl">Broadcast History</h2>
                <p className="text-gray-400 text-sm">Previously sent notifications</p>
              </div>
            </div>

            {historyLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-[#008CE5]" />
              </div>
            ) : history.length > 0 ? (
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                {history.map((entry, index) => {
                  const typeConfig = getTypeConfig(entry.type);
                  const Icon = typeConfig.icon;
                  return (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className="bg-gray-50 rounded-[16px] p-4"
                    >
                      <div className="flex gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: typeConfig.gradient }}>
                          <Icon className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="text-gray-900 font-semibold text-sm truncate">{entry.title}</h4>
                            <span className="text-gray-400 text-xs whitespace-nowrap">{timeAgo(entry.created_at)}</span>
                          </div>
                          <p className="text-gray-400 text-sm mt-1 line-clamp-2">{entry.message}</p>
                          <div className="flex items-center gap-3 mt-2">
                            <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                              <Users className="w-3 h-3" />
                              {getAudienceLabel(entry.audience)}
                            </span>
                            <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                              <Hash className="w-3 h-3" />
                              {entry.recipient_count} sent
                            </span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">No broadcasts sent yet</p>
              </div>
            )}
          </motion.div>
        </div>

        {/* Confirmation Dialog */}
        {confirmOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6 max-w-md w-full"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #FFA500, #FF8C00)' }}>
                  <Send className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-gray-900 font-bold text-lg">Confirm Send</h3>
                  <p className="text-gray-400 text-sm">This action cannot be undone</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-[16px] p-4 mb-4 space-y-2">
                <p className="text-gray-900 text-sm"><span className="text-gray-400">Title:</span> {title}</p>
                <p className="text-gray-900 text-sm"><span className="text-gray-400">Type:</span> {getTypeConfig(type).label}</p>
                <p className="text-gray-900 text-sm"><span className="text-gray-400">Audience:</span> {getAudienceLabel(audience)}</p>
              </div>

              <div className="flex gap-3">
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setConfirmOpen(false)}
                  className="flex-1 px-4 py-3 rounded-[16px] bg-gray-50 text-gray-600 font-semibold"
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSend}
                  className="flex-1 px-4 py-3 rounded-[16px] font-bold"
                  style={{
                    background: 'linear-gradient(to right, #008CE5, #0070B8)',
                    color: '#FFFFFF',
                  }}
                >
                  Send Now
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
