import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { CreditCard, Plus, Check, DollarSign, AlertCircle, Shield, X } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { getRequestContext, updateRequestContext } from '../../data/requestContext';
import { loadPlatformSettings } from '../../lib/platformSettings';
import { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardNumberElement, CardExpiryElement, CardCvcElement, useElements, useStripe } from '@stripe/react-stripe-js';
import type { StripeCardNumberElementOptions, PaymentMethod } from '@stripe/stripe-js';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

interface AddCardFormProps {
  onCancel: () => void;
  onSubmit: (paymentMethod: PaymentMethod) => Promise<void>;
  saving: boolean;
  isDark: boolean;
  textColor: string;
  subColor: string;
  inputBg: string;
  inputBorder: string;
  submitLabel?: string;
  cancelLabel?: string;
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
  submitLabel = 'Save Card',
  cancelLabel = 'Cancel',
}: AddCardFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  const elementStyle: StripeCardNumberElementOptions['style'] = {
    base: {
      color: isDark ? '#FFFFFF' : '#1F2937',
      fontSize: '15px',
      '::placeholder': { color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' },
    },
    invalid: { color: '#EF4444' },
  };

  async function submit() {
    if (!stripe || !elements) {
      setErrors(['Stripe is still loading. Please wait a moment and try again.']);
      return;
    }

    const cardNumber = elements.getElement(CardNumberElement);
    if (!cardNumber) {
      setErrors(['Card input not ready.']);
      return;
    }

    setErrors([]);
    const result = await stripe.createPaymentMethod({
      type: 'card',
      card: cardNumber,
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
      <div className="space-y-3">
        {errors.length > 0 && (
          <div className="rounded-xl p-3 bg-red-500/10 border border-red-500/30">
            {errors.map((err, i) => (
              <div key={i} className="flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                <p className="text-red-500 text-sm">{err}</p>
              </div>
            ))}
          </div>
        )}
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: subColor }}>Cardholder Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name on card"
            className="w-full px-3 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#008CE5]/50"
            style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
          />
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: subColor }}>Card Number *</label>
          <div
            className="w-full px-3 py-3 rounded-xl"
            style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}
            onClick={() => elements?.getElement(CardNumberElement)?.focus()}
          >
            <CardNumberElement options={{ style: elementStyle, showIcon: true }} />
          </div>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-xs font-medium mb-1 block" style={{ color: subColor }}>Expiry *</label>
            <div
              className="w-full px-3 py-3 rounded-xl"
              style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}
              onClick={() => elements?.getElement(CardExpiryElement)?.focus()}
            >
              <CardExpiryElement options={{ style: elementStyle }} />
            </div>
          </div>
          <div className="flex-1">
            <label className="text-xs font-medium mb-1 block" style={{ color: subColor }}>CVC *</label>
            <div
              className="w-full px-3 py-3 rounded-xl"
              style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}
              onClick={() => elements?.getElement(CardCvcElement)?.focus()}
            >
              <CardCvcElement options={{ style: elementStyle }} />
            </div>
          </div>
        </div>
        <div className="rounded-xl p-2.5 flex gap-2" style={{ backgroundColor: isDark ? 'rgba(0,122,255,0.1)' : 'rgba(0,122,255,0.05)' }}>
          <Shield className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#0070B8' }} />
          <p className="text-xs" style={{ color: subColor }}>Card details are tokenized by Stripe and never stored as raw numbers.</p>
        </div>
      </div>

      <div className="flex gap-3 mt-5">
        <button onClick={onCancel} className="flex-1 px-4 py-3 rounded-xl font-semibold text-sm" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E8F0FB', color: textColor }}>
          {cancelLabel}
        </button>
        <button
          onClick={submit}
          disabled={saving}
          className="flex-1 px-4 py-3 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-[#008CE5] to-[#0070B8] disabled:opacity-50"
        >
          {saving ? 'Processing...' : submitLabel}
        </button>
      </div>
    </>
  );
}

