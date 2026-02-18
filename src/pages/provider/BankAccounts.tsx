import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Plus, CreditCard, Check, Trash2, Building2, Shield } from 'lucide-react';
import { useState } from 'react';

interface BankAccount {
  id: string;
  bankName: string;
  accountType: 'checking' | 'savings';
  last4: string;
  isDefault: boolean;
  status: 'verified' | 'pending' | 'failed';
  addedDate: string;
}

export function ProviderBankAccounts() {
  const navigate = useNavigate();
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    accountHolderName: '',
    routingNumber: '',
    accountNumber: '',
    confirmAccountNumber: '',
    accountType: 'checking',
    bankName: '',
  });

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([
    {
      id: '1',
      bankName: 'Chase Bank',
      accountType: 'checking',
      last4: '4532',
      isDefault: true,
      status: 'verified',
      addedDate: 'Jan 15, 2025',
    },
    {
      id: '2',
      bankName: 'Wells Fargo',
      accountType: 'savings',
      last4: '8821',
      isDefault: false,
      status: 'verified',
      addedDate: 'Jan 20, 2025',
    },
  ]);

  const setDefaultAccount = (id: string) => {
    setBankAccounts(accounts =>
      accounts.map(account => ({
        ...account,
        isDefault: account.id === id,
      }))
    );
  };

  const deleteAccount = (id: string) => {
    setBankAccounts(accounts => accounts.filter(account => account.id !== id));
  };

  const handleAddAccount = () => {
    // Validation
    if (formData.accountNumber !== formData.confirmAccountNumber) {
      alert('Account numbers do not match');
      return;
    }

    const newAccount: BankAccount = {
      id: Date.now().toString(),
      bankName: formData.bankName,
      accountType: formData.accountType as 'checking' | 'savings',
      last4: formData.accountNumber.slice(-4),
      isDefault: bankAccounts.length === 0,
      status: 'pending',
      addedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    };

    setBankAccounts([...bankAccounts, newAccount]);
    setShowAddModal(false);
    setFormData({
      accountHolderName: '',
      routingNumber: '',
      accountNumber: '',
      confirmAccountNumber: '',
      accountType: 'checking',
      bankName: '',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'verified': return 'text-[#2EFFAF] bg-[#2EFFAF]/20';
      case 'pending': return 'text-yellow-400 bg-yellow-400/20';
      case 'failed': return 'text-red-400 bg-red-400/20';
      default: return 'text-white/60 bg-white/10';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0F1419] via-[#1A1F2E] to-[#252B3D] pb-24">
      {/* Header */}
      <div className="glass-light border-b border-white/10 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto p-6">
          <div className="flex items-center gap-4 mb-2">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => navigate('/provider/profile')}
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </motion.button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-white">Bank Accounts</h1>
              <p className="text-white/60 text-sm">Manage payout destinations</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Info Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-[24px] p-5 border border-[#007AFF]/30"
        >
          <div className="flex gap-3">
            <Shield className="w-5 h-5 text-[#007AFF] flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-white font-semibold mb-1">Secure & Encrypted</h3>
              <p className="text-white/70 text-sm">
                Your banking information is encrypted and securely stored. We never share your financial data.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Add Account Button */}
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
            <span className="text-white font-semibold text-lg">Add Bank Account</span>
          </div>
        </motion.button>

        {/* Bank Accounts List */}
        {bankAccounts.length > 0 ? (
          <div className="space-y-4">
            {bankAccounts.map((account, index) => (
              <motion.div
                key={account.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + index * 0.1 }}
                className={`glass-light rounded-[24px] p-6 border-2 ${
                  account.isDefault ? 'border-[#2EFFAF]/50' : 'border-white/10'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-7 h-7 text-[#0F1419]" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="text-white font-bold text-lg">{account.bankName}</h3>
                        <p className="text-white/60 text-sm">
                          {account.accountType.charAt(0).toUpperCase() + account.accountType.slice(1)} •••• {account.last4}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(account.status)}`}>
                          {account.status.charAt(0).toUpperCase() + account.status.slice(1)}
                        </span>
                        {account.isDefault && (
                          <span className="px-3 py-1 rounded-full bg-[#2EFFAF]/20 text-[#2EFFAF] text-xs font-semibold flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            Default
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="text-white/50 text-sm mb-4">Added {account.addedDate}</p>

                    <div className="flex gap-2">
                      {!account.isDefault && (
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setDefaultAccount(account.id)}
                          className="px-4 py-2 rounded-[16px] bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0F1419] font-semibold text-sm"
                        >
                          Set as Default
                        </motion.button>
                      )}
                      {!account.isDefault && (
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => deleteAccount(account.id)}
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
            ))}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <CreditCard className="w-16 h-16 text-white/20 mx-auto mb-4" />
            <p className="text-white/60">No bank accounts added yet</p>
          </motion.div>
        )}

        {/* Default Account Info */}
        {bankAccounts.some(acc => acc.isDefault) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-[24px] p-5"
          >
            <p className="text-white/70 text-sm">
              💰 Your earnings will be automatically deposited to your default account within 2-3 business days after each payout period.
            </p>
          </motion.div>
        )}
      </div>

      {/* Add Account Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-light rounded-t-[32px] md:rounded-[32px] p-6 w-full md:max-w-lg max-h-[90vh] overflow-y-auto"
          >
            <h2 className="text-white font-bold text-2xl mb-6">Add Bank Account</h2>

            <div className="space-y-4">
              <div>
                <label className="text-white/70 text-sm mb-2 block">Account Holder Name</label>
                <input
                  type="text"
                  value={formData.accountHolderName}
                  onChange={(e) => setFormData({ ...formData, accountHolderName: e.target.value })}
                  placeholder="John Doe"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-[16px] text-white placeholder-white/40 focus:outline-none focus:border-[#2EFFAF]/50"
                />
              </div>

              <div>
                <label className="text-white/70 text-sm mb-2 block">Bank Name</label>
                <input
                  type="text"
                  value={formData.bankName}
                  onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                  placeholder="Chase Bank"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-[16px] text-white placeholder-white/40 focus:outline-none focus:border-[#2EFFAF]/50"
                />
              </div>

              <div>
                <label className="text-white/70 text-sm mb-2 block">Routing Number</label>
                <input
                  type="text"
                  value={formData.routingNumber}
                  onChange={(e) => setFormData({ ...formData, routingNumber: e.target.value })}
                  placeholder="123456789"
                  maxLength={9}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-[16px] text-white placeholder-white/40 focus:outline-none focus:border-[#2EFFAF]/50 font-mono"
                />
                <p className="text-white/50 text-xs mt-1">9-digit routing number</p>
              </div>

              <div>
                <label className="text-white/70 text-sm mb-2 block">Account Number</label>
                <input
                  type="text"
                  value={formData.accountNumber}
                  onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                  placeholder="000123456789"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-[16px] text-white placeholder-white/40 focus:outline-none focus:border-[#2EFFAF]/50 font-mono"
                />
              </div>

              <div>
                <label className="text-white/70 text-sm mb-2 block">Confirm Account Number</label>
                <input
                  type="text"
                  value={formData.confirmAccountNumber}
                  onChange={(e) => setFormData({ ...formData, confirmAccountNumber: e.target.value })}
                  placeholder="000123456789"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-[16px] text-white placeholder-white/40 focus:outline-none focus:border-[#2EFFAF]/50 font-mono"
                />
              </div>

              <div>
                <label className="text-white/70 text-sm mb-2 block">Account Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setFormData({ ...formData, accountType: 'checking' })}
                    className={`p-4 rounded-[16px] font-semibold transition-all ${
                      formData.accountType === 'checking'
                        ? 'bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0F1419]'
                        : 'bg-white/5 text-white border border-white/10'
                    }`}
                  >
                    Checking
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setFormData({ ...formData, accountType: 'savings' })}
                    className={`p-4 rounded-[16px] font-semibold transition-all ${
                      formData.accountType === 'savings'
                        ? 'bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0F1419]'
                        : 'bg-white/5 text-white border border-white/10'
                    }`}
                  >
                    Savings
                  </motion.button>
                </div>
              </div>

              {/* Security Notice */}
              <div className="glass rounded-[16px] p-4 border border-[#007AFF]/30">
                <div className="flex gap-3">
                  <Shield className="w-5 h-5 text-[#007AFF] flex-shrink-0" />
                  <p className="text-white/70 text-xs">
                    Your account will be verified within 1-2 business days via micro-deposits. We'll send two small deposits to your account for verification.
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
                onClick={handleAddAccount}
                className="flex-1 px-6 py-3 rounded-[20px] bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0F1419] font-bold"
              >
                Add Account
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
