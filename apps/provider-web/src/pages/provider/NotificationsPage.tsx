import { useNavigate } from 'react-router';
import { ArrowLeft, Bell, Check } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useEffect, useMemo, useState } from 'react';

export function NotificationsPage() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { user } = useAuth() as any;
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadNotifications() {
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('notifications')
          .select('id, title, message, type, read, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(100);
        if (error) throw error;
        setRows(data || []);
      } catch (error) {
        console.warn('Failed to load notifications:', error);
        setRows([]);
      } finally {
        setLoading(false);
      }
    }
    void loadNotifications();
  }, [user?.id]);

  const unread = useMemo(() => rows.filter((r) => !r.read).length, [rows]);

  async function markAllRead() {
    if (!user) return;
    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
    setRows((prev) => prev.map((r) => ({ ...r, read: true })));
  }

  return (
    <div className="min-h-screen p-6" style={{ background: isDark ? 'linear-gradient(180deg, #0A1626 0%, #081427 100%)' : 'linear-gradient(180deg, #F8FBFF 0%, #EAF2FF 100%)' }}>
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/profile')}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2' }}
          title="Back to profile"
        >
          <ArrowLeft className="w-5 h-5" style={{ color: isDark ? '#FFFFFF' : '#14263D' }} />
        </button>
        <h1 className="text-2xl font-bold" style={{ color: isDark ? '#FFFFFF' : '#14263D' }}>Notifications</h1>
      </div>

      <div className="rounded-2xl p-6" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2'}` }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
          <Bell className="w-5 h-5" style={{ color: '#0070B8' }} />
            <p className="font-semibold" style={{ color: isDark ? '#FFFFFF' : '#14263D' }}>
              {unread > 0 ? `${unread} unread notification(s)` : 'All caught up'}
            </p>
          </div>
          {unread > 0 && (
            <button onClick={markAllRead} className="text-sm font-semibold flex items-center gap-1" style={{ color: '#008CE5' }}>
              <Check className="w-4 h-4" />
              Mark all read
            </button>
          )}
        </div>

        {loading ? (
          <p style={{ color: isDark ? 'rgba(255,255,255,0.6)' : '#6B7280' }}>Loading notifications...</p>
        ) : rows.length === 0 ? (
          <p style={{ color: isDark ? 'rgba(255,255,255,0.6)' : '#6B7280' }}>No notifications yet.</p>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div key={row.id} className="rounded-xl p-3" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F5F9FF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2'}` }}>
                <div className="flex items-center justify-between gap-3 mb-1">
                  <p className="font-medium" style={{ color: isDark ? '#FFFFFF' : '#14263D' }}>{row.title}</p>
                  {!row.read && <span className="text-xs px-2 py-0.5 rounded-full bg-[#008CE5]/20 text-[#008CE5]">New</span>}
                </div>
                <p className="text-sm" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#4B5563' }}>{row.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
