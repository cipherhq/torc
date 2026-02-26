import { useNavigate } from 'react-router';
import { ArrowLeft, Star } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useEffect, useMemo, useState } from 'react';

export function RatingsReviews() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { user } = useAuth() as any;
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadReviews() {
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('jobs')
          .select('id, rating, review, reviewed_at, updated_at, requester_name')
          .eq('provider_id', user.id)
          .not('rating', 'is', null)
          .order('reviewed_at', { ascending: false, nullsFirst: false })
          .order('updated_at', { ascending: false })
          .limit(100);
        if (error) throw error;
        setRows(data || []);
      } catch (error) {
        console.warn('Failed to load ratings:', error);
        setRows([]);
      } finally {
        setLoading(false);
      }
    }
    void loadReviews();
  }, [user?.id]);

  const averageRating = useMemo(() => {
    if (!rows.length) return 0;
    const total = rows.reduce((sum, r) => sum + Number(r.rating || 0), 0);
    return total / rows.length;
  }, [rows]);

  return (
    <div className="min-h-screen p-6" style={{ background: isDark ? '#0F1419' : '#FAF8F5' }}>
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/profile')}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E8E4DE' }}
          title="Back to profile"
        >
          <ArrowLeft className="w-5 h-5" style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }} />
        </button>
        <h1 className="text-2xl font-bold" style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }}>Ratings & Reviews</h1>
      </div>

      <div className="rounded-2xl p-6" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#E8E4DE'}` }}>
        <div className="flex items-center gap-3 mb-2">
          <Star className="w-5 h-5" style={{ color: '#008CE5' }} />
          <p className="font-semibold" style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }}>
            {rows.length ? `${averageRating.toFixed(2)} average from ${rows.length} review(s)` : 'No ratings yet'}
          </p>
        </div>
        <p className="mb-4" style={{ color: isDark ? 'rgba(255,255,255,0.6)' : '#6B7280' }}>
          Ratings update automatically from completed customer reviews.
        </p>

        {loading ? (
          <p style={{ color: isDark ? 'rgba(255,255,255,0.6)' : '#6B7280' }}>Loading reviews...</p>
        ) : rows.length === 0 ? (
          <p style={{ color: isDark ? 'rgba(255,255,255,0.6)' : '#6B7280' }}>No customer ratings yet.</p>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div key={row.id} className="rounded-xl p-3" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FDFBF8', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#E8E4DE'}` }}>
                <div className="flex items-center justify-between mb-1">
                  <p className="font-medium" style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }}>{row.requester_name || 'Customer'}</p>
                  <p className="text-sm" style={{ color: '#008CE5' }}>{Number(row.rating || 0).toFixed(1)} / 5</p>
                </div>
                <p className="text-sm" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#4B5563' }}>{row.review || 'No written review provided.'}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
