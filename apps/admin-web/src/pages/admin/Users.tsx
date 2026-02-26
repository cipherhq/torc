import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'motion/react';
import { AdminLayout } from '../../components/AdminLayout';
import { supabase } from '../../lib/supabase';
import {
  Users, Search, RefreshCw, UserCheck, UserX, Shield, Mail, Phone,
  ChevronDown, ChevronUp, Star, Calendar, Briefcase, Edit3, Save,
  X, Loader2, AlertCircle, DollarSign, Ban,
} from 'lucide-react';
import { Pagination } from '../../components/Pagination';

interface Profile {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  phone: string | null;
  role: 'customer' | 'provider' | 'admin';
  status: string;
  avatar_url: string | null;
  total_jobs: number | null;
  rating: number | null;
  member_since: string | null;
  created_at: string;
  updated_at: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
}

interface UserJob {
  id: string;
  status: string;
  service_id: string;
  base_price: number;
  total_amount: number;
  payment_status: string;
  rating: number | null;
  pickup_address: string | null;
  created_at: string;
  completed_at: string | null;
}

type FilterTab = 'all' | 'customers' | 'providers' | 'admins' | 'suspended';

export function AdminUsers() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // On-demand job history
  const [userJobs, setUserJobs] = useState<Record<string, UserJob[]>>({});
  const [jobsLoading, setJobsLoading] = useState<string | null>(null);

  // Edit modal
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [editForm, setEditForm] = useState({
    first_name: '', last_name: '', phone: '', role: 'customer' as string,
  });
  const [editSaving, setEditSaving] = useState(false);


  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, full_name, phone, role, status, avatar_url, total_jobs, rating, member_since, created_at, updated_at, address_line1, city, state')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setProfiles(data || []);
    } catch (err: any) {
      console.error('Failed to fetch profiles:', err);
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  // Load job history on-demand when expanding a user
  const loadUserJobs = async (userId: string, role: string) => {
    if (userJobs[userId]) return;
    setJobsLoading(userId);
    try {
      const column = role === 'provider' ? 'provider_id' : 'customer_id';
      const { data } = await supabase
        .from('jobs')
        .select('id, status, service_id, base_price, total_amount, payment_status, rating, pickup_address, created_at, completed_at')
        .eq(column, userId)
        .order('created_at', { ascending: false })
        .limit(10);

      setUserJobs(prev => ({ ...prev, [userId]: data || [] }));
    } catch (e) {
      console.warn('Failed to load user jobs:', e);
      setUserJobs(prev => ({ ...prev, [userId]: [] }));
    } finally {
      setJobsLoading(null);
    }
  };

  const handleToggleExpand = (profile: Profile) => {
    if (expandedUserId === profile.id) {
      setExpandedUserId(null);
    } else {
      setExpandedUserId(profile.id);
      loadUserJobs(profile.id, profile.role);
    }
  };

  const stats = useMemo(() => {
    const total = profiles.length;
    const active = profiles.filter((p) => p.status === 'active').length;
    const suspended = profiles.filter((p) => p.status === 'suspended').length;
    const customers = profiles.filter((p) => p.role === 'customer').length;
    const providers = profiles.filter((p) => p.role === 'provider').length;
    const admins = profiles.filter((p) => p.role === 'admin').length;
    return { total, active, suspended, customers, providers, admins };
  }, [profiles]);

  const filteredProfiles = useMemo(() => {
    let result = profiles;

    switch (activeFilter) {
      case 'customers':
        result = result.filter((p) => p.role === 'customer');
        break;
      case 'providers':
        result = result.filter((p) => p.role === 'provider');
        break;
      case 'admins':
        result = result.filter((p) => p.role === 'admin');
        break;
      case 'suspended':
        result = result.filter((p) => p.status === 'suspended');
        break;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (p) =>
          (p.full_name && p.full_name.toLowerCase().includes(q)) ||
          (p.first_name && p.first_name.toLowerCase().includes(q)) ||
          (p.last_name && p.last_name.toLowerCase().includes(q)) ||
          (p.email && p.email.toLowerCase().includes(q)) ||
          (p.phone && p.phone.toLowerCase().includes(q))
      );
    }

    return result;
  }, [profiles, activeFilter, searchQuery]);

  useEffect(() => { setCurrentPage(1); }, [activeFilter, searchQuery]);

  const paginatedProfiles = useMemo(() =>
    filteredProfiles.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
  [filteredProfiles, currentPage]);

  const getDisplayName = (p: Profile): string => {
    if (p.full_name) return p.full_name;
    if (p.first_name || p.last_name) return `${p.first_name || ''} ${p.last_name || ''}`.trim();
    return p.email || 'Unknown';
  };

  const getInitials = (p: Profile): string => {
    const name = getDisplayName(p);
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '--';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatCurrency = (n: number) => `$${n.toFixed(2)}`;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': case 'approved': case 'paid': return 'bg-green-100 text-green-700';
      case 'cancelled': case 'rejected': case 'failed': return 'bg-red-100 text-red-700';
      case 'pending': case 'matching': return 'bg-yellow-100 text-yellow-700';
      default: return 'bg-blue-100 text-blue-700';
    }
  };

  // Suspend/unsuspend user
  const handleToggleStatus = async (profile: Profile) => {
    const newStatus = profile.status === 'suspended' ? 'active' : 'suspended';
    setActionLoading(profile.id);
    try {
      const updateData: Record<string, any> = { status: newStatus, updated_at: new Date().toISOString() };
      if (newStatus === 'suspended') {
        updateData.suspended_at = new Date().toISOString();
      } else {
        updateData.suspended_at = null;
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', profile.id);

      if (updateError) throw updateError;

      const { data: sessionData } = await supabase.auth.getSession();
      const actorId = sessionData?.session?.user?.id;
      if (actorId) {
        await supabase.from('admin_audit_logs').insert({
          actor_id: actorId,
          action: newStatus === 'suspended' ? 'suspend_user' : 'unsuspend_user',
          entity_type: 'profile',
          entity_id: profile.id,
          details: { user_email: profile.email, user_name: getDisplayName(profile) },
        });
      }

      setProfiles((prev) =>
        prev.map((p) => p.id === profile.id ? { ...p, status: newStatus, ...updateData } : p)
      );
    } catch (err: any) {
      console.error('Failed to update user status:', err);
      setError(err.message || 'Failed to update user status');
    } finally {
      setActionLoading(null);
    }
  };

  // Open edit modal
  const openEditModal = (profile: Profile) => {
    setEditingUser(profile);
    setEditForm({
      first_name: profile.first_name || '',
      last_name: profile.last_name || '',
      phone: profile.phone || '',
      role: profile.role,
    });
  };

  // Save edited user
  const handleSaveEdit = async () => {
    if (!editingUser) return;
    setEditSaving(true);
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          first_name: editForm.first_name,
          last_name: editForm.last_name,
          full_name: `${editForm.first_name} ${editForm.last_name}`.trim(),
          phone: editForm.phone,
          role: editForm.role,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingUser.id);

      if (updateError) throw updateError;

      const { data: session } = await supabase.auth.getSession();
      if (session?.session?.user?.id) {
        await supabase.from('admin_audit_logs').insert({
          actor_id: session.session.user.id,
          action: 'edit_user',
          entity_type: 'profile',
          entity_id: editingUser.id,
          details: {
            changes: editForm,
            previous_role: editingUser.role,
            new_role: editForm.role,
          },
        });
      }

      setProfiles(prev =>
        prev.map(p => p.id === editingUser.id ? {
          ...p,
          first_name: editForm.first_name,
          last_name: editForm.last_name,
          full_name: `${editForm.first_name} ${editForm.last_name}`.trim(),
          phone: editForm.phone,
          role: editForm.role as Profile['role'],
        } : p)
      );

      setEditingUser(null);
    } catch (err: any) {
      console.error('Failed to save user:', err);
      setError(err.message || 'Failed to save user');
    } finally {
      setEditSaving(false);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'customer': return 'bg-blue-100 text-blue-700';
      case 'provider': return 'bg-green-100 text-green-700';
      case 'admin': return 'bg-purple-100 text-purple-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700';
      case 'suspended': return 'bg-red-100 text-red-700';
      case 'pending': return 'bg-yellow-100 text-yellow-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const filterTabs: { key: FilterTab; label: string; count?: number }[] = [
    { key: 'all', label: 'All', count: stats.total },
    { key: 'customers', label: 'Customers', count: stats.customers },
    { key: 'providers', label: 'Providers', count: stats.providers },
    { key: 'admins', label: 'Admins', count: stats.admins },
    { key: 'suspended', label: 'Suspended', count: stats.suspended },
  ];

  const statCards = [
    { label: 'Total Users', value: stats.total, icon: Users, gradient: 'linear-gradient(135deg, #008CE5, #0070B8)' },
    { label: 'Active', value: stats.active, icon: UserCheck, gradient: 'linear-gradient(135deg, #22C55E, #16A34A)' },
    { label: 'Suspended', value: stats.suspended, icon: UserX, gradient: 'linear-gradient(135deg, #EF4444, #DC2626)' },
    { label: 'Admins', value: stats.admins, icon: Shield, gradient: 'linear-gradient(135deg, #8B5CF6, #7C3AED)' },
  ];

  return (
    <AdminLayout>
      <div className="p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">User Management</h1>
            <p className="text-gray-500">Manage all user accounts, roles, and permissions</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={fetchProfiles}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </motion.button>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mb-6 flex items-center gap-3 bg-red-50 border border-red-200 rounded-[20px] px-5 py-4 text-red-600">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-medium">{error}</p>
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {statCards.map((card, index) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6"
              >
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ background: card.gradient }}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <p className="text-gray-500 text-sm mb-1">{card.label}</p>
                <p className="text-gray-900 font-bold text-2xl">
                  {loading ? '--' : card.value.toLocaleString()}
                </p>
              </motion.div>
            );
          })}
        </div>

        {/* Search + Filter Tabs */}
        <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6 mb-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search users by name, email, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#008CE5]/50"
            />
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            {filterTabs.map((tab) => (
              <motion.button
                key={tab.key}
                whileTap={{ scale: 0.95 }}
                onClick={() => setActiveFilter(tab.key)}
                className="px-4 py-2 rounded-full text-sm font-semibold transition-all"
                style={activeFilter === tab.key
                  ? { background: 'linear-gradient(to right, #008CE5, #0070B8)', color: '#FFFFFF' }
                  : { backgroundColor: '#F9FAFB', color: '#4B5563' }
                }
              >
                {tab.label} {tab.count !== undefined && !loading ? `(${tab.count})` : ''}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-16 flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 text-[#008CE5] animate-spin mb-4" />
            <p className="text-gray-500 text-sm">Loading users...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && filteredProfiles.length === 0 && (
          <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-16 flex flex-col items-center justify-center">
            <Users className="w-12 h-12 text-gray-300 mb-4" />
            <p className="text-gray-900 font-semibold text-lg mb-1">No users found</p>
            <p className="text-gray-500 text-sm">
              {searchQuery ? 'Try adjusting your search or filters.' : 'No users match the current filter.'}
            </p>
          </div>
        )}

        {/* User Cards */}
        {!loading && filteredProfiles.length > 0 && (
          <div className="space-y-3">
            {paginatedProfiles.map((profile, index) => {
              const isExpanded = expandedUserId === profile.id;
              const displayName = getDisplayName(profile);
              const initials = getInitials(profile);
              const isProcessing = actionLoading === profile.id;
              const jobs = userJobs[profile.id] || [];
              const isJobsLoading = jobsLoading === profile.id;

              return (
                <motion.div
                  key={profile.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.03, 0.5) }}
                  className="bg-white shadow-sm border border-gray-100 rounded-[24px] overflow-hidden"
                >
                  {/* Main Row */}
                  <div
                    className="flex items-center gap-4 p-5 cursor-pointer hover:bg-gray-50/50 transition-colors"
                    onClick={() => handleToggleExpand(profile)}
                  >
                    {/* Avatar */}
                    <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #008CE5, #0070B8)' }}>
                      <span className="text-white font-bold text-sm">{initials}</span>
                    </div>

                    {/* Name + Email */}
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-900 font-semibold truncate">{displayName}</p>
                      <p className="text-gray-500 text-sm truncate">{profile.email || '--'}</p>
                    </div>

                    {/* Role Badge */}
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold capitalize hidden sm:inline-block ${getRoleBadge(profile.role)}`}>
                      {profile.role}
                    </span>

                    {/* Status Badge */}
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold capitalize ${getStatusBadge(profile.status)}`}>
                      {profile.status}
                    </span>

                    {/* Jobs Count */}
                    <div className="hidden md:flex items-center gap-1 text-gray-500 text-sm min-w-[60px]">
                      <Briefcase className="w-4 h-4" />
                      <span>{profile.total_jobs ?? 0}</span>
                    </div>

                    {/* Expand icon */}
                    <div className="text-gray-400">
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                  </div>

                  {/* Expanded Detail */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 px-5 pb-5">
                      {/* Info grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                        <div className="bg-gray-50 rounded-xl p-3">
                          <p className="text-gray-400 text-xs mb-1">Email</p>
                          <div className="flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-gray-400" />
                            <p className="text-gray-900 text-sm font-semibold truncate">{profile.email || '--'}</p>
                          </div>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-3">
                          <p className="text-gray-400 text-xs mb-1">Phone</p>
                          <div className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-gray-400" />
                            <p className="text-gray-900 text-sm font-semibold">{profile.phone || '--'}</p>
                          </div>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-3">
                          <p className="text-gray-400 text-xs mb-1">Member Since</p>
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-gray-400" />
                            <p className="text-gray-900 text-sm font-semibold">{formatDate(profile.member_since || profile.created_at)}</p>
                          </div>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-3">
                          <p className="text-gray-400 text-xs mb-1">Location</p>
                          <p className="text-gray-900 text-sm font-semibold">
                            {profile.city && profile.state ? `${profile.city}, ${profile.state}` : '--'}
                          </p>
                        </div>
                      </div>

                      {/* Stats row */}
                      <div className="grid grid-cols-3 gap-3 mt-3">
                        <div className="bg-gray-50 rounded-xl p-3">
                          <p className="text-gray-400 text-xs mb-1">Total Jobs</p>
                          <div className="flex items-center gap-1.5">
                            <Briefcase className="w-3.5 h-3.5 text-gray-400" />
                            <p className="text-gray-900 text-sm font-bold">{profile.total_jobs ?? 0}</p>
                          </div>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-3">
                          <p className="text-gray-400 text-xs mb-1">Rating</p>
                          <div className="flex items-center gap-1.5">
                            <Star className="w-3.5 h-3.5 text-yellow-400" />
                            <p className="text-gray-900 text-sm font-bold">{profile.rating != null && profile.rating > 0 ? profile.rating.toFixed(1) : '--'}</p>
                          </div>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-3">
                          <p className="text-gray-400 text-xs mb-1">Role</p>
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold capitalize ${getRoleBadge(profile.role)}`}>
                            {profile.role}
                          </span>
                        </div>
                      </div>

                      {/* Job History */}
                      <div className="mt-5">
                        <h4 className="text-gray-900 font-semibold text-sm mb-3 flex items-center gap-2">
                          <Briefcase className="w-4 h-4 text-[#008CE5]" />
                          Recent Jobs
                        </h4>
                        {isJobsLoading ? (
                          <div className="flex items-center gap-2 py-3">
                            <Loader2 className="w-4 h-4 animate-spin text-[#008CE5]" />
                            <span className="text-gray-400 text-sm">Loading jobs...</span>
                          </div>
                        ) : jobs.length === 0 ? (
                          <p className="text-gray-400 text-sm bg-gray-50 rounded-xl p-3">No jobs found</p>
                        ) : (
                          <div className="space-y-2">
                            {jobs.slice(0, 5).map((job) => (
                              <div key={job.id} className="bg-gray-50 rounded-xl p-3 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${getStatusColor(job.status)}`}>
                                    {job.status}
                                  </span>
                                  <span className="text-gray-500 text-xs flex-shrink-0">{formatDate(job.created_at)}</span>
                                  {job.pickup_address && (
                                    <span className="text-gray-400 text-xs truncate hidden lg:inline">{job.pickup_address}</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 flex-shrink-0">
                                  {job.rating && (
                                    <div className="flex items-center gap-1">
                                      <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                                      <span className="text-gray-600 text-xs">{job.rating}</span>
                                    </div>
                                  )}
                                  <span className="text-gray-900 text-sm font-semibold">
                                    {formatCurrency(Number(job.total_amount) || 0)}
                                  </span>
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(job.payment_status)}`}>
                                    {job.payment_status}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap items-center gap-3 mt-5 pt-4 border-t border-gray-100">
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={(e) => { e.stopPropagation(); openEditModal(profile); }}
                          className="px-5 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200 transition-colors flex items-center gap-2"
                        >
                          <Edit3 className="w-4 h-4" />
                          Edit User
                        </motion.button>

                        {profile.status === 'suspended' ? (
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={(e) => { e.stopPropagation(); handleToggleStatus(profile); }}
                            disabled={isProcessing}
                            className="px-5 py-2.5 rounded-xl bg-green-100 text-green-700 text-sm font-semibold hover:bg-green-200 disabled:opacity-50 transition-colors flex items-center gap-2"
                          >
                            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                            Unsuspend
                          </motion.button>
                        ) : (
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={(e) => { e.stopPropagation(); handleToggleStatus(profile); }}
                            disabled={isProcessing}
                            className="px-5 py-2.5 rounded-xl bg-red-100 text-red-700 text-sm font-semibold hover:bg-red-200 disabled:opacity-50 transition-colors flex items-center gap-2"
                          >
                            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                            Suspend
                          </motion.button>
                        )}

                      </div>

                      {/* User ID */}
                      <p className="text-gray-500 text-xs mt-3">ID: {profile.id}</p>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {!loading && filteredProfiles.length > 0 && (
          <Pagination currentPage={currentPage} totalItems={filteredProfiles.length} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
        )}

        {/* Edit Modal */}
        {editingUser && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditingUser(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-[24px] p-6 w-full max-w-lg"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">Edit User</h2>
                <button onClick={() => setEditingUser(null)} className="p-2 rounded-xl hover:bg-gray-100">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-gray-500 text-xs font-semibold mb-1 block">First Name</label>
                    <input
                      type="text"
                      value={editForm.first_name}
                      onChange={(e) => setEditForm(prev => ({ ...prev, first_name: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#008CE5]"
                    />
                  </div>
                  <div>
                    <label className="text-gray-500 text-xs font-semibold mb-1 block">Last Name</label>
                    <input
                      type="text"
                      value={editForm.last_name}
                      onChange={(e) => setEditForm(prev => ({ ...prev, last_name: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#008CE5]"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-gray-500 text-xs font-semibold mb-1 block">Phone</label>
                  <input
                    type="text"
                    value={editForm.phone}
                    onChange={(e) => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#008CE5]"
                  />
                </div>

                <div>
                  <label className="text-gray-500 text-xs font-semibold mb-1 block">Role</label>
                  {editingUser.role === 'admin' ? (
                    <p className="px-4 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-gray-500 text-sm">Admin (managed via RBAC)</p>
                  ) : (
                    <select
                      value={editForm.role}
                      onChange={(e) => setEditForm(prev => ({ ...prev, role: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#008CE5]"
                    >
                      <option value="customer">Customer</option>
                      <option value="provider">Provider</option>
                    </select>
                  )}
                </div>

                <p className="text-gray-400 text-xs">Email: {editingUser.email} (cannot be changed)</p>
              </div>

              <div className="flex gap-3 mt-6">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSaveEdit}
                  disabled={editSaving}
                  className="flex-1 py-3 rounded-xl text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{ background: 'linear-gradient(to right, #008CE5, #0070B8)' }}
                >
                  {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {editSaving ? 'Saving...' : 'Save Changes'}
                </motion.button>
                <button
                  onClick={() => setEditingUser(null)}
                  className="px-6 py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}

      </div>
    </AdminLayout>
  );
}
