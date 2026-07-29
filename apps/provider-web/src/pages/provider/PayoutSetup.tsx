import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft, DollarSign, Plus, Trash2, Pencil, CheckCircle2, Building2,
  Mail, AtSign, Clock, Calendar, Info, Save, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { PageHeader } from '../../components/PageHeader';
import { supabase } from '../../lib/supabase';
import { loadPlatformSettings } from '../../lib/platformSettings';

type MethodType = 'bank' | 'paypal' | 'venmo';

interface PayoutMethod {
  id: string;
  provider_id: string;
  method_type: MethodType;
  display_name: string | null;
  account_holder_name: string | null;
  bank_name: string | null;
  account_last4: string | null;
  routing_last4: string | null;
  paypal_email: string | null;
  venmo_handle: string | null;
  is_default: boolean;
  status: string | null;
}

interface FormState {
  methodType: MethodType;
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  confirmAccountNumber: string;
  routingNumber: string;
  paypalEmail: string;
  confirmPaypalEmail: string;
  venmoHandle: string;
}

interface PayoutRow {
  id: string;
  period_start: string;
  period_end: string;
  net_payout: number | null;
  status: string;
  created_at: string;
  paid_at: string | null;
  reference: string | null;
}

const emptyForm: FormState = {
  methodType: 'bank',
  accountHolderName: '',
  bankName: '',
  accountNumber: '',
  confirmAccountNumber: '',
  routingNumber: '',
  paypalEmail: '',
  confirmPaypalEmail: '',
  venmoHandle: '',
};

function deriveBasePrice(job: { base_price?: number | null; total_amount?: number | null; tip?: number | null }) {
  const base = Number(job.base_price) || 0;
  if (base > 0) return base;
  return Math.max((Number(job.total_amount) || 0) - (Number(job.tip) || 0), 0);
}

function FormField({
  label, value, onChange, placeholder, isDark, type = 'text',
}: {
  label: string; value: string; onChange: (value: string) => void;
  placeholder: string; isDark: boolean; type?: string;
}) {
  const borderColor = isDark ? 'rgba(255,255,255,0.12)' : '#D3E0F2';
  const bgColor = isDark ? 'rgba(255,255,255,0.04)' : '#F5F9FF';
  const labelColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: labelColor }}>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-xl px-4 py-3 bg-transparent outline-none"
        style={{ border: `1px solid ${borderColor}`, backgroundColor: bgColor, color: isDark ? '#FFFFFF' : '#14263D', fontSize: 16 }}
      />
    </div>
  );
}

