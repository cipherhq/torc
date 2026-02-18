import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, DollarSign, TrendingUp, Download, Clock, Calendar, Building2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

export function ProviderEarnings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [earnings, setEarnings] = useState({ available: 0, pending: 0, thisWeek: 0, thisMonth: 0 });
  const [chartData, setChartData] = useState([
    { day: 'Mon', amount: 0 }, { day: 'Tue', amount: 0 }, { day: 'Wed', amount: 0 },
    { day: 'Thu', amount: 0 }, { day: 'Fri', amount: 0 }, { day: 'Sat', amount: 0 }, { day: 'Sun', amount: 0 },
  ]);
  const [recentJobs, setRecentJobs] = useState<any[]>([]);
  const [payoutHistory] = useState<any[]>([]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    async function load() {
      try {
        setLoadError(null);
        setLoading(true);
        const { data: jobs } = await supabase
          .from('jobs')
          .select('*, service:services(name), customer:profiles!jobs_customer_id_fkey(first_name, last_name)')
          .eq('provider_id', user!.id)
          .order('created_at', { ascending: false });

        if (jobs) {
          const now = new Date();
          const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

          const completed = jobs.filter(j => j.status === 'completed');
          const weekJobs = completed.filter(j => new Date(j.completed_at || j.created_at) >= weekStart);
          const monthJobs = completed.filter(j => new Date(j.completed_at || j.created_at) >= monthStart);

          setEarnings({
            available: completed.reduce((s, j) => s + (j.total_amount || 0), 0),
            pending: jobs.filter(j => ['accepted','enroute','arrived','inprogress'].includes(j.status)).reduce((s, j) => s + (j.total_amount || j.base_price || 0), 0),
            thisWeek: weekJobs.reduce((s, j) => s + (j.total_amount || 0), 0),
            thisMonth: monthJobs.reduce((s, j) => s + (j.total_amount || 0), 0),
          });

          const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
          const dayTotals: Record<string, number> = {};
          days.forEach(d => { dayTotals[d] = 0; });
          weekJobs.forEach(j => {
            const day = days[new Date(j.completed_at || j.created_at).getDay()];
            dayTotals[day] += j.total_amount || 0;
          });
          setChartData(['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => ({ day: d, amount: dayTotals[d] || 0 })));

          setRecentJobs(jobs.slice(0, 10).map(j => ({
            id: j.id,
            service: j.service?.name || 'Service',
            customer: j.customer ? `${j.customer.first_name || ''} ${(j.customer.last_name || '')[0] || ''}.` : 'Customer',
            amount: j.total_amount || j.base_price || 0,
            tip: j.tip || 0,
            date: new Date(j.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          })));
        }
      } catch (e) {
        console.warn('Failed to load earnings:', e);
        setLoadError('Could not load earnings right now.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user]);

  const formatMoney = (amount: number) => Number(amount || 0).toFixed(2);

  return (
    <div className="min-h-screen bg-[#252B3D] relative overflow-hidden pb-24">
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
        <h1 className="text-2xl font-bold text-white">Earnings</h1>
      </div>

      {loading && (
        <div className="relative z-10 px-6 mb-6">
          <div className="glass rounded-[24px] p-5">
            <p className="text-white/70">Loading earnings...</p>
          </div>
        </div>
      )}

      {loadError && (
        <div className="relative z-10 px-6 mb-6">
          <div className="glass rounded-[24px] p-5 border border-red-500/30">
            <p className="text-red-300">{loadError}</p>
          </div>
        </div>
      )}

      {/* Balance cards */}
      <div className="relative z-10 px-6 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-[32px] p-6 mb-4"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-white/60 text-sm mb-1">Available Balance</p>
              <h2 className="text-white font-bold text-4xl">${formatMoney(earnings.available)}</h2>
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-6 py-3 rounded-2xl bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0F1419] font-semibold flex items-center gap-2"
            >
              <Download className="w-5 h-5" />
              Instant Payout
            </motion.button>
          </div>

          <div className="border-t border-white/10 pt-4">
            <p className="text-white/60 text-sm mb-1">Pending (processing)</p>
            <p className="text-white font-semibold text-xl">${formatMoney(earnings.pending)}</p>
          </div>
        </motion.div>

        <div className="grid grid-cols-2 gap-3">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="glass rounded-[24px] p-5"
          >
            <Calendar className="w-6 h-6 text-[#2EFFAF] mb-2" />
            <p className="text-white/60 text-sm">This Week</p>
            <p className="text-white font-bold text-2xl">${formatMoney(earnings.thisWeek)}</p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="glass rounded-[24px] p-5"
          >
            <TrendingUp className="w-6 h-6 text-[#007AFF] mb-2" />
            <p className="text-white/60 text-sm">This Month</p>
            <p className="text-white font-bold text-2xl">${formatMoney(earnings.thisMonth)}</p>
          </motion.div>
        </div>

        {/* Bank Account Quick Link */}
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/bank-accounts')}
          className="w-full mt-3 glass rounded-[24px] p-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#007AFF]/20 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-[#007AFF]" />
            </div>
            <div className="text-left">
              <p className="text-white font-semibold text-sm">Manage Bank Accounts</p>
              <p className="text-white/60 text-xs">Manage payout methods</p>
            </div>
          </div>
          <svg className="w-5 h-5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </motion.button>
      </div>

      {/* Earnings chart */}
      <div className="relative z-10 px-6 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass rounded-[32px] p-6"
        >
          <h3 className="text-white font-semibold mb-4">This Week</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <XAxis 
                dataKey="day" 
                stroke="rgba(255, 255, 255, 0.4)"
                fontSize={12}
              />
              <YAxis 
                stroke="rgba(255, 255, 255, 0.4)"
                fontSize={12}
              />
              <Bar 
                dataKey="amount" 
                fill="url(#colorGradient)" 
                radius={[8, 8, 0, 0]}
              />
              <defs>
                <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2EFFAF" />
                  <stop offset="100%" stopColor="#007AFF" />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* Recent jobs */}
      <div className="relative z-10 px-6">
        <h3 className="text-white font-semibold mb-4">Recent Jobs</h3>
        <div className="space-y-3 mb-6">
          {recentJobs.length === 0 && (
            <div className="glass rounded-[24px] p-5">
              <p className="text-white/60">No recent jobs yet.</p>
            </div>
          )}
          {recentJobs.map((job, index) => (
            <motion.div
              key={job.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + index * 0.05 }}
              className="glass rounded-[24px] p-5"
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-white font-semibold">{job.service}</h4>
                  <p className="text-white/60 text-sm">{job.customer}</p>
                </div>
                <div className="text-right">
                  <p className="text-white font-bold">${job.amount + job.tip}</p>
                  <p className="text-[#2EFFAF] text-sm">+${job.tip} tip</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-white/40 text-xs">
                <Clock className="w-3 h-3" />
                {job.date}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Payout History */}
      <div className="relative z-10 px-6">
        <h3 className="text-white font-semibold mb-4">Payout History</h3>
        <div className="space-y-3">
          {payoutHistory.length === 0 && (
            <div className="glass rounded-[24px] p-5">
              <p className="text-white/60">No payouts yet.</p>
            </div>
          )}
          {payoutHistory.map((payout, index) => (
            <motion.div
              key={payout.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + index * 0.05 }}
              className="glass rounded-[24px] p-5"
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-white font-semibold">Payout ID: {payout.id}</h4>
                  <p className="text-white/60 text-sm">Date: {payout.date}</p>
                </div>
                <div className="text-right">
                  <p className="text-white font-bold">Net Payout: ${payout.netPayout}</p>
                  <p className={`text-${payout.status === 'paid' ? 'green' : 'yellow'}-500 text-sm`}>{payout.status === 'paid' ? 'Paid' : 'Pending'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-white/40 text-xs">
                <Clock className="w-3 h-3" />
                {payout.date}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

    </div>
  );
}