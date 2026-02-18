import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, CreditCard, Plus, Check, DollarSign, AlertCircle, Shield, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { getRequestContext, updateRequestContext } from '../../data/requestContext';
import { services } from '../../data/services';
import { useState, useEffect } from 'react';

export function PricingPayment() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const context = getRequestContext();
  const service = services.find(s => s.id === context.serviceId);

  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<string | null>(null);
  const [saveCard, setSaveCard] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
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
      if (data && data.length > 0) {
        const def = data.find((m: any) => m.is_default) || data[0];
        setSelectedPayment(def.id);
      }
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

  const basePrice = service?.basePrice || 0;
  const hazardFee = context.isHazardLocation ? 15 : 0;
  const schedulingFee = context.scheduledFor ? 5 : 0;
  const subtotal = basePrice + hazardFee + schedulingFee;
  const tax = subtotal * 0.08;
  const total = subtotal + tax;

  const handleConfirm = () => {
    const validationErrors: string[] = [];
    if (!selectedPayment && paymentMethods.length > 0) {
      validationErrors.push('Please select a payment method');
    }
    if (paymentMethods.length === 0) {
      validationErrors.push('Please add a payment method to continue');
    }
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors([]);
    updateRequestContext({ paymentMethodId: selectedPayment, estimatedPrice: total });
    navigate('/matching');
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden" style={{ background: isDark ? '#0F1419' : '#F5F7FA' }}>
      {/* Header */}
      <div className="relative z-10 p-6 flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }} title="Go back">
          <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
        </button>
        <h1 className="text-xl font-bold" style={{ color: textColor }}>Review & Pay</h1>
      </div>

      <div className="relative z-10 flex-1 px-6 pb-36 overflow-y-auto">
        {/* Price breakdown */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-5 mb-6" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
        >
          <div className="flex items-center gap-2 mb-5">
            <DollarSign className="w-5 h-5" style={{ color: '#2EFFAF' }} />
            <h2 className="font-semibold" style={{ color: textColor }}>Price Estimate</h2>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: subColor }}>{service?.name}</span>
              <span className="font-semibold text-sm" style={{ color: textColor }}>${basePrice}</span>
            </div>
            {hazardFee > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: subColor }}>Hazardous Location Fee</span>
                <span className="font-semibold text-sm" style={{ color: textColor }}>${hazardFee}</span>
              </div>
            )}
            {schedulingFee > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: subColor }}>Scheduling Fee</span>
                <span className="font-semibold text-sm" style={{ color: textColor }}>${schedulingFee}</span>
              </div>
            )}
            <div className="pt-3 mt-3" style={{ borderTop: `1px solid ${cardBorder}` }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm" style={{ color: subColor }}>Subtotal</span>
                <span className="font-semibold text-sm" style={{ color: textColor }}>${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: subColor }}>Tax (8%)</span>
                <span className="font-semibold text-sm" style={{ color: textColor }}>${tax.toFixed(2)}</span>
              </div>
            </div>
            <div className="pt-3 mt-3" style={{ borderTop: `1px solid ${cardBorder}` }}>
              <div className="flex items-center justify-between">
                <span className="font-bold" style={{ color: textColor }}>Total</span>
                <span className="font-bold text-xl" style={{ color: '#2EFFAF' }}>${total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl p-3" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F9FAFB' }}>
            <p className="text-xs" style={{ color: subColor }}>Final price may vary based on actual time and distance</p>
          </div>
        </motion.div>

        {/* Payment methods */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="w-5 h-5" style={{ color: '#2EFFAF' }} />
            <p className="font-semibold" style={{ color: textColor }}>Payment Method</p>
          </div>

          {paymentMethods.length === 0 ? (
            <div className="rounded-2xl p-5 mb-3 text-center" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
              <CreditCard className="w-10 h-10 mx-auto mb-2" style={{ color: isDark ? 'rgba(255,255,255,0.15)' : '#D1D5DB' }} />
              <p className="text-sm" style={{ color: subColor }}>Add a payment method to continue</p>
            </div>
          ) : (
            <div className="space-y-2 mb-3">
              {paymentMethods.map((method: any) => (
                <button key={method.id} onClick={() => setSelectedPayment(method.id)}
                  className="w-full rounded-2xl p-4 flex items-center gap-3 transition-all"
                  style={{
                    backgroundColor: selectedPayment === method.id ? (isDark ? 'rgba(46,255,175,0.08)' : 'rgba(46,255,175,0.05)') : cardBg,
                    border: `2px solid ${selectedPayment === method.id ? '#2EFFAF' : cardBorder}`,
                  }}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: selectedPayment === method.id ? 'rgba(46,255,175,0.2)' : (isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6') }}>
                    <CreditCard className="w-5 h-5" style={{ color: selectedPayment === method.id ? '#2EFFAF' : subColor }} />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-semibold text-sm" style={{ color: textColor }}>{method.brand || 'Card'} •••• {method.last4 || '****'}</p>
                    {method.is_default && <p className="text-xs mt-0.5" style={{ color: '#2EFFAF' }}>Default</p>}
                  </div>
                  <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center" style={{ borderColor: selectedPayment === method.id ? '#2EFFAF' : subColor }}>
                    {selectedPayment === method.id && <div className="w-2.5 h-2.5 rounded-full bg-[#2EFFAF]" />}
                  </div>
                </button>
              ))}
            </div>
          )}

          <button onClick={() => { setShowAddCard(true); setCardErrors([]); }}
            className="w-full rounded-2xl p-4 flex items-center gap-3 border-2 border-dashed transition-all hover:border-[#2EFFAF]/50"
            style={{ borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#D1D5DB' }}
          >
            <Plus className="w-5 h-5" style={{ color: '#2EFFAF' }} />
            <p className="font-semibold text-sm" style={{ color: '#2EFFAF' }}>Add New Card</p>
          </button>
        </div>

        {/* Save card toggle */}
        <button onClick={() => setSaveCard(!saveCard)} className="w-full rounded-2xl p-4 flex items-center gap-3 mb-6" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
          <div className="w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors" style={{ borderColor: saveCard ? '#2EFFAF' : subColor, backgroundColor: saveCard ? '#2EFFAF' : 'transparent' }}>
            {saveCard && <Check className="w-3 h-3 text-[#0F1419]" />}
          </div>
          <p className="font-semibold text-sm flex-1 text-left" style={{ color: textColor }}>Save card for future use</p>
        </button>
      </div>

      {/* Fixed bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-20 p-6" style={{ backgroundColor: isDark ? '#0F1419' : '#FFFFFF', borderTop: `1px solid ${cardBorder}` }}>
        {errors.length > 0 && (
          <div className="mb-3 rounded-xl p-3 bg-red-500/10 border border-red-500/30">
            {errors.map((err, i) => (
              <div key={i} className="flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                <p className="text-red-500 text-sm">{err}</p>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm" style={{ color: subColor }}>Total Amount</span>
          <span className="font-bold text-xl" style={{ color: '#2EFFAF' }}>${total.toFixed(2)}</span>
        </div>
        <motion.button whileTap={{ scale: 0.98 }} onClick={handleConfirm}
          className="w-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-2xl py-4 font-bold text-[#0F1419] text-lg shadow-lg shadow-[#2EFFAF]/30"
        >
          Confirm & Request
        </motion.button>
      </div>

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
