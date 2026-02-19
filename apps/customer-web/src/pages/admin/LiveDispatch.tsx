import { motion } from 'motion/react';
import { AdminLayout } from '../../components/AdminLayout';
import { MapPin, Clock, AlertCircle, Users, Activity, Send, MessageSquare } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface Job {
  id: string; // full UUID for linking
  displayId: string;
  customerId: string | null;
  providerId: string | null;
  customer: string | null;
  provider: string | null;
  service: string;
  location: { address: string };
  status: 'pending' | 'matched' | 'enroute' | 'inprogress' | 'completed';
  priority: 'normal' | 'urgent';
  timestamp: string;
}

interface ChatMessage {
  id: string;
  job_id: string;
  sender_name: string;
  sender_role: string;
  message: string;
  created_at: string;
}

export function AdminLiveDispatch() {
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [targetRole, setTargetRole] = useState<'all' | 'customer' | 'provider'>('all');
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    async function loadActiveJobs() {
      try {
        setLoading(true);
        const [{ data, error }, { data: chatData, error: chatError }] = await Promise.all([
          supabase
          .from('jobs')
          .select(`
            id,
            status,
            pickup_address,
            customer_id,
            provider_id,
            created_at,
            customer:profiles!jobs_customer_id_fkey(first_name,last_name,email),
            provider:profiles!jobs_provider_id_fkey(first_name,last_name,email),
            service:services(name)
          `)
          .in('status', ['pending', 'requested', 'matching', 'matched', 'accepted', 'en_route', 'enroute', 'arrived', 'in_progress', 'inprogress'])
          .order('created_at', { ascending: false }),
          supabase
            .from('chat_messages')
            .select('id, job_id, sender_name, sender_role, message, created_at')
            .order('created_at', { ascending: false })
            .limit(30),
        ]);

        if (error) throw error;
        if (chatError) throw chatError;

        const formattedJobs: Job[] = (data || []).map((job: any, index: number) => {
          const customerName = `${job.customer?.first_name || ''} ${job.customer?.last_name || ''}`.trim() || job.customer?.email || null;
          const providerName = `${job.provider?.first_name || ''} ${job.provider?.last_name || ''}`.trim() || job.provider?.email || null;
          const serviceName = job.service?.name || 'Unknown Service';
          
          // Map status
          let status: Job['status'] = 'pending';
          if (job.status === 'en_route' || job.status === 'enroute' || job.status === 'arrived') status = 'enroute';
          else if (job.status === 'in_progress' || job.status === 'inprogress') status = 'inprogress';
          else if (job.status === 'matching' || job.status === 'matched' || job.status === 'accepted') status = 'matched';
          else if (job.status === 'pending' || job.status === 'requested') status = 'pending';

          // Calculate time ago
          const requestedAt = new Date(job.created_at);
          const now = new Date();
          const diffMinutes = Math.floor((now.getTime() - requestedAt.getTime()) / 60000);
          const timestamp = diffMinutes < 1 ? 'Just now' : `${diffMinutes} min ago`;

          return {
            id: job.id,
            displayId: `JOB-${job.id.slice(0, 8)}`,
            customerId: job.customer_id || null,
            providerId: job.provider_id || null,
            customer: customerName,
            provider: providerName,
            service: serviceName,
            location: { address: job.pickup_address || 'Location not set' },
            status,
            priority: diffMinutes > 30 ? 'urgent' : 'normal',
            timestamp,
          };
        });

        setJobs(formattedJobs);
        setMessages((chatData || []) as ChatMessage[]);
      } catch (error) {
        console.warn('Failed to load active jobs:', error);
        setJobs([]);
        setMessages([]);
      } finally {
        setLoading(false);
      }
    }
    loadActiveJobs();
    
    // Refresh every 30 seconds
    const interval = setInterval(loadActiveJobs, 30000);
    return () => clearInterval(interval);
  }, []);

  const stats = [
    { label: 'Active Jobs', value: jobs.filter(j => j.status !== 'completed').length, icon: Activity, color: 'from-[#2EFFAF] to-[#007AFF]' },
    { label: 'Providers Assigned', value: jobs.filter(j => !!j.providerId).length, icon: Users, color: 'from-green-400 to-emerald-500' },
    { label: 'Pending Requests', value: jobs.filter(j => j.status === 'pending').length, icon: AlertCircle, color: 'from-orange-400 to-red-500' },
    { label: 'Open Conversations', value: messages.length, icon: Clock, color: 'from-purple-400 to-pink-500' },
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

  async function sendAnnouncement() {
    const message = announcement.trim();
    if (!message) return;
    try {
      setSending(true);
      setFeedback(null);
      let query = supabase.from('profiles').select('id');
      if (targetRole !== 'all') {
        query = query.eq('role', targetRole);
      } else {
        query = query.in('role', ['customer', 'provider']);
      }
      const { data: recipients, error } = await query;
      if (error) throw error;

      const rows = (recipients || []).map((r: any) => ({
        user_id: r.id,
        type: 'alert',
        title: 'Admin announcement',
        message,
      }));

      if (rows.length > 0) {
        const { error: insertError } = await supabase.from('notifications').insert(rows);
        if (insertError) throw insertError;
      }

      setAnnouncement('');
      setFeedback(`Sent to ${rows.length} ${targetRole === 'all' ? 'users' : `${targetRole}s`}.`);
    } catch (error: any) {
      console.warn('Failed to send announcement:', error);
      setFeedback(error?.message || 'Failed to send announcement.');
    } finally {
      setSending(false);
    }
  }

  return (
    <AdminLayout>
      <div className="p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-white text-3xl font-bold mb-2">Live Dispatch</h1>
          <p className="text-white/60">Real-time job monitoring, messaging visibility, and user/provider announcements</p>
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
          {/* Active jobs */}
          <div className="col-span-2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-[24px] p-6 h-[600px] overflow-y-auto"
            >
              <h2 className="text-white font-bold text-xl mb-4">Active Jobs</h2>
              {loading ? (
                <p className="text-white/60">Loading jobs...</p>
              ) : jobs.length === 0 ? (
                <p className="text-white/60">No active jobs found.</p>
              ) : (
                <div className="space-y-3">
                  {jobs.map((job, index) => (
                    <motion.div
                      key={job.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      onClick={() => setSelectedJob(job.id)}
                      className={`glass-light rounded-[16px] p-4 cursor-pointer transition-all border-2 ${
                        selectedJob === job.id ? 'border-[#2EFFAF]/50' : 'border-transparent hover:border-white/10'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-white font-bold text-sm">{job.displayId}</p>
                          <p className="text-white/60 text-xs">{job.timestamp}</p>
                        </div>
                        {job.priority === 'urgent' && (
                          <div className="px-2 py-1 rounded-full bg-red-500/20 text-red-400 text-xs font-semibold">URGENT</div>
                        )}
                      </div>
                      <div className="space-y-1.5 mb-2">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3 h-3 text-[#2EFFAF]" />
                          <p className="text-white/70 text-xs">{job.location.address}</p>
                        </div>
                        <p className="text-white text-sm font-semibold">{job.service}</p>
                        <p className="text-white/70 text-xs">Customer: {job.customer || '-'}</p>
                        <p className="text-white/70 text-xs">Provider: {job.provider || 'Unassigned'}</p>
                      </div>
                      <div className={`px-3 py-1.5 rounded-full text-xs font-semibold text-white ${getStatusColor(job.status)} inline-block`}>
                        {getStatusLabel(job.status)}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>

          {/* Communications */}
          <div className="col-span-1">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-[24px] p-6 h-[600px] overflow-y-auto"
            >
              <h2 className="text-white font-bold text-xl mb-4">Communication</h2>

              <div className="glass-light rounded-2xl p-4 mb-4">
                <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
                  <Send className="w-4 h-4 text-[#2EFFAF]" />
                  Broadcast message
                </h3>
                <select
                  title="Target audience"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value as 'all' | 'customer' | 'provider')}
                  className="w-full mb-2 rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-white"
                >
                  <option value="all">All users</option>
                  <option value="customer">Customers only</option>
                  <option value="provider">Providers only</option>
                </select>
                <textarea
                  value={announcement}
                  onChange={(e) => setAnnouncement(e.target.value)}
                  rows={4}
                  placeholder="Type announcement..."
                  className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-white placeholder-white/40"
                />
                <button
                  onClick={sendAnnouncement}
                  disabled={sending || !announcement.trim()}
                  className="mt-3 w-full rounded-xl bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0F1419] font-semibold py-2 disabled:opacity-50"
                >
                  {sending ? 'Sending...' : 'Send announcement'}
                </button>
                {feedback && <p className="text-xs text-white/70 mt-2">{feedback}</p>}
              </div>

              <div className="glass-light rounded-2xl p-4">
                <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-[#2EFFAF]" />
                  Recent user/provider messages
                </h3>
                {messages.length === 0 ? (
                  <p className="text-white/60 text-sm">No messages found.</p>
                ) : (
                  <div className="space-y-2">
                    {messages.map((msg) => (
                      <div key={msg.id} className="rounded-xl bg-white/5 p-3">
                        <p className="text-xs text-white/60">{msg.sender_name} ({msg.sender_role})</p>
                        <p className="text-sm text-white">{msg.message}</p>
                        <p className="text-[11px] text-white/50 mt-1">
                          {new Date(msg.created_at).toLocaleString()} • JOB-{msg.job_id.slice(0, 8)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