export function PricingPayment() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const context = getRequestContext();

  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<string | null>(null);
  const [saveCard, setSaveCard] = useState(false);
  const [tempPaymentMethod, setTempPaymentMethod] = useState<PaymentMethod | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [showAddCard, setShowAddCard] = useState(false);
  const [saving, setSaving] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [taxRate, setTaxRate] = useState(8);

  const textColor = isDark ? '#FFFFFF' : '#14263D';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2';
  const inputBg = isDark ? 'rgba(255,255,255,0.05)' : '#F5F9FF';
  const inputBorder = isDark ? 'rgba(255,255,255,0.1)' : '#D3E0F2';

  useEffect(() => {
    if (!user) return;
    fetchPaymentMethods();
    loadPlatformSettings().then(s => setTaxRate(s.tax_rate)).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!context.serviceId) navigate('/service-selection');
  }, [context.serviceId, navigate]);

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

  const handleAddCard = async (paymentMethod: PaymentMethod) => {
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
      setShowAddCard(false);
      await fetchPaymentMethods();
    } finally {
      setSaving(false);
    }
  };

  const basePrice = Number(context.serviceBasePrice || 0);
  const hazardFee = context.isHazardous ? 15 : 0;
  const schedulingFee = context.scheduledFor ? 5 : 0;
  const subtotal = basePrice + hazardFee + schedulingFee;
  const tax = subtotal * (taxRate / 100);
  const total = subtotal + tax;

  const handleInlineCard = async (paymentMethod: PaymentMethod) => {
    setTempPaymentMethod(paymentMethod);
  };

  const handleConfirm = async () => {
    let stripePaymentMethodId: string | null = null;

    if (tempPaymentMethod) {
      stripePaymentMethodId = tempPaymentMethod.id;
    } else if (selectedPayment && paymentMethods.length > 0) {
      const selected = paymentMethods.find((m: any) => m.id === selectedPayment);
      stripePaymentMethodId = selected?.stripe_payment_method_id || null;
      if (!stripePaymentMethodId) {
        setErrors(['Selected payment method is not linked to Stripe. Please add the card again.']);
        return;
      }
    } else {
      setErrors(['Please enter your card details to continue']);
      return;
    }

    try {
      setProcessingPayment(true);
      setErrors([]);

      // Get a fresh token via refresh, fallback to current session
      const { data: refreshData } = await supabase.auth.refreshSession();
      let token = refreshData?.session?.access_token;
      if (!token) {
        const { data: { session } } = await supabase.auth.getSession();
        token = session?.access_token;
      }
      if (!token) throw new Error('Please sign in again to continue.');

      // Direct fetch to guarantee the fresh token is used (--no-verify-jwt deployed)
      const fnRes = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-payment-intent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            amount: Number(total.toFixed(2)),
            currency: 'usd',
            paymentMethodId: stripePaymentMethodId,
            savePaymentMethod: saveCard,
            metadata: {
              service_id: context.serviceId,
              flow: 'customer_checkout',
            },
          }),
        }
      );
      const data = await fnRes.json();
      if (!fnRes.ok) throw new Error(data?.error || `Payment failed (${fnRes.status})`);
      if (!data?.clientSecret) throw new Error(data?.error || 'Missing client secret from payment intent.');

      const stripe = await stripePromise;
      if (!stripe) throw new Error('Stripe is not available right now.');

      const confirmResult = await stripe.confirmCardPayment(data.clientSecret, {
        payment_method: stripePaymentMethodId,
      });

      if (confirmResult.error) {
        throw new Error(confirmResult.error.message || 'Payment confirmation failed.');
      }

      const paymentIntent = confirmResult.paymentIntent;
      if (!paymentIntent || paymentIntent.status !== 'succeeded') {
        throw new Error(`Payment not completed (status: ${paymentIntent?.status || 'unknown'}).`);
      }

      // Save card to DB only if user opted in
      if (saveCard && tempPaymentMethod) {
        const card = tempPaymentMethod.card;
        await supabase.from('payment_methods').insert({
          user_id: user.id,
          type: 'card',
          brand: card?.brand ? card.brand[0].toUpperCase() + card.brand.slice(1) : 'Card',
          last4: card?.last4 || null,
          exp_month: card?.exp_month || null,
          exp_year: card?.exp_year || null,
          stripe_payment_method_id: tempPaymentMethod.id,
          is_default: true,
        });
      }

      updateRequestContext({
        paymentMethodId: selectedPayment || null,
        estimatedPrice: total,
        paymentIntentId: paymentIntent.id,
        paymentStatus: 'paid',
        paymentCurrency: (paymentIntent.currency || 'usd').toUpperCase(),
      });
      navigate('/matching');
    } catch (e: any) {
      setErrors([e?.message || 'Could not process payment right now.']);
      setProcessingPayment(false);
    }
  };

  return (
    <div className="h-screen flex flex-col relative" style={{ background: isDark ? 'linear-gradient(180deg, #0A1626 0%, #081427 100%)' : 'linear-gradient(180deg, #F8FBFF 0%, #EAF2FF 100%)' }}>
      <PageHeader title="Review & Pay" />

      <div className="relative z-10 flex-1 px-6 overflow-y-auto overscroll-contain" style={{ paddingTop: 'calc(var(--safe-top) + 64px)', paddingBottom: 'calc(140px + env(safe-area-inset-bottom, 0px))' }}>
        {/* Price breakdown */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-5 mb-6" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
        >
          <div className="flex items-center gap-2 mb-5">
            <DollarSign className="w-5 h-5" style={{ color: '#008CE5' }} />
            <h2 className="font-semibold" style={{ color: textColor }}>Price Estimate</h2>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: subColor }}>{context.serviceName || 'Selected service'}</span>
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
                <span className="font-bold text-xl" style={{ color: '#008CE5' }}>${total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl p-3" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F5F9FF' }}>
            <p className="text-xs" style={{ color: subColor }}>Final price may vary based on actual time and distance</p>
          </div>
        </motion.div>

        {/* Payment methods */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="w-5 h-5" style={{ color: '#008CE5' }} />
            <p className="font-semibold" style={{ color: textColor }}>Payment Method</p>
          </div>

          {paymentMethods.length === 0 && !tempPaymentMethod ? (
            <div className="rounded-2xl p-5 mb-3" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
              <div className="text-center mb-4">
                <CreditCard className="w-10 h-10 mx-auto mb-2" style={{ color: isDark ? 'rgba(255,255,255,0.15)' : '#D1D5DB' }} />
                <p className="text-sm font-medium" style={{ color: textColor }}>Enter card details</p>
                <p className="text-xs mt-1" style={{ color: subColor }}>Your card is securely processed by Stripe</p>
              </div>
              <Elements stripe={stripePromise}>
                <AddCardForm
                  onCancel={() => navigate(-1)}
                  onSubmit={handleInlineCard}
                  saving={saving}
                  isDark={isDark}
                  textColor={textColor}
                  subColor={subColor}
                  inputBg={inputBg}
                  inputBorder={inputBorder}
                  submitLabel="Continue"
                  cancelLabel="Go Back"
                />
              </Elements>
            </div>
          ) : paymentMethods.length === 0 && tempPaymentMethod ? (
            <div className="space-y-3 mb-3">
              <div className="w-full rounded-2xl p-4 flex items-center gap-3"
                style={{
                  backgroundColor: isDark ? 'rgba(78,205,196,0.12)' : 'rgba(78,205,196,0.08)',
                  border: '2px solid #008CE5',
                  boxShadow: '0 4px 16px rgba(78,205,196,0.25)',
                }}
              >
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(78,205,196,0.2)' }}>
                  <CreditCard className="w-5 h-5" style={{ color: '#008CE5' }} />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-semibold" style={{ color: textColor }}>
                    {tempPaymentMethod.card?.brand ? tempPaymentMethod.card.brand[0].toUpperCase() + tempPaymentMethod.card.brand.slice(1) : 'Card'} •••• {tempPaymentMethod.card?.last4 || '****'}
                  </p>
                </div>
                <button onClick={() => setTempPaymentMethod(null)} className="text-xs font-semibold px-3 py-1 rounded-lg" style={{ color: '#008CE5', backgroundColor: isDark ? 'rgba(0,140,229,0.15)' : 'rgba(0,140,229,0.1)' }}>
                  Change
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 mb-3">
              {paymentMethods.map((method: any) => {
                const isSelected = selectedPayment === method.id;
                return (
                  <motion.button key={method.id} whileTap={{ scale: 0.97 }}
                    onClick={() => setSelectedPayment(method.id)}
                    className="w-full rounded-2xl p-4 flex items-center gap-3 transition-all active:opacity-80"
                    style={{
                      backgroundColor: isSelected ? (isDark ? 'rgba(78,205,196,0.12)' : 'rgba(78,205,196,0.08)') : cardBg,
                      border: `2px solid ${isSelected ? '#008CE5' : cardBorder}`,
                      boxShadow: isSelected ? '0 4px 16px rgba(78,205,196,0.25)' : 'none',
                    }}
                  >
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: isSelected ? 'rgba(78,205,196,0.2)' : (isDark ? 'rgba(255,255,255,0.05)' : '#E8F0FB') }}>
                      <CreditCard className="w-5 h-5" style={{ color: isSelected ? '#008CE5' : subColor }} />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-semibold" style={{ color: textColor }}>{method.brand || 'Card'} •••• {method.last4 || '****'}</p>
                      {method.is_default && <p className="text-xs mt-0.5 font-medium" style={{ color: '#008CE5' }}>Default</p>}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        (async () => {
                          await supabase.from('payment_methods').delete().eq('id', method.id);
                          await fetchPaymentMethods();
                          if (selectedPayment === method.id) setSelectedPayment(null);
                        })();
                      }}
                      className="text-xs font-semibold px-2 py-1 rounded-lg mr-2"
                      style={{ color: '#EF4444', backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.1)' }}
                    >
                      Remove
                    </button>
                    <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center" style={{
                      borderColor: isSelected ? '#008CE5' : (isDark ? 'rgba(255,255,255,0.25)' : '#D1D5DB'),
                      backgroundColor: isSelected ? '#008CE5' : 'transparent',
                    }}>
                      {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}

          {paymentMethods.length > 0 && (
            <button onClick={() => { setShowAddCard(true); }}
              className="w-full rounded-2xl p-4 flex items-center gap-3 border-2 border-dashed transition-all hover:border-[#008CE5]/50"
              style={{ borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#D1D5DB' }}
            >
              <Plus className="w-5 h-5" style={{ color: '#008CE5' }} />
              <p className="font-semibold text-sm" style={{ color: '#008CE5' }}>Add New Card</p>
            </button>
          )}
        </div>

        {/* Save card toggle - only shown for one-time card use */}
        {tempPaymentMethod && (
          <button onClick={() => setSaveCard(!saveCard)} className="w-full rounded-2xl p-4 flex items-center gap-3 mb-6" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
            <div className="w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors" style={{ borderColor: saveCard ? '#008CE5' : subColor, backgroundColor: saveCard ? '#008CE5' : 'transparent' }}>
              {saveCard && <Check className="w-3 h-3 text-white" />}
            </div>
            <p className="font-semibold text-sm flex-1 text-left" style={{ color: textColor }}>Save card for future use</p>
          </button>
        )}

        {/* Inline errors */}
        {errors.length > 0 && (
          <div className="mb-4 rounded-xl p-3 bg-red-500/10 border border-red-500/30">
            {errors.map((err, i) => (
              <div key={i} className="flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                <p className="text-red-500 text-sm">{err}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fixed bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-20 px-6 py-4" style={{ backgroundColor: isDark ? '#0A1626' : '#FFFFFF', borderTop: `1px solid ${cardBorder}`, paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm" style={{ color: subColor }}>Total Amount</span>
          <span className="font-bold text-xl" style={{ color: '#008CE5' }}>${total.toFixed(2)}</span>
        </div>
        <button onClick={handleConfirm}
          disabled={processingPayment}
          className="torc-btn-primary"
          style={processingPayment ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
        >
          {processingPayment ? 'Processing Payment...' : 'Confirm & Request'}
        </button>
      </div>

      {/* Add Card Modal */}
      {showAddCard && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowAddCard(false)}>
          <motion.div initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="rounded-t-3xl md:rounded-3xl p-6 w-full md:max-w-md max-h-[90vh] overflow-y-auto"
            style={{ backgroundColor: isDark ? '#14263D' : '#FFFFFF' }}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-lg" style={{ color: textColor }}>Add Credit Card</h2>
              <button onClick={() => setShowAddCard(false)} title="Close"><X className="w-5 h-5" style={{ color: subColor }} /></button>
            </div>
            <Elements stripe={stripePromise}>
              <AddCardForm
                onCancel={() => setShowAddCard(false)}
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