export function PayoutSetup() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { user } = useAuth();
  const [methods, setMethods] = useState<PayoutMethod[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [showAllPayouts, setShowAllPayouts] = useState(false);
  const [serviceFee, setServiceFee] = useState(10);
  const [earningsData, setEarningsData] = useState({ net: 0, paidOut: 0 });

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    loadAll();
  }, [user]);

  async function loadAll() {
    if (!user) return;
    setLoading(true);
    setLoadError(null);

    try {
      const [methodsRes, payoutsRes, settings, jobsRes] = await Promise.all([
        supabase.from('provider_payout_methods').select('*').eq('provider_id', user.id).order('created_at', { ascending: false }),
        supabase.from('provider_payouts').select('*').eq('provider_id', user.id).order('period_start', { ascending: false }).limit(50),
        loadPlatformSettings(),
        supabase.from('jobs').select('base_price, total_amount, tip, status, payment_status').eq('provider_id', user.id).eq('status', 'completed'),
      ]);

      if (methodsRes.error && !(methodsRes.error as any)?.message?.includes('does not exist')) {
        throw methodsRes.error;
      }
      setMethods((methodsRes.data || []) as PayoutMethod[]);

      if (!payoutsRes.error) {
        setPayouts((payoutsRes.data || []) as PayoutRow[]);
      }

      setServiceFee(settings.service_fee_pct);

      if (jobsRes.data) {
        const jobs = jobsRes.data;
        const totalBase = jobs.reduce((s, j) => s + deriveBasePrice(j), 0);
        const totalTips = jobs.reduce((s, j) => s + (Number(j.tip) || 0), 0);
        const fee = totalBase * (settings.service_fee_pct / 100);
        const net = totalBase - fee + totalTips;
        const paidOut = (payoutsRes.data || [])
          .filter((p: any) => p.status === 'paid')
          .reduce((s: number, p: any) => s + (Number(p.net_payout) || 0), 0);
        setEarningsData({ net, paidOut });
      }
    } catch (error: any) {
      console.warn('Failed to load payout data:', error);
      if ((error as any)?.code === '42P01') {
        setLoadError('Payout methods table is missing. Run the latest migration.');
      } else {
        setLoadError('Could not load payout information right now.');
      }
    } finally {
      setLoading(false);
    }
  }

  function openAdd() { setEditingId(null); setForm(emptyForm); setShowModal(true); }

  function openEdit(method: PayoutMethod) {
    setEditingId(method.id);
    setForm({
      methodType: method.method_type,
      accountHolderName: method.account_holder_name || '',
      bankName: method.bank_name || '',
      accountNumber: '',
      confirmAccountNumber: '',
      routingNumber: '',
      paypalEmail: method.paypal_email || '',
      confirmPaypalEmail: method.paypal_email || '',
      venmoHandle: method.venmo_handle || '',
    });
    setShowModal(true);
  }

  const [formError, setFormError] = useState('');

  function validateForm() {
    setFormError('');
    if (form.methodType === 'bank') {
      if (!form.bankName.trim() || !form.accountHolderName.trim()) return false;
      if (!form.accountNumber.trim() || form.accountNumber !== form.confirmAccountNumber) return false;
      if (form.routingNumber.trim()) {
        const routingDigits = form.routingNumber.replace(/\D/g, '');
        if (routingDigits.length !== 9) { setFormError('Routing number must be exactly 9 digits'); return false; }
        if (routingDigits !== form.routingNumber.trim()) { setFormError('Routing number must contain only digits'); return false; }
      }
      const acctDigits = form.accountNumber.replace(/\D/g, '');
      if (acctDigits !== form.accountNumber.trim()) { setFormError('Account number must contain only digits'); return false; }
      if (acctDigits.length < 4 || acctDigits.length > 17) { setFormError('Account number must be between 4 and 17 digits'); return false; }
      return true;
    }
    if (form.methodType === 'paypal') {
      if (!form.paypalEmail.trim()) return false;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.paypalEmail.trim())) { setFormError('Please enter a valid PayPal email address'); return false; }
      if (form.paypalEmail !== form.confirmPaypalEmail) return false;
      return true;
    }
    return !!form.venmoHandle.trim();
  }

  const canSave = useMemo(() => validateForm(), [form]);

  async function saveMethod() {
    if (!user || !canSave) return;
    setSaving(true);

    const payload = {
      provider_id: user.id,
      method_type: form.methodType,
      display_name: null,
      account_holder_name: form.methodType === 'bank' ? form.accountHolderName.trim() || null : null,
      bank_name: form.methodType === 'bank' ? form.bankName.trim() || null : null,
      account_last4: form.methodType === 'bank' && form.accountNumber ? form.accountNumber.slice(-4) : null,
      routing_last4: form.methodType === 'bank' && form.routingNumber ? form.routingNumber.slice(-4) : null,
      paypal_email: form.methodType === 'paypal' ? form.paypalEmail.trim() || null : null,
      venmo_handle: form.methodType === 'venmo' ? form.venmoHandle.trim() || null : null,
      status: 'active',
      is_default: editingId ? undefined : methods.length === 0,
    };

    let error: any = null;
    if (editingId) {
      const { error: updateError } = await supabase.from('provider_payout_methods').update(payload).eq('id', editingId).eq('provider_id', user.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase.from('provider_payout_methods').insert(payload);
      error = insertError;
    }

    if (error) {
      console.warn('Failed to save payout method:', error);
      const raw = String((error as any)?.message || '');
      if ((error as any)?.code === '42P01') {
        alert('Payout methods table is missing. Run the latest database migrations, then retry.');
      } else if (raw.includes('column') || raw.includes('schema cache')) {
        alert(`Payout schema is outdated: ${raw}`);
      } else {
        alert('Unable to save payout method right now.');
      }
      setSaving(false);
      return;
    }

    setShowModal(false);
    setEditingId(null);
    setForm(emptyForm);
    await loadAll();
    setSaving(false);
  }

  async function removeMethod(id: string) {
    if (!user || actionInProgress) return;
    if (!window.confirm('Are you sure you want to delete this payout method?')) return;
    setActionInProgress(id);
    try {
      const { error } = await supabase.from('provider_payout_methods').delete().eq('id', id).eq('provider_id', user.id);
      if (error) throw error;
      await loadAll();
    } catch {
      // stays unchanged on failure
    } finally {
      setActionInProgress(null);
    }
  }

  async function setDefaultMethod(id: string) {
    if (!user || actionInProgress) return;
    if (!window.confirm('Set this as your default payout method?')) return;
    setActionInProgress(id);
    try {
      await supabase.from('provider_payout_methods').update({ is_default: false }).eq('provider_id', user.id);
      await supabase.from('provider_payout_methods').update({ is_default: true }).eq('id', id).eq('provider_id', user.id);
      await loadAll();
    } catch {
      // stays unchanged on failure
    } finally {
      setActionInProgress(null);
    }
  }

  function methodLabel(method: PayoutMethod) {
    if (method.method_type === 'bank') return `${method.bank_name || 'Bank'} •••• ${method.account_last4 || '----'}`;
    if (method.method_type === 'paypal') return method.paypal_email || 'PayPal';
    return method.venmo_handle ? `@${method.venmo_handle.replace(/^@/, '')}` : 'Venmo';
  }

  function methodIcon(type: MethodType) {
    if (type === 'bank') return <Building2 className="w-5 h-5 text-[#008CE5]" />;
    if (type === 'paypal') return <Mail className="w-5 h-5 text-[#008CE5]" />;
    return <AtSign className="w-5 h-5 text-[#008CE5]" />;
  }

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const availableBalance = Math.max(0, earningsData.net - earningsData.paidOut);
  const visiblePayouts = showAllPayouts ? payouts : payouts.slice(0, 5);
  const defaultMethod = methods.find((m) => m.is_default) || methods[0];

  const textColor = isDark ? '#FFFFFF' : '#14263D';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2';
  // Full-screen modal page (replaces main content when open)
  if (showModal) {
    const tabItems: { type: MethodType; label: string; icon: typeof Building2 }[] = [
      { type: 'bank', label: 'Bank', icon: Building2 },
      { type: 'paypal', label: 'PayPal', icon: Mail },
      { type: 'venmo', label: 'Venmo', icon: AtSign },
    ];

    return (
      <div className="min-h-screen flex flex-col"
        style={{
          background: isDark ? 'linear-gradient(180deg, #0A1626 0%, #081427 100%)' : 'linear-gradient(180deg, #F8FBFF 0%, #EAF2FF 100%)',
          paddingTop: 'var(--safe-top, 0px)',
        }}>
        {/* Header */}
        <div className="flex items-center gap-4 p-6 pb-4 flex-shrink-0">
          <button onClick={() => setShowModal(false)} className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : '#FFFFFF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.18)' : '#D3E0F2'}` }} title="Close">
            <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
          </button>
          <h2 className="font-bold text-xl" style={{ color: textColor }}>
            {editingId ? 'Update Payout Method' : 'Add Payout Method'}
          </h2>
        </div>

        {/* Scrollable form content */}
        <div className="flex-1 overflow-y-auto px-6 pb-6" style={{ WebkitOverflowScrolling: 'touch' }}>
          {/* Method type tabs */}
          <div className="rounded-2xl p-1.5 mb-6"
            style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E8F0FB' }}>
            <div className="grid grid-cols-3 gap-1">
              {tabItems.map(({ type, label, icon: TabIcon }) => {
                const active = form.methodType === type;
                return (
                  <button key={type} onClick={() => setForm({ ...form, methodType: type })}
                    className="rounded-xl py-3 flex items-center justify-center gap-2 text-sm font-semibold transition-all"
                    style={{
                      backgroundColor: active ? (isDark ? '#0B1F35' : '#FFFFFF') : 'transparent',
                      color: active ? '#008CE5' : (isDark ? 'rgba(255,255,255,0.5)' : '#6B7280'),
                      boxShadow: active ? (isDark ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.08)') : 'none',
                    }}>
                    <TabIcon className="w-4 h-4" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Form fields */}
          {formError && (
            <p className="text-xs text-red-400 mb-2 px-1">{formError}</p>
          )}
          <div className="space-y-4">
            {form.methodType === 'bank' && (
              <>
                <FormField label="Account Holder Name *" value={form.accountHolderName} onChange={(v) => setForm({ ...form, accountHolderName: v })} placeholder="Full legal name" isDark={isDark} />
                <FormField label="Bank Name *" value={form.bankName} onChange={(v) => setForm({ ...form, bankName: v })} placeholder="e.g. Chase, Bank of America" isDark={isDark} />
                <FormField label="Account Number *" value={form.accountNumber} onChange={(v) => setForm({ ...form, accountNumber: v })} placeholder={editingId ? 'Enter to replace' : 'Account number'} isDark={isDark} />
                <FormField label="Confirm Account Number *" value={form.confirmAccountNumber} onChange={(v) => setForm({ ...form, confirmAccountNumber: v })} placeholder="Re-enter account number" isDark={isDark} />
                {form.accountNumber && form.confirmAccountNumber && form.accountNumber !== form.confirmAccountNumber && (
                  <p className="text-xs text-red-400 px-1 -mt-2">Account numbers do not match</p>
                )}
                <div>
                  <FormField label="Routing Number" value={form.routingNumber} onChange={(v) => setForm({ ...form, routingNumber: v.replace(/\D/g, '').slice(0, 9) })} placeholder={editingId ? 'Enter to replace' : 'Routing number'} isDark={isDark} />
                </div>
              </>
            )}

            {form.methodType === 'paypal' && (
              <>
                <FormField label="PayPal Email *" value={form.paypalEmail} onChange={(v) => setForm({ ...form, paypalEmail: v })} placeholder="you@example.com" isDark={isDark} type="email" />
                <FormField label="Confirm PayPal Email *" value={form.confirmPaypalEmail} onChange={(v) => setForm({ ...form, confirmPaypalEmail: v })} placeholder="Re-enter email" isDark={isDark} type="email" />
                {form.paypalEmail && form.confirmPaypalEmail && form.paypalEmail !== form.confirmPaypalEmail && (
                  <p className="text-xs text-red-400 px-1 -mt-2">Email addresses do not match</p>
                )}
              </>
            )}

            {form.methodType === 'venmo' && (
              <FormField label="Venmo Handle *" value={form.venmoHandle} onChange={(v) => setForm({ ...form, venmoHandle: v })} placeholder="e.g. @username" isDark={isDark} />
            )}
          </div>
        </div>

        {/* Bottom buttons — above the tab bar */}
        <div className="flex gap-3 px-6 pt-4 flex-shrink-0"
          style={{
            borderTop: `1px solid ${cardBorder}`,
            paddingBottom: 'calc(72px + env(safe-area-inset-bottom, 0px))',
          }}>
          <button onClick={() => setShowModal(false)} className="flex-1 rounded-2xl py-4 font-semibold"
            style={{
              backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E8F0FB',
              color: isDark ? '#FFFFFF' : '#14263D',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : '#D3E0F2'}`,
            }}>
            Cancel
          </button>
          <button onClick={saveMethod} disabled={!canSave || saving}
            className="flex-1 rounded-2xl py-4 font-bold disabled:opacity-40 flex items-center justify-center gap-2"
            style={{
              background: 'linear-gradient(135deg, #008CE5, #0070B8)',
              boxShadow: '0 6px 16px rgba(0,140,229,0.35)',
              color: '#FFFFFF',
            }}>
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Save Method'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden"
      style={{ background: isDark ? 'linear-gradient(180deg, #14263D 0%, #0A1626 100%)' : 'linear-gradient(180deg, #FFFFFF 0%, #EEF4FF 100%)', paddingBottom: 'calc(96px + var(--safe-bottom, 0px))' }}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] rounded-full" style={{ backgroundColor: '#008CE5', filter: 'blur(160px)', opacity: isDark ? 0.06 : 0.03 }} />
      </div>

      <PageHeader title="Payouts" onBack={() => navigate(-1)} />

      <div className="relative z-10 px-6 space-y-5" style={{ paddingTop: 'calc(var(--safe-top) + 64px)' }}>
        {loadError && (
          <div className="rounded-2xl p-4 border border-red-500/30" style={{ backgroundColor: cardBg }}>
            <p className="text-red-400 text-sm">{loadError}</p>
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
            <div className="w-8 h-8 border-2 border-[#008CE5] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p style={{ color: subColor }}>Loading payout information...</p>
          </div>
        ) : (
          <>
            {/* Balance card */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-3xl p-6 overflow-hidden relative"
              style={{ background: 'linear-gradient(135deg, #008CE5 0%, #0070B8 50%, #005A94 100%)', boxShadow: '0 8px 32px rgba(0,140,229,0.3)' }}
            >
              <div className="absolute top-0 right-0 w-40 h-40 rounded-full" style={{ background: 'rgba(255,255,255,0.08)', filter: 'blur(40px)' }} />
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-5 h-5" style={{ color: 'rgba(255,255,255,0.78)' }} />
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.78)' }}>Available Balance</p>
              </div>
              <h2 className="font-bold text-4xl mb-1" style={{ color: '#FFFFFF' }}>${fmt(availableBalance)}</h2>
              <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.72)' }}>After {serviceFee}% Torc fee</p>

              <div className="flex gap-3">
                <div className="flex-1 rounded-xl py-2 px-3 text-center" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.72)' }}>Total Earned</p>
                  <p className="font-bold" style={{ color: '#FFFFFF' }}>${fmt(earningsData.net)}</p>
                </div>
                <div className="flex-1 rounded-xl py-2 px-3 text-center" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.72)' }}>Paid Out</p>
                  <p className="font-bold" style={{ color: '#FFFFFF' }}>${fmt(earningsData.paidOut)}</p>
                </div>
              </div>
            </motion.div>

            {/* Default payout destination */}
            {defaultMethod && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
                className="rounded-2xl p-4" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(0,140,229,0.12)' }}>
                    {methodIcon(defaultMethod.method_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs" style={{ color: subColor }}>Payouts go to</p>
                    <p className="font-semibold truncate" style={{ color: textColor }}>
                      {defaultMethod.display_name || methodLabel(defaultMethod)}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: 'rgba(0,140,229,0.15)', color: '#008CE5' }}>
                    Default
                  </span>
                </div>
              </motion.div>
            )}

            {/* Payout methods */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold" style={{ color: textColor }}>Payout Methods</h2>
                <button onClick={openAdd} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold"
                  style={{ background: 'linear-gradient(135deg, #008CE5, #0070B8)', color: '#FFFFFF' }}>
                  <Plus className="w-4 h-4" /> Add
                </button>
              </div>

              {methods.length === 0 ? (
                <div className="rounded-2xl p-6 text-center border-2 border-dashed" style={{ borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#D1D5DB' }}>
                  <Building2 className="w-10 h-10 mx-auto mb-2" style={{ color: isDark ? 'rgba(255,255,255,0.15)' : '#D1D5DB' }} />
                  <p style={{ color: subColor }}>No payout methods added yet</p>
                  <button onClick={openAdd} className="mt-3 px-4 py-2 rounded-xl text-sm font-semibold"
                    style={{ background: 'linear-gradient(135deg, #008CE5, #0070B8)', color: '#FFFFFF' }}>
                    Add Payout Method
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {methods.map((method) => (
                    <div key={method.id} className="rounded-2xl p-4" style={{ backgroundColor: cardBg, border: `1px solid ${method.is_default ? 'rgba(0,140,229,0.4)' : cardBorder}` }}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(0,140,229,0.12)' }}>
                            {methodIcon(method.method_type)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold truncate" style={{ color: textColor }}>
                              {method.display_name || method.method_type.charAt(0).toUpperCase() + method.method_type.slice(1)}
                            </p>
                            <p className="text-sm truncate" style={{ color: subColor }}>{methodLabel(method)}</p>
                          </div>
                        </div>
                        {method.is_default && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 flex-shrink-0"
                            style={{ backgroundColor: 'rgba(0,140,229,0.15)', color: '#008CE5' }}>
                            <CheckCircle2 className="w-3 h-3" /> Default
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2 mt-3">
                        {!method.is_default && (
                          <button onClick={() => setDefaultMethod(method.id)} disabled={!!actionInProgress} className="px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-40"
                            style={{ background: 'linear-gradient(135deg, #008CE5, #0070B8)', color: '#FFFFFF' }}>
                            {actionInProgress === method.id ? 'Updating...' : 'Set Default'}
                          </button>
                        )}
                        <button onClick={() => openEdit(method)} className="px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1"
                          style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E8F0FB', color: textColor }}>
                          <Pencil className="w-3 h-3" /> Edit
                        </button>
                        {!method.is_default && (
                          <button onClick={() => removeMethod(method.id)} disabled={!!actionInProgress} className="px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1 text-red-400 disabled:opacity-40"
                            style={{ backgroundColor: 'rgba(239,68,68,0.08)' }}>
                            <Trash2 className="w-3 h-3" /> Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>

            {/* Payout schedule info */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
              className="rounded-2xl p-4" style={{ backgroundColor: isDark ? 'rgba(0,140,229,0.08)' : 'rgba(0,140,229,0.05)', border: `1px solid ${isDark ? 'rgba(0,140,229,0.2)' : 'rgba(0,140,229,0.12)'}` }}>
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: '#008CE5' }} />
                <div>
                  <h3 className="font-semibold text-sm mb-1" style={{ color: textColor }}>Payout Schedule</h3>
                  <p className="text-xs" style={{ color: subColor }}>
                    Payouts are processed weekly. Earnings from completed jobs are deposited to your default payout method within 2-3 business days after each payout period ends.
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Payout history */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <h2 className="font-semibold mb-3" style={{ color: textColor }}>Payout History</h2>
              {payouts.length === 0 ? (
                <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
                  <Clock className="w-10 h-10 mx-auto mb-2" style={{ color: isDark ? 'rgba(255,255,255,0.15)' : '#D1D5DB' }} />
                  <p style={{ color: subColor }}>No payouts yet. Complete jobs to start earning!</p>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {visiblePayouts.map((payout) => {
                      const statusColor = payout.status === 'paid' ? '#10B981' : payout.status === 'failed' ? '#EF4444' : '#F59E0B';
                      const statusLabel = payout.status === 'paid' ? 'Paid' : payout.status === 'failed' ? 'Failed' : 'Processing';
                      return (
                        <div key={payout.id} className="rounded-2xl p-4" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4" style={{ color: '#008CE5' }} />
                              <p className="font-semibold text-sm" style={{ color: textColor }}>
                                {new Date(payout.period_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {new Date(payout.period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </p>
                            </div>
                            <p className="font-bold" style={{ color: '#008CE5' }}>${fmt(Number(payout.net_payout || 0))}</p>
                          </div>
                          <div className="flex items-center justify-between text-xs" style={{ color: subColor }}>
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: `${statusColor}15`, color: statusColor }}>
                                {statusLabel}
                              </span>
                              {payout.reference && <span>Ref: {payout.reference}</span>}
                            </div>
                            <span>
                              {payout.paid_at
                                ? `Paid ${new Date(payout.paid_at).toLocaleDateString()}`
                                : new Date(payout.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {payouts.length > 5 && (
                    <button onClick={() => setShowAllPayouts(!showAllPayouts)}
                      className="w-full mt-3 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-1"
                      style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#E8F0FB', color: textColor }}>
                      {showAllPayouts ? <><ChevronUp className="w-4 h-4" /> Show Less</> : <><ChevronDown className="w-4 h-4" /> Show All ({payouts.length})</>}
                    </button>
                  )}
                </>
              )}
            </motion.div>
          </>
        )}
      </div>

    </div>
  );
}
