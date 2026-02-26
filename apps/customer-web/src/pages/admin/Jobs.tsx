import { motion } from 'motion/react';
import { MapPin, Clock, User, Search } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { AdminLayout } from '../../components/AdminLayout';
import { loadPlatformSettings } from '../../lib/platformSettings';

interface Job {
  id: string;
  service: string;
  customer: string;
  provider: string | null;
  status: string;
  statusRaw: string;
  location: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMinutes: number | null;
  ageHours: number;
  amount: string;
  slaState: 'green' | 'yellow' | 'red';
}

export function AdminJobs() {
  const [filter, setFilter] = useState<'all' | 'active' | 'pending' | 'completed'>('active');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function loadJobs() {
      try {
        setLoading(true);
        const settings = await loadPlatformSettings();
        const urgentSlaHours = settings.urgentSlaHours;
        const standardSlaHours = settings.standardSlaHours;
        
        let query = supabase
          .from('jobs')
          .select(`
            id,
            status,
            pickup_address,
            total_amount,
            created_at,
            started_at,
            completed_at,
            service:services(name),
            customer:profiles!jobs_customer_id_fkey(first_name, last_name, email),
            provider:profiles!jobs_provider_id_fkey(first_name, last_name, email)
          `)
          .order('created_at', { ascending: false });

        // Apply filter
        if (filter === 'active') {
          query = query.in('status', ['pending', 'requested', 'matching', 'matched', 'accepted', 'en_route', 'enroute', 'arrived', 'in_progress', 'inprogress']);
        } else if (filter === 'pending') {
          query = query.in('status', ['pending', 'requested', 'matching']);
        } else if (filter === 'completed') {
          query = query.eq('status', 'completed');
        }

        const { data, error } = await query;

        if (error) throw error;

        const formattedJobs: Job[] = (data || []).map((job: any) => {
          const customerName = `${job.customer?.first_name || ''} ${job.customer?.last_name || ''}`.trim() || job.customer?.email || 'Unknown';
          const providerNameBase = `${job.provider?.first_name || ''} ${job.provider?.last_name || ''}`.trim();
          const providerName = providerNameBase || job.provider?.email || null;
          const serviceName = job.service?.name || 'Unknown Service';
          const amount = job.total_amount ? `$${Number(job.total_amount).toFixed(2)}` : '-';
          const createdAt = job.created_at;
          const ageHours = (Date.now() - new Date(createdAt).getTime()) / 36e5;
          const startedAt = job.started_at || null;
          const completedAt = job.completed_at || null;
          const durationMinutes = startedAt && completedAt
            ? Math.max(0, Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 60000))
            : null;
          let slaState: 'green' | 'yellow' | 'red' = 'green';
          const inOpenFlow = ['pending', 'requested', 'matching', 'matched', 'accepted', 'en_route', 'enroute', 'arrived', 'in_progress', 'inprogress'].includes(job.status);
          if (inOpenFlow) {
            if (job.status === 'requested' && ageHours > urgentSlaHours) {
              slaState = 'red';
            } else if (ageHours > standardSlaHours) {
              slaState = 'red';
            } else if (ageHours > standardSlaHours / 2) {
              slaState = 'yellow';
            }
          }
          
          return {
            id: `J-${job.id.slice(0, 8)}`,
            service: serviceName,
            customer: customerName,
            provider: providerName,
            statusRaw: job.status,
            status: ['en_route', 'enroute', 'in_progress', 'inprogress', 'matched', 'accepted', 'arrived'].includes(job.status) ? 'active' : ['pending', 'requested', 'matching'].includes(job.status) ? 'pending' : job.status === 'completed' ? 'completed' : 'active',
            location: job.pickup_address || 'Location not set',
            createdAt,
            startedAt,
            completedAt,
            durationMinutes,
            ageHours,
            amount,
            slaState,
          };
        });

        setJobs(formattedJobs);
      } catch (error) {
        console.warn('Failed to load jobs:', error);
        setJobs([]);
      } finally {
        setLoading(false);
      }
    }
    loadJobs();
  }, [filter]);

  const getSLAColor = (sla: string) => {
    switch (sla) {
      case 'green': return 'bg-green-500';
      case 'yellow': return 'bg-yellow-500';
      case 'red': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const visibleJobs = jobs.filter((job) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      job.id.toLowerCase().includes(q) ||
      job.service.toLowerCase().includes(q) ||
      job.customer.toLowerCase().includes(q) ||
      (job.provider || '').toLowerCase().includes(q) ||
      job.location.toLowerCase().includes(q) ||
      job.statusRaw.toLowerCase().includes(q)
    );
  });

  const formatDateTime = (value: string | null) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
  };

  return (
    <AdminLayout>
      <div className="p-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1A1F2E] to-[#2F3548] p-8 rounded-3xl mb-8">
        <div>
            <h1 className="text-3xl font-bold text-white">Jobs Operations</h1>
            <p className="text-white/60">Monitor and manage active requests</p>
        </div>
      </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6 items-center">
          {(['all', 'active', 'pending', 'completed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-6 py-3 rounded-2xl font-semibold transition-all ${
                filter === f
                  ? 'bg-gradient-to-r from-[#008CE5] to-[#0070B8] text-white shadow-lg'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 bg-white rounded-2xl px-3 py-2 min-w-[300px]">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ID, service, customer, provider..."
              className="w-full text-sm text-gray-800 placeholder-gray-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Jobs table */}
        <div className="bg-white rounded-3xl shadow-lg overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <p className="text-gray-600">Loading jobs...</p>
            </div>
          ) : visibleJobs.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-600">No jobs found</p>
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Job ID</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Service</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Customer</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Provider</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Location</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Age</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Started</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Completed</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Duration</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Amount</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">SLA</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {visibleJobs.map((job) => (
                  <motion.tr
                    key={job.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <span className="font-mono text-sm font-semibold text-gray-900">{job.id}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-900">{job.service}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-900">{job.customer}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {job.provider ? (
                        <span className="text-sm text-gray-900">{job.provider}</span>
                      ) : (
                        <span className="text-sm text-orange-500 font-semibold">Unassigned</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-600">{job.location}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-900">{job.ageHours < 1 ? `${Math.max(1, Math.round(job.ageHours * 60))}m` : `${job.ageHours.toFixed(1)}h`}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-900">{formatDateTime(job.startedAt)}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-900">{formatDateTime(job.completedAt)}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-900">{job.durationMinutes != null ? `${job.durationMinutes}m` : '-'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-semibold text-gray-900">{job.amount}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className={`w-3 h-3 rounded-full ${getSLAColor(job.slaState)}`} />
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-semibold px-3 py-1 rounded-full bg-gray-100 text-gray-700 uppercase">
                        {job.statusRaw}
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
