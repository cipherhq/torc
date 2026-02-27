import { useNavigate } from 'react-router';
import { ArrowLeft, FileText, Download, Calendar, DollarSign, Info, TrendingUp } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { loadPlatformSettings } from '../../lib/platformSettings';
import { useEffect, useMemo, useState } from 'react';

interface YearlySummary {
  year: number;
  grossEarnings: number;
  platformFees: number;
  tips: number;
  netEarnings: number;
  jobCount: number;
  isComplete: boolean; // true if year has ended (Dec 31 passed)
}

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function deriveBasePrice(job: { base_price?: number | null; total_amount?: number | null; tip?: number | null }): number {
  const base = Number(job.base_price) || 0;
  if (base > 0) return base;
  return Math.max((Number(job.total_amount) || 0) - (Number(job.tip) || 0), 0);
}

function generateTaxCsv(summary: YearlySummary, providerName: string, providerEmail: string) {
  const rows = [
    ['TORC Provider Tax Summary'],
    [`Tax Year: ${summary.year}`],
    [`Generated: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`],
    [`Provider: ${providerName}`],
    [`Email: ${providerEmail}`],
    [''],
    ['Category', 'Amount'],
    ['Gross Earnings (1099 Income)', `$${fmt(summary.grossEarnings)}`],
    ['Platform Fees (Deductible Expense)', `$${fmt(summary.platformFees)}`],
    ['Tips Received', `$${fmt(summary.tips)}`],
    ['Net Earnings', `$${fmt(summary.netEarnings)}`],
    [''],
    ['Total Jobs Completed', String(summary.jobCount)],
    ['Average Per Job', `$${summary.jobCount > 0 ? fmt(summary.netEarnings / summary.jobCount) : '0.00'}`],
    [''],
    ['Note: This summary is for informational purposes only.'],
    ['Consult a qualified tax professional for official tax preparation.'],
    ['If your annual gross earnings exceed $600, you may receive a 1099-NEC form.'],
  ];

  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `torc-tax-summary-${summary.year}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function TaxDocuments() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { user, profile } = useAuth() as any;
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [platformFee, setPlatformFee] = useState(15);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    loadData();
  }, [user?.id]);

  async function loadData() {
    if (!user) return;
    try {
      setLoading(true);
      const [jobsRes, settings] = await Promise.all([
        supabase
          .from('jobs')
          .select('id, base_price, tip, total_amount, status, completed_at, created_at')
          .eq('provider_id', user.id)
          .eq('status', 'completed')
          .order('completed_at', { ascending: false }),
        loadPlatformSettings(),
      ]);
      if (jobsRes.data) setJobs(jobsRes.data);
      setPlatformFee(settings.platformFee);
    } catch (error) {
      console.warn('Failed to load tax data:', error);
    } finally {
      setLoading(false);
    }
  }

  const yearlySummaries = useMemo(() => {
    if (jobs.length === 0) return [];

    const byYear: Record<number, any[]> = {};
    jobs.forEach((j) => {
      const date = new Date(j.completed_at || j.created_at);
      const year = date.getFullYear();
      if (!byYear[year]) byYear[year] = [];
      byYear[year].push(j);
    });

    const currentYear = new Date().getFullYear();
    const summaries: YearlySummary[] = Object.entries(byYear)
      .map(([yearStr, yearJobs]) => {
        const year = Number(yearStr);
        const grossBase = yearJobs.reduce((s, j) => s + deriveBasePrice(j), 0);
        const tips = yearJobs.reduce((s, j) => s + (Number(j.tip) || 0), 0);
        const fees = grossBase * (platformFee / 100);
        const net = grossBase - fees + tips;
        return {
          year,
          grossEarnings: grossBase + tips,
          platformFees: fees,
          tips,
          netEarnings: net,
          jobCount: yearJobs.length,
          isComplete: year < currentYear,
        };
      })
      .sort((a, b) => b.year - a.year);

    return summaries;
  }, [jobs, platformFee]);

  const currentYearSummary = yearlySummaries.find((s) => s.year === new Date().getFullYear());

  const textColor = isDark ? '#FFFFFF' : '#14263D';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2';

  const providerName = profile
    ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Provider'
    : 'Provider';
  const providerEmail = profile?.email || user?.email || '';

  return (
    <div className="min-h-screen pb-28" style={{ background: isDark ? 'linear-gradient(180deg, #0A1626 0%, #081427 100%)' : 'linear-gradient(180deg, #F8FBFF 0%, #EAF2FF 100%)' }}>
      <div className="p-6 flex items-center gap-4" style={{ paddingTop: 'var(--safe-top)' }}>
        <button
          onClick={() => navigate('/profile')}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}
          title="Back to profile"
        >
          <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
        </button>
        <h1 className="text-2xl font-bold" style={{ color: textColor }}>Tax Documents</h1>
      </div>

      <div className="px-6 space-y-5">
        {loading ? (
          <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
            <div className="w-8 h-8 border-2 border-[#008CE5] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p style={{ color: subColor }}>Loading tax information...</p>
          </div>
        ) : (
          <>
            {/* Current year summary card */}
            {currentYearSummary && (
              <div className="rounded-3xl p-6 overflow-hidden relative"
                style={{ background: 'linear-gradient(135deg, #008CE5 0%, #0070B8 50%, #005A94 100%)', boxShadow: '0 8px 32px rgba(0,140,229,0.3)' }}>
                <div className="absolute top-0 right-0 w-40 h-40 rounded-full" style={{ background: 'rgba(255,255,255,0.08)', filter: 'blur(40px)' }} />
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="w-5 h-5" style={{ color: 'rgba(255,255,255,0.78)' }} />
                  <p className="text-sm" style={{ color: 'rgba(255,255,255,0.78)' }}>{new Date().getFullYear()} Year-to-Date</p>
                </div>
                <h2 className="font-bold text-3xl mb-4" style={{ color: '#FFFFFF' }}>${fmt(currentYearSummary.grossEarnings)}</h2>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl py-2 px-3 text-center" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.72)' }}>Net Earnings</p>
                    <p className="font-bold" style={{ color: '#FFFFFF' }}>${fmt(currentYearSummary.netEarnings)}</p>
                  </div>
                  <div className="rounded-xl py-2 px-3 text-center" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.72)' }}>Jobs Completed</p>
                    <p className="font-bold" style={{ color: '#FFFFFF' }}>{currentYearSummary.jobCount}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Yearly tax summaries */}
            <div>
              <h2 className="font-semibold mb-3" style={{ color: textColor }}>Annual Tax Summaries</h2>
              {yearlySummaries.length === 0 ? (
                <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
                  <FileText className="w-12 h-12 mx-auto mb-2" style={{ color: isDark ? 'rgba(255,255,255,0.15)' : '#D1D5DB' }} />
                  <p style={{ color: subColor }}>No earnings recorded yet.</p>
                  <p className="text-xs mt-1" style={{ color: subColor }}>Complete jobs to see your tax summary here.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {yearlySummaries.map((summary) => (
                    <div key={summary.year} className="rounded-2xl p-5" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                            style={{ backgroundColor: summary.isComplete ? 'rgba(16,185,129,0.12)' : 'rgba(0,140,229,0.12)' }}>
                            <FileText className="w-5 h-5" style={{ color: summary.isComplete ? '#10B981' : '#008CE5' }} />
                          </div>
                          <div>
                            <p className="font-bold" style={{ color: textColor }}>{summary.year} Tax Summary</p>
                            <p className="text-xs" style={{ color: subColor }}>
                              {summary.isComplete ? 'Year complete — ready for download' : 'In progress — updates on Dec 31'}
                            </p>
                          </div>
                        </div>
                        {summary.isComplete && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                            style={{ backgroundColor: 'rgba(16,185,129,0.12)', color: '#10B981' }}>
                            Final
                          </span>
                        )}
                      </div>

                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <DollarSign className="w-4 h-4" style={{ color: '#008CE5' }} />
                            <span className="text-sm" style={{ color: subColor }}>Gross Earnings (1099)</span>
                          </div>
                          <span className="font-semibold text-sm" style={{ color: textColor }}>${fmt(summary.grossEarnings)}</span>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="w-4 h-4" style={{ color: '#10B981' }} />
                            <span className="text-sm" style={{ color: subColor }}>Tips</span>
                          </div>
                          <span className="font-semibold text-sm" style={{ color: '#10B981' }}>${fmt(summary.tips)}</span>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#EF4444', opacity: 0.5 }} />
                            <span className="text-sm" style={{ color: subColor }}>Platform Fees ({platformFee}%)</span>
                          </div>
                          <span className="font-semibold text-sm text-red-500">-${fmt(summary.platformFees)}</span>
                        </div>

                        <div className="border-t pt-2.5" style={{ borderColor: cardBorder }}>
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sm" style={{ color: textColor }}>Net Earnings</span>
                            <span className="font-bold" style={{ color: '#008CE5' }}>${fmt(summary.netEarnings)}</span>
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs" style={{ color: subColor }}>Jobs completed</span>
                            <span className="text-xs font-medium" style={{ color: textColor }}>{summary.jobCount}</span>
                          </div>
                        </div>
                      </div>

                      {/* Download button */}
                      <button
                        onClick={() => generateTaxCsv(summary, providerName, providerEmail)}
                        className="w-full mt-4 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
                        style={{ background: 'linear-gradient(135deg, #008CE5, #0070B8)', boxShadow: '0 4px 12px rgba(0,140,229,0.25)', color: '#FFFFFF' }}
                      >
                        <Download className="w-4 h-4" />
                        Download {summary.year} Tax Summary
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Info section */}
            <div className="rounded-2xl p-4" style={{ backgroundColor: isDark ? 'rgba(0,140,229,0.08)' : 'rgba(0,140,229,0.05)', border: `1px solid ${isDark ? 'rgba(0,140,229,0.2)' : 'rgba(0,140,229,0.12)'}` }}>
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: '#008CE5' }} />
                <div>
                  <h3 className="font-semibold text-sm mb-1" style={{ color: textColor }}>Tax Information</h3>
                  <ul className="text-xs space-y-1.5" style={{ color: subColor }}>
                    <li>Tax summaries are finalized on December 31st of each year.</li>
                    <li>If your annual gross earnings exceed $600, you may receive a 1099-NEC form from Torc.</li>
                    <li>Platform fees are typically deductible as business expenses.</li>
                    <li>Download your summary and share it with your tax professional.</li>
                  </ul>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
