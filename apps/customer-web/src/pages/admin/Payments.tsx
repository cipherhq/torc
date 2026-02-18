import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, DollarSign, TrendingUp, Download } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface Transaction {
  id: string;
  type: string;
  amount: number;
  customer: string;
  provider: string;
  status: string;
  time: string;
}

export function AdminPayments() {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [pendingPayouts, setPendingPayouts] = useState(0);
  const [processing, setProcessing] = useState(0);

  useEffect(() => {
    async function loadPayments() {
      try {
        setLoading(true);
        
        // Get today's date range
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Fetch jobs with payments (where total_price is not null)
        const { data, error } = await supabase
          .from('jobs')
          .select(`
            id,
            total_price,
            status,
            completed_at,
            created_at,
            customer:customers(
              user:profiles(full_name, email)
            ),
            provider:providers(
              user:profiles(full_name)
            )
          `)
          .not('total_price', 'is', null)
          .order('created_at', { ascending: false })
          .limit(100);

        if (error) throw error;

        // Calculate stats
        const todayJobs = (data || []).filter((job: any) => {
          const jobDate = new Date(job.completed_at || job.created_at);
          return jobDate >= today && jobDate < tomorrow;
        });
        
        const revenue = todayJobs.reduce((sum: number, job: any) => sum + (Number(job.total_price) || 0), 0);
        setTodayRevenue(revenue);

        // Format transactions
        const formattedTransactions: Transaction[] = (data || []).slice(0, 50).map((job: any) => {
          const customerName = job.customer?.user?.full_name || job.customer?.user?.email?.split('@')[0] || 'Unknown';
          const customerShort = customerName.split(' ').map((n: string) => n[0]).join('').slice(0, 2) + '.';
          
          const providerName = job.provider?.user?.full_name || null;
          const providerShort = providerName ? 
            `${providerName.split(' ')[0]} ${providerName.split(' ')[1]?.[0] || ''}.` : '-';

          const jobDate = new Date(job.completed_at || job.created_at);
          const time = jobDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

          return {
            id: `TXN-${job.id.slice(0, 8)}`,
            type: 'charge',
            amount: Number(job.total_price) || 0,
            customer: customerShort,
            provider: providerShort,
            status: job.status === 'completed' ? 'completed' : 'processing',
            time,
          };
        });

        setTransactions(formattedTransactions);
      } catch (error) {
        console.warn('Failed to load payments:', error);
        setTransactions([]);
      } finally {
        setLoading(false);
      }
    }
    loadPayments();
  }, []);

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <div className="bg-gradient-to-r from-[#1A1F2E] to-[#2F3548] p-8">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate('/admin')}
            className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center"
          >
            <ArrowLeft className="w-6 h-6 text-white" />
          </motion.button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-white">Payments & Transactions</h1>
          </div>
          <button className="px-6 py-3 rounded-2xl bg-white text-gray-900 font-semibold flex items-center gap-2">
            <Download className="w-5 h-5" />
            Export
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-8">
        <div className="grid grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-3xl p-6 shadow-lg">
            <DollarSign className="w-10 h-10 text-[#2EFFAF] mb-3" />
            <p className="text-gray-600 text-sm">Today's Revenue</p>
            <p className="text-3xl font-bold text-gray-900">${todayRevenue.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-3xl p-6 shadow-lg">
            <TrendingUp className="w-10 h-10 text-[#007AFF] mb-3" />
            <p className="text-gray-600 text-sm">Pending Payouts</p>
            <p className="text-3xl font-bold text-gray-900">${pendingPayouts.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-3xl p-6 shadow-lg">
            <DollarSign className="w-10 h-10 text-green-500 mb-3" />
            <p className="text-gray-600 text-sm">Processing</p>
            <p className="text-3xl font-bold text-gray-900">${processing.toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-lg overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <p className="text-gray-600">Loading transactions...</p>
            </div>
          ) : transactions.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-600">No transactions found</p>
            </div>
          ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Transaction ID</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Type</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Amount</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Customer</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Provider</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Status</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {transactions.map((txn) => (
                <tr key={txn.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-mono text-sm">{txn.id}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                      txn.type === 'charge' ? 'bg-green-100 text-green-700' :
                      txn.type === 'payout' ? 'bg-blue-100 text-blue-700' :
                      'bg-orange-100 text-orange-700'
                    }`}>
                      {txn.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-semibold">${txn.amount}</td>
                  <td className="px-6 py-4 text-gray-600">{txn.customer}</td>
                  <td className="px-6 py-4 text-gray-600">{txn.provider}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                      txn.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {txn.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-600 text-sm">{txn.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
      </div>
    </div>
  );
}
