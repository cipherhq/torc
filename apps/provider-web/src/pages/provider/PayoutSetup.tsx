import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, DollarSign, Plus, Trash2, Pencil, CheckCircle2, Building2, Mail, AtSign, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../lib/supabase';

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
  displayName: string;
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  routingNumber: string;
  paypalEmail: string;
  venmoHandle: string;
}

const emptyForm: FormState = {
  methodType: 'bank',
  displayName: '',
  accountHolderName: '',
  bankName: '',
  accountNumber: '',
  routingNumber: '',
  paypalEmail: '',
  venmoHandle: '',
};

export function PayoutSetup() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { user } = useAuth();
  const [methods, setMethods] = useState<PayoutMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    fetchMethods();
  }, [user]);

  async function fetchMethods() {
    if (!user) return;
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from('provider_payout_methods')
      .select('*')
      .eq('provider_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Failed to load payout methods:', error);
      if ((error as any).code === '42P01') {
        setLoadError('Payout methods table is missing. Run the latest migration first.');
      } else {
        setLoadError('Could not load payout methods right now.');
      }
      setMethods([]);
    } else {
      setMethods((data || []) as PayoutMethod[]);
    }
    setLoading(false);
  }

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(method: PayoutMethod) {
    setEditingId(method.id);
    setForm({
      methodType: method.method_type,
      displayName: method.display_name || '',
      accountHolderName: method.account_holder_name || '',
      bankName: method.bank_name || '',
      accountNumber: '',
      routingNumber: '',
      paypalEmail: method.paypal_email || '',
      venmoHandle: method.venmo_handle || '',
    });
    setShowModal(true);
  }

  function validateForm() {
    if (form.methodType === 'bank') return !!form.bankName.trim() && !!form.accountHolderName.trim() && !!form.accountNumber.trim();
    if (form.methodType === 'paypal') return !!form.paypalEmail.trim();
    return !!form.venmoHandle.trim();
  }

  const canSave = useMemo(() => validateForm(), [form]);

  async function saveMethod() {
    if (!user || !canSave) return;
    setSaving(true);

    const payload = {
      provider_id: user.id,
      method_type: form.methodType,
      display_name: form.displayName.trim() || null,
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
      const { error: updateError } = await supabase
        .from('provider_payout_methods')
        .update(payload)
        .eq('id', editingId)
        .eq('provider_id', user.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase.from('provider_payout_methods').insert(payload);
      error = insertError;
    }

    if (error) {
      console.warn('Failed to save payout method:', error);
      alert('Unable to save payout method right now.');
      setSaving(false);
      return;
    }

    setShowModal(false);
    setEditingId(null);
    setForm(emptyForm);
    await fetchMethods();
    setSaving(false);
  }

  async function removeMethod(id: string) {
    if (!user) return;
    const { error } = await supabase.from('provider_payout_methods').delete().eq('id', id).eq('provider_id', user.id);
    if (error) {
      console.warn('Failed to delete payout method:', error);
      alert('Unable to delete payout method right now.');
      return;
    }
    await fetchMethods();
  }

  async function setDefaultMethod(id: string) {
    if (!user) return;
    const clearRes = await supabase.from('provider_payout_methods').update({ is_default: false }).eq('provider_id', user.id);
    if (clearRes.error) {
      console.warn('Failed to clear default payout method:', clearRes.error);
      return;
    }
    const setRes = await supabase.from('provider_payout_methods').update({ is_default: true }).eq('id', id).eq('provider_id', user.id);
    if (setRes.error) {
      console.warn('Failed to set default payout method:', setRes.error);
      return;
    }
    await fetchMethods();
  }

  function methodLabel(method: PayoutMethod) {
    if (method.method_type === 'bank') return `${method.bank_name || 'Bank'} •••• ${method.account_last4 || '----'}`;
    if (method.method_type === 'paypal') return method.paypal_email || 'PayPal';
    return method.venmo_handle ? `@${method.venmo_handle.replace(/^@/, '')}` : 'Venmo';
  }

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-hidden"
      style={{
        background: isDark
          ? 'linear-gradient(180deg, #1A1F2E 0%, #0F1419 100%)'
          : 'linear-gradient(180deg, #FFFFFF 0%, #F0F4F8 100%)',
      }}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] rounded-full" style={{ backgroundColor: '#2EFFAF', filter: 'blur(160px)', opacity: isDark ? 0.06 : 0.03 }} />
      </div>

      {/* Header */}
      <div className="relative z-10 p-6 flex items-center gap-4">
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate(-1)} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}>
          <ArrowLeft className="w-5 h-5" style={{ color: isDark ? '#FFFFFF' : '#1F2937' }} />
        </motion.button>
        <h1 className="text-xl font-bold" style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }}>Payout Methods</h1>
      </div>

      <div className="relative z-10 flex-1 px-6 pb-8">
        <div className="rounded-2xl p-5 mb-4" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB'}` }}>
          <div className="flex items-center gap-3 mb-2">
            <DollarSign className="w-5 h-5 text-[#2EFFAF]" />
            <p className="font-semibold" style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }}>How you get paid</p>
          </div>
          <p className="text-sm" style={{ color: isDark ? 'rgba(255,255,255,0.65)' : '#6B7280' }}>
            Add and manage bank account, PayPal, or Venmo payout destinations.
          </p>
        </div>

        <button onClick={openAdd} className="w-full rounded-2xl p-4 mb-4 border-2 border-dashed flex items-center justify-center gap-2" style={{ borderColor: isDark ? 'rgba(255,255,255,0.2)' : '#D1D5DB', color: isDark ? '#FFFFFF' : '#1A1F2E', backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#FFFFFF' }}>
          <Plus className="w-4 h-4" />
          Add Payout Method
        </button>

        {loadError && (
          <div className="rounded-2xl p-4 mb-4 border border-red-500/30" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF' }}>
            <p className="text-red-400 text-sm">{loadError}</p>
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF', color: isDark ? 'rgba(255,255,255,0.6)' : '#6B7280' }}>
            Loading payout methods...
          </div>
        ) : methods.length === 0 ? (
          <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF' }}>
            <p style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#6B7280' }}>No payout methods added yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {methods.map((method) => (
              <div key={method.id} className="rounded-2xl p-4" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB'}` }}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(46,255,175,0.12)' }}>
                      {method.method_type === 'bank' && <Building2 className="w-5 h-5 text-[#2EFFAF]" />}
                      {method.method_type === 'paypal' && <Mail className="w-5 h-5 text-[#2EFFAF]" />}
                      {method.method_type === 'venmo' && <AtSign className="w-5 h-5 text-[#2EFFAF]" />}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold truncate" style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }}>
                        {method.display_name || method.method_type.toUpperCase()}
                      </p>
                      <p className="text-sm truncate" style={{ color: isDark ? 'rgba(255,255,255,0.6)' : '#6B7280' }}>
                        {methodLabel(method)}
                      </p>
                    </div>
                  </div>
                  {method.is_default && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold flex items-center gap-1" style={{ backgroundColor: 'rgba(46,255,175,0.15)', color: '#2EFFAF' }}>
                      <CheckCircle2 className="w-3 h-3" />
                      Default
                    </span>
                  )}
                </div>
                <div className="flex gap-2 mt-3">
                  {!method.is_default && (
                    <button onClick={() => setDefaultMethod(method.id)} className="px-3 py-2 rounded-xl text-sm" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6', color: isDark ? '#FFFFFF' : '#1A1F2E' }}>
                      Set Default
                    </button>
                  )}
                  <button onClick={() => openEdit(method)} className="px-3 py-2 rounded-xl text-sm flex items-center gap-1" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6', color: isDark ? '#FFFFFF' : '#1A1F2E' }}>
                    <Pencil className="w-3 h-3" />
                    Edit
                  </button>
                  <button onClick={() => removeMethod(method.id)} className="px-3 py-2 rounded-xl text-sm flex items-center gap-1 text-red-400" style={{ backgroundColor: 'rgba(239,68,68,0.08)' }}>
                    <Trash2 className="w-3 h-3" />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4">
          <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} className="w-full md:max-w-lg rounded-t-3xl md:rounded-3xl p-6" style={{ backgroundColor: isDark ? '#1A1F2E' : '#FFFFFF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB'}` }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-xl" style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }}>
                {editingId ? 'Update Payout Method' : 'Add Payout Method'}
              </h2>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6' }} title="Close">
                <X className="w-4 h-4" style={{ color: isDark ? '#FFFFFF' : '#6B7280' }} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4">
              {(['bank', 'paypal', 'venmo'] as MethodType[]).map((type) => (
                <button key={type} onClick={() => setForm({ ...form, methodType: type })} className="rounded-xl py-2 text-sm font-semibold" style={{ backgroundColor: form.methodType === type ? 'rgba(46,255,175,0.18)' : (isDark ? 'rgba(255,255,255,0.06)' : '#F3F4F6'), color: form.methodType === type ? '#2EFFAF' : (isDark ? '#FFFFFF' : '#1A1F2E') }}>
                  {type === 'bank' ? 'Bank' : type === 'paypal' ? 'PayPal' : 'Venmo'}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              <input type="text" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="Display name (optional)" className="w-full rounded-xl px-3 py-2 bg-transparent outline-none" style={{ border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB'}`, color: isDark ? '#FFFFFF' : '#1A1F2E' }} />

              {form.methodType === 'bank' && (
                <>
                  <input type="text" value={form.accountHolderName} onChange={(e) => setForm({ ...form, accountHolderName: e.target.value })} placeholder="Account holder name" className="w-full rounded-xl px-3 py-2 bg-transparent outline-none" style={{ border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB'}`, color: isDark ? '#FFFFFF' : '#1A1F2E' }} />
                  <input type="text" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="Bank name" className="w-full rounded-xl px-3 py-2 bg-transparent outline-none" style={{ border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB'}`, color: isDark ? '#FFFFFF' : '#1A1F2E' }} />
                  <input type="text" value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} placeholder={editingId ? 'Account number (enter to replace)' : 'Account number'} className="w-full rounded-xl px-3 py-2 bg-transparent outline-none" style={{ border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB'}`, color: isDark ? '#FFFFFF' : '#1A1F2E' }} />
                  <input type="text" value={form.routingNumber} onChange={(e) => setForm({ ...form, routingNumber: e.target.value })} placeholder={editingId ? 'Routing number (enter to replace)' : 'Routing number'} className="w-full rounded-xl px-3 py-2 bg-transparent outline-none" style={{ border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB'}`, color: isDark ? '#FFFFFF' : '#1A1F2E' }} />
                </>
              )}

              {form.methodType === 'paypal' && (
                <input type="email" value={form.paypalEmail} onChange={(e) => setForm({ ...form, paypalEmail: e.target.value })} placeholder="PayPal email" className="w-full rounded-xl px-3 py-2 bg-transparent outline-none" style={{ border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB'}`, color: isDark ? '#FFFFFF' : '#1A1F2E' }} />
              )}

              {form.methodType === 'venmo' && (
                <input type="text" value={form.venmoHandle} onChange={(e) => setForm({ ...form, venmoHandle: e.target.value })} placeholder="Venmo handle (e.g. @name)" className="w-full rounded-xl px-3 py-2 bg-transparent outline-none" style={{ border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB'}`, color: isDark ? '#FFFFFF' : '#1A1F2E' }} />
              )}
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowModal(false)} className="flex-1 rounded-xl py-3 font-medium" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6', color: isDark ? '#FFFFFF' : '#6B7280' }}>Cancel</button>
              <button onClick={saveMethod} disabled={!canSave || saving} className="flex-1 rounded-xl py-3 font-bold text-[#0F1419] bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] disabled:opacity-50">
                {saving ? 'Saving...' : editingId ? 'Update' : 'Add'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
