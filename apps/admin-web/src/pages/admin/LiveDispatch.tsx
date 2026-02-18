import { motion } from 'motion/react';
import { AdminSidebar } from '../../components/AdminSidebar';
import { MapPin, Navigation, Clock, AlertCircle, CheckCircle, Users, Activity } from 'lucide-react';
import { useState } from 'react';

interface Job {
  id: string;
  customer: string;
  provider: string | null;
  service: string;
  location: { x: number; y: number; address: string };
  status: 'pending' | 'matched' | 'enroute' | 'inprogress' | 'completed';
  priority: 'normal' | 'urgent';
  timestamp: string;
  eta?: number;
}

export function AdminLiveDispatch() {
  const [selectedJob, setSelectedJob] = useState<string | null>(null);

  const jobs: Job[] = [
    {
      id: 'JOB-2045',
      customer: 'Sarah Johnson',
      provider: 'Marcus Rodriguez',
      service: 'Jump Start',
      location: { x: 35, y: 45, address: '1234 Market St, SF' },
      status: 'enroute',
      priority: 'normal',
      timestamp: '2 min ago',
      eta: 12,
    },
    {
      id: 'JOB-2046',
      customer: 'Mike Chen',
      provider: null,
      service: 'Towing',
      location: { x: 65, y: 30, address: '567 Mission St, SF' },
      status: 'pending',
      priority: 'urgent',
      timestamp: '1 min ago',
    },
    {
      id: 'JOB-2044',
      customer: 'Emma Davis',
      provider: 'Sarah Williams',
      service: 'Tire Change',
      location: { x: 50, y: 70, address: '890 Valencia St, SF' },
      status: 'inprogress',
      priority: 'normal',
      timestamp: '15 min ago',
    },
    {
      id: 'JOB-2043',
      customer: 'John Smith',
      provider: 'James Chen',
      service: 'Fuel Delivery',
      location: { x: 25, y: 60, address: '234 Castro St, SF' },
      status: 'matched',
      priority: 'normal',
      timestamp: '5 min ago',
      eta: 8,
    },
  ];

  const stats = [
    { label: 'Active Jobs', value: jobs.filter(j => j.status !== 'completed').length, icon: Activity, color: 'from-[#2EFFAF] to-[#007AFF]' },
    { label: 'Providers Online', value: 24, icon: Users, color: 'from-green-400 to-emerald-500' },
    { label: 'Pending Requests', value: jobs.filter(j => j.status === 'pending').length, icon: AlertCircle, color: 'from-orange-400 to-red-500' },
    { label: 'Avg Response Time', value: '3.2 min', icon: Clock, color: 'from-purple-400 to-pink-500' },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-orange-500';
      case 'matched': return 'bg-blue-500';
      case 'enroute': return 'bg-[#007AFF]';
      case 'inprogress': return 'bg-purple-500';
      case 'completed': return 'bg-[#2EFFAF]';
      default: return 'bg-gray-500';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return 'Matching...';
      case 'matched': return 'Provider Assigned';
      case 'enroute': return 'Provider En Route';
      case 'inprogress': return 'Service In Progress';
      case 'completed': return 'Completed';
      default: return status;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1E2433] via-[#252B3D] to-[#2F3548] flex">
      <AdminSidebar />

      <div className="flex-1 ml-64 p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-white text-3xl font-bold mb-2">Live Dispatch</h1>
          <p className="text-white/60">Real-time job monitoring and management</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="glass rounded-[24px] p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                </div>
                <p className="text-white/60 text-sm mb-1">{stat.label}</p>
                <p className="text-white text-2xl font-bold">{stat.value}</p>
              </motion.div>
            );
          })}
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Map View */}
          <div className="col-span-2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-[24px] p-6 h-[600px] relative overflow-hidden"
            >
              <h2 className="text-white font-bold text-xl mb-4">Service Area Map</h2>
              
              {/* Simplified Map Background */}
              <div className="absolute inset-6 top-16 rounded-[16px] overflow-hidden bg-gradient-to-br from-[#1A1F2E] via-[#252B3D] to-[#2F3548]">
                {/* Grid */}
                <div className="absolute inset-0 opacity-20">
                  <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <pattern id="dispatch-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(46, 255, 175, 0.3)" strokeWidth="1"/>
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#dispatch-grid)" />
                  </svg>
                </div>

                {/* Street Lines */}
                <svg className="absolute inset-0 w-full h-full opacity-20">
                  <line x1="0" y1="30%" x2="100%" y2="30%" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
                  <line x1="0" y1="60%" x2="100%" y2="60%" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
                  <line x1="30%" y1="0" x2="30%" y2="100%" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
                  <line x1="70%" y1="0" x2="70%" y2="100%" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
                </svg>

                {/* Job Markers */}
                {jobs.map((job) => (
                  <motion.div
                    key={job.id}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    whileHover={{ scale: 1.2 }}
                    onClick={() => setSelectedJob(job.id)}
                    style={{
                      position: 'absolute',
                      left: `${job.location.x}%`,
                      top: `${job.location.y}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                    className="cursor-pointer"
                  >
                    <div className="relative">
                      {/* Pulse effect for pending */}
                      {job.status === 'pending' && (
                        <motion.div
                          animate={{ scale: [1, 2, 1], opacity: [0.5, 0, 0.5] }}
                          transition={{ duration: 2, repeat: Infinity }}
                          className="absolute inset-0 rounded-full bg-orange-500"
                        />
                      )}
                      
                      {/* Marker */}
                      <div className={`w-8 h-8 rounded-full ${getStatusColor(job.status)} border-4 border-white/30 shadow-lg flex items-center justify-center relative z-10`}>
                        {job.status === 'enroute' && (
                          <Navigation className="w-4 h-4 text-white" />
                        )}
                        {job.status === 'pending' && (
                          <AlertCircle className="w-4 h-4 text-white" />
                        )}
                        {job.status === 'inprogress' && (
                          <Activity className="w-4 h-4 text-white" />
                        )}
                      </div>

                      {/* Label */}
                      {selectedJob === job.id && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="absolute top-10 left-1/2 -translate-x-1/2 glass-light rounded-[12px] px-3 py-2 whitespace-nowrap"
                        >
                          <p className="text-white font-semibold text-xs">{job.id}</p>
                          <p className="text-white/70 text-xs">{job.service}</p>
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Legend */}
              <div className="absolute bottom-6 left-6 glass-light rounded-[16px] p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-orange-500" />
                    <span className="text-white text-xs">Pending</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#007AFF]" />
                    <span className="text-white text-xs">En Route</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-purple-500" />
                    <span className="text-white text-xs">In Progress</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#2EFFAF]" />
                    <span className="text-white text-xs">Completed</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Job List */}
          <div className="col-span-1">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-[24px] p-6 h-[600px] overflow-y-auto"
            >
              <h2 className="text-white font-bold text-xl mb-4">Active Jobs</h2>
              
              <div className="space-y-3">
                {jobs.map((job, index) => (
                  <motion.div
                    key={job.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => setSelectedJob(job.id)}
                    className={`glass-light rounded-[16px] p-4 cursor-pointer transition-all border-2 ${
                      selectedJob === job.id
                        ? 'border-[#2EFFAF]/50'
                        : 'border-transparent hover:border-white/10'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-white font-bold text-sm">{job.id}</p>
                        <p className="text-white/60 text-xs">{job.timestamp}</p>
                      </div>
                      {job.priority === 'urgent' && (
                        <div className="px-2 py-1 rounded-full bg-red-500/20 text-red-400 text-xs font-semibold">
                          URGENT
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 mb-3">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3 h-3 text-[#2EFFAF]" />
                        <p className="text-white/70 text-xs">{job.service}</p>
                      </div>
                      <p className="text-white text-sm font-semibold">{job.customer}</p>
                      {job.provider && (
                        <p className="text-white/60 text-xs">Provider: {job.provider}</p>
                      )}
                    </div>

                    <div className={`px-3 py-1.5 rounded-full text-xs font-semibold text-white ${getStatusColor(job.status)} inline-block`}>
                      {getStatusLabel(job.status)}
                    </div>

                    {job.eta && (
                      <p className="text-[#2EFFAF] text-xs font-semibold mt-2">
                        ETA: {job.eta} min
                      </p>
                    )}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
