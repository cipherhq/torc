import { useNavigate } from 'react-router';
import { ArrowLeft, Star, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useEffect, useMemo, useState } from 'react';

const PAGE_SIZE = 10;

export function RatingsReviews() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { user } = useAuth() as any;
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

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
          .select('id, rating, review, reviewed_at, updated_at, requester_name, customer_id')
          .eq('provider_id', user.id)
          .not('rating', 'is', null)
          .order('reviewed_at', { ascending: false, nullsFirst: false })
          .order('updated_at', { ascending: false })
          .limit(500);
        if (error) throw error;

        // Batch-fetch customer names
        const rows = data || [];
        const custIds = [...new Set(rows.map((r: any) => r.customer_id).filter(Boolean))] as string[];
        if (custIds.length > 0) {
          const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name').in('id', custIds);
          const map = new Map((profiles || []).map((p: any) => [p.id, p]));
          rows.forEach((r: any) => { r.customer = r.customer_id ? map.get(r.customer_id) || null : null; });
        }
        setRows(rows);
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

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pagedRows = useMemo(() => {
    const start = page * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, page]);

  function getCustomerName(row: any): string {
    if (row.customer?.first_name) {
      const last = row.customer.last_name ? ` ${row.customer.last_name[0]}.` : '';
      return `${row.customer.first_name}${last}`;
    }
    return row.requester_name || 'Customer';
  }

  const textColor = isDark ? '#FFFFFF' : '#14263D';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2';

  return (
    <div className="min-h-screen" style={{ background: isDark ? 'linear-gradient(180deg, #0A1626 0%, #081427 100%)' : 'linear-gradient(180deg, #F8FBFF 0%, #EAF2FF 100%)' , paddingBottom: 'calc(96px + var(--safe-bottom, 0px))' }}>
      <div className="p-6 flex items-center gap-4" style={{ paddingTop: 'var(--safe-top)' }}>
        <button
          onClick={() => navigate('/profile')}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}
          title="Back to profile"
        >
          <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
        </button>
        <h1 className="text-2xl font-bold" style={{ color: textColor }}>Ratings & Reviews</h1>
      </div>

      <div className="px-6">
        {/* Summary card */}
        <div className="rounded-2xl p-6 mb-5" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(0,140,229,0.12)' }}>
              <Star className="w-6 h-6" style={{ color: '#008CE5' }} />
            </div>
            <div>
              <p className="font-bold text-2xl" style={{ color: textColor }}>
                {rows.length ? averageRating.toFixed(1) : '-'}
              </p>
              <p className="text-sm" style={{ color: subColor }}>
                {rows.length ? `${rows.length} review${rows.length !== 1 ? 's' : ''}` : 'No ratings yet'}
              </p>
            </div>
          </div>

          {/* Star breakdown */}
          {rows.length > 0 && (
            <div className="space-y-1.5 mt-4">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = rows.filter((r) => Math.round(Number(r.rating)) === star).length;
                const pct = rows.length > 0 ? (count / rows.length) * 100 : 0;
                return (
                  <div key={star} className="flex items-center gap-2">
                    <span className="text-xs w-6 text-right" style={{ color: subColor }}>{star}</span>
                    <Star className="w-3.5 h-3.5" style={{ color: '#F59E0B', fill: '#F59E0B' }} />
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F3F4F6' }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: '#008CE5' }} />
                    </div>
                    <span className="text-xs w-8" style={{ color: subColor }}>{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Reviews list */}
        {loading ? (
          <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
            <p style={{ color: subColor }}>Loading reviews...</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
            <Star className="w-12 h-12 mx-auto mb-2" style={{ color: isDark ? 'rgba(255,255,255,0.1)' : '#D1D5DB' }} />
            <p style={{ color: subColor }}>No customer ratings yet.</p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {pagedRows.map((row) => (
                <div key={row.id} className="rounded-2xl p-4" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#008CE5] to-[#0070B8] flex items-center justify-center text-white font-bold text-sm">
                        {getCustomerName(row)[0]?.toUpperCase() || 'C'}
                      </div>
                      <div>
                        <p className="font-semibold" style={{ color: textColor }}>{getCustomerName(row)}</p>
                        <p className="text-xs" style={{ color: subColor }}>
                          {row.reviewed_at
                            ? new Date(row.reviewed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                            : row.updated_at
                              ? new Date(row.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                              : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className="w-4 h-4"
                          style={{
                            color: i < Math.round(Number(row.rating)) ? '#F59E0B' : (isDark ? 'rgba(255,255,255,0.1)' : '#D1D5DB'),
                            fill: i < Math.round(Number(row.rating)) ? '#F59E0B' : 'none',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <p className="text-sm" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#4B5563' }}>
                    {row.review || 'No written review provided.'}
                  </p>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-5">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-30"
                  style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}
                >
                  <ChevronLeft className="w-5 h-5" style={{ color: textColor }} />
                </button>
                <p className="text-sm font-medium" style={{ color: subColor }}>
                  Page {page + 1} of {totalPages}
                </p>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-30"
                  style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}
                >
                  <ChevronRight className="w-5 h-5" style={{ color: textColor }} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
