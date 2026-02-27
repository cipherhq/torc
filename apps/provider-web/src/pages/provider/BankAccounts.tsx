import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Plus, CreditCard, Check, Trash2, Building2, Shield, User, Hash, KeyRound, X, Landmark, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';

function IconBadge({ children, color = '#008CE5' }: { children: React.ReactNode; color?: string }) {
  return (
    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${color}15` }}>
      {children}
    </div>
  );
}

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
  const { isDark } = useTheme();
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    accountHolderName: '',
    routingNumber: '',
    accountNumber: '',
    confirmAccountNumber: '',
    accountType: 'checking',
    bankName: '',
  });

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

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
      case 'verified': return 'text-[#008CE5] bg-[#008CE5]/20';
      case 'pending': return 'text-yellow-400 bg-yellow-400/20';
      case 'failed': return 'text-red-400 bg-red-400/20';
      default: return 'text-white/60 bg-white/10';
    }
  };

  const textColor = isDark ? '#FFFFFF' : '#14263D';
  const subColor = isDark ? 'rgba(255,255,255,0.6)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2';

  return (
    <div className="min-h-screen pb-24"
      style={{ background: isDark ? 'linear-gradient(180deg, #0A1626 0%, #081427 100%)' : 'linear-gradient(180deg, #F8FBFF 0%, #EAF2FF 100%)' }}>
      {/* Header */}
      <div className="sticky top-0 z-10" style={{ backgroundColor: isDark ? 'rgba(10,22,38,0.85)' : 'rgba(248,251,255,0.85)', backdropFilter: 'blur(12px)', borderBottom: `1px solid ${cardBorder}` }}>
        <div className="max-w-2xl mx-auto p-6" style={{ paddingTop: 'var(--safe-top)' }}>
          <div className="flex items-center gap-4 mb-2">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => navigate('/profile')}
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}
            >
              <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
            </motion.button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold" style={{ color: textColor }}>Bank Accounts</h1>
              <p className="text-sm" style={{ color: subColor }}>Manage payout destinations</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Info Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[24px] p-5"
          style={{ backgroundColor: isDark ? 'rgba(0,112,184,0.08)' : 'rgba(0,112,184,0.05)', border: `1px solid ${isDark ? 'rgba(0,112,184,0.3)' : 'rgba(0,112,184,0.15)'}` }}
        >
          <div className="flex gap-3">
            <Shield className="w-5 h-5 text-[#0070B8] flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold mb-1" style={{ color: textColor }}>Secure & Encrypted</h3>
              <p className="text-sm" style={{ color: subColor }}>
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
          className="w-full rounded-[24px] p-6 border-2 border-dashed transition-all hover:border-[#008CE5]/50"
          style={{ backgroundColor: cardBg, borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#D3E0F2' }}
        >
          <div className="flex items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-r from-[#008CE5] to-[#0070B8] flex items-center justify-center">
              <Plus className="w-6 h-6 text-white" />
            </div>
            <span className="font-semibold text-lg" style={{ color: textColor }}>Add Bank Account</span>
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
                className="rounded-[24px] p-6"
                style={{ backgroundColor: cardBg, border: `2px solid ${account.isDefault ? 'rgba(0,140,229,0.5)' : cardBorder}` }}
              >
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#008CE5] to-[#0070B8] flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-7 h-7 text-white" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-bold text-lg" style={{ color: textColor }}>{account.bankName}</h3>
                        <p className="text-sm" style={{ color: subColor }}>
                          {account.accountType.charAt(0).toUpperCase() + account.accountType.slice(1)} •••• {account.last4}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(account.status)}`}>
                          {account.status.charAt(0).toUpperCase() + account.status.slice(1)}
                        </span>
                        {account.isDefault && (
                          <span className="px-3 py-1 rounded-full bg-[#008CE5]/20 text-[#008CE5] text-xs font-semibold flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            Default
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="text-sm mb-4" style={{ color: isDark ? 'rgba(255,255,255,0.5)' : '#9CA3AF' }}>Added {account.addedDate}</p>

                    <div className="flex gap-2">
                      {!account.isDefault && (
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setDefaultAccount(account.id)}
                          className="px-4 py-2 rounded-[16px] bg-gradient-to-r from-[#008CE5] to-[#0070B8] text-white font-semibold text-sm"
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
            <CreditCard className="w-16 h-16 mx-auto mb-4" style={{ color: isDark ? 'rgba(255,255,255,0.15)' : '#D1D5DB' }} />
            <p style={{ color: subColor }}>No bank accounts added yet</p>
          </motion.div>
        )}

        {/* Default Account Info */}
        {bankAccounts.some(acc => acc.isDefault) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[24px] p-5"
            style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
          >
            <p className="text-sm" style={{ color: subColor }}>
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
            className="rounded-t-[32px] md:rounded-[32px] p-6 w-full md:max-w-lg max-h-[90vh] overflow-y-auto"
            style={{
              backgroundColor: isDark ? '#14263D' : '#FFFFFF',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#D3E0F2'}`,
            }}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-bold text-2xl" style={{ color: isDark ? '#FFFFFF' : '#14263D' }}>Add Bank Account</h2>
              <button onClick={() => setShowAddModal(false)} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E8F0FB' }}>
                <X className="w-4 h-4" style={{ color: isDark ? '#FFFFFF' : '#6B7280' }} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#374151' }}>Account Holder Name</label>
                <div className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#008CE5]/50" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F5F9FF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#D3E0F2'}` }}>
                  <IconBadge><User className="w-4 h-4" style={{ color: '#008CE5' }} /></IconBadge>
                  <input type="text" value={formData.accountHolderName} onChange={(e) => setFormData({ ...formData, accountHolderName: e.target.value })} placeholder="John Doe" className="flex-1 bg-transparent border-none outline-none text-sm" style={{ color: isDark ? '#FFFFFF' : '#1F2937' }} />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#374151' }}>Bank Name</label>
                <div className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#008CE5]/50" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F5F9FF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#D3E0F2'}` }}>
                  <IconBadge color="#0070B8"><Landmark className="w-4 h-4" style={{ color: '#0070B8' }} /></IconBadge>
                  <input type="text" value={formData.bankName} onChange={(e) => setFormData({ ...formData, bankName: e.target.value })} placeholder="Chase Bank" className="flex-1 bg-transparent border-none outline-none text-sm" style={{ color: isDark ? '#FFFFFF' : '#1F2937' }} />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#374151' }}>Routing Number</label>
                <div className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#008CE5]/50" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F5F9FF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#D3E0F2'}` }}>
                  <IconBadge color="#F59E0B"><KeyRound className="w-4 h-4" style={{ color: '#F59E0B' }} /></IconBadge>
                  <input type="text" value={formData.routingNumber} onChange={(e) => setFormData({ ...formData, routingNumber: e.target.value })} placeholder="123456789" maxLength={9} className="flex-1 bg-transparent border-none outline-none text-sm font-mono" style={{ color: isDark ? '#FFFFFF' : '#1F2937' }} />
                </div>
                <p className="text-xs mt-1" style={{ color: isDark ? 'rgba(255,255,255,0.3)' : '#9CA3AF' }}>9-digit routing number</p>
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#374151' }}>Account Number</label>
                <div className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#008CE5]/50" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F5F9FF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#D3E0F2'}` }}>
                  <IconBadge color="#0070B8"><Hash className="w-4 h-4" style={{ color: '#0070B8' }} /></IconBadge>
                  <input type="text" value={formData.accountNumber} onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })} placeholder="000123456789" className="flex-1 bg-transparent border-none outline-none text-sm font-mono" style={{ color: isDark ? '#FFFFFF' : '#1F2937' }} />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#374151' }}>Confirm Account Number</label>
                <div className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#008CE5]/50" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F5F9FF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#D3E0F2'}` }}>
                  <IconBadge color="#0070B8"><Hash className="w-4 h-4" style={{ color: '#0070B8' }} /></IconBadge>
                  <input type="text" value={formData.confirmAccountNumber} onChange={(e) => setFormData({ ...formData, confirmAccountNumber: e.target.value })} placeholder="000123456789" className="flex-1 bg-transparent border-none outline-none text-sm font-mono" style={{ color: isDark ? '#FFFFFF' : '#1F2937' }} />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#374151' }}>Account Type</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { type: 'checking' as const, icon: CreditCard, label: 'Checking' },
                    { type: 'savings' as const, icon: Wallet, label: 'Savings' },
                  ].map(({ type, icon: Icon, label }) => (
                    <button key={type} type="button" onClick={() => setFormData({ ...formData, accountType: type })}
                      className="flex flex-col items-center gap-2 rounded-2xl px-4 py-4 transition-all"
                      style={{
                        backgroundColor: formData.accountType === type
                          ? (isDark ? 'rgba(0,140,229,0.1)' : 'rgba(0,140,229,0.08)')
                          : (isDark ? 'rgba(255,255,255,0.05)' : '#F5F9FF'),
                        border: `2px solid ${formData.accountType === type ? '#008CE5' : (isDark ? 'rgba(255,255,255,0.1)' : '#D3E0F2')}`,
                      }}
                    >
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: formData.accountType === type ? 'rgba(0,140,229,0.2)' : (isDark ? 'rgba(255,255,255,0.05)' : '#E8F0FB') }}>
                        <Icon className="w-5 h-5" style={{ color: formData.accountType === type ? '#008CE5' : (isDark ? 'rgba(255,255,255,0.5)' : '#6B7280') }} />
                      </div>
                      <p className="text-sm font-semibold" style={{ color: isDark ? '#FFFFFF' : '#14263D' }}>{label}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Security Notice */}
              <div className="rounded-2xl p-4" style={{ backgroundColor: isDark ? 'rgba(0,122,255,0.08)' : 'rgba(0,122,255,0.04)', border: `1px solid ${isDark ? 'rgba(0,122,255,0.2)' : 'rgba(0,122,255,0.15)'}` }}>
                <div className="flex gap-3">
                  <IconBadge color="#0070B8"><Shield className="w-4 h-4" style={{ color: '#0070B8' }} /></IconBadge>
                  <p className="text-xs flex-1" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#4B5563' }}>
                    Your account will be verified within 1-2 business days via micro-deposits. We'll send two small deposits for verification.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <motion.button whileTap={{ scale: 0.98 }} onClick={() => setShowAddModal(false)}
                className="flex-1 px-6 py-3.5 rounded-2xl font-semibold text-sm"
                style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E8F0FB', color: isDark ? 'rgba(255,255,255,0.7)' : '#6B7280' }}>
                Cancel
              </motion.button>
              <motion.button whileTap={{ scale: 0.98 }} onClick={handleAddAccount}
                className="flex-1 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-[#008CE5] to-[#0070B8] text-white font-bold text-sm">
                Add Account
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
