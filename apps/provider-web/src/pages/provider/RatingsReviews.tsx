import { useNavigate } from 'react-router';
import { ArrowLeft, Star } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export function RatingsReviews() {
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
        <h1 className="text-2xl font-bold" style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }}>Ratings & Reviews</h1>
      </div>

      <div className="rounded-2xl p-6" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB'}` }}>
        <div className="flex items-center gap-3 mb-2">
          <Star className="w-5 h-5" style={{ color: '#2EFFAF' }} />
          <p className="font-semibold" style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }}>Provider ratings are enabled</p>
        </div>
        <p style={{ color: isDark ? 'rgba(255,255,255,0.6)' : '#6B7280' }}>
          Ratings are updated from completed customer reviews and reflected on your profile.
        </p>
      </div>
    </div>
  );
}
