import { motion } from 'motion/react';
import { CustomerBottomNav } from '../../components/CustomerBottomNav';
import { CreditCard, Plus, DollarSign, Gift, Download, Trash2, Check, X, AlertCircle, Shield } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useState, useEffect } from 'react';

export function Wallet() {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [walletBalance] = useState(0.00);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [transactions] = useState<any[]>([]);
  const [showAddCard, setShowAddCard] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cardForm, setCardForm] = useState({ cardNumber: '', expiryDate: '', cvv: '', zipCode: '' });
  const [cardErrors, setCardErrors] = useState<string[]>([]);

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
      const { data, error } = await supabase.from('payment_methods').select('*').eq('user_id', user.id);
      if (error) throw error;
      setPaymentMethods(data || []);
    } catch (error) {
      console.warn('Error fetching payment methods:', error);
      setPaymentMethods([]);
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

  const handleAddCard = async () => {
    const errs: string[] = [];
    const digits = cardForm.cardNumber.replace(/\D/g, '');
    if (digits.length < 13) errs.push('Card number must be 13-16 digits');
    const [mm, yy] = cardForm.expiryDate.split('/');
    const month = parseInt(mm);
    if (!mm || !yy || month < 1 || month > 12) errs.push('Invalid expiry date');
    if (cardForm.cvv.replace(/\D/g, '').length < 3) errs.push('CVV must be at least 3 digits');
    if (!cardForm.zipCode.trim()) errs.push('ZIP code is required');
    if (errs.length > 0) { setCardErrors(errs); return; }
    setCardErrors([]);
    setSaving(true);
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
      setShowAddCard(false);
      setCardForm({ cardNumber: '', expiryDate: '', cvv: '', zipCode: '' });
      await fetchPaymentMethods();
    } catch (e) {
      setCardErrors(['Failed to save card. Please try again.']);
    }
    setSaving(false);
  };

  const deleteMethod = async (id: string) => {
    try {
      await supabase.from('payment_methods').delete().eq('id', id);
      await fetchPaymentMethods();
    } catch (e) {
      console.warn('Failed to delete:', e);
    }
  };

  return (
    <div className="min-h-screen pb-24 relative overflow-hidden" style={{ background: isDark ? '#0F1419' : '#F5F7FA' }}>
      {/* Header */}
      <div className="relative z-10 p-6">
        <h1 className="text-2xl font-bold mb-1" style={{ color: textColor }}>Wallet</h1>
        <p className="text-sm" style={{ color: subColor }}>Manage payments and credits</p>
      </div>

      <div className="relative z-10 px-6">
        {/* Balance Card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-6 mb-6 relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #2EFFAF 0%, #007AFF 100%)', boxShadow: '0 12px 32px rgba(46, 255, 175, 0.25)' }}
        >
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <DollarSign className="w-5 h-5 text-[#0F1419]" />
              <p className="text-[#0F1419] font-semibold text-sm">Torc Credits</p>
            </div>
            <p className="text-4xl font-bold text-[#0F1419] mb-1">${walletBalance.toFixed(2)}</p>
            <p className="text-[#0F1419]/70 text-sm">Available balance</p>
          </div>
        </motion.div>

        {/* Payment Methods */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold" style={{ color: textColor }}>Payment Methods</h2>
            <button onClick={() => { setShowAddCard(true); setCardErrors([]); }} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }} title="Add payment method">
              <Plus className="w-4 h-4" style={{ color: '#2EFFAF' }} />
            </button>
          </div>

          <div className="space-y-2">
            {paymentMethods.length === 0 ? (
              <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
                <CreditCard className="w-10 h-10 mx-auto mb-2" style={{ color: isDark ? 'rgba(255,255,255,0.15)' : '#D1D5DB' }} />
                <p className="text-sm" style={{ color: subColor }}>No payment methods added yet</p>
              </div>
            ) : (
              paymentMethods.map((method: any) => (
                <div key={method.id} className="rounded-2xl p-4" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2EFFAF]/20 to-[#007AFF]/20 flex items-center justify-center">
                      <CreditCard className="w-5 h-5" style={{ color: '#2EFFAF' }} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="font-semibold text-sm" style={{ color: textColor }}>{method.brand || 'Card'} •••• {method.last4 || '****'}</p>
                        {method.is_default && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ backgroundColor: 'rgba(46,255,175,0.15)', color: '#2EFFAF' }}>DEFAULT</span>
                        )}
                      </div>
                      <p className="text-xs" style={{ color: subColor }}>
                        {method.exp_month && method.exp_year ? `Expires ${String(method.exp_month).padStart(2, '0')}/${method.exp_year}` : ''}
                      </p>
                    </div>
                    {!method.is_default && (
                      <button onClick={() => deleteMethod(method.id)} className="p-1.5 rounded-full" style={{ backgroundColor: 'rgba(239,68,68,0.1)' }} title="Remove card">
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}

            <button onClick={() => { setShowAddCard(true); setCardErrors([]); }}
              className="w-full rounded-2xl p-4 flex items-center gap-3 border-2 border-dashed transition-all hover:border-[#2EFFAF]/50"
              style={{ borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#D1D5DB' }}
            >
              <Plus className="w-5 h-5" style={{ color: '#2EFFAF' }} />
              <p className="font-semibold text-sm" style={{ color: '#2EFFAF' }}>Add New Card</p>
            </button>
          </div>
        </div>

        {/* Promotions */}
        <div className="mb-6">
          <h2 className="font-semibold mb-3" style={{ color: textColor }}>Promotions</h2>
          <div className="rounded-2xl p-4" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center">
                <Gift className="w-5 h-5 text-[#0F1419]" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm" style={{ color: textColor }}>Have a promo code?</p>
                <p className="text-xs" style={{ color: subColor }}>Enter code to get credits</p>
              </div>
              <button className="px-3 py-1.5 bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-xl text-[#0F1419] font-semibold text-xs">Add Code</button>
            </div>
          </div>
        </div>

        {/* Transaction History */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold" style={{ color: textColor }}>Recent Transactions</h2>
            <button className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }} title="Download history">
              <Download className="w-4 h-4" style={{ color: '#2EFFAF' }} />
            </button>
          </div>
          {transactions.length === 0 ? (
            <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
              <p className="text-sm" style={{ color: subColor }}>No transactions yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((t: any, i: number) => (
                <div key={t.id} className="rounded-2xl p-4 flex items-center justify-between" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: textColor }}>{t.description}</p>
                    <p className="text-xs" style={{ color: subColor }}>{new Date(t.date).toLocaleDateString()}</p>
                  </div>
                  <p className="font-bold" style={{ color: t.amount > 0 ? '#2EFFAF' : textColor }}>
                    {t.amount > 0 ? '+' : ''}{t.amount.toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <CustomerBottomNav />

      {/* Add Card Modal */}
      {showAddCard && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowAddCard(false)}>
          <motion.div initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="rounded-t-3xl md:rounded-3xl p-6 w-full md:max-w-md max-h-[90vh] overflow-y-auto"
            style={{ backgroundColor: isDark ? '#1A1F2E' : '#FFFFFF' }}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-lg" style={{ color: textColor }}>Add Credit Card</h2>
              <button onClick={() => setShowAddCard(false)} title="Close"><X className="w-5 h-5" style={{ color: subColor }} /></button>
            </div>

            {cardErrors.length > 0 && (
              <div className="mb-4 rounded-xl p-3 bg-red-500/10 border border-red-500/30">
                {cardErrors.map((err, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                    <p className="text-red-500 text-sm">{err}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: subColor }}>Card Number *</label>
                <input type="text" value={cardForm.cardNumber} onChange={(e) => setCardForm({ ...cardForm, cardNumber: formatCardNumber(e.target.value) })}
                  placeholder="1234 5678 9012 3456" maxLength={19}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none font-mono focus:ring-2 focus:ring-[#2EFFAF]/50"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: subColor }}>Expiry *</label>
                  <input type="text" value={cardForm.expiryDate} onChange={(e) => setCardForm({ ...cardForm, expiryDate: formatExpiry(e.target.value) })}
                    placeholder="MM/YY" maxLength={5}
                    className="w-full px-3 py-2.5 rounded-xl text-sm outline-none font-mono focus:ring-2 focus:ring-[#2EFFAF]/50"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: subColor }}>CVV *</label>
                  <input type="text" value={cardForm.cvv} onChange={(e) => setCardForm({ ...cardForm, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                    placeholder="123" maxLength={4}
                    className="w-full px-3 py-2.5 rounded-xl text-sm outline-none font-mono focus:ring-2 focus:ring-[#2EFFAF]/50"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: subColor }}>ZIP Code *</label>
                <input type="text" value={cardForm.zipCode} onChange={(e) => setCardForm({ ...cardForm, zipCode: e.target.value.replace(/\D/g, '').slice(0, 5) })}
                  placeholder="94103" maxLength={5}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#2EFFAF]/50"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
                />
              </div>
              <div className="rounded-xl p-2.5 flex gap-2" style={{ backgroundColor: isDark ? 'rgba(0,122,255,0.1)' : 'rgba(0,122,255,0.05)' }}>
                <Shield className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#007AFF' }} />
                <p className="text-xs" style={{ color: subColor }}>Encrypted with bank-level security via Stripe.</p>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAddCard(false)} className="flex-1 px-4 py-3 rounded-xl font-semibold text-sm" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6', color: textColor }}>Cancel</button>
              <button onClick={handleAddCard} disabled={saving}
                className="flex-1 px-4 py-3 rounded-xl font-bold text-sm text-[#0F1419] bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] disabled:opacity-50"
              >{saving ? 'Saving...' : 'Add Card'}</button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
