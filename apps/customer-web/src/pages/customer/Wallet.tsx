import { motion } from 'motion/react';
import { CustomerBottomNav } from '../../components/CustomerBottomNav';
import { CreditCard, Plus, DollarSign, Gift, Download, Trash2, ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';

interface WalletTransaction {
  id: string;
  description: string;
  date: string;
  amount: number;
  status: string;
}

export function Wallet() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [walletBalance, setWalletBalance] = useState(0.0);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loadingWallet, setLoadingWallet] = useState(true);
  const [walletError, setWalletError] = useState<string | null>(null);

  const textColor = isDark ? '#FFFFFF' : '#14263D';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2';

  useEffect(() => {
    if (!user) {
      setLoadingWallet(false);
      return;
    }
    void fetchPaymentMethods();
    void loadWalletData();
  }, [user]);

  async function fetchPaymentMethods() {
    try {
      const { data, error } = await supabase.from('payment_methods').select('*').eq('user_id', user.id);
      if (error) throw error;
      setPaymentMethods(data || []);
    } catch (error) {
      console.warn('Error fetching payment methods:', error);
      setPaymentMethods([]);
    }
  }

  async function loadWalletData() {
    if (!user) return;
    try {
      setLoadingWallet(true);
      setWalletError(null);

      const [jobsRes, refundsRes] = await Promise.all([
        supabase
          .from('jobs')
          .select('id, created_at, total_amount, payment_status, service:services(name)')
          .eq('customer_id', user.id)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('refunds')
          .select('id, amount, status, reason, created_at')
          .eq('customer_id', user.id)
          .order('created_at', { ascending: false })
          .limit(100),
      ]);

      if (jobsRes.error) throw jobsRes.error;
      if (refundsRes.error) throw refundsRes.error;

      const jobTransactions: WalletTransaction[] = (jobsRes.data || [])
        .filter((job: any) => ['paid', 'refunded', 'failed', 'requires_action'].includes(job.payment_status))
        .map((job: any) => ({
          id: `job-${job.id}`,
          description: `${job.service?.name || 'Service'} payment`,
          date: job.created_at,
          amount: -Math.abs(Number(job.total_amount) || 0),
          status: job.payment_status,
        }));

      const refundTransactions: WalletTransaction[] = (refundsRes.data || []).map((refund: any) => ({
        id: `refund-${refund.id}`,
        description: `Refund${refund.reason ? `: ${refund.reason}` : ''}`,
        date: refund.created_at,
        amount: Math.abs(Number(refund.amount) || 0),
        status: refund.status,
      }));

      const merged = [...jobTransactions, ...refundTransactions].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      const approvedCredits = (refundsRes.data || [])
        .filter((r: any) => r.status === 'approved')
        .reduce((sum: number, r: any) => sum + (Number(r.amount) || 0), 0);

      setTransactions(merged);
      setWalletBalance(approvedCredits);
    } catch (error) {
      console.warn('Error loading wallet data:', error);
      setTransactions([]);
      setWalletBalance(0);
      setWalletError('Could not load wallet activity right now.');
    } finally {
      setLoadingWallet(false);
    }
  }

  async function deleteMethod(id: string) {
    try {
      await supabase.from('payment_methods').delete().eq('id', id);
      await fetchPaymentMethods();
    } catch (e) {
      console.warn('Failed to delete:', e);
    }
  }

  return (
    <div className="min-h-screen pb-24 relative overflow-hidden" style={{ background: isDark ? 'linear-gradient(180deg, #0A1626 0%, #081427 100%)' : 'linear-gradient(180deg, #F8FBFF 0%, #EAF2FF 100%)' }}>
      <div className="relative z-10 p-6 flex items-center gap-4" style={{ paddingTop: 'var(--safe-top)' }}>
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}
        >
          <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
        </button>
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: textColor }}>Wallet</h1>
          <p className="text-sm" style={{ color: subColor }}>Manage payments and credits</p>
        </div>
      </div>

      <div className="relative z-10 px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-6 mb-6 relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #008CE5 0%, #0070B8 100%)', boxShadow: '0 12px 32px rgba(46, 255, 175, 0.25)' }}
        >
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <DollarSign className="w-5 h-5 text-white" />
              <p className="text-white font-semibold text-sm">Refund Credits</p>
            </div>
            <p className="text-4xl font-bold text-white mb-1">${walletBalance.toFixed(2)}</p>
            <p className="text-white/70 text-sm">Approved refund balance</p>
          </div>
        </motion.div>

        {walletError && (
          <div className="rounded-2xl p-4 mb-6 border border-red-500/30" style={{ backgroundColor: cardBg }}>
            <p className="text-sm text-red-400">{walletError}</p>
          </div>
        )}

        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold" style={{ color: textColor }}>Payment Methods</h2>
            <button
              onClick={() => navigate('/customer/payment-methods')}
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}
              title="Manage payment methods"
            >
              <Plus className="w-4 h-4" style={{ color: '#008CE5' }} />
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
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#008CE5]/20 to-[#0070B8]/20 flex items-center justify-center">
                      <CreditCard className="w-5 h-5" style={{ color: '#008CE5' }} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="font-semibold text-sm" style={{ color: textColor }}>{method.brand || 'Card'} •••• {method.last4 || '****'}</p>
                        {method.is_default && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ backgroundColor: 'rgba(0,140,229,0.15)', color: '#008CE5' }}>DEFAULT</span>
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

            <button
              onClick={() => navigate('/customer/payment-methods')}
              className="w-full rounded-2xl p-4 flex items-center gap-3 border-2 border-dashed transition-all hover:border-[#008CE5]/50"
              style={{ borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#D1D5DB' }}
            >
              <Plus className="w-5 h-5" style={{ color: '#008CE5' }} />
              <p className="font-semibold text-sm" style={{ color: '#008CE5' }}>Add New Card</p>
            </button>
          </div>
        </div>

        <div className="mb-6">
          <h2 className="font-semibold mb-3" style={{ color: textColor }}>Promotions</h2>
          <div className="rounded-2xl p-4" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#008CE5] to-[#0070B8] flex items-center justify-center">
                <Gift className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm" style={{ color: textColor }}>Have a promo code?</p>
                <p className="text-xs" style={{ color: subColor }}>Enter code to get credits</p>
              </div>
              <button className="px-3 py-1.5 bg-gradient-to-r from-[#008CE5] to-[#0070B8] rounded-xl text-white font-semibold text-xs">Add Code</button>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold" style={{ color: textColor }}>Recent Transactions</h2>
            <button className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }} title="Download history">
              <Download className="w-4 h-4" style={{ color: '#008CE5' }} />
            </button>
          </div>
          {loadingWallet ? (
            <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
              <p className="text-sm" style={{ color: subColor }}>Loading transactions...</p>
            </div>
          ) : transactions.length === 0 ? (
            <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
              <p className="text-sm" style={{ color: subColor }}>No transactions yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((t) => (
                <div key={t.id} className="rounded-2xl p-4 flex items-center justify-between" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: textColor }}>{t.description}</p>
                    <p className="text-xs" style={{ color: subColor }}>{new Date(t.date).toLocaleDateString()}</p>
                  </div>
                  <p className="font-bold" style={{ color: t.amount > 0 ? '#008CE5' : textColor }}>
                    {t.amount > 0 ? '+' : '-'}${Math.abs(t.amount).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <CustomerBottomNav />
    </div>
  );
}
