import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Plus, CreditCard, Check, Trash2, Shield, AlertCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

interface PaymentMethod {
  id: string;
  type: string;
  last4?: string;
  brand?: string;
  exp_month?: number;
  exp_year?: number;
  is_default: boolean;
}

export function PaymentMethods() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    cardNumber: '',
    expiryDate: '',
    cvv: '',
    zipCode: '',
    nickname: '',
  });
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  const textColor = isDark ? '#FFFFFF' : '#1A1F2E';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB';
  const inputBg = isDark ? 'rgba(255,255,255,0.05)' : '#F9FAFB';
  const inputBorder = isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB';

  useEffect(() => {
    if (!user) return;
    fetchPaymentMethods();
  }, [user]);

  const fetchPaymentMethods = async () => {
    try {
      const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false });
      if (error) throw error;
      setPaymentMethods(data || []);
    } catch (e) {
      console.warn('Failed to load payment methods:', e);
    }
  };

  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 16);
    return digits.replace(/(.{4})/g, '$1 ').trim();
  };

  const formatExpiry = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    if (digits.length >= 3) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return digits;
  };

  const detectBrand = (number: string) => {
    const d = number.replace(/\D/g, '');
    if (d.startsWith('4')) return 'Visa';
    if (/^5[1-5]/.test(d) || /^2[2-7]/.test(d)) return 'Mastercard';
    if (/^3[47]/.test(d)) return 'Amex';
    if (/^6(?:011|5)/.test(d)) return 'Discover';
    return 'Card';
  };

  const validateForm = (): string[] => {
    const errs: string[] = [];
    const digits = formData.cardNumber.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 16) errs.push('Card number must be 13-16 digits');
    const [mm, yy] = formData.expiryDate.split('/');
    const month = parseInt(mm);
    const year = parseInt('20' + (yy || ''));
    if (!mm || !yy || month < 1 || month > 12) errs.push('Invalid expiry date (MM/YY)');
    else {
      const now = new Date();
      const expiry = new Date(year, month);
      if (expiry < now) errs.push('Card is expired');
    }
    if (formData.cvv.replace(/\D/g, '').length < 3) errs.push('CVV must be at least 3 digits');
    if (!formData.zipCode.trim()) errs.push('ZIP code is required');
    return errs;
  };

  const handleAddCard = async () => {
    const errs = validateForm();
    if (errs.length > 0) {
      setFormErrors(errs);
      return;
    }
    setFormErrors([]);
    setSaving(true);

    const digits = formData.cardNumber.replace(/\D/g, '');
    const [mm, yy] = formData.expiryDate.split('/');

    try {
      const { error } = await supabase.from('payment_methods').insert({
        user_id: user.id,
        type: 'card',
        brand: detectBrand(digits),
        last4: digits.slice(-4),
        exp_month: parseInt(mm),
        exp_year: parseInt('20' + yy),
        is_default: paymentMethods.length === 0,
      });

      if (error) throw error;

      setShowAddModal(false);
      setFormData({ cardNumber: '', expiryDate: '', cvv: '', zipCode: '', nickname: '' });
      await fetchPaymentMethods();
    } catch (e) {
      console.error('Failed to save card:', e);
      setFormErrors(['Failed to save card. Please try again.']);
    }
    setSaving(false);
  };

  const setDefaultMethod = async (id: string) => {
    try {
      await supabase.from('payment_methods').update({ is_default: false }).eq('user_id', user.id);
      await supabase.from('payment_methods').update({ is_default: true }).eq('id', id);
      await fetchPaymentMethods();
    } catch (e) {
      console.warn('Failed to set default:', e);
    }
  };

  const deleteMethod = async (id: string) => {
    try {
      await supabase.from('payment_methods').delete().eq('id', id);
      await fetchPaymentMethods();
    } catch (e) {
      console.warn('Failed to delete method:', e);
    }
  };

  return (
    <div className="min-h-screen pb-24" style={{ background: isDark ? '#0F1419' : '#F5F7FA' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 p-6" style={{ backgroundColor: isDark ? '#0F1419' : '#FFFFFF', borderBottom: `1px solid ${cardBorder}` }}>
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <button onClick={() => navigate('/profile')} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }} title="Go back">
            <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
          </button>
          <div>
            <h1 className="text-xl font-bold" style={{ color: textColor }}>Payment Methods</h1>
            <p className="text-sm" style={{ color: subColor }}>Manage your payment options</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-6 space-y-5">
        {/* Security Banner */}
        <div className="rounded-2xl p-4 flex gap-3" style={{ backgroundColor: isDark ? 'rgba(0,122,255,0.1)' : 'rgba(0,122,255,0.05)', border: `1px solid ${isDark ? 'rgba(0,122,255,0.3)' : 'rgba(0,122,255,0.15)'}` }}>
          <Shield className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#007AFF' }} />
          <div>
            <h3 className="font-semibold text-sm mb-1" style={{ color: textColor }}>Secure Payments</h3>
            <p className="text-xs" style={{ color: subColor }}>Your payment information is encrypted and securely stored.</p>
          </div>
        </div>

        {/* Add Payment Button */}
        <button onClick={() => { setShowAddModal(true); setFormErrors([]); }}
          className="w-full rounded-2xl p-5 border-2 border-dashed flex items-center justify-center gap-3 transition-all hover:border-[#2EFFAF]/50"
          style={{ borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#D1D5DB' }}
        >
          <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] flex items-center justify-center">
            <Plus className="w-5 h-5 text-[#0F1419]" />
          </div>
          <span className="font-semibold" style={{ color: textColor }}>Add Payment Method</span>
        </button>

        {/* Payment Methods List */}
        {paymentMethods.length > 0 ? (
          <div className="space-y-3">
            {paymentMethods.map((method) => (
              <div key={method.id} className="rounded-2xl p-5" style={{ backgroundColor: cardBg, border: `2px solid ${method.is_default ? 'rgba(46,255,175,0.4)' : cardBorder}` }}>
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center flex-shrink-0">
                    <CreditCard className="w-6 h-6 text-[#0F1419]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-1">
                      <div>
                        <h3 className="font-bold" style={{ color: textColor }}>{method.brand || 'Card'} •••• {method.last4 || '****'}</h3>
                        <p className="text-sm" style={{ color: subColor }}>
                          {method.exp_month && method.exp_year ? `Expires ${String(method.exp_month).padStart(2, '0')}/${method.exp_year}` : ''}
                        </p>
                      </div>
                      {method.is_default && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1" style={{ backgroundColor: 'rgba(46,255,175,0.15)', color: '#2EFFAF' }}>
                          <Check className="w-3 h-3" />Default
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 mt-3">
                      {!method.is_default && (
                        <>
                          <button onClick={() => setDefaultMethod(method.id)} className="px-3 py-1.5 rounded-xl text-xs font-semibold text-[#0F1419] bg-gradient-to-r from-[#2EFFAF] to-[#007AFF]">
                            Set as Default
                          </button>
                          <button onClick={() => deleteMethod(method.id)} className="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>
                            <Trash2 className="w-3 h-3" />Remove
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-10">
            <CreditCard className="w-14 h-14 mx-auto mb-3" style={{ color: isDark ? 'rgba(255,255,255,0.15)' : '#D1D5DB' }} />
            <p style={{ color: subColor }}>No payment methods added yet</p>
          </div>
        )}
      </div>

      {/* Add Card Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowAddModal(false)}>
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="rounded-t-3xl md:rounded-3xl p-6 w-full md:max-w-md max-h-[90vh] overflow-y-auto"
            style={{ backgroundColor: isDark ? '#1A1F2E' : '#FFFFFF' }}
          >
            <h2 className="font-bold text-xl mb-5" style={{ color: textColor }}>Add Credit Card</h2>

            {formErrors.length > 0 && (
              <div className="mb-4 rounded-xl p-3 bg-red-500/10 border border-red-500/30">
                {formErrors.map((err, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                    <p className="text-red-500 text-sm">{err}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="text-sm mb-1.5 block font-medium" style={{ color: subColor }}>Card Number *</label>
                <input
                  type="text"
                  value={formData.cardNumber}
                  onChange={(e) => setFormData({ ...formData, cardNumber: formatCardNumber(e.target.value) })}
                  placeholder="1234 5678 9012 3456"
                  maxLength={19}
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none font-mono focus:ring-2 focus:ring-[#2EFFAF]/50"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm mb-1.5 block font-medium" style={{ color: subColor }}>Expiry *</label>
                  <input
                    type="text"
                    value={formData.expiryDate}
                    onChange={(e) => setFormData({ ...formData, expiryDate: formatExpiry(e.target.value) })}
                    placeholder="MM/YY"
                    maxLength={5}
                    className="w-full px-4 py-3 rounded-xl text-sm outline-none font-mono focus:ring-2 focus:ring-[#2EFFAF]/50"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
                  />
                </div>
                <div>
                  <label className="text-sm mb-1.5 block font-medium" style={{ color: subColor }}>CVV *</label>
                  <input
                    type="text"
                    value={formData.cvv}
                    onChange={(e) => setFormData({ ...formData, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                    placeholder="123"
                    maxLength={4}
                    className="w-full px-4 py-3 rounded-xl text-sm outline-none font-mono focus:ring-2 focus:ring-[#2EFFAF]/50"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm mb-1.5 block font-medium" style={{ color: subColor }}>ZIP Code *</label>
                <input
                  type="text"
                  value={formData.zipCode}
                  onChange={(e) => setFormData({ ...formData, zipCode: e.target.value.replace(/\D/g, '').slice(0, 5) })}
                  placeholder="94103"
                  maxLength={5}
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#2EFFAF]/50"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
                />
              </div>

              <div>
                <label className="text-sm mb-1.5 block font-medium" style={{ color: subColor }}>Nickname (Optional)</label>
                <input
                  type="text"
                  value={formData.nickname}
                  onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                  placeholder="Personal Card"
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#2EFFAF]/50"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
                />
              </div>

              <div className="rounded-xl p-3 flex gap-2" style={{ backgroundColor: isDark ? 'rgba(0,122,255,0.1)' : 'rgba(0,122,255,0.05)', border: `1px solid ${isDark ? 'rgba(0,122,255,0.2)' : 'rgba(0,122,255,0.1)'}` }}>
                <Shield className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#007AFF' }} />
                <p className="text-xs" style={{ color: subColor }}>Your card info is encrypted with bank-level security via Stripe.</p>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAddModal(false)} className="flex-1 px-5 py-3 rounded-xl font-semibold text-sm" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6', color: textColor }}>
                Cancel
              </button>
              <button onClick={handleAddCard} disabled={saving}
                className="flex-1 px-5 py-3 rounded-xl font-bold text-sm text-[#0F1419] bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Add Card'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
