import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { AdminLayout } from '../../components/AdminLayout';
import { supabase } from '../../lib/supabase';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Download,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { loadPlatformSettings } from '../../lib/platformSettings';

type JobPaymentStatus = 'unpaid' | 'requires_action' | 'paid' | 'failed' | 'refunded';
type RefundStatus = 'pending' | 'approved' | 'rejected';
type PayoutStatus = 'pending' | 'processing' | 'paid' | 'failed';

interface JobFinancialRow {
  id: string;
  base_price: number | null;
  total_amount: number | null;
  tip: number | null;
  completed_at: string | null;
  created_at: string;
  status: string;
  payment_status: JobPaymentStatus | null;
}

interface RefundRevenue {
  amount: number;
  status: RefundStatus;
  created_at: string;
}

interface ProviderPayoutRow {
  net_payout: number | null;
  total_earnings: number | null;
  total_tips: number | null;
  platform_fee: number | null;
  status: PayoutStatus;
  created_at: string;
  paid_at: string | null;
}

const money = (value: number) => `$${value.toFixed(2)}`;
const num = (value: unknown) => Number(value || 0);

function getBaseAmount(job: JobFinancialRow) {
  const base = num(job.base_price);
  if (base > 0) return base;
  return Math.max(num(job.total_amount) - num(job.tip), 0);
}

