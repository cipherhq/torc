import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { AdminLayout } from '../../components/AdminLayout';
import { supabase } from '../../lib/supabase';
import { DollarSign, TrendingUp, TrendingDown, Wallet, Download, RefreshCw } from 'lucide-react';
import { loadPlatformSettings } from '../../lib/platformSettings';

interface JobRevenue {
  total_amount: number | null;
  completed_at: string | null;
  created_at: string;
  status: string;
}

interface RefundRevenue {
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

const money = (value: number) => `$${value.toFixed(2)}`;

export function AdminFinance() {
  const [jobs, setJobs] = useState([] as JobRevenue[]);
  const [refunds, setRefunds] = useState([] as RefundRevenue[]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null as string | null);
  const [platformFeePercent, setPlatformFeePercent] = useState(15);

  useEffect(() => {
    loadFinance();
  }, []);

  async function loadFinance() {
    try {
      setLoading(true);
      setLoadError(null);
      const [{ data: jobsData, error: jobsError }, { data: refundsData, error: refundsError }, settings] = await Promise.all([
        supabase.from('jobs').select('total_amount, completed_at, created_at, status').eq('status', 'completed'),
        supabase.from('refunds').select('amount, status, created_at'),
        loadPlatformSettings(),
      ]);
      if (jobsError) throw jobsError;
      if (refundsError && !String(refundsError.message || '').toLowerCase().includes('does not exist')) {
        throw refundsError;
      }
      setJobs((jobsData || []) as JobRevenue[]);
      setRefunds((refundsData || []) as RefundRevenue[]);
      setPlatformFeePercent(settings.platformFee);
    } catch (error: any) {
      console.warn('Failed to load finance page:', error);
      setLoadError(error?.message || 'Failed to load finance data.');
      setJobs([]);
      setRefunds([]);
    } finally {
      setLoading(false);
    }
  }

  const pnl = useMemo(() => {
    const grossSales = jobs.reduce((sum, job) => sum + Number(job.total_amount || 0), 0);
    const platformFeeRate = platformFeePercent / 100;
    const providerPayoutEstimate = grossSales * (1 - platformFeeRate);
    const grossPlatformRevenue = grossSales * platformFeeRate;
    const approvedRefunds = refunds.filter((r) => r.status === 'approved').reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const pendingRefunds = refunds.filter((r) => r.status === 'pending').reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const netRevenue = grossPlatformRevenue - approvedRefunds;
    return {
      grossSales,
      providerPayoutEstimate,
      grossPlatformRevenue,
      approvedRefunds,
      pendingRefunds,
      netRevenue,
      marginPct: grossSales > 0 ? (netRevenue / grossSales) * 100 : 0,
    };
  }, [jobs, refunds, platformFeePercent]);

  const monthly = useMemo(() => {
    const byMonth = new Map<string, { sales: number; refunds: number }>();
    jobs.forEach((job) => {
      const d = new Date(job.completed_at || job.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const current = byMonth.get(key) || { sales: 0, refunds: 0 };
      current.sales += Number(job.total_amount || 0);
      byMonth.set(key, current);
    });
    refunds.forEach((refund) => {
      if (refund.status !== 'approved') return;
      const d = new Date(refund.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const current = byMonth.get(key) || { sales: 0, refunds: 0 };
      current.refunds += Number(refund.amount || 0);
      byMonth.set(key, current);
    });
    return Array.from(byMonth.entries())
      .map(([month, v]) => ({
        month,
        sales: v.sales,
        platform: v.sales * (platformFeePercent / 100),
        refunds: v.refunds,
        net: v.sales * (platformFeePercent / 100) - v.refunds,
      }))
      .sort((a, b) => (a.month < b.month ? -1 : 1))
      .slice(-12)
      .reverse();
  }, [jobs, refunds, platformFeePercent]);

  function exportFinanceCsv() {
    if (monthly.length === 0) return;
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['month', 'sales', 'platform_revenue', 'approved_refunds', 'net_platform_revenue'],
      ...monthly.map((row) => [
        row.month,
        row.sales.toFixed(2),
        row.platform.toFixed(2),
        row.refunds.toFixed(2),
        row.net.toFixed(2),
      ]),
    ];
    const csv = rows.map((r) => r.map(escape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `finance-pnl-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="mb-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">Finance (P&amp;L)</h1>
              <p className="text-white/60">Revenue, estimated costs, refunds, and net platform performance</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void loadFinance()}
                className="rounded-xl bg-white/10 hover:bg-white/20 text-white px-4 py-2 text-sm flex items-center gap-2"
                title="Refresh finance data"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
              <button
                onClick={exportFinanceCsv}
                disabled={monthly.length === 0}
                className="rounded-xl bg-[#2EFFAF]/20 border border-[#2EFFAF]/30 text-[#9FFFD8] px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-60"
                title="Export monthly P&L as CSV"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="glass-light rounded-[24px] p-8 text-white/70">Loading finance data...</div>
        ) : loadError ? (
          <div className="glass-light rounded-[24px] p-8 text-red-300">{loadError}</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              <motion.div className="glass-light rounded-[24px] p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <DollarSign className="w-8 h-8 text-[#2EFFAF] mb-2" />
                <p className="text-white/60 text-sm">Gross Sales</p>
                <p className="text-white text-3xl font-bold">{money(pnl.grossSales)}</p>
              </motion.div>
              <motion.div className="glass-light rounded-[24px] p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Wallet className="w-8 h-8 text-[#007AFF] mb-2" />
                <p className="text-white/60 text-sm">Estimated Provider Payouts</p>
                <p className="text-white text-3xl font-bold">{money(pnl.providerPayoutEstimate)}</p>
              </motion.div>
              <motion.div className="glass-light rounded-[24px] p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <TrendingUp className="w-8 h-8 text-[#2EFFAF] mb-2" />
                <p className="text-white/60 text-sm">Gross Platform Revenue ({platformFeePercent.toFixed(1)}%)</p>
                <p className="text-white text-3xl font-bold">{money(pnl.grossPlatformRevenue)}</p>
              </motion.div>
              <motion.div className="glass-light rounded-[24px] p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <TrendingDown className="w-8 h-8 text-red-400 mb-2" />
                <p className="text-white/60 text-sm">Approved Refunds</p>
                <p className="text-white text-3xl font-bold">{money(pnl.approvedRefunds)}</p>
              </motion.div>
              <motion.div className="glass-light rounded-[24px] p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <TrendingDown className="w-8 h-8 text-yellow-400 mb-2" />
                <p className="text-white/60 text-sm">Pending Refund Exposure</p>
                <p className="text-white text-3xl font-bold">{money(pnl.pendingRefunds)}</p>
              </motion.div>
              <motion.div className="glass-light rounded-[24px] p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <DollarSign className="w-8 h-8 text-[#2EFFAF] mb-2" />
                <p className="text-white/60 text-sm">Net Platform Revenue</p>
                <p className="text-white text-3xl font-bold">{money(pnl.netRevenue)}</p>
                <p className="text-white/60 text-sm mt-1">Margin: {pnl.marginPct.toFixed(2)}%</p>
              </motion.div>
            </div>

            <div className="glass-light rounded-[24px] p-6">
              <h2 className="text-white font-bold text-xl mb-4">Monthly P&amp;L Trend</h2>
              {monthly.length === 0 ? (
                <p className="text-white/60">No monthly data available yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10 text-white/60 text-sm">
                        <th className="text-left py-3">Month</th>
                        <th className="text-left py-3">Sales</th>
                        <th className="text-left py-3">Platform ({platformFeePercent.toFixed(1)}%)</th>
                        <th className="text-left py-3">Refunds</th>
                        <th className="text-left py-3">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthly.map((row) => (
                        <tr key={row.month} className="border-b border-white/5 text-white">
                          <td className="py-3">{row.month}</td>
                          <td className="py-3">{money(row.sales)}</td>
                          <td className="py-3">{money(row.platform)}</td>
                          <td className="py-3">{money(row.refunds)}</td>
                          <td className="py-3">{money(row.net)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
