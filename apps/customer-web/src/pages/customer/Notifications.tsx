import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Bell, Check, Trash2, Settings, MapPin, DollarSign, Star, Gift, AlertCircle, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { CustomerBottomNav } from '../../components/CustomerBottomNav';

interface Notification {
  id: string;
  type: 'service' | 'payment' | 'promo' | 'rating' | 'alert' | 'info';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  actionUrl?: string;
}

function timeAgo(date: string): string {
  const now = new Date();
  const d = new Date(date);
  const seconds = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
  return d.toLocaleDateString();
}

export function Notifications() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const textColor = isDark ? '#FFFFFF' : '#14263D';
  const subColor = isDark ? 'rgba(255,255,255,0.6)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2';
  const { user } = useAuth();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(true);

  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    async function load() {
      try {
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', user!.id)
          .order('created_at', { ascending: false })
          .limit(50);

        if (!error && data) {
          setNotifications(data.map((n: any) => ({
            id: n.id,
            type: n.type || 'info',
            title: n.title,
            message: n.message,
            timestamp: timeAgo(n.created_at),
            read: n.read || false,
            actionUrl: n.action_url,
          })));
        }
      } catch (e) {
        console.warn('Failed to load notifications:', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user]);

  const getIcon = (type: string) => {
    switch (type) {
      case 'service': return MapPin;
      case 'payment': return DollarSign;
      case 'promo': return Gift;
      case 'rating': return Star;
      case 'alert': return AlertCircle;
      default: return Bell;
    }
  };

  const getIconColor = (type: string) => {
    switch (type) {
      case 'service': return 'from-[#008CE5] to-[#0070B8]';
      case 'payment': return 'from-green-400 to-emerald-500';
      case 'promo': return 'from-purple-400 to-pink-500';
      case 'rating': return 'from-yellow-400 to-orange-500';
      case 'alert': return 'from-red-400 to-orange-500';
      default: return 'from-[#008CE5] to-[#0070B8]';
    }
  };

  const markAsRead = async (id: string) => {
    setNotifications(notifications.map(n => 
      n.id === id ? { ...n, read: true } : n
    ));
    await supabase.from('notifications').update({ read: true }).eq('id', id);
  };

  const markAllAsRead = async () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
    if (user) {
      await supabase.from('notifications').update({ read: true }).eq('user_id', user.id);
    }
  };

  const deleteNotification = async (id: string) => {
    setNotifications(notifications.filter(n => n.id !== id));
    await supabase.from('notifications').delete().eq('id', id);
  };

  const filteredNotifications = notifications.filter(n =>
    filter === 'all' ? true : !n.read
  );

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="min-h-screen pb-24"
      style={{ background: isDark ? 'linear-gradient(180deg, #0A1626 0%, #081427 100%)' : 'linear-gradient(180deg, #F8FBFF 0%, #EAF2FF 100%)' }}>
      {/* Header */}
      <div className="sticky top-0 z-10" style={{ backgroundColor: isDark ? 'rgba(10,22,38,0.85)' : 'rgba(248,251,255,0.85)', backdropFilter: 'blur(12px)', borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2'}` }}>
        <div className="max-w-2xl mx-auto p-6" style={{ paddingTop: 'var(--safe-top)' }}>
          <div className="flex items-center gap-4 mb-2">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => navigate('/profile')}
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}
            >
              <ArrowLeft className="w-5 h-5" style={{ color: isDark ? '#FFFFFF' : '#14263D' }} />
            </motion.button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold" style={{ color: isDark ? '#FFFFFF' : '#14263D' }}>Notifications</h1>
              <p className="text-sm" style={{ color: isDark ? 'rgba(255,255,255,0.6)' : '#6B7280' }}>
                {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
              </p>
            </div>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => navigate('/customer/notification-settings')}
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}
            >
              <Settings className="w-5 h-5" style={{ color: isDark ? '#FFFFFF' : '#14263D' }} />
            </motion.button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Quick Actions */}
        <div className="flex gap-2">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setFilter('all')}
            className={`flex-1 px-4 py-3 rounded-[16px] font-semibold text-sm transition-all ${
              filter === 'all'
                ? 'bg-gradient-to-r from-[#008CE5] to-[#0070B8] text-white'
                : ''
            }`}
            style={filter !== 'all' ? { backgroundColor: cardBg, border: `1px solid ${cardBorder}`, color: subColor } : undefined}
          >
            All ({notifications.length})
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setFilter('unread')}
            className={`flex-1 px-4 py-3 rounded-[16px] font-semibold text-sm transition-all ${
              filter === 'unread'
                ? 'bg-gradient-to-r from-[#008CE5] to-[#0070B8] text-white'
                : ''
            }`}
            style={filter !== 'unread' ? { backgroundColor: cardBg, border: `1px solid ${cardBorder}`, color: subColor } : undefined}
          >
            Unread ({unreadCount})
          </motion.button>
          {unreadCount > 0 && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={markAllAsRead}
              className="px-4 py-3 rounded-[16px] font-semibold text-sm flex items-center gap-2"
              style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}`, color: subColor }}
            >
              <Check className="w-4 h-4" />
              Mark All
            </motion.button>
          )}
        </div>

        {/* Notifications List */}
        {filteredNotifications.length > 0 ? (
          <div className="space-y-3">
            {filteredNotifications.map((notification, index) => {
              const Icon = getIcon(notification.type);
              const iconColor = getIconColor(notification.type);

              return (
                <motion.div
                  key={notification.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="rounded-[24px] p-5 relative"
                  style={{ backgroundColor: cardBg, border: !notification.read ? '2px solid rgba(0,140,229,0.3)' : `1px solid ${cardBorder}` }}
                >
                  <div className="flex gap-4">
                    <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${iconColor} flex items-center justify-center flex-shrink-0`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-1">
                        <h3 className="font-bold text-base" style={{ color: textColor }}>{notification.title}</h3>
                        {!notification.read && (
                          <div className="w-2 h-2 rounded-full bg-[#008CE5] flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-sm mb-2 leading-relaxed" style={{ color: subColor }}>{notification.message}</p>
                      <p className="text-xs" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }}>{notification.timestamp}</p>

                      <div className="flex gap-2 mt-3">
                        {notification.actionUrl && (
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => navigate(notification.actionUrl!)}
                            className="px-4 py-2 rounded-[12px] bg-gradient-to-r from-[#008CE5] to-[#0070B8] text-white font-semibold text-xs"
                          >
                            View Details
                          </motion.button>
                        )}
                        {!notification.read && (
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => markAsRead(notification.id)}
                            className="px-4 py-2 rounded-[12px] font-semibold text-xs flex items-center gap-1"
                            style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', color: textColor }}
                          >
                            <Check className="w-3 h-3" />
                            Mark Read
                          </motion.button>
                        )}
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => deleteNotification(notification.id)}
                          className="px-4 py-2 rounded-[12px] bg-red-400/20 text-red-400 font-semibold text-xs flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </motion.button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <Bell className="w-16 h-16 mx-auto mb-4" style={{ color: isDark ? 'rgba(255,255,255,0.2)' : '#D3E0F2' }} />
            <p className="mb-2" style={{ color: subColor }}>No {filter} notifications</p>
            <p className="text-sm" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }}>You're all caught up!</p>
          </motion.div>
        )}
      </div>
      <CustomerBottomNav />
    </div>
  );
}
