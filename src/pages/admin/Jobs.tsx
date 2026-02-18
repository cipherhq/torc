import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, MapPin, Clock, User, Phone, MoreHorizontal } from 'lucide-react';
import { useState } from 'react';

export function AdminJobs() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'active' | 'pending' | 'completed'>('active');

  const jobs = [
    {
      id: 'J-1234',
      service: 'Towing',
      customer: 'Sarah Johnson',
      provider: 'Mike R.',
      status: 'active',
      location: '123 Main St',
      eta: '8 min',
      amount: '$120',
      sla: 'green',
    },
    {
      id: 'J-1235',
      service: 'Jump Start',
      customer: 'John Doe',
      provider: 'Emma W.',
      status: 'active',
      location: '456 Oak Ave',
      eta: '12 min',
      amount: '$45',
      sla: 'yellow',
    },
    {
      id: 'J-1236',
      service: 'Tire Change',
      customer: 'Mike Chen',
      provider: null,
      status: 'pending',
      location: '789 Pine Rd',
      eta: '-',
      amount: '$65',
      sla: 'red',
    },
  ];

  const filteredJobs = filter === 'all' ? jobs : jobs.filter(j => j.status === filter);

  const getSLAColor = (sla: string) => {
    switch (sla) {
      case 'green': return 'bg-green-500';
      case 'yellow': return 'bg-yellow-500';
      case 'red': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      {/* Header */}
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
          <div>
            <h1 className="text-3xl font-bold text-white">Jobs Operations</h1>
            <p className="text-white/60">Monitor and manage active requests</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-8">
        {/* Filters */}
        <div className="flex gap-3 mb-6">
          {(['all', 'active', 'pending', 'completed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-6 py-3 rounded-2xl font-semibold transition-all ${
                filter === f
                  ? 'bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-white shadow-lg'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Jobs table */}
        <div className="bg-white rounded-3xl shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Job ID</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Service</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Customer</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Provider</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Location</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">ETA</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Amount</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">SLA</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredJobs.map((job) => (
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
                        <span className="text-sm text-gray-900">{job.eta}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-semibold text-gray-900">{job.amount}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className={`w-3 h-3 rounded-full ${getSLAColor(job.sla)}`} />
                    </td>
                    <td className="px-6 py-4">
                      <button className="p-2 hover:bg-gray-200 rounded-xl transition-colors">
                        <MoreHorizontal className="w-5 h-5 text-gray-600" />
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
