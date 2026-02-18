import { useNavigate } from 'react-router';
import { ArrowLeft, Bell } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export function NotificationsPage() {
  const navigate = useNavigate();
  const { isDark } = useTheme();

  return (
    <div className="min-h-screen p-6" style={{ background: isDark ? '#0F1419' : '#F5F7FA' }}>
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/profile')}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB' }}
          title="Back to profile"
        >
          <ArrowLeft className="w-5 h-5" style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }} />
        </button>
        <h1 className="text-2xl font-bold" style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }}>Notifications</h1>
      </div>

      <div className="rounded-2xl p-6" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB'}` }}>
        <div className="flex items-center gap-3 mb-2">
          <Bell className="w-5 h-5" style={{ color: '#007AFF' }} />
          <p className="font-semibold" style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }}>Notification settings</p>
        </div>
        <p style={{ color: isDark ? 'rgba(255,255,255,0.6)' : '#6B7280' }}>
          Configure push alerts and in-app notices for jobs, payouts, and account updates.
        </p>
      </div>
    </div>
  );
}
