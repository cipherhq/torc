import { motion } from 'motion/react';
import { AdminLayout } from '../../components/AdminLayout';
import { Search, Filter, UserPlus, Mail, Phone, Ban, CheckCircle, Trash2, RotateCcw } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';

interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: 'active' | 'suspended' | 'pending' | 'deleted';
  joinedDate: string;
  totalJobs: number;
  totalSpent: string;
  avatar: string;
}

export function AdminUsers() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningUserId, setActioningUserId] = useState<string | null>(null);
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [bulkActioning, setBulkActioning] = useState(false);

  useEffect(() => {
    async function loadCurrentAdmin() {
      const { data } = await supabase.auth.getUser();
      setCurrentAdminId(data.user?.id || null);
    }
    void loadCurrentAdmin();
  }, []);

  useEffect(() => {
    async function loadUsers() {
      try {
        setLoading(true);
        
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;

        // Fetch additional data for each user (total jobs and spent)
        const formattedUsers: User[] = await Promise.all((data || []).map(async (profile: any) => {
          // Get customer data if exists
          const { data: customerData } = await supabase
            .from('customers')
            .select('total_jobs, total_spent')
            .eq('user_id', profile.id)
            .single();

          const totalJobs = customerData?.total_jobs || 0;
          const totalSpent = customerData?.total_spent ? `$${Number(customerData.total_spent).toFixed(0)}` : '$0';
          
          const name = profile.full_name || profile.email?.split('@')[0] || 'Unknown';
          const initials = name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
          
          const joinedDate = new Date(profile.created_at).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
          });

          return {
            id: profile.id,
            name,
            email: profile.email || '-',
            phone: profile.phone || '-',
            status: profile.status === 'suspended'
              ? 'suspended'
              : profile.status === 'pending'
                ? 'pending'
                : profile.status === 'deleted'
                  ? 'deleted'
                : 'active',
            joinedDate,
            totalJobs,
            totalSpent,
            avatar: initials,
          };
        }));

        setUsers(formattedUsers);
      } catch (error) {
        console.warn('Failed to load users:', error);
        setUsers([]);
      } finally {
        setLoading(false);
      }
    }
    loadUsers();
  }, []);

  async function writeAuditLog(action: string, targetUserId: string, details: Record<string, unknown>) {
    if (!currentAdminId) return;
    const { error } = await supabase.from('admin_audit_logs').insert({
      actor_id: currentAdminId,
      action,
      entity_type: 'user',
      entity_id: targetUserId,
      details,
    });
    if (error) {
      // Keep user management functional even if the audit table is not deployed yet.
      console.warn('Audit log write skipped:', error.message);
    }
  }

  async function writeAuditLogs(rows: Array<{ action: string; entity_id: string; details: Record<string, unknown> }>) {
    if (!currentAdminId || rows.length === 0) return;
    const payload = rows.map((row) => ({
      actor_id: currentAdminId,
      action: row.action,
      entity_type: 'user',
      entity_id: row.entity_id,
      details: row.details,
    }));
    const { error } = await supabase.from('admin_audit_logs').insert(payload);
    if (error) {
      console.warn('Audit log write skipped:', error.message);
    }
  }

  async function softDeleteUser(user: User) {
    const confirmed = window.confirm(`Soft-delete ${user.name}? This preserves records and disables access.`);
    if (!confirmed) return;

    try {
      setActionError(null);
      setActionMessage(null);
      setActioningUserId(user.id);

      const { error } = await supabase
        .from('profiles')
        .update({
          status: 'deleted',
          deleted_at: new Date().toISOString(),
          suspended_at: null,
        })
        .eq('id', user.id);

      if (error) throw error;

      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, status: 'deleted' } : u)));
      setSelectedUserIds((prev) => prev.filter((id) => id !== user.id));

      await writeAuditLog('delete_user', user.id, {
        target_user_name: user.name,
        previous_status: user.status,
        next_status: 'deleted',
      });

      setActionMessage(`${user.name} was soft-deleted.`);
    } catch (error: any) {
      console.warn('Failed to soft-delete user:', error);
      setActionError(error?.message || 'Could not soft-delete user.');
    } finally {
      setActioningUserId(null);
    }
  }

  async function restoreUser(user: User) {
    const confirmed = window.confirm(`Restore ${user.name} to active status?`);
    if (!confirmed) return;

    try {
      setActionError(null);
      setActionMessage(null);
      setActioningUserId(user.id);

      const { error } = await supabase
        .from('profiles')
        .update({
          status: 'active',
          deleted_at: null,
          suspended_at: null,
        })
        .eq('id', user.id);

      if (error) throw error;

      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, status: 'active' } : u)));
      setSelectedUserIds((prev) => prev.filter((id) => id !== user.id));

      await writeAuditLog('restore_user', user.id, {
        target_user_name: user.name,
        previous_status: user.status,
        next_status: 'active',
      });

      setActionMessage(`${user.name} has been restored.`);
    } catch (error: any) {
      console.warn('Failed to restore user:', error);
      setActionError(error?.message || 'Could not restore user.');
    } finally {
      setActioningUserId(null);
    }
  }

  const filteredUsers = useMemo(
    () => users.filter((user) => {
      if (selectedStatus !== 'all' && user.status !== selectedStatus) return false;
      if (
        searchQuery &&
        !user.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !user.email.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !user.phone.includes(searchQuery)
      ) return false;
      return true;
    }),
    [users, selectedStatus, searchQuery]
  );

  const allFilteredSelected = filteredUsers.length > 0 && filteredUsers.every((u) => selectedUserIds.includes(u.id));

  function toggleUserSelection(userId: string) {
    setSelectedUserIds((prev) => (
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    ));
  }

  function toggleSelectAllFiltered() {
    if (allFilteredSelected) {
      setSelectedUserIds((prev) => prev.filter((id) => !filteredUsers.some((u) => u.id === id)));
      return;
    }
    setSelectedUserIds((prev) => Array.from(new Set([...prev, ...filteredUsers.map((u) => u.id)])));
  }

  async function runBulkStatusUpdate(nextStatus: 'active' | 'suspended' | 'deleted') {
    if (selectedUserIds.length === 0) return;
    const confirmed = window.confirm(`Apply "${nextStatus}" to ${selectedUserIds.length} selected user(s)?`);
    if (!confirmed) return;

    try {
      setActionError(null);
      setActionMessage(null);
      setBulkActioning(true);

      const updatePayload: Record<string, unknown> = { status: nextStatus };
      if (nextStatus === 'suspended') {
        updatePayload.suspended_at = new Date().toISOString();
        updatePayload.deleted_at = null;
      } else if (nextStatus === 'deleted') {
        updatePayload.deleted_at = new Date().toISOString();
        updatePayload.suspended_at = null;
      } else {
        updatePayload.deleted_at = null;
        updatePayload.suspended_at = null;
      }

      const { error } = await supabase
        .from('profiles')
        .update(updatePayload)
        .in('id', selectedUserIds);
      if (error) throw error;

      const selectedSet = new Set(selectedUserIds);
      const affectedUsers = users.filter((u) => selectedSet.has(u.id));
      setUsers((prev) => prev.map((u) => (selectedSet.has(u.id) ? { ...u, status: nextStatus } : u)));

      const actionName = nextStatus === 'suspended'
        ? 'suspend_user'
        : nextStatus === 'deleted'
          ? 'delete_user'
          : 'activate_user';

      await writeAuditLogs(
        affectedUsers.map((u) => ({
          action: actionName,
          entity_id: u.id,
          details: {
            target_user_name: u.name,
            previous_status: u.status,
            next_status: nextStatus,
            bulk_action: true,
          },
        }))
      );

      setSelectedUserIds([]);
      setActionMessage(`Updated ${affectedUsers.length} user(s) to ${nextStatus}.`);
    } catch (error: any) {
      console.warn('Bulk user update failed:', error);
      setActionError(error?.message || 'Bulk update failed.');
    } finally {
      setBulkActioning(false);
    }
  }

  async function setUserStatus(user: User, nextStatus: 'active' | 'suspended') {
    const intentLabel = nextStatus === 'suspended' ? 'suspend' : 'activate';
    const confirmed = window.confirm(`Are you sure you want to ${intentLabel} ${user.name}?`);
    if (!confirmed) return;

    try {
      setActionError(null);
      setActionMessage(null);
      setActioningUserId(user.id);

      const updatePayload: Record<string, unknown> = {
        status: nextStatus,
      };
      if (nextStatus === 'suspended') {
        updatePayload.suspended_at = new Date().toISOString();
      } else {
        updatePayload.suspended_at = null;
      }

      const { error } = await supabase
        .from('profiles')
        .update(updatePayload)
        .eq('id', user.id);

      if (error) throw error;

      setUsers((prev) => prev.map((u) => (
        u.id === user.id
          ? { ...u, status: nextStatus }
          : u
      )));

      await writeAuditLog(
        nextStatus === 'suspended' ? 'suspend_user' : 'activate_user',
        user.id,
        {
          target_user_name: user.name,
          previous_status: user.status,
          next_status: nextStatus,
        }
      );

      setActionMessage(`${user.name} is now ${nextStatus}.`);
    } catch (error: any) {
      console.warn('Failed to update user status:', error);
      setActionError(error?.message || 'Could not update user status.');
    } finally {
      setActioningUserId(null);
    }
  }

  const stats = [
    { label: 'Total Users', value: String(users.length), color: 'from-[#2EFFAF] to-[#00D68F]' },
    { label: 'Active Users', value: String(users.filter(u => u.status === 'active').length), color: 'from-[#007AFF] to-[#0051D5]' },
    { label: 'New This Month', value: String(users.filter(u => {
      const joined = new Date(u.joinedDate);
      const now = new Date();
      return joined.getMonth() === now.getMonth() && joined.getFullYear() === now.getFullYear();
    }).length), color: 'from-[#FF6B6B] to-[#FF5252]' },
    { label: 'Suspended', value: String(users.filter(u => u.status === 'suspended').length), color: 'from-[#FFA500] to-[#FF8C00]' },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-[#2EFFAF] bg-[#2EFFAF]/20';
      case 'suspended': return 'text-red-400 bg-red-400/20';
      case 'pending': return 'text-yellow-400 bg-yellow-400/20';
      case 'deleted': return 'text-gray-300 bg-gray-500/20';
      default: return 'text-white/60 bg-white/10';
    }
  };

  return (
    <AdminLayout>
      <div className="p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">User Management</h1>
            <p className="text-white/60">Manage all customer accounts</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setActionError('User creation should happen through Auth signup flow. Direct admin create is not enabled in this client app.')}
            className="px-6 py-3 rounded-[20px] bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0F1419] font-bold flex items-center gap-2 shadow-lg shadow-[#2EFFAF]/30"
          >
            <UserPlus className="w-5 h-5" />
            Add User
          </motion.button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="glass-light rounded-[24px] p-6"
            >
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${stat.color} flex items-center justify-center mb-4`}>
                <span className="text-white font-bold text-xl">{stat.value.slice(0, 1)}</span>
              </div>
              <p className="text-white/60 text-sm mb-1">{stat.label}</p>
              <div className="flex items-end justify-between">
                <p className="text-white font-bold text-2xl">{stat.value}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Search and Filters */}
        <div className="glass-light rounded-[24px] p-6 mb-6">
          {actionError && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {actionError}
            </div>
          )}
          {actionMessage && (
            <div className="mb-4 rounded-xl border border-[#2EFFAF]/30 bg-[#2EFFAF]/10 px-4 py-3 text-sm text-[#9FFFD8]">
              {actionMessage}
            </div>
          )}
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
              <input
                type="text"
                placeholder="Search users by name, email, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-[16px] text-white placeholder-white/40 focus:outline-none focus:border-[#2EFFAF]/50"
              />
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-4 py-3 bg-white/5 border border-white/10 rounded-[16px] flex items-center gap-2 text-white hover:bg-white/10"
            >
              <Filter className="w-5 h-5" />
              <span>Filters</span>
            </motion.button>
          </div>

          {/* Status filters */}
          <div className="flex gap-2 mt-4">
            {['all', 'active', 'suspended', 'pending', 'deleted'].map((status) => (
              <motion.button
                key={status}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedStatus(status)}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                  selectedStatus === status
                    ? 'bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0F1419]'
                    : 'bg-white/5 text-white/70 hover:bg-white/10'
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </motion.button>
            ))}
          </div>
          {selectedUserIds.length > 0 && (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 flex flex-wrap items-center gap-2">
              <span className="text-white/80 text-sm">{selectedUserIds.length} selected</span>
              <button
                onClick={() => void runBulkStatusUpdate('suspended')}
                disabled={bulkActioning}
                className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-300 text-sm font-semibold disabled:opacity-60"
                title="Suspend selected users"
              >
                Suspend
              </button>
              <button
                onClick={() => void runBulkStatusUpdate('active')}
                disabled={bulkActioning}
                className="px-3 py-1.5 rounded-lg bg-[#2EFFAF]/20 text-[#9FFFD8] text-sm font-semibold disabled:opacity-60"
                title="Activate selected users"
              >
                Activate
              </button>
              <button
                onClick={() => void runBulkStatusUpdate('deleted')}
                disabled={bulkActioning}
                className="px-3 py-1.5 rounded-lg bg-gray-500/20 text-gray-200 text-sm font-semibold disabled:opacity-60"
                title="Delete selected users"
              >
                Delete
              </button>
            </div>
          )}
        </div>

        {/* Users Table */}
        <div className="glass-light rounded-[24px] overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <p className="text-white/60">Loading users...</p>
            </div>
          ) : users.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-white/60">No users found</p>
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-white/10">
                <tr>
                  <th className="px-6 py-4 text-left">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAllFiltered}
                      title="Select all filtered users"
                      className="w-4 h-4 rounded bg-white/10 border-white/20"
                    />
                  </th>
                  <th className="px-6 py-4 text-left text-white/60 text-sm font-semibold">User</th>
                  <th className="px-6 py-4 text-left text-white/60 text-sm font-semibold">Contact</th>
                  <th className="px-6 py-4 text-left text-white/60 text-sm font-semibold">Status</th>
                  <th className="px-6 py-4 text-left text-white/60 text-sm font-semibold">Joined</th>
                  <th className="px-6 py-4 text-left text-white/60 text-sm font-semibold">Jobs</th>
                  <th className="px-6 py-4 text-left text-white/60 text-sm font-semibold">Total Spent</th>
                  <th className="px-6 py-4 text-left text-white/60 text-sm font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user, index) => (
                  <motion.tr
                    key={user.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedUserIds.includes(user.id)}
                        onChange={() => toggleUserSelection(user.id)}
                        title={`Select ${user.name}`}
                        className="w-4 h-4 rounded bg-white/10 border-white/20"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center">
                          <span className="text-[#0F1419] font-bold text-sm">{user.avatar}</span>
                        </div>
                        <div>
                          <p className="text-white font-semibold">{user.name}</p>
                          <p className="text-white/50 text-sm">ID: {user.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-white/70 text-sm">
                          <Mail className="w-4 h-4" />
                          {user.email}
                        </div>
                        <div className="flex items-center gap-2 text-white/70 text-sm">
                          <Phone className="w-4 h-4" />
                          {user.phone}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(user.status)}`}>
                        {user.status.charAt(0).toUpperCase() + user.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-white/70">{user.joinedDate}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-white font-semibold">{user.totalJobs}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[#2EFFAF] font-bold">{user.totalSpent}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {user.status === 'active' ? (
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => setUserStatus(user, 'suspended')}
                            disabled={actioningUserId === user.id}
                            className="p-2 rounded-lg bg-red-400/20 text-red-400 hover:bg-red-400/30"
                            title="Suspend User"
                          >
                            <Ban className="w-4 h-4" />
                          </motion.button>
                        ) : user.status === 'deleted' ? (
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => restoreUser(user)}
                            disabled={actioningUserId === user.id}
                            className="p-2 rounded-lg bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 disabled:opacity-60"
                            title="Restore User"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </motion.button>
                        ) : (
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => setUserStatus(user, 'active')}
                            disabled={actioningUserId === user.id}
                            className="p-2 rounded-lg bg-[#2EFFAF]/20 text-[#2EFFAF] hover:bg-[#2EFFAF]/30"
                            title="Activate User"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </motion.button>
                        )}
                        {user.status !== 'deleted' && (
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => softDeleteUser(user)}
                            disabled={actioningUserId === user.id}
                            className="p-2 rounded-lg bg-gray-500/20 text-gray-300 hover:bg-gray-500/30 disabled:opacity-60"
                            title="Soft Delete User"
                          >
                            <Trash2 className="w-4 h-4" />
                          </motion.button>
                        )}
                      </div>
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
