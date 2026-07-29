import { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'motion/react';
import { AdminLayout } from '../../components/AdminLayout';
import { Pagination } from '../../components/Pagination';
import { PayoutsTableSkeleton } from '../../components/PageSkeleton';
import { supabase } from '../../lib/supabase';
import { loadPlatformSettings } from '../../lib/platformSettings';
import { logAudit } from '../../lib/auditLog';
import {
  DollarSign, TrendingUp, Users, Search, RefreshCw,
  Send, X, Loader2, CreditCard, Building2, Wallet,
  Clock, CheckCircle, AlertTriangle, ChevronDown, ChevronUp,
  FileText, XCircle, ShieldCheck,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ProviderBalance {
  provider_id: string;
  provider_name: string;
  provider_email: string;
  jobs_count: number;
  total_earned: number;
  total_tips: number;
  platform_fee: number;
  net_owed: number;
  already_paid: number;
  balance: number;
}

interface PayoutMethod {
  id: string;
  method_type: string;
  display_name: string | null;
  account_holder_name: string | null;
  bank_name: string | null;
  account_last4: string | null;
  routing_last4: string | null;
  paypal_email: string | null;
  venmo_handle: string | null;
  is_default: boolean;
  status: string;
}

interface PayoutRecord {
  id: string;
  provider_id: string;
  provider_name?: string;
  period_start: string;
  period_end: string;
  total_earnings: number;
  total_tips: number;
  platform_fee: number;
  net_payout: number;
  status: string;
  reference_id: string | null;
  payment_method: string | null;
  notes: string | null;
  paid_at: string | null;
  created_at: string;
}

type FilterTab = 'all' | 'has_balance' | 'paid_up';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const fmt = (n: number) => `$${n.toFixed(2)}`;

function deriveBasePrice(job: { base_price?: number | null; total_amount?: number | null; tip?: number | null }) {
  const base = Number(job.base_price) || 0;
  if (base > 0) return base;
  return Math.max((Number(job.total_amount) || 0) - (Number(job.tip) || 0), 0);
}

function methodIcon(type: string) {
  switch (type) {
    case 'bank': return Building2;
    case 'paypal': return CreditCard;
    case 'venmo': return Wallet;
    default: return CreditCard;
  }
}

function methodLabel(type: string) {
  switch (type) {
    case 'bank': return 'Bank Transfer';
    case 'paypal': return 'PayPal';
    case 'venmo': return 'Venmo';
    case 'bank_transfer': return 'Bank Transfer';
    case 'other': return 'Other';
    default: return type;
  }
}

function methodSummary(m: PayoutMethod) {
  if (m.method_type === 'bank') {
    return `${m.bank_name || 'Bank'} ****${m.account_last4 || '????'}`;
  }
  if (m.method_type === 'paypal') {
    return m.paypal_email || 'PayPal account';
  }
  if (m.method_type === 'venmo') {
    return m.venmo_handle || 'Venmo account';
  }
  return m.display_name || m.method_type;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function AdminPayouts() {
  /* Data */
  const [providers, setProviders] = useState<ProviderBalance[]>([]);
  const [payoutHistory, setPayoutHistory] = useState<PayoutRecord[]>([]);
  const [allMethods, setAllMethods] = useState<Record<string, PayoutMethod[]>>({});
  const [serviceFee, setServiceFee] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* Filters & pagination – provider table */
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterTab>('all');
  const [providerPage, setProviderPage] = useState(1);
  const PROVIDER_PAGE_SIZE = 15;

  /* Filters & pagination – history table */
  const [historyPage, setHistoryPage] = useState(1);
  const HISTORY_PAGE_SIZE = 10;

  /* Payout modal */
  const [payingProvider, setPayingProvider] = useState<ProviderBalance | null>(null);
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [payMethodId, setPayMethodId] = useState<string | null>(null);
  const [payProcessing, setPayProcessing] = useState(false);

  /* Pending payouts awaiting approval */
  const [pendingPayouts, setPendingPayouts] = useState<PayoutRecord[]>([]);

  /* Expanded history rows */
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  /* ---------------------------------------------------------------- */
  /*  Load all data                                                    */
  /* ---------------------------------------------------------------- */

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const settings = await loadPlatformSettings();
      const sFee = settings.serviceFee;
      setServiceFee(sFee);

      /* 1) All completed jobs grouped by provider */
      const { data: jobs, error: jobsErr } = await supabase
        .from('jobs')
        .select('provider_id, base_price, tip, total_amount, completed_at')
        .eq('status', 'completed')
        .not('provider_id', 'is', null);

      if (jobsErr) throw jobsErr;

      /* 2) All past payouts */
      const { data: payouts, error: payoutsErr } = await supabase
        .from('provider_payouts')
        .select('*')
        .order('created_at', { ascending: false });

      if (payoutsErr) throw payoutsErr;

      /* 3) Provider profiles */
      const providerIds = Array.from(new Set((jobs || []).map((j: any) => j.provider_id).filter(Boolean)));
      const payoutProviderIds = (payouts || []).map((p: any) => p.provider_id).filter(Boolean);
      const allIds = Array.from(new Set([...providerIds, ...payoutProviderIds]));

      const profileMap = new Map<string, { first_name: string; last_name: string; email: string }>();
      if (allIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email')
          .in('id', allIds);
        for (const p of (profiles || [])) {
          profileMap.set(p.id, p);
        }
      }

      /* 4) Provider payout methods */
      const { data: methods } = await supabase
        .from('provider_payout_methods')
        .select('*')
        .eq('status', 'active');

      const methodsByProvider: Record<string, PayoutMethod[]> = {};
      for (const m of (methods || [])) {
        if (!methodsByProvider[m.provider_id]) methodsByProvider[m.provider_id] = [];
        methodsByProvider[m.provider_id].push(m);
      }
      setAllMethods(methodsByProvider);

      /* 5) Aggregate jobs per provider */
      const provMap = new Map<string, { jobs: number; earned: number; tips: number; fee: number; net: number }>();
      for (const job of (jobs || [])) {
        const pid = (job as any).provider_id;
        if (!pid) continue;
        const basePrice = deriveBasePrice(job as any);
        const tip = Number((job as any).tip) || 0;
        const svcFee = basePrice * (sFee / 100);
        const net = basePrice - svcFee + tip;

        const totalFee = svcFee;
        const existing = provMap.get(pid);
        if (existing) {
          existing.jobs += 1;
          existing.earned += basePrice;
          existing.tips += tip;
          existing.fee += totalFee;
          existing.net += net;
        } else {
          provMap.set(pid, { jobs: 1, earned: basePrice, tips: tip, fee: totalFee, net });
        }
      }

      /* 6) Sum past payouts per provider */
      const paidMap = new Map<string, number>();
      for (const p of (payouts || [])) {
        if (p.status === 'paid' || p.status === 'processing') {
          paidMap.set(p.provider_id, (paidMap.get(p.provider_id) || 0) + Number(p.net_payout || 0));
        }
      }

      /* 7) Build provider balance rows */
      const balances: ProviderBalance[] = [];
      for (const [pid, agg] of provMap.entries()) {
        const prof = profileMap.get(pid);
        const name = prof ? `${prof.first_name || ''} ${prof.last_name || ''}`.trim() : pid.slice(0, 8);
        const email = prof?.email || '';
        const paid = paidMap.get(pid) || 0;
        balances.push({
          provider_id: pid,
          provider_name: name || 'Unknown Provider',
          provider_email: email,
          jobs_count: agg.jobs,
          total_earned: agg.earned,
          total_tips: agg.tips,
          platform_fee: agg.fee,
          net_owed: agg.net,
          already_paid: paid,
          balance: Math.max(0, agg.net - paid),
        });
      }
      balances.sort((a, b) => b.balance - a.balance);
      setProviders(balances);

      /* 8) Build payout history with names */
      const history: PayoutRecord[] = (payouts || []).map((p: any) => {
        const prof = profileMap.get(p.provider_id);
        const name = prof ? `${prof.first_name || ''} ${prof.last_name || ''}`.trim() : p.provider_id?.slice(0, 8);
        return { ...p, provider_name: name || 'Unknown' };
      });
      setPayoutHistory(history);

      /* 9) Separate pending payouts for approval queue */
      const pending = history.filter((p) => p.status === 'pending');
      setPendingPayouts(pending);
    } catch (err: any) {
      console.error('Failed to load payout data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadData(); }, []);

  /* ---------------------------------------------------------------- */
  /*  Filtered + paginated providers                                   */
  /* ---------------------------------------------------------------- */

  const filteredProviders = useMemo(() => {
    let list = providers;
    if (filter === 'has_balance') list = list.filter((p) => p.balance > 0.01);
    if (filter === 'paid_up') list = list.filter((p) => p.balance < 0.01);
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((p) =>
        p.provider_name.toLowerCase().includes(q) ||
        p.provider_email.toLowerCase().includes(q)
      );
    }
    return list;
  }, [providers, filter, search]);

  useEffect(() => { setProviderPage(1); }, [filter, search]);

  const paginatedProviders = useMemo(() =>
    filteredProviders.slice((providerPage - 1) * PROVIDER_PAGE_SIZE, providerPage * PROVIDER_PAGE_SIZE),
  [filteredProviders, providerPage]);

  /* Paginated history */
  const paginatedHistory = useMemo(() =>
    payoutHistory.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE),
  [payoutHistory, historyPage]);

  /* ---------------------------------------------------------------- */
  /*  Summary stats                                                    */
  /* ---------------------------------------------------------------- */

  const totalOwed = providers.reduce((s, p) => s + p.balance, 0);
  const providersWithBalance = providers.filter((p) => p.balance > 0.01).length;

  const thisMonth = new Date();
  thisMonth.setDate(1); thisMonth.setHours(0, 0, 0, 0);
  const payoutsThisMonth = payoutHistory.filter((p) => p.status === 'paid' && p.paid_at && new Date(p.paid_at) >= thisMonth);
  const monthlyTotal = payoutsThisMonth.reduce((s, p) => s + Number(p.net_payout || 0), 0);

  const pendingTotal = pendingPayouts.reduce((s, p) => s + Number(p.net_payout || 0), 0);

  const statCards = [
    { label: 'Total Owed', value: fmt(totalOwed), icon: DollarSign, gradient: 'linear-gradient(135deg, #EF4444, #DC2626)' },
    { label: 'Providers with Balance', value: String(providersWithBalance), icon: Users, gradient: 'linear-gradient(135deg, #008CE5, #0070B8)' },
    { label: 'Pending Approval', value: `${pendingPayouts.length} (${fmt(pendingTotal)})`, icon: Clock, gradient: 'linear-gradient(135deg, #F59E0B, #D97706)' },
    { label: 'Payouts This Month', value: `${payoutsThisMonth.length} (${fmt(monthlyTotal)})`, icon: CheckCircle, gradient: 'linear-gradient(135deg, #22C55E, #16A34A)' },
    { label: 'Torc Fee Rate', value: `${serviceFee}%`, icon: TrendingUp, gradient: 'linear-gradient(135deg, #8B5CF6, #7C3AED)' },
  ];

  const filterTabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'All Providers', count: providers.length },
    { key: 'has_balance', label: 'Owed Balance', count: providers.filter((p) => p.balance > 0.01).length },
    { key: 'paid_up', label: 'Paid Up', count: providers.filter((p) => p.balance < 0.01).length },
  ];

  /* ---------------------------------------------------------------- */
  /*  Open payout modal                                                */
  /* ---------------------------------------------------------------- */

  function openPayModal(provider: ProviderBalance) {
    setPayingProvider(provider);
    setPayRef('');
    setPayNotes('');
    const methods = allMethods[provider.provider_id] || [];
    const defaultMethod = methods.find((m) => m.is_default) || methods[0];
    setPayMethodId(defaultMethod?.id || null);
  }

  /* ---------------------------------------------------------------- */
  /*  Process single payout                                            */
  /* ---------------------------------------------------------------- */

  async function handleCompletePayout() {
    if (!payingProvider) return;
    if (payProcessing) return; // Prevent duplicate submissions from rapid clicks
    const amount = payingProvider.balance;
    if (!amount || amount <= 0) return;
    if (!payRef.trim() || payRef.trim().length < 4) {
      alert('Please enter a valid payment reference ID (at least 4 characters).');
      return;
    }

    const confirmed = window.confirm(
      `Queue payout of $${payingProvider.balance.toFixed(2)} to ${payingProvider.provider_name} for approval?\n\nReference: ${payRef.trim()}`
    );
    if (!confirmed) return;

    setPayProcessing(true);
    try {
      const selectedMethod = (allMethods[payingProvider.provider_id] || []).find((m) => m.id === payMethodId);
      const methodType = selectedMethod?.method_type || 'other';

      const now = new Date();
      const periodStart = new Date(now);
      const day = periodStart.getDay();
      const daysSinceMonday = day === 0 ? 6 : day - 1;
      periodStart.setDate(periodStart.getDate() - daysSinceMonday);
      periodStart.setHours(0, 0, 0, 0);

      const { error: insertErr } = await supabase.from('provider_payouts').insert({
        provider_id: payingProvider.provider_id,
        period_start: periodStart.toISOString().split('T')[0],
        period_end: now.toISOString().split('T')[0],
        total_earnings: payingProvider.total_earned,
        total_tips: payingProvider.total_tips,
        platform_fee: payingProvider.platform_fee,
        net_payout: amount,
        status: 'pending',
        reference_id: payRef.trim(),
        payment_method: methodType,
        notes: payNotes.trim() || null,
      });

      if (insertErr) throw insertErr;

      await logAudit({
        action: 'queue_payout',
        entity_type: 'provider_payout',
        entity_id: payingProvider.provider_id,
        details: {
          amount,
          reference_id: payRef.trim(),
          payment_method: methodType,
          provider_name: payingProvider.provider_name,
        },
      });

      setPayingProvider(null);
      alert('Payout queued for approval.');
      await loadData();
    } catch (err: any) {
      console.error('Failed to queue payout:', err);
      alert(`Payout failed: ${err.message || 'Unknown error'}`);
    } finally {
      setPayProcessing(false);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Approve a pending payout                                         */
  /* ---------------------------------------------------------------- */

  const approvingRef = useRef(false);
  const rejectingRef = useRef(false);

  async function handleApprovePayout(payout: PayoutRecord) {
    if (approvingRef.current) return; // Prevent duplicate submissions from rapid clicks

    const confirmed = window.confirm(
      `Approve payout of ${fmt(Number(payout.net_payout))} to ${payout.provider_name}?\n\nReference: ${payout.reference_id || '--'}\n\nThis will mark the payout as paid.`
    );
    if (!confirmed) return;

    approvingRef.current = true;
    try {
      const { error: updateErr } = await supabase
        .from('provider_payouts')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', payout.id);

      if (updateErr) throw updateErr;

      await logAudit({
        action: 'approve_payout',
        entity_type: 'provider_payout',
        entity_id: payout.id,
        details: {
          provider_id: payout.provider_id,
          provider_name: payout.provider_name,
          amount: payout.net_payout,
          reference_id: payout.reference_id,
        },
      });

      // Send payout confirmation email (fire-and-forget)
      supabase
        .from('profiles')
        .select('email, first_name')
        .eq('id', payout.provider_id)
        .maybeSingle()
        .then(({ data: providerProfile }) => {
          if (providerProfile?.email) {
            supabase.functions.invoke('send-email', {
              body: {
                to: providerProfile.email,
                template: 'payout_paid',
                data: {
                  providerName: providerProfile.first_name || 'there',
                  amount: fmt(Number(payout.net_payout)),
                  referenceId: payout.reference_id || '--',
                  paymentMethod: payout.payment_method || 'Bank Transfer',
                  paidAt: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
                },
              },
            }).catch((err: any) => console.warn('Payout email failed:', err));
          }
        });

      await loadData();
    } catch (err: any) {
      console.error('Failed to approve payout:', err);
      alert(`Approval failed: ${err.message || 'Unknown error'}`);
    } finally {
      approvingRef.current = false;
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Reject a pending payout                                          */
  /* ---------------------------------------------------------------- */

  async function handleRejectPayout(payout: PayoutRecord) {
    if (rejectingRef.current) return; // Prevent duplicate submissions from rapid clicks

    const reason = window.prompt('Reason for rejection:');
    if (reason === null) return; // user cancelled

    rejectingRef.current = true;
    try {
      const { error: updateErr } = await supabase
        .from('provider_payouts')
        .update({ status: 'failed', notes: `Rejected: ${reason || 'No reason provided'}` })
        .eq('id', payout.id);

      if (updateErr) throw updateErr;

      await logAudit({
        action: 'reject_payout',
        entity_type: 'provider_payout',
        entity_id: payout.id,
        details: {
          provider_id: payout.provider_id,
          provider_name: payout.provider_name,
          amount: payout.net_payout,
          reference_id: payout.reference_id,
          rejection_reason: reason || 'No reason provided',
        },
      });

      await loadData();
    } catch (err: any) {
      console.error('Failed to reject payout:', err);
      alert(`Rejection failed: ${err.message || 'Unknown error'}`);
    } finally {
      rejectingRef.current = false;
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <AdminLayout>
      <div className="p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Provider Payouts</h1>
            <p className="text-gray-500">Manage provider earnings, balances, and external payouts</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => void loadData()}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </motion.button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-6 flex items-center gap-3 bg-red-50 border border-red-200 rounded-[20px] px-5 py-4 text-red-600">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-medium">{error}</p>
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          {statCards.map((card, i) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6"
              >
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ background: card.gradient }}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <p className="text-gray-500 text-sm mb-1">{card.label}</p>
                <p className="text-gray-900 font-bold text-2xl">{loading ? '--' : card.value}</p>
              </motion.div>
            );
          })}
        </div>

        {/* Search + Filter tabs */}
        <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6 mb-6">
          <div className="relative mb-4">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search providers by name or email..."
              aria-label="Search providers by name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {filterTabs.map((tab) => (
              <motion.button
                key={tab.key}
                whileTap={{ scale: 0.95 }}
                onClick={() => setFilter(tab.key)}
                className="px-4 py-2 rounded-full text-sm font-semibold transition-all"
                style={filter === tab.key
                  ? { background: 'linear-gradient(to right, #008CE5, #0070B8)', color: '#FFFFFF' }
                  : { backgroundColor: '#F9FAFB', color: '#4B5563' }
                }
              >
                {tab.label} ({tab.count})
              </motion.button>
            ))}
          </div>
        </div>

        {/* Pending Payouts Approval Queue */}
        {pendingPayouts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white shadow-sm border border-amber-200 rounded-[24px] overflow-hidden mb-6"
          >
            <div className="px-6 py-4 border-b border-amber-100 bg-amber-50/50">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-500" />
                Pending Approval ({pendingPayouts.length})
              </h2>
              <p className="text-gray-500 text-sm">These payouts are queued and require approval before being marked as paid</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-amber-100 bg-amber-50/30">
                  <tr>
                    <th className="px-6 py-3 text-left text-gray-500 text-xs font-semibold uppercase tracking-wider">Provider</th>
                    <th className="px-4 py-3 text-right text-gray-500 text-xs font-semibold uppercase tracking-wider">Amount</th>
                    <th className="px-4 py-3 text-left text-gray-500 text-xs font-semibold uppercase tracking-wider">Method</th>
                    <th className="px-4 py-3 text-left text-gray-500 text-xs font-semibold uppercase tracking-wider">Reference</th>
                    <th className="px-4 py-3 text-left text-gray-500 text-xs font-semibold uppercase tracking-wider">Queued</th>
                    <th className="px-4 py-3 text-left text-gray-500 text-xs font-semibold uppercase tracking-wider">Notes</th>
                    <th className="px-6 py-3 text-center text-gray-500 text-xs font-semibold uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pendingPayouts.map((rec, i) => (
                    <motion.tr
                      key={rec.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="hover:bg-amber-50/30 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <p className="text-gray-900 font-semibold text-sm">{rec.provider_name}</p>
                      </td>
                      <td className="px-4 py-4 text-right font-bold" style={{ color: '#008CE5' }}>
                        {fmt(Number(rec.net_payout))}
                      </td>
                      <td className="px-4 py-4 text-gray-600 text-sm">
                        {rec.payment_method ? methodLabel(rec.payment_method) : '--'}
                      </td>
                      <td className="px-4 py-4">
                        {rec.reference_id ? (
                          <span className="px-2 py-1 rounded-lg bg-gray-100 text-gray-700 text-xs font-mono">{rec.reference_id}</span>
                        ) : (
                          <span className="text-gray-400 text-sm">--</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-gray-700 text-sm whitespace-nowrap">
                        {new Date(rec.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-4 text-gray-500 text-sm max-w-[150px] truncate">
                        {rec.notes || '--'}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleApprovePayout(rec)}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-sm"
                            style={{ background: 'linear-gradient(to right, #22C55E, #16A34A)' }}
                          >
                            <ShieldCheck className="w-4 h-4" />
                            Approve & Pay
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleRejectPayout(rec)}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors"
                          >
                            <XCircle className="w-4 h-4" />
                            Reject
                          </motion.button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {/* Provider balance table */}
        <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-gray-900 font-bold text-xl">Provider Balances</h2>
            <p className="text-gray-500 text-sm">Earnings calculated using {serviceFee}% Torc fee on base price</p>
          </div>

          {loading ? (
            <PayoutsTableSkeleton />
          ) : filteredProviders.length === 0 ? (
            <div className="p-16 flex flex-col items-center justify-center">
              <Users className="w-12 h-12 text-gray-300 mb-4" />
              <p className="text-gray-900 font-semibold text-lg mb-1">No providers found</p>
              <p className="text-gray-500 text-sm">
                {search ? 'Try adjusting your search.' : 'No completed jobs yet.'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full table-fixed">
                  <thead className="border-b border-gray-200 bg-gray-50/50">
                    <tr>
                      <th className="w-[20%] px-6 py-4 text-left text-gray-500 text-xs font-semibold uppercase tracking-wider">Provider</th>
                      <th className="w-[7%] px-3 py-4 text-center text-gray-500 text-xs font-semibold uppercase tracking-wider">Jobs</th>
                      <th className="w-[11%] px-3 py-4 text-right text-gray-500 text-xs font-semibold uppercase tracking-wider">Earned</th>
                      <th className="w-[10%] px-3 py-4 text-right text-gray-500 text-xs font-semibold uppercase tracking-wider">Tips</th>
                      <th className="w-[10%] px-3 py-4 text-right text-gray-500 text-xs font-semibold uppercase tracking-wider">Fees</th>
                      <th className="w-[11%] px-3 py-4 text-right text-gray-500 text-xs font-semibold uppercase tracking-wider">Net Owed</th>
                      <th className="w-[10%] px-3 py-4 text-right text-gray-500 text-xs font-semibold uppercase tracking-wider">Paid</th>
                      <th className="w-[11%] px-3 py-4 text-right text-gray-500 text-xs font-semibold uppercase tracking-wider">Balance</th>
                      <th className="w-[10%] px-4 py-4 text-center text-gray-500 text-xs font-semibold uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginatedProviders.map((prov, i) => (
                      <motion.tr
                        key={prov.provider_id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.02 }}
                        className="hover:bg-blue-50/30 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <p className="text-gray-900 font-semibold text-sm truncate">{prov.provider_name}</p>
                          <p className="text-gray-400 text-xs truncate">{prov.provider_email}</p>
                        </td>
                        <td className="px-3 py-4 text-center text-gray-700 font-medium text-sm">{prov.jobs_count}</td>
                        <td className="px-3 py-4 text-right text-gray-700 text-sm font-medium">{fmt(prov.total_earned)}</td>
                        <td className="px-3 py-4 text-right text-sm font-medium" style={{ color: '#22C55E' }}>+{fmt(prov.total_tips)}</td>
                        <td className="px-3 py-4 text-right text-red-400 text-sm font-medium">-{fmt(prov.platform_fee)}</td>
                        <td className="px-3 py-4 text-right text-gray-900 font-bold text-sm">{fmt(prov.net_owed)}</td>
                        <td className="px-3 py-4 text-right text-gray-500 text-sm">{fmt(prov.already_paid)}</td>
                        <td className="px-3 py-4 text-right">
                          <span className={`font-bold text-base ${prov.balance > 0.01 ? '' : 'text-gray-400'}`}
                            style={prov.balance > 0.01 ? { color: '#008CE5' } : undefined}
                          >
                            {fmt(prov.balance)}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          {prov.balance > 0.01 ? (
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => openPayModal(prov)}
                              className="px-5 py-2 rounded-xl text-sm font-semibold text-white shadow-sm shadow-blue-500/20"
                              style={{ background: 'linear-gradient(to right, #008CE5, #0070B8)' }}
                            >
                              Pay
                            </motion.button>
                          ) : (
                            <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                              Paid
                            </span>
                          )}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                currentPage={providerPage}
                totalItems={filteredProviders.length}
                pageSize={PROVIDER_PAGE_SIZE}
                onPageChange={setProviderPage}
              />
            </>
          )}
        </div>

        {/* Recent Payouts History */}
        <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-gray-900 font-bold text-xl">Payout History</h2>
            <p className="text-gray-500 text-sm">{payoutHistory.length} recorded payouts</p>
          </div>

          {payoutHistory.length === 0 ? (
            <div className="p-12 text-center">
              <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No payouts recorded yet</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-gray-200 bg-gray-50/50">
                    <tr>
                      <th className="px-6 py-4 text-left text-gray-500 text-xs font-semibold uppercase tracking-wider">Date</th>
                      <th className="px-4 py-4 text-left text-gray-500 text-xs font-semibold uppercase tracking-wider">Provider</th>
                      <th className="px-4 py-4 text-right text-gray-500 text-xs font-semibold uppercase tracking-wider">Amount</th>
                      <th className="px-4 py-4 text-left text-gray-500 text-xs font-semibold uppercase tracking-wider">Method</th>
                      <th className="px-4 py-4 text-left text-gray-500 text-xs font-semibold uppercase tracking-wider">Reference</th>
                      <th className="px-4 py-4 text-left text-gray-500 text-xs font-semibold uppercase tracking-wider">Status</th>
                      <th className="px-6 py-4 text-center text-gray-500 text-xs font-semibold uppercase tracking-wider"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedHistory.map((rec) => {
                      const isExpanded = expandedHistoryId === rec.id;
                      return (
                        <motion.tr
                          key={rec.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors align-top"
                        >
                          <td className="px-6 py-4 text-gray-700 text-sm whitespace-nowrap">
                            {rec.paid_at
                              ? new Date(rec.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                              : rec.created_at
                              ? new Date(rec.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                              : '--'}
                          </td>
                          <td className="px-4 py-4 text-gray-900 font-medium">{rec.provider_name}</td>
                          <td className="px-4 py-4 text-right font-bold" style={{ color: '#008CE5' }}>{fmt(Number(rec.net_payout))}</td>
                          <td className="px-4 py-4 text-gray-600 text-sm">{rec.payment_method ? methodLabel(rec.payment_method) : '--'}</td>
                          <td className="px-4 py-4">
                            {rec.reference_id ? (
                              <span className="px-2 py-1 rounded-lg bg-gray-100 text-gray-700 text-xs font-mono">{rec.reference_id}</span>
                            ) : (
                              <span className="text-gray-400 text-sm">--</span>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className="px-3 py-1 rounded-full text-xs font-semibold capitalize"
                              style={rec.status === 'paid'
                                ? { backgroundColor: '#DEF7EC', color: '#03543F' }
                                : rec.status === 'processing'
                                ? { backgroundColor: '#DBEAFE', color: '#1E40AF' }
                                : rec.status === 'pending'
                                ? { backgroundColor: '#FEF3C7', color: '#92400E' }
                                : rec.status === 'failed'
                                ? { backgroundColor: '#FEE2E2', color: '#991B1B' }
                                : { backgroundColor: '#F3F4F6', color: '#4B5563' }
                              }
                            >
                              {rec.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <button
                              onClick={() => setExpandedHistoryId(isExpanded ? null : rec.id)}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                            {isExpanded && (
                              <div className="text-left mt-2 bg-gray-50 rounded-xl p-3 text-xs text-gray-600 space-y-1">
                                <p><span className="font-semibold">Period:</span> {rec.period_start} to {rec.period_end}</p>
                                <p><span className="font-semibold">Earnings:</span> {fmt(Number(rec.total_earnings))}</p>
                                <p><span className="font-semibold">Tips:</span> {fmt(Number(rec.total_tips))}</p>
                                <p><span className="font-semibold">Torc Fee:</span> {fmt(Number(rec.platform_fee))}</p>
                                {rec.notes && <p><span className="font-semibold">Notes:</span> {rec.notes}</p>}
                                <p className="text-gray-400">ID: {rec.id}</p>
                              </div>
                            )}
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination
                currentPage={historyPage}
                totalItems={payoutHistory.length}
                pageSize={HISTORY_PAGE_SIZE}
                onPageChange={setHistoryPage}
              />
            </>
          )}
        </div>

        {/* Payout info box */}
        <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6 mt-8">
          <h3 className="text-gray-900 font-semibold mb-3">How Payouts Work</h3>
          <ul className="space-y-2 text-gray-500 text-sm">
            <li>Provider earnings = base service price - Torc fee ({serviceFee}%) + tips (100% passed through)</li>
            <li><strong>Step 1:</strong> Click "Pay" to queue a payout for approval (status: pending)</li>
            <li><strong>Step 2:</strong> Review in the "Pending Approval" section, then Approve & Pay or Reject</li>
            <li><strong>Step 3:</strong> Approved payouts are marked as paid; rejected payouts are marked as failed</li>
            <li>The provider's balance updates only after a payout is approved (pending payouts do not reduce balance)</li>
          </ul>
        </div>
      </div>

      {/* ============================================================= */}
      {/*  Payout Modal                                                  */}
      {/* ============================================================= */}
      {payingProvider && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payout-modal-title"
          onKeyDown={(e) => { if (e.key === 'Escape' && !payProcessing) setPayingProvider(null); }}
          onClick={() => !payProcessing && setPayingProvider(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-[32px] p-8 max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 id="payout-modal-title" className="text-gray-900 font-bold text-2xl">Process Payout</h2>
                <p className="text-gray-500 text-sm mt-1">{payingProvider.provider_name}</p>
              </div>
              <button onClick={() => setPayingProvider(null)} aria-label="Close payout dialog" className="p-2 rounded-xl hover:bg-gray-100 text-gray-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Balance summary */}
            <div className="rounded-2xl p-4 mb-6" style={{ backgroundColor: 'rgba(0,140,229,0.05)', border: '1px solid rgba(0,140,229,0.15)' }}>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-gray-400 text-xs mb-1">Net Owed</p>
                  <p className="text-gray-900 font-bold">{fmt(payingProvider.net_owed)}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs mb-1">Already Paid</p>
                  <p className="text-gray-900 font-bold">{fmt(payingProvider.already_paid)}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs mb-1">Balance</p>
                  <p className="font-bold text-xl" style={{ color: '#008CE5' }}>{fmt(payingProvider.balance)}</p>
                </div>
              </div>
            </div>

            {/* Payout method selection */}
            <div className="mb-5">
              <label className="text-gray-600 text-sm font-semibold mb-2 block">Provider Payout Method</label>
              {(allMethods[payingProvider.provider_id] || []).length === 0 ? (
                <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-yellow-700 text-sm">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  No payout methods configured by this provider
                </div>
              ) : (
                <div className="space-y-2">
                  {(allMethods[payingProvider.provider_id] || []).map((m) => {
                    const Icon = methodIcon(m.method_type);
                    const selected = payMethodId === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => setPayMethodId(m.id)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left"
                        style={selected
                          ? { backgroundColor: 'rgba(0,140,229,0.08)', border: '2px solid #008CE5' }
                          : { backgroundColor: '#F9FAFB', border: '2px solid transparent' }
                        }
                      >
                        <Icon className="w-5 h-5 flex-shrink-0" style={{ color: selected ? '#008CE5' : '#9CA3AF' }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-900 font-medium text-sm">{methodLabel(m.method_type)}</p>
                          <p className="text-gray-500 text-xs truncate">{methodSummary(m)}</p>
                        </div>
                        {m.is_default && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">Default</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Amount — locked to prevent human error */}
            <div className="mb-5">
              <label className="text-gray-600 text-sm font-semibold mb-2 block">Payout Amount</label>
              <div className="w-full py-3.5 px-4 bg-gray-100 border-2 border-gray-200 rounded-xl text-gray-900 text-lg font-bold select-none">
                {fmt(payingProvider.balance)}
              </div>
              <p className="text-gray-400 text-xs mt-1.5">Full outstanding balance will be paid out</p>
            </div>

            {/* Reference ID */}
            <div className="mb-5">
              <label className="text-gray-600 text-sm font-semibold mb-2 block">
                Payment Reference ID <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                placeholder="Enter transaction ID (e.g. TXN-123456)"
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                className="w-full px-4 py-3.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {/* Notes */}
            <div className="mb-8">
              <label className="text-gray-600 text-sm font-semibold mb-2 block">Notes (optional)</label>
              <textarea
                placeholder="Additional notes about this payout..."
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                rows={3}
                className="w-full px-4 py-3.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-4">
              <button
                onClick={() => setPayingProvider(null)}
                className="flex-1 px-6 py-3.5 rounded-2xl bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleCompletePayout}
                disabled={payProcessing || !payRef.trim()}
                className="flex-[1.3] px-6 py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2.5 disabled:opacity-50 text-white shadow-lg shadow-blue-500/20"
                style={{ background: 'linear-gradient(to right, #008CE5, #0070B8)' }}
              >
                {payProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                {payProcessing ? 'Queuing...' : 'Queue for Approval'}
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </AdminLayout>
  );
}
