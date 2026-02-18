import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, CreditCard, Plus, Check, DollarSign } from 'lucide-react';
import { mockPaymentMethods } from '../../data/mockData';
import { getRequestContext, updateRequestContext } from '../../data/requestContext';
import { services } from '../../data/services';
import { useState } from 'react';

export function PricingPayment() {
  const navigate = useNavigate();
  const context = getRequestContext();
  const service = services.find(s => s.id === context.serviceId);
  
  const [selectedPayment, setSelectedPayment] = useState(mockPaymentMethods[0].id);
  const [saveCard, setSaveCard] = useState(false);

  // Calculate pricing
  const basePrice = service?.basePrice || 0;
  const hazardFee = context.isHazardous ? 15 : 0;
  const schedulingFee = context.scheduledFor ? 5 : 0;
  const subtotal = basePrice + hazardFee + schedulingFee;
  const tax = subtotal * 0.08;
  const total = subtotal + tax;

  const handleConfirm = () => {
    updateRequestContext({
      paymentMethodId: selectedPayment,
      estimatedPrice: total,
    });
    navigate('/matching');
  };

  return (
    <div className="min-h-screen bg-[#0A0F1E] flex flex-col relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-[#2EFFAF] opacity-10 blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <div className="relative z-10 p-6 flex items-center gap-4">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate(-1)}
          className="glass rounded-full p-3"
        >
          <ArrowLeft className="w-6 h-6 text-white" />
        </motion.button>
        <h1 className="text-2xl font-bold text-white">Review & Pay</h1>
      </div>

      <div className="relative z-10 flex-1 px-6 pb-32 overflow-y-auto">
        {/* Price breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-[32px] p-6 mb-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <DollarSign className="w-6 h-6 text-[#2EFFAF]" />
            <h2 className="text-white font-semibold text-lg">Price Estimate</h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-white/80">{service?.name}</span>
              <span className="text-white font-semibold">${basePrice}</span>
            </div>
            
            {hazardFee > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-white/80">Hazardous Location Fee</span>
                <span className="text-white font-semibold">${hazardFee}</span>
              </div>
            )}
            
            {schedulingFee > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-white/80">Scheduling Fee</span>
                <span className="text-white font-semibold">${schedulingFee}</span>
              </div>
            )}

            <div className="border-t border-white/10 pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/80">Subtotal</span>
                <span className="text-white font-semibold">${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/80">Tax (8%)</span>
                <span className="text-white font-semibold">${tax.toFixed(2)}</span>
              </div>
            </div>

            <div className="border-t border-white/10 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-white font-bold text-lg">Total</span>
                <span className="text-[#2EFFAF] font-bold text-2xl">${total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 glass rounded-2xl p-4">
            <p className="text-white/60 text-sm">
              💡 Final price may vary based on actual time and distance
            </p>
          </div>
        </motion.div>

        {/* Payment methods */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-4">
            <CreditCard className="w-5 h-5 text-[#2EFFAF]" />
            <p className="text-white font-semibold">Payment Method</p>
          </div>

          <div className="space-y-3">
            {mockPaymentMethods.map((method) => (
              <motion.button
                key={method.id}
                whileTap={{ scale: 0.98 }}
                onClick={() => setSelectedPayment(method.id)}
                className={`w-full rounded-[24px] p-5 flex items-center gap-4 transition-all ${
                  selectedPayment === method.id
                    ? 'bg-gradient-to-r from-[#2EFFAF]/20 to-[#007AFF]/20 border-2 border-[#2EFFAF]'
                    : 'glass'
                }`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  selectedPayment === method.id
                    ? 'bg-gradient-to-br from-[#2EFFAF] to-[#007AFF]'
                    : 'bg-white/5'
                }`}>
                  <CreditCard className={`w-6 h-6 ${
                    selectedPayment === method.id ? 'text-[#0A0F1E]' : 'text-white/40'
                  }`} />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-white font-semibold">
                    {method.brand} •••• {method.last4}
                  </p>
                  {method.isDefault && (
                    <p className="text-[#2EFFAF] text-sm mt-1">Default</p>
                  )}
                </div>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                  selectedPayment === method.id ? 'border-[#2EFFAF]' : 'border-white/40'
                }`}>
                  {selectedPayment === method.id && (
                    <div className="w-3 h-3 rounded-full bg-[#2EFFAF]" />
                  )}
                </div>
              </motion.button>
            ))}

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full glass rounded-[24px] p-5 flex items-center gap-4 border-2 border-dashed border-white/20"
            >
              <Plus className="w-6 h-6 text-white/40" />
              <p className="text-white/60 font-semibold">Add New Card</p>
            </motion.button>
          </div>
        </div>

        {/* Save card toggle */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => setSaveCard(!saveCard)}
          className="w-full glass rounded-[24px] p-5 flex items-center gap-4 mb-6"
        >
          <div 
            className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors ${
              saveCard ? 'border-[#2EFFAF] bg-[#2EFFAF]' : 'border-white/40'
            }`}
          >
            {saveCard && <Check className="w-4 h-4 text-[#0A0F1E]" />}
          </div>
          <p className="text-white font-semibold flex-1 text-left">
            Save card for future use
          </p>
        </motion.button>
      </div>

      {/* Fixed bottom button */}
      <div className="fixed bottom-0 left-0 right-0 z-20 p-6 glass border-t border-white/10">
        <div className="flex items-center justify-between mb-4">
          <span className="text-white/80">Total Amount</span>
          <span className="text-[#2EFFAF] font-bold text-2xl">${total.toFixed(2)}</span>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleConfirm}
          className="w-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-[32px] py-5 font-bold text-[#0A0F1E] text-lg shadow-lg shadow-[#2EFFAF]/30"
        >
          Confirm & Request
        </motion.button>
      </div>
    </div>
  );
}
