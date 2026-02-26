import { motion } from 'motion/react';
import { DollarSign, TrendingUp, Download } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '../../components/AdminLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface JobPayment {
  id: string;
  customer_id: string | null;
  provider_id: string | null;
  total_amount: number | null;
  status: string;
  created_at: string;
  completed_at: string | null;
  customer: { first_name?: string | null; last_name?: string | null; email?: string | null } | null;
  provider: { first_name?: string | null; last_name?: string | null; email?: string | null } | null;
}

interface RefundRow {
  id: string;
  job_id: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  reason: string;
  created_at: string;
}

const money = (value: number | null | undefined) => `$${Number(value || 0).toFixed(2)}`;

function displayName(user?: { first_name?: string | null; last_name?: string | null; email?: string | null } | null) {
  if (!user) return '-';
  const full = `${user.first_name || ''} ${user.last_name || ''}`.trim();
  return full || user.email || 'Unknown';
}

export function AdminPayments() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState([] as JobPayment[]);
  const [refunds, setRefunds] = useState([] as RefundRow[]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null as string | null);
  const [processingRefundJobId, setProcessingRefundJobId] = useState(null as string | null);
  const [searchQuery, setSearchQuery] = useState('');
  const [jobStatusFilter, setJobStatusFilter] = useState<'all' | 'completed' | 'pending' | 'cancelled'>('all');

  useEffect(() => {
    loadPayments();
  }, []);

  async function loadPayments() {
    try {
      setLoading(true);
      setLoadError(null);

      const [{ data: jobsData, error: jobsError }, { data: refundsData, error: refundsError }] = await Promise.all([
        supabase
          .from('jobs')
          .select(`
            id,
            customer_id,
            provider_id,
            total_amount,
            status,
            created_at,
            completed_at,
            customer:profiles!jobs_customer_id_fkey(first_name,last_name,email),
            provider:profiles!jobs_provider_id_fkey(first_name,last_name,email)
          `)
          .not('total_amount', 'is', null)
          .order('created_at', { ascending: false })
          .limit(150),
        supabase
          .from('refunds')
          .select('id, job_id, amount, status, reason, created_at')
          .order('created_at', { ascending: false }),
      ]);

      if (jobsError) throw jobsError;
      if (refundsError && !String(refundsError.message || '').toLowerCase().includes('does not exist')) {
        throw refundsError;
      }

      setJobs((jobsData || []) as JobPayment[]);
      setRefunds((refundsData || []) as RefundRow[]);
    } catch (error: any) {
      console.warn('Failed to load payments:', error);
      setLoadError(error?.message || 'Could not load payments.');
      setJobs([]);
      setRefunds([]);
    } finally {
      setLoading(false);
    }
  }

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayRevenue = jobs
      .filter((job) => job.status === 'completed' && new Date(job.completed_at || job.created_at) >= today)
      .reduce((sum, job) => sum + Number(job.total_amount || 0), 0);
    const pendingRefunds = refunds.filter((r) => r.status === 'pending');
    const approvedRefunds = refunds.filter((r) => r.status === 'approved');

    return {
      todayRevenue,
      pendingRefundsCount: pendingRefunds.length,
      approvedRefundAmount: approvedRefunds.reduce((sum, r) => sum + Number(r.amount || 0), 0),
    };
  }, [jobs, refunds]);

  const filteredJobs = useMemo(
    () => jobs.filter((job) => {
      if (jobStatusFilter !== 'all' && job.status !== jobStatusFilter) return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        job.id.toLowerCase().includes(q) ||
        displayName(job.customer).toLowerCase().includes(q) ||
        displayName(job.provider).toLowerCase().includes(q)
      );
    }),
    [jobs, searchQuery, jobStatusFilter]
  );

  async function issueRefund(job: JobPayment) {
    if (!job.customer_id) {
      window.alert('This job has no customer account linked.');
      return;
    }
    const currentAmount = Number(job.total_amount || 0);
    if (currentAmount <= 0) {
      window.alert('Job has no payable amount to refund.');
      return;
    }

    const amountRaw = window.prompt('Refund amount (USD):', currentAmount.toFixed(2));
    if (!amountRaw) return;
    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0 || amount > currentAmount) {
      window.alert('Invalid refund amount.');
      return;
    }

    const reason = window.prompt('Refund reason:', 'Admin approved refund');
    if (!reason || !reason.trim()) return;

    try {
      setProcessingRefundJobId(job.id);
      const { error } = await supabase.from('refunds').insert({
        job_id: job.id,
        customer_id: job.customer_id,
        provider_id: job.provider_id,
        amount,
        reason: reason.trim(),
        status: 'pending',
        processed_by: user?.id || null,
      });
      if (error) throw error;

      if (user?.id) {
        const { error: auditError } = await supabase.from('admin_audit_logs').insert({
          actor_id: user.id,
          action: 'issue_refund',
          entity_type: 'job_payment',
          entity_id: job.id,
          details: {
            amount,
            reason: reason.trim(),
            customer_id: job.customer_id,
            provider_id: job.provider_id,
          },
        });
        if (auditError) {
          console.warn('Audit log write skipped:', auditError.message);
        }
      }

      const notifications: Array<{ user_id: string; type: 'payment'; title: string; message: string }> = [
        {
          user_id: job.customer_id,
          type: 'payment',
          title: 'Refund initiated',
          message: `A refund of ${money(amount)} was initiated for your recent service.`,
        },
      ];

      if (job.provider_id) {
        notifications.push({
          user_id: job.provider_id,
          type: 'payment',
          title: 'Refund update on completed job',
          message: `A refund of ${money(amount)} was initiated for a job you completed.`,
        });
      }

      await supabase.from('notifications').insert(notifications);
      await loadPayments();
    } catch (error: any) {
      console.warn('Failed to issue refund:', error);
      window.alert(error?.message || 'Failed to issue refund.');
    } finally {
      setProcessingRefundJobId(null);
    }
  }

  const refundByJobId = new Map<string, RefundRow>(
    refunds.map((refund) => [refund.job_id, refund])
  );

  function exportPaymentsCsv() {
    if (filteredJobs.length === 0) return;
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['job_id', 'amount', 'job_status', 'customer', 'provider', 'refund_status', 'refund_amount', 'created_at'],
      ...filteredJobs.map((job) => {
        const refund = refundByJobId.get(job.id);
        return [
          job.id,
          Number(job.total_amount || 0).toFixed(2),
          job.status,
          displayName(job.customer),
          displayName(job.provider),
          refund?.status || '',
          refund ? Number(refund.amount || 0).toFixed(2) : '',
          job.created_at,
        ];
      }),
    ];
    const csv = rows.map((r) => r.map(escape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="bg-gradient-to-r from-[#1A1F2E] to-[#2F3548] p-8 rounded-3xl mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">Payments, Refunds & Transactions</h1>
              <p className="text-white/60 mt-1">Live payment records with admin refund operations</p>
            </div>
            <button
              onClick={exportPaymentsCsv}
              disabled={filteredJobs.length === 0}
              className="px-6 py-3 rounded-2xl bg-white text-gray-900 font-semibold flex items-center gap-2 disabled:opacity-60"
              title="Export filtered transactions"
            >
              <Download className="w-5 h-5" />
              Export
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-3xl p-6 shadow-lg">
            <DollarSign className="w-10 h-10 text-[#008CE5] mb-3" />
            <p className="text-gray-600 text-sm">Today&apos;s Revenue</p>
            <p className="text-3xl font-bold text-gray-900">{money(stats.todayRevenue)}</p>
          </div>
          <div className="bg-white rounded-3xl p-6 shadow-lg">
            <TrendingUp className="w-10 h-10 text-[#0070B8] mb-3" />
            <p className="text-gray-600 text-sm">Pending Refunds</p>
            <p className="text-3xl font-bold text-gray-900">{stats.pendingRefundsCount}</p>
          </div>
          <div className="bg-white rounded-3xl p-6 shadow-lg">
            <DollarSign className="w-10 h-10 text-green-500 mb-3" />
            <p className="text-gray-600 text-sm">Approved Refund Amount</p>
            <p className="text-3xl font-bold text-gray-900">{money(stats.approvedRefundAmount)}</p>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-lg overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by transaction ID, customer, provider..."
              className="flex-1 min-w-[260px] border border-gray-200 rounded-xl px-3 py-2 text-sm"
            />
            <select
              value={jobStatusFilter}
              onChange={(e) => setJobStatusFilter(e.target.value as 'all' | 'completed' | 'pending' | 'cancelled')}
              title="Filter by job status"
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          {loading ? (
            <div className="p-12 text-center text-gray-600">Loading transactions...</div>
          ) : loadError ? (
            <div className="p-12 text-center text-red-600">{loadError}</div>
          ) : filteredJobs.length === 0 ? (
            <div className="p-12 text-center text-gray-600">No transactions found.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Transaction ID</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Amount</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Customer</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Provider</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Job Status</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Refund</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Created</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredJobs.map((job) => {
                  const refund = refundByJobId.get(job.id);
                  const canRefund = job.status === 'completed' && !refund;
                  return (
                    <tr key={job.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 font-mono text-sm">TXN-{job.id.slice(0, 8)}</td>
                      <td className="px-6 py-4 font-semibold">{money(job.total_amount)}</td>
                      <td className="px-6 py-4 text-gray-600">{displayName(job.customer)}</td>
                      <td className="px-6 py-4 text-gray-600">{displayName(job.provider)}</td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                          job.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {job.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {refund ? (
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{refund.status}</p>
                            <p className="text-xs text-gray-500">{money(refund.amount)}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500">none</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-gray-600 text-sm">
                        {new Date(job.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <motion.button
                          whileTap={{ scale: 0.98 }}
                          disabled={!canRefund || processingRefundJobId === job.id}
                          onClick={() => issueRefund(job)}
                          className="px-3 py-2 rounded-xl bg-red-50 text-red-700 text-sm font-semibold disabled:opacity-50"
                        >
                          {processingRefundJobId === job.id ? 'Processing...' : 'Issue Refund'}
                        </motion.button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
