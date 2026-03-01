import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Plus, CreditCard, Check, Trash2, Shield, AlertCircle, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { CustomerBottomNav } from '../../components/CustomerBottomNav';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useElements, useStripe } from '@stripe/react-stripe-js';
import type { PaymentMethod as StripePaymentMethod, StripeCardElementOptions } from '@stripe/stripe-js';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

interface SavedPaymentMethod {
  id: string;
  type: string;
  last4?: string;
  brand?: string;
  exp_month?: number;
  exp_year?: number;
  is_default: boolean;
}

interface AddCardFormProps {
  onCancel: () => void;
  onSubmit: (paymentMethod: StripePaymentMethod) => Promise<void>;
  saving: boolean;
  isDark: boolean;
  textColor: string;
  subColor: string;
  inputBg: string;
  inputBorder: string;
}

function AddCardForm({
  onCancel,
  onSubmit,
  saving,
  isDark,
  textColor,
  subColor,
  inputBg,
  inputBorder,
}: AddCardFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  const cardOptions: StripeCardElementOptions = {
    style: {
      base: {
        color: isDark ? '#FFFFFF' : '#1F2937',
        fontSize: '16px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        lineHeight: '24px',
        '::placeholder': { color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' },
      },
      invalid: { color: '#EF4444' },
    },
  };

  async function handleSubmit() {
    if (!stripe || !elements) {
      setErrors(['Stripe is still loading. Please wait a moment and try again.']);
      return;
    }
    const card = elements.getElement(CardElement);
    if (!card) {
      setErrors(['Card input is not ready.']);
      return;
    }

    setErrors([]);
    const result = await stripe.createPaymentMethod({
      type: 'card',
      card,
      billing_details: { name: name.trim() || undefined },
    });

    if (result.error) {
      setErrors([result.error.message || 'Could not verify card details.']);
      return;
    }
    if (!result.paymentMethod) {
      setErrors(['Could not create payment method.']);
      return;
    }

    try {
      await onSubmit(result.paymentMethod);
    } catch (e: any) {
      setErrors([e?.message || 'Failed to save card.']);
    }
  }

  return (
    <>
      {errors.length > 0 && (
        <div className="mb-5 rounded-xl p-4 bg-red-500/10 border border-red-500/30">
          {errors.map((err, i) => (
            <div key={i} className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-red-500 text-sm">{err}</p>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-5">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide mb-2 block" style={{ color: subColor }}>Cardholder Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name on card"
            className="w-full px-4 py-3.5 rounded-xl text-base outline-none transition-all focus:ring-2 focus:ring-[#008CE5]/40"
            style={{
              backgroundColor: inputBg,
              border: `1.5px solid ${inputBorder}`,
              color: textColor,
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            }}
          />
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wide mb-2 block" style={{ color: subColor }}>Card Details</label>
          <div
            className="w-full px-4 py-4 rounded-xl transition-all"
            style={{
              backgroundColor: inputBg,
              border: `1.5px solid ${inputBorder}`,
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            }}
          >
            <CardElement options={cardOptions} />
          </div>
          <p className="text-xs mt-2 ml-1" style={{ color: subColor }}>Card number, expiry date, and CVC</p>
        </div>

        <div
          className="rounded-xl p-4 flex gap-3"
          style={{
            backgroundColor: isDark ? 'rgba(0,140,229,0.08)' : 'rgba(0,140,229,0.04)',
            border: `1px solid ${isDark ? 'rgba(0,140,229,0.2)' : 'rgba(0,140,229,0.12)'}`,
          }}
        >
          <Shield className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#008CE5' }} />
          <p className="text-xs leading-relaxed" style={{ color: subColor }}>Your card is securely tokenized by Stripe. We never store your full card number.</p>
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button
          onClick={onCancel}
          className="flex-1 h-12 rounded-xl font-semibold text-sm active:scale-[0.98] transition-transform"
          style={{
            backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6',
            color: textColor,
            border: `1.5px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#D1D5DB'}`,
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="flex-1 h-12 rounded-xl font-bold text-sm text-white active:scale-[0.98] transition-transform disabled:opacity-50"
          style={{
            background: 'linear-gradient(135deg, #008CE5, #0070B8)',
            boxShadow: saving ? 'none' : '0 6px 16px rgba(0,140,229,0.3)',
          }}
        >
          {saving ? 'Saving...' : 'Save Card'}
        </button>
      </div>
    </>
  );
}

export function PaymentMethods() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<SavedPaymentMethod[]>([]);

  const textColor = isDark ? '#FFFFFF' : '#14263D';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2';
  const inputBg = isDark ? 'rgba(255,255,255,0.05)' : '#F5F9FF';
  const inputBorder = isDark ? 'rgba(255,255,255,0.1)' : '#D3E0F2';

  useEffect(() => {
    if (!user) return;
    void fetchPaymentMethods();
  }, [user]);

  async function fetchPaymentMethods() {
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
      setPaymentMethods([]);
    }
  }

  async function handleAddCard(paymentMethod: StripePaymentMethod) {
    if (!user) throw new Error('You need to be signed in.');
    setSaving(true);
    try {
      const card = paymentMethod.card;
      const { error } = await supabase.from('payment_methods').insert({
        user_id: user.id,
        type: 'card',
        brand: card?.brand ? card.brand[0].toUpperCase() + card.brand.slice(1) : 'Card',
        last4: card?.last4 || null,
        exp_month: card?.exp_month || null,
        exp_year: card?.exp_year || null,
        stripe_payment_method_id: paymentMethod.id,
        is_default: paymentMethods.length === 0,
      });
      if (error) throw error;
      setShowAddModal(false);
      await fetchPaymentMethods();
    } finally {
      setSaving(false);
    }
  }

  async function setDefaultMethod(id: string) {
    try {
      await supabase.from('payment_methods').update({ is_default: false }).eq('user_id', user.id);
      await supabase.from('payment_methods').update({ is_default: true }).eq('id', id);
      await fetchPaymentMethods();
    } catch (e) {
      console.warn('Failed to set default:', e);
    }
  }

  async function deleteMethod(id: string) {
    try {
      await supabase.from('payment_methods').delete().eq('id', id);
      await fetchPaymentMethods();
    } catch (e) {
      console.warn('Failed to delete method:', e);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: isDark ? 'linear-gradient(180deg, #0A1626 0%, #081427 100%)' : 'linear-gradient(180deg, #F8FBFF 0%, #EAF2FF 100%)' , paddingBottom: 'calc(96px + var(--safe-bottom, 0px))' }}>
      <div className="sticky top-0 z-10 p-6" style={{ paddingTop: 'var(--safe-top)', backgroundColor: isDark ? '#0A1626' : '#FFFFFF', borderBottom: `1px solid ${cardBorder}` }}>
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
        <div className="rounded-2xl p-4 flex gap-3" style={{ backgroundColor: isDark ? 'rgba(0,122,255,0.1)' : 'rgba(0,122,255,0.05)', border: `1px solid ${isDark ? 'rgba(0,122,255,0.3)' : 'rgba(0,122,255,0.15)'}` }}>
          <Shield className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#0070B8' }} />
          <div>
            <h3 className="font-semibold text-sm mb-1" style={{ color: textColor }}>Secure Payments</h3>
            <p className="text-xs" style={{ color: subColor }}>Cards are securely tokenized by Stripe.</p>
          </div>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="w-full rounded-2xl p-5 border-2 border-dashed flex items-center justify-center gap-3 transition-all hover:border-[#008CE5]/50"
          style={{ borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#D1D5DB' }}
        >
          <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#008CE5] to-[#0070B8] flex items-center justify-center">
            <Plus className="w-5 h-5 text-white" />
          </div>
          <span className="font-semibold" style={{ color: textColor }}>Add Payment Method</span>
        </button>

        {paymentMethods.length > 0 ? (
          <div className="space-y-3">
            {paymentMethods.map((method) => (
              <div key={method.id} className="rounded-2xl p-5" style={{ backgroundColor: cardBg, border: `2px solid ${method.is_default ? 'rgba(0,140,229,0.4)' : cardBorder}` }}>
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#008CE5] to-[#0070B8] flex items-center justify-center flex-shrink-0">
                    <CreditCard className="w-6 h-6 text-white" />
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
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1" style={{ backgroundColor: 'rgba(0,140,229,0.15)', color: '#008CE5' }}>
                          <Check className="w-3 h-3" />Default
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 mt-3">
                      {!method.is_default && (
                        <>
                          <button onClick={() => setDefaultMethod(method.id)} className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-[#008CE5] to-[#0070B8]">
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

      <CustomerBottomNav />

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowAddModal(false)}>
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="rounded-t-3xl md:rounded-3xl p-6 w-full md:max-w-md max-h-[90vh] overflow-y-auto"
            style={{ backgroundColor: isDark ? '#14263D' : '#FFFFFF' }}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#008CE5] to-[#0070B8] flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-white" />
                </div>
                <h2 className="font-bold text-xl" style={{ color: textColor }}>Add Credit Card</h2>
              </div>
              <button onClick={() => setShowAddModal(false)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6' }} title="Close">
                <X className="w-4 h-4" style={{ color: subColor }} />
              </button>
            </div>
            <Elements stripe={stripePromise}>
              <AddCardForm
                onCancel={() => setShowAddModal(false)}
                onSubmit={handleAddCard}
                saving={saving}
                isDark={isDark}
                textColor={textColor}
                subColor={subColor}
                inputBg={inputBg}
                inputBorder={inputBorder}
              />
            </Elements>
          </motion.div>
        </div>
      )}
    </div>
  );
}
