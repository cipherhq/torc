import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Bell, Check, Trash2, Settings, MapPin, DollarSign, Star, Gift, AlertCircle, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

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
      case 'service': return 'from-[#2EFFAF] to-[#007AFF]';
      case 'payment': return 'from-green-400 to-emerald-500';
      case 'promo': return 'from-purple-400 to-pink-500';
      case 'rating': return 'from-yellow-400 to-orange-500';
      case 'alert': return 'from-red-400 to-orange-500';
      default: return 'from-[#2EFFAF] to-[#007AFF]';
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
    <div className="min-h-screen bg-gradient-to-br from-[#1E2433] via-[#252B3D] to-[#2F3548] pb-24">
      {/* Header */}
      <div className="glass-light border-b border-white/10 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto p-6">
          <div className="flex items-center gap-4 mb-2">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => navigate('/profile')}
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </motion.button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-white">Notifications</h1>
              <p className="text-white/70 text-sm">
                {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
              </p>
            </div>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => navigate('/notification-settings')}
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
            >
              <Settings className="w-5 h-5 text-white" />
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
                ? 'bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0F1419]'
                : 'glass text-white/70'
            }`}
          >
            All ({notifications.length})
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setFilter('unread')}
            className={`flex-1 px-4 py-3 rounded-[16px] font-semibold text-sm transition-all ${
              filter === 'unread'
                ? 'bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0F1419]'
                : 'glass text-white/70'
            }`}
          >
            Unread ({unreadCount})
          </motion.button>
          {unreadCount > 0 && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={markAllAsRead}
              className="px-4 py-3 rounded-[16px] glass text-white/70 font-semibold text-sm flex items-center gap-2"
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
                  className={`glass-light rounded-[24px] p-5 relative ${
                    !notification.read ? 'border-2 border-[#2EFFAF]/30' : ''
                  }`}
                >
                  <div className="flex gap-4">
                    <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${iconColor} flex items-center justify-center flex-shrink-0`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-1">
                        <h3 className="text-white font-bold text-base">{notification.title}</h3>
                        {!notification.read && (
                          <div className="w-2 h-2 rounded-full bg-[#2EFFAF] flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-white/70 text-sm mb-2 leading-relaxed">{notification.message}</p>
                      <p className="text-white/50 text-xs">{notification.timestamp}</p>

                      <div className="flex gap-2 mt-3">
                        {notification.actionUrl && (
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => navigate(notification.actionUrl!)}
                            className="px-4 py-2 rounded-[12px] bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0F1419] font-semibold text-xs"
                          >
                            View Details
                          </motion.button>
                        )}
                        {!notification.read && (
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => markAsRead(notification.id)}
                            className="px-4 py-2 rounded-[12px] bg-white/10 text-white font-semibold text-xs flex items-center gap-1"
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
            <Bell className="w-16 h-16 text-white/20 mx-auto mb-4" />
            <p className="text-white/60 mb-2">No {filter} notifications</p>
            <p className="text-white/40 text-sm">You're all caught up!</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
