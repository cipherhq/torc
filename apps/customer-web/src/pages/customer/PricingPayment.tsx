import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, CreditCard, Plus, Check, DollarSign, AlertCircle, Shield, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { getRequestContext, updateRequestContext } from '../../data/requestContext';
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
        <button onClick={onCancel} className="flex-1 px-4 py-3 rounded-xl font-semibold text-sm" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F5F2ED', color: textColor }}>
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={saving}
          className="flex-1 px-4 py-3 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-[#008CE5] to-[#0070B8] disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Card'}
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
  const [errors, setErrors] = useState<string[]>([]);
  const [showAddCard, setShowAddCard] = useState(false);
  const [saving, setSaving] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);

  const textColor = isDark ? '#FFFFFF' : '#1A1F2E';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E8E4DE';
  const inputBg = isDark ? 'rgba(255,255,255,0.05)' : '#FDFBF8';
  const inputBorder = isDark ? 'rgba(255,255,255,0.1)' : '#E8E4DE';

  useEffect(() => {
    if (!user) return;
    fetchPaymentMethods();
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
  const hazardFee = context.isHazardLocation ? 15 : 0;
  const schedulingFee = context.scheduledFor ? 5 : 0;
  const subtotal = basePrice + hazardFee + schedulingFee;
  const tax = subtotal * 0.08;
  const total = subtotal + tax;

  const handleConfirm = async () => {
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

    const selected = paymentMethods.find((m: any) => m.id === selectedPayment);
    const stripePaymentMethodId = selected?.stripe_payment_method_id;
    if (!stripePaymentMethodId) {
      setErrors(['Selected payment method is not linked to Stripe. Please add the card again.']);
      return;
    }

    try {
      setProcessingPayment(true);
      setErrors([]);

      const { data, error } = await supabase.functions.invoke('create-payment-intent', {
        body: {
          amount: Number(total.toFixed(2)),
          currency: 'usd',
          paymentMethodId: stripePaymentMethodId,
          savePaymentMethod: saveCard,
          metadata: {
            service_id: context.serviceId,
            flow: 'customer_checkout',
          },
        },
      });
      if (error) {
        // Extract the real error from edge function response
        // supabase-js v2: error.context is the parsed response body
        const ctx = error.context;
        const msg = ctx?.error || ctx?.message || data?.error || error.message;
        throw new Error(msg);
      }
      if (!data?.clientSecret) throw new Error('Missing client secret from payment intent.');

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

      updateRequestContext({
        paymentMethodId: selectedPayment,
        estimatedPrice: total,
        paymentIntentId: paymentIntent.id,
        paymentStatus: 'paid',
        paymentCurrency: (paymentIntent.currency || 'usd').toUpperCase(),
      });
      navigate('/matching');
    } catch (e: any) {
      setErrors([e?.message || 'Could not process payment right now.']);
    } finally {
      setProcessingPayment(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden" style={{ background: isDark ? '#0F1419' : '#FAF8F5' }}>
      {/* Header */}
      <div className="relative z-10 p-6 flex items-center gap-4" style={{ paddingTop: 'var(--safe-top)' }}>
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

          <div className="mt-4 rounded-xl p-3" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#FDFBF8' }}>
            <p className="text-xs" style={{ color: subColor }}>Final price may vary based on actual time and distance</p>
          </div>
        </motion.div>

        {/* Payment methods */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="w-5 h-5" style={{ color: '#008CE5' }} />
            <p className="font-semibold" style={{ color: textColor }}>Payment Method</p>
          </div>

          {paymentMethods.length === 0 ? (
            <div className="rounded-2xl p-5 mb-3 text-center" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
              <CreditCard className="w-10 h-10 mx-auto mb-2" style={{ color: isDark ? 'rgba(255,255,255,0.15)' : '#D1D5DB' }} />
              <p className="text-sm" style={{ color: subColor }}>Add a payment method to continue</p>
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
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: isSelected ? 'rgba(78,205,196,0.2)' : (isDark ? 'rgba(255,255,255,0.05)' : '#F5F2ED') }}>
                      <CreditCard className="w-5 h-5" style={{ color: isSelected ? '#008CE5' : subColor }} />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-semibold" style={{ color: textColor }}>{method.brand || 'Card'} •••• {method.last4 || '****'}</p>
                      {method.is_default && <p className="text-xs mt-0.5 font-medium" style={{ color: '#008CE5' }}>Default</p>}
                    </div>
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

          <button onClick={() => { setShowAddCard(true); }}
            className="w-full rounded-2xl p-4 flex items-center gap-3 border-2 border-dashed transition-all hover:border-[#008CE5]/50"
            style={{ borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#D1D5DB' }}
          >
            <Plus className="w-5 h-5" style={{ color: '#008CE5' }} />
            <p className="font-semibold text-sm" style={{ color: '#008CE5' }}>Add New Card</p>
          </button>
        </div>

        {/* Save card toggle */}
        <button onClick={() => setSaveCard(!saveCard)} className="w-full rounded-2xl p-4 flex items-center gap-3 mb-6" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
          <div className="w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors" style={{ borderColor: saveCard ? '#008CE5' : subColor, backgroundColor: saveCard ? '#008CE5' : 'transparent' }}>
            {saveCard && <Check className="w-3 h-3 text-white" />}
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
          <span className="font-bold text-xl" style={{ color: '#008CE5' }}>${total.toFixed(2)}</span>
        </div>
        <button onClick={handleConfirm}
          disabled={processingPayment}
          className="torc-btn-primary"
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
            style={{ backgroundColor: isDark ? '#1A1F2E' : '#FFFFFF' }}
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
