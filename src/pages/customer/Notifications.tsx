import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Bell, Check, Trash2, Settings, MapPin, DollarSign, Star, Gift, AlertCircle } from 'lucide-react';
import { useState } from 'react';

interface Notification {
  id: string;
  type: 'service' | 'payment' | 'promo' | 'rating' | 'alert';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  actionUrl?: string;
}

export function Notifications() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: '1',
      type: 'service',
      title: 'Service Completed',
      message: 'Your jump start service with Marcus Rodriguez has been completed. Please rate your experience.',
      timestamp: '10 min ago',
      read: false,
      actionUrl: '/service-history',
    },
    {
      id: '2',
      type: 'payment',
      title: 'Payment Processed',
      message: '$55.00 charged to Visa •••• 4242 for your recent towing service.',
      timestamp: '2 hours ago',
      read: false,
    },
    {
      id: '3',
      type: 'promo',
      title: '🎉 Special Offer!',
      message: 'Get 20% off your next service! Use code TORC20 at checkout. Valid until Feb 28.',
      timestamp: '1 day ago',
      read: true,
    },
    {
      id: '4',
      type: 'rating',
      title: 'How was your experience?',
      message: 'We\'d love to hear about your tire change service with Sarah Williams.',
      timestamp: '2 days ago',
      read: true,
      actionUrl: '/service-history',
    },
    {
      id: '5',
      type: 'alert',
      title: 'Service Area Update',
      message: 'TORC is now available in Oakland! Invite your friends and earn $10 credit.',
      timestamp: '3 days ago',
      read: true,
    },
  ]);

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

  const markAsRead = (id: string) => {
    setNotifications(notifications.map(n => 
      n.id === id ? { ...n, read: true } : n
    ));
  };

  const markAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
  };

  const deleteNotification = (id: string) => {
    setNotifications(notifications.filter(n => n.id !== id));
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
