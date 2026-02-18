import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Plus, CreditCard, Check, Trash2, Shield, Apple, Smartphone } from 'lucide-react';
import { useState } from 'react';

interface PaymentMethod {
  id: string;
  type: 'card' | 'apple_pay' | 'google_pay';
  last4?: string;
  brand?: string;
  expiryMonth?: string;
  expiryYear?: string;
  isDefault: boolean;
  nickname?: string;
}

export function PaymentMethods() {
  const navigate = useNavigate();
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    cardNumber: '',
    expiryDate: '',
    cvv: '',
    zipCode: '',
    nickname: '',
  });

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([
    {
      id: '1',
      type: 'card',
      brand: 'Visa',
      last4: '4242',
      expiryMonth: '12',
      expiryYear: '2027',
      isDefault: true,
      nickname: 'Personal Card',
    },
    {
      id: '2',
      type: 'apple_pay',
      isDefault: false,
    },
    {
      id: '3',
      type: 'card',
      brand: 'Mastercard',
      last4: '8888',
      expiryMonth: '06',
      expiryYear: '2026',
      isDefault: false,
      nickname: 'Business Card',
    },
  ]);

  const setDefaultMethod = (id: string) => {
    setPaymentMethods(methods =>
      methods.map(method => ({
        ...method,
        isDefault: method.id === id,
      }))
    );
  };

  const deleteMethod = (id: string) => {
    setPaymentMethods(methods => methods.filter(method => method.id !== id));
  };

  const handleAddCard = () => {
    const newCard: PaymentMethod = {
      id: Date.now().toString(),
      type: 'card',
      brand: 'Visa',
      last4: formData.cardNumber.slice(-4),
      expiryMonth: formData.expiryDate.split('/')[0],
      expiryYear: '20' + formData.expiryDate.split('/')[1],
      isDefault: paymentMethods.length === 0,
      nickname: formData.nickname || 'Credit Card',
    };

    setPaymentMethods([...paymentMethods, newCard]);
    setShowAddModal(false);
    setFormData({ cardNumber: '', expiryDate: '', cvv: '', zipCode: '', nickname: '' });
  };

  const getCardIcon = (brand?: string) => {
    return <CreditCard className="w-7 h-7 text-[#0F1419]" />;
  };

  const getMethodIcon = (method: PaymentMethod) => {
    if (method.type === 'apple_pay') return <Apple className="w-7 h-7 text-[#0F1419]" />;
    if (method.type === 'google_pay') return <Smartphone className="w-7 h-7 text-[#0F1419]" />;
    return getCardIcon(method.brand);
  };

  const getMethodDisplay = (method: PaymentMethod) => {
    if (method.type === 'apple_pay') return { title: 'Apple Pay', subtitle: 'iPhone • Apple Watch' };
    if (method.type === 'google_pay') return { title: 'Google Pay', subtitle: 'Android Device' };
    return {
      title: `${method.brand} •••• ${method.last4}`,
      subtitle: method.nickname || `Expires ${method.expiryMonth}/${method.expiryYear}`,
    };
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1E2433] via-[#252B3D] to-[#2F3548] pb-24">
      {/* Header */}
      <div className="glass-light border-b border-white/10 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto p-6">
          <div className="flex items-center gap-4 mb-2">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => navigate('/profile')}
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </motion.button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-white">Payment Methods</h1>
              <p className="text-white/70 text-sm">Manage your payment options</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Security Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-[24px] p-5 border border-[#007AFF]/30"
        >
          <div className="flex gap-3">
            <Shield className="w-5 h-5 text-[#007AFF] flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-white font-semibold mb-1">Secure Payments</h3>
              <p className="text-white/70 text-sm">
                Your payment information is encrypted and securely stored. We never share your financial data.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Add Payment Button */}
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setShowAddModal(true)}
          className="w-full glass-light rounded-[24px] p-6 border-2 border-dashed border-white/20 hover:border-[#2EFFAF]/50 transition-all"
        >
          <div className="flex items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] flex items-center justify-center">
              <Plus className="w-6 h-6 text-[#0F1419]" />
            </div>
            <span className="text-white font-semibold text-lg">Add Payment Method</span>
          </div>
        </motion.button>

        {/* Payment Methods List */}
        {paymentMethods.length > 0 ? (
          <div className="space-y-4">
            {paymentMethods.map((method, index) => {
              const display = getMethodDisplay(method);
              return (
                <motion.div
                  key={method.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + index * 0.1 }}
                  className={`glass-light rounded-[24px] p-6 border-2 ${
                    method.isDefault ? 'border-[#2EFFAF]/50' : 'border-white/10'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center flex-shrink-0">
                      {getMethodIcon(method)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="text-white font-bold text-lg">{display.title}</h3>
                          <p className="text-white/60 text-sm">{display.subtitle}</p>
                        </div>
                        {method.isDefault && (
                          <span className="px-3 py-1 rounded-full bg-[#2EFFAF]/20 text-[#2EFFAF] text-xs font-semibold flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            Default
                          </span>
                        )}
                      </div>

                      <div className="flex gap-2 mt-4">
                        {!method.isDefault && (
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setDefaultMethod(method.id)}
                            className="px-4 py-2 rounded-[16px] bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0F1419] font-semibold text-sm"
                          >
                            Set as Default
                          </motion.button>
                        )}
                        {!method.isDefault && (
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => deleteMethod(method.id)}
                            className="px-4 py-2 rounded-[16px] bg-red-400/20 text-red-400 font-semibold text-sm flex items-center gap-2"
                          >
                            <Trash2 className="w-4 h-4" />
                            Remove
                          </motion.button>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <CreditCard className="w-16 h-16 text-white/20 mx-auto mb-4" />
            <p className="text-white/60">No payment methods added yet</p>
          </motion.div>
        )}

        {/* Default Payment Info */}
        {paymentMethods.some(m => m.isDefault) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-[24px] p-5"
          >
            <p className="text-white/70 text-sm">
              💳 Your default payment method will be charged automatically after each service is completed.
            </p>
          </motion.div>
        )}
      </div>

      {/* Add Card Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-light rounded-t-[32px] md:rounded-[32px] p-6 w-full md:max-w-lg max-h-[90vh] overflow-y-auto"
          >
            <h2 className="text-white font-bold text-2xl mb-6">Add Credit Card</h2>

            <div className="space-y-4">
              <div>
                <label className="text-white/70 text-sm mb-2 block">Card Number</label>
                <input
                  type="text"
                  value={formData.cardNumber}
                  onChange={(e) => setFormData({ ...formData, cardNumber: e.target.value })}
                  placeholder="1234 5678 9012 3456"
                  maxLength={19}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-[16px] text-white placeholder-white/40 focus:outline-none focus:border-[#2EFFAF]/50 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-white/70 text-sm mb-2 block">Expiry Date</label>
                  <input
                    type="text"
                    value={formData.expiryDate}
                    onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                    placeholder="MM/YY"
                    maxLength={5}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-[16px] text-white placeholder-white/40 focus:outline-none focus:border-[#2EFFAF]/50 font-mono"
                  />
                </div>
                <div>
                  <label className="text-white/70 text-sm mb-2 block">CVV</label>
                  <input
                    type="text"
                    value={formData.cvv}
                    onChange={(e) => setFormData({ ...formData, cvv: e.target.value })}
                    placeholder="123"
                    maxLength={4}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-[16px] text-white placeholder-white/40 focus:outline-none focus:border-[#2EFFAF]/50 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-white/70 text-sm mb-2 block">ZIP Code</label>
                <input
                  type="text"
                  value={formData.zipCode}
                  onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                  placeholder="94103"
                  maxLength={10}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-[16px] text-white placeholder-white/40 focus:outline-none focus:border-[#2EFFAF]/50"
                />
              </div>

              <div>
                <label className="text-white/70 text-sm mb-2 block">Nickname (Optional)</label>
                <input
                  type="text"
                  value={formData.nickname}
                  onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                  placeholder="Personal Card"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-[16px] text-white placeholder-white/40 focus:outline-none focus:border-[#2EFFAF]/50"
                />
              </div>

              {/* Security Notice */}
              <div className="glass rounded-[16px] p-4 border border-[#007AFF]/30">
                <div className="flex gap-3">
                  <Shield className="w-5 h-5 text-[#007AFF] flex-shrink-0" />
                  <p className="text-white/70 text-xs">
                    Your card information is encrypted with bank-level security. We use Stripe for secure payment processing.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-6 py-3 rounded-[20px] bg-white/10 text-white font-semibold"
              >
                Cancel
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleAddCard}
                className="flex-1 px-6 py-3 rounded-[20px] bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0F1419] font-bold"
              >
                Add Card
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