function getMonthKey(value: string | null | undefined) {
  const date = value ? new Date(value) : new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function isMissingRelationError(error: unknown) {
  const message = String((error as { message?: string })?.message || '').toLowerCase();
  return message.includes('does not exist');
}

export function AdminFinance() {
  const [jobs, setJobs] = useState([] as JobFinancialRow[]);
  const [refunds, setRefunds] = useState([] as RefundRevenue[]);
  const [payouts, setPayouts] = useState([] as ProviderPayoutRow[]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null as string | null);
  const [platformFeePercent, setPlatformFeePercent] = useState(15);

  useEffect(() => {
    void loadFinance();
  }, []);

  async function loadFinance() {
    try {
      setLoading(true);
      setLoadError(null);

      const [
        { data: jobsData, error: jobsError },
        { data: refundsData, error: refundsError },
        { data: payoutsData, error: payoutsError },
        settings,
      ] = await Promise.all([
        supabase
          .from('jobs')
          .select('id, base_price, total_amount, tip, completed_at, created_at, status, payment_status')
          .eq('status', 'completed'),
        supabase.from('refunds').select('amount, status, created_at'),
        supabase.from('provider_payouts').select('net_payout, total_earnings, total_tips, platform_fee, status, created_at, paid_at'),
        loadPlatformSettings(),
      ]);

      if (jobsError) throw jobsError;
      if (refundsError && !isMissingRelationError(refundsError)) throw refundsError;
      if (payoutsError && !isMissingRelationError(payoutsError)) throw payoutsError;

      setJobs((jobsData || []) as JobFinancialRow[]);
      setRefunds((refundsData || []) as RefundRevenue[]);
      setPayouts((payoutsData || []) as ProviderPayoutRow[]);
      setPlatformFeePercent(settings.platformFee);

      // Load cancellation operations and tips for financial visibility
      const [cancelOpsRes, tipsRes, earningsRes] = await Promise.all([
        supabase.from('job_cancellation_operations').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('job_tips').select('*').eq('stripe_status', 'succeeded').order('created_at', { ascending: false }).limit(50),
        supabase.from('provider_earnings').select('*').order('created_at', { ascending: false }).limit(100),
      ]);
      // Log financial summary for admin visibility
      const cancelOps = cancelOpsRes?.data || [];
      const tips = tipsRes?.data || [];
      const earnings = earningsRes?.data || [];
      console.log(`[Finance] Cancellation ops: ${cancelOps.length} (completed: ${cancelOps.filter((o: any) => o.status === 'completed').length}, failed: ${cancelOps.filter((o: any) => o.status === 'failed').length}, manual_review: ${cancelOps.filter((o: any) => o.status === 'manual_review').length})`);
      console.log(`[Finance] Tips: ${tips.length}, total: $${tips.reduce((s: number, t: any) => s + Number(t.amount || 0), 0).toFixed(2)}`);
      console.log(`[Finance] Earnings: service=${earnings.filter((e: any) => e.entry_type === 'service_earning').length}, tips=${earnings.filter((e: any) => e.entry_type === 'tip').length}, compensation=${earnings.filter((e: any) => e.entry_type === 'cancellation_compensation').length}`);
    } catch (error: any) {
      console.warn('Failed to load finance page:', error);
      setLoadError(error?.message || 'Failed to load finance data.');
      setJobs([]);
      setRefunds([]);
      setPayouts([]);
    } finally {
      setLoading(false);
    }
  }

  const metrics = useMemo(() => {
    const feeRate = platformFeePercent / 100;

    const paymentBuckets: Record<JobPaymentStatus, { jobs: number; amount: number }> = {
      unpaid: { jobs: 0, amount: 0 },
      requires_action: { jobs: 0, amount: 0 },
      paid: { jobs: 0, amount: 0 },
      failed: { jobs: 0, amount: 0 },
      refunded: { jobs: 0, amount: 0 },
    };

    const grossSales = jobs.reduce((sum, job) => sum + getBaseAmount(job), 0);
    const totalTips = jobs.reduce((sum, job) => sum + num(job.tip), 0);
    jobs.forEach((job) => {
      const rawStatus = job.payment_status || 'unpaid';
      const status = rawStatus in paymentBuckets ? (rawStatus as JobPaymentStatus) : 'unpaid';
      paymentBuckets[status].jobs += 1;
      paymentBuckets[status].amount += num(job.total_amount);
    });

    const expectedPlatformFees = grossSales * feeRate;
    const expectedProviderPayout = grossSales - expectedPlatformFees + totalTips;

    const approvedRefunds = refunds
      .filter((refund) => refund.status === 'approved')
      .reduce((sum, refund) => sum + num(refund.amount), 0);
    const pendingRefunds = refunds
      .filter((refund) => refund.status === 'pending')
      .reduce((sum, refund) => sum + num(refund.amount), 0);

    const payoutBuckets: Record<PayoutStatus, { count: number; amount: number }> = {
      pending: { count: 0, amount: 0 },
      processing: { count: 0, amount: 0 },
      paid: { count: 0, amount: 0 },
      failed: { count: 0, amount: 0 },
    };

    payouts.forEach((payout) => {
      if (!(payout.status in payoutBuckets)) return;
      const amount = num(payout.net_payout);
      payoutBuckets[payout.status].count += 1;
      payoutBuckets[payout.status].amount += amount;
    });

    const paidOut = payoutBuckets.paid.amount;
    const processingPayouts = payoutBuckets.processing.amount;
    const pendingPayouts = payoutBuckets.pending.amount;
    const payoutCoverageAmount = paidOut + processingPayouts;

    const netPlatformRevenue = expectedPlatformFees - approvedRefunds;
    const capturedCustomerPayments = paymentBuckets.paid.amount;
    const providerOutstandingEstimate = Math.max(expectedProviderPayout - payoutCoverageAmount, 0);
    const cashPositionEstimate = capturedCustomerPayments - approvedRefunds - paidOut;

    return {
      feeRate,
      grossSales,
      totalTips,
      expectedPlatformFees,
      expectedProviderPayout,
      approvedRefunds,
      pendingRefunds,
      netPlatformRevenue,
      paymentBuckets,
      payoutBuckets,
      paidOut,
      processingPayouts,
      pendingPayouts,
      capturedCustomerPayments,
      providerOutstandingEstimate,
      cashPositionEstimate,
      paymentSuccessRate:
        jobs.length > 0 ? (paymentBuckets.paid.jobs / jobs.length) * 100 : 0,
      payoutCoveragePct:
        expectedProviderPayout > 0
          ? (payoutCoverageAmount / expectedProviderPayout) * 100
          : 0,
      marginPct: grossSales > 0 ? (netPlatformRevenue / grossSales) * 100 : 0,
    };
  }, [jobs, refunds, payouts, platformFeePercent]);

  const monthly = useMemo(() => {
    const feeRate = platformFeePercent / 100;
    const byMonth = new Map<
      string,
      {
        month: string;
        sales: number;
        tips: number;
        captured: number;
        fees: number;
        refunds: number;
        payoutsPaid: number;
      }
    >();

    const ensure = (key: string) => {
      if (!byMonth.has(key)) {
        byMonth.set(key, {
          month: key,
          sales: 0,
          tips: 0,
          captured: 0,
          fees: 0,
          refunds: 0,
          payoutsPaid: 0,
        });
      }
      return byMonth.get(key)!;
    };

    jobs.forEach((job) => {
      const row = ensure(getMonthKey(job.completed_at || job.created_at));
      const amount = getBaseAmount(job);
      const tip = num(job.tip);
      row.sales += amount;
      row.tips += tip;
      row.fees += amount * feeRate;
      if (job.payment_status === 'paid') {
        row.captured += amount;
      }
    });

    refunds.forEach((refund) => {
      if (refund.status !== 'approved') return;
      const row = ensure(getMonthKey(refund.created_at));
      row.refunds += num(refund.amount);
    });

    payouts.forEach((payout) => {
      if (payout.status !== 'paid') return;
      const row = ensure(getMonthKey(payout.paid_at || payout.created_at));
      row.payoutsPaid += num(payout.net_payout);
    });

    return Array.from(byMonth.values())
      .sort((a, b) => (a.month < b.month ? -1 : 1))
      .slice(-12)
      .reverse()
      .map((row) => {
        const providerOwed = row.sales - row.fees + row.tips;
        const netPlatformRevenue = row.fees - row.refunds;
        const cashEstimate = row.captured - row.refunds - row.payoutsPaid;
        return {
          ...row,
          providerOwed,
          netPlatformRevenue,
          cashEstimate,
        };
      });
  }, [jobs, refunds, payouts, platformFeePercent]);

  function exportFinanceCsv() {
    if (monthly.length === 0) return;
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [
      [
        'month',
        'sales',
        'tips',
        'platform_fees',
        'approved_refunds',
        'provider_owed_estimate',
        'paid_payouts',
        'net_platform_revenue',
        'cash_position_estimate',
      ],
      ...monthly.map((row) => [
        row.month,
        row.sales.toFixed(2),
        row.tips.toFixed(2),
        row.fees.toFixed(2),
        row.refunds.toFixed(2),
        row.providerOwed.toFixed(2),
        row.payoutsPaid.toFixed(2),
        row.netPlatformRevenue.toFixed(2),
        row.cashEstimate.toFixed(2),
      ]),
    ];
    const csv = rows.map((r) => r.map(escape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `financial-hub-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const paymentStatusRows: Array<{ key: JobPaymentStatus; label: string; color: string }> = [
    { key: 'paid', label: 'Paid', color: 'text-green-600' },
    { key: 'requires_action', label: 'Requires Action', color: 'text-yellow-600' },
    { key: 'unpaid', label: 'Unpaid', color: 'text-gray-500' },
    { key: 'failed', label: 'Failed', color: 'text-red-500' },
    { key: 'refunded', label: 'Refunded', color: 'text-orange-500' },
  ];

  const payoutStatusRows: Array<{ key: PayoutStatus; label: string; color: string }> = [
    { key: 'paid', label: 'Paid Out', color: 'text-green-600' },
    { key: 'processing', label: 'Processing', color: 'text-[#0070B8]' },
    { key: 'pending', label: 'Pending Queue', color: 'text-yellow-600' },
    { key: 'failed', label: 'Failed', color: 'text-red-500' },
  ];

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="mb-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">Financial Hub</h1>
              <p className="text-gray-500">
                End-to-end payment flow: customer charge, TORC fee deduction, provider payout, and platform margin.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void loadFinance()}
                className="rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-900 px-4 py-2 text-sm flex items-center gap-2"
                title="Refresh financial data"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
              <button
                onClick={exportFinanceCsv}
                disabled={monthly.length === 0}
                className="rounded-xl px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-60"
                style={{ backgroundColor: 'rgba(0,140,229,0.2)', border: '1px solid rgba(0,140,229,0.3)', color: '#008CE5' }}
                title="Export monthly financial rollup as CSV"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-8 text-gray-600">Loading finance data...</div>
        ) : loadError ? (
          <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-8 text-red-500">{loadError}</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
              <motion.div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <DollarSign className="w-8 h-8 text-[#008CE5] mb-2" />
                <p className="text-gray-500 text-sm">Gross Completed Sales</p>
                <p className="text-gray-900 text-3xl font-bold">{money(metrics.grossSales)}</p>
                <p className="text-gray-500 text-xs mt-1">Service amount before fee deductions</p>
              </motion.div>
              <motion.div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <CreditCard className="w-8 h-8 text-[#0070B8] mb-2" />
                <p className="text-gray-500 text-sm">Captured Customer Payments</p>
                <p className="text-gray-900 text-3xl font-bold">{money(metrics.capturedCustomerPayments)}</p>
                <p className="text-gray-500 text-xs mt-1">Paid charge volume from completed jobs</p>
              </motion.div>
              <motion.div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <TrendingUp className="w-8 h-8 text-[#008CE5] mb-2" />
                <p className="text-gray-500 text-sm">Platform Fees ({platformFeePercent.toFixed(1)}%)</p>
                <p className="text-gray-900 text-3xl font-bold">{money(metrics.expectedPlatformFees)}</p>
                <p className="text-gray-500 text-xs mt-1">TORC fee retained from completed services</p>
              </motion.div>
              <motion.div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <DollarSign className="w-8 h-8 text-[#008CE5] mb-2" />
                <p className="text-gray-500 text-sm">Net Platform Revenue</p>
                <p className="text-gray-900 text-3xl font-bold">{money(metrics.netPlatformRevenue)}</p>
                <p className="text-gray-500 text-xs mt-1">
                  Fee revenue minus approved refunds ({money(metrics.approvedRefunds)})
                </p>
              </motion.div>
              <motion.div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Wallet className="w-8 h-8 text-[#0070B8] mb-2" />
                <p className="text-gray-500 text-sm">Provider Payout Owed</p>
                <p className="text-gray-900 text-3xl font-bold">{money(metrics.expectedProviderPayout)}</p>
                <p className="text-gray-500 text-xs mt-1">Sales - TORC fee + tips ({money(metrics.totalTips)})</p>
              </motion.div>
              <motion.div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <CheckCircle2 className="w-8 h-8 text-[#008CE5] mb-2" />
                <p className="text-gray-500 text-sm">Paid Out To Providers</p>
                <p className="text-gray-900 text-3xl font-bold">{money(metrics.paidOut)}</p>
                <p className="text-gray-500 text-xs mt-1">From payout ledger status = paid</p>
              </motion.div>
              <motion.div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Clock className="w-8 h-8 text-yellow-600 mb-2" />
                <p className="text-gray-500 text-sm">Outstanding Payout Liability</p>
                <p className="text-gray-900 text-3xl font-bold">{money(metrics.providerOutstandingEstimate)}</p>
                <p className="text-gray-500 text-xs mt-1">
                  Owed minus paid/processing ({money(metrics.processingPayouts)} in processing)
                </p>
              </motion.div>
              <motion.div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <TrendingDown className="w-8 h-8 text-[#FFD8A8] mb-2" />
                <p className="text-gray-500 text-sm">Cash Position Estimate</p>
                <p className="text-gray-900 text-3xl font-bold">{money(metrics.cashPositionEstimate)}</p>
                <p className="text-gray-500 text-xs mt-1">Captured payments - refunds - paid payouts</p>
              </motion.div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6">
                <p className="text-gray-500 text-sm">Payment Success Rate</p>
                <p className="text-gray-900 text-3xl font-bold">{metrics.paymentSuccessRate.toFixed(1)}%</p>
                <p className="text-gray-500 text-xs mt-1">Completed jobs with payment_status=paid</p>
              </div>
              <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6">
                <p className="text-gray-500 text-sm">Payout Coverage</p>
                <p className="text-gray-900 text-3xl font-bold">{metrics.payoutCoveragePct.toFixed(1)}%</p>
                <p className="text-gray-500 text-xs mt-1">Paid + processing vs provider amount owed</p>
              </div>
              <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6">
                <p className="text-gray-500 text-sm">Platform Margin</p>
                <p className="text-gray-900 text-3xl font-bold">{metrics.marginPct.toFixed(2)}%</p>
                <p className="text-gray-500 text-xs mt-1">Net platform revenue vs completed sales</p>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
              <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6">
                <h2 className="text-gray-900 font-bold text-xl mb-4">Payment Status Breakdown</h2>
                <div className="space-y-3">
                  {paymentStatusRows.map((row) => (
                    <div key={row.key} className="rounded-2xl bg-gray-50 border border-gray-200 p-4">
                      <div className="flex items-center justify-between">
                        <p className={`font-semibold ${row.color}`}>{row.label}</p>
                        <p className="text-gray-500 text-sm">
                          {metrics.paymentBuckets[row.key].jobs} job{metrics.paymentBuckets[row.key].jobs !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <p className="text-gray-900 text-xl font-bold mt-1">{money(metrics.paymentBuckets[row.key].amount)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6">
                <h2 className="text-gray-900 font-bold text-xl mb-4">Payout Status Breakdown</h2>
                <div className="space-y-3">
                  {payoutStatusRows.map((row) => (
                    <div key={row.key} className="rounded-2xl bg-gray-50 border border-gray-200 p-4">
                      <div className="flex items-center justify-between">
                        <p className={`font-semibold ${row.color}`}>{row.label}</p>
                        <p className="text-gray-500 text-sm">
                          {metrics.payoutBuckets[row.key].count} payout{metrics.payoutBuckets[row.key].count !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <p className="text-gray-900 text-xl font-bold mt-1">{money(metrics.payoutBuckets[row.key].amount)}</p>
                    </div>
                  ))}
                </div>
                {payouts.length === 0 && (
                  <p className="text-gray-400 text-xs mt-4">
                    No rows in provider_payouts yet. Queue payouts in Admin Payouts to track paid/processing amounts here.
                  </p>
                )}
              </div>
            </div>

            <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6 mb-8">
              <h2 className="text-gray-900 font-bold text-xl mb-4">Monthly Financial Rollup</h2>
              {monthly.length === 0 ? (
                <p className="text-gray-500">No monthly data available yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 text-gray-500 text-sm">
                        <th className="text-left py-3">Month</th>
                        <th className="text-left py-3">Sales</th>
                        <th className="text-left py-3">Tips</th>
                        <th className="text-left py-3">Fees</th>
                        <th className="text-left py-3">Refunds</th>
                        <th className="text-left py-3">Provider Owed</th>
                        <th className="text-left py-3">Payouts Paid</th>
                        <th className="text-left py-3">Net Revenue</th>
                        <th className="text-left py-3">Cash Est.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthly.map((row) => (
                        <tr key={row.month} className="border-b border-gray-100 text-gray-900">
                          <td className="py-3">{row.month}</td>
                          <td className="py-3">{money(row.sales)}</td>
                          <td className="py-3">{money(row.tips)}</td>
                          <td className="py-3">{money(row.fees)}</td>
                          <td className="py-3">{money(row.refunds)}</td>
                          <td className="py-3">{money(row.providerOwed)}</td>
                          <td className="py-3">{money(row.payoutsPaid)}</td>
                          <td className="py-3">{money(row.netPlatformRevenue)}</td>
                          <td className="py-3">{money(row.cashEstimate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-[#0070B8] mt-0.5" />
                <div>
                  <h3 className="text-gray-900 font-semibold mb-2">Payout Formula Applied</h3>
                  <p className="text-gray-600 text-sm">
                    For each completed service: customer pays full amount, TORC retains the platform fee ({platformFeePercent.toFixed(1)}%),
                    and provider payout is calculated as service amount minus fee plus tips.
                  </p>
                  <p className="text-gray-500 text-xs mt-2">
                    Profit and cash are dashboard estimates from current jobs, refunds, and provider_payouts ledger data.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
