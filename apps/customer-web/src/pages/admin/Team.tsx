import { motion } from 'motion/react';
import { AdminLayout } from '../../components/AdminLayout';
import { UserPlus, Shield, Eye, Edit, Trash2, Crown, Users, Lock } from 'lucide-react';
import { useState } from 'react';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'super_admin' | 'admin' | 'manager' | 'support';
  avatar: string;
  status: 'active' | 'invited';
  joinedDate: string;
  permissions: string[];
}

interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  membersCount: number;
  color: string;
}

export function AdminTeam() {
  const [showAddMember, setShowAddMember] = useState(false);
  const [activeTab, setActiveTab] = useState<'members' | 'roles'>('members');

  const teamMembers: TeamMember[] = [
    {
      id: '1',
      name: 'Admin User',
      email: 'admin@torc.com',
      role: 'super_admin',
      avatar: 'AU',
      status: 'active',
      joinedDate: 'Jan 1, 2025',
      permissions: ['all'],
    },
    {
      id: '2',
      name: 'Sarah Manager',
      email: 'sarah@torc.com',
      role: 'manager',
      avatar: 'SM',
      status: 'active',
      joinedDate: 'Jan 15, 2025',
      permissions: ['jobs', 'providers', 'payments'],
    },
    {
      id: '3',
      name: 'Mike Support',
      email: 'mike@torc.com',
      role: 'support',
      avatar: 'MS',
      status: 'active',
      joinedDate: 'Feb 1, 2025',
      permissions: ['jobs', 'users'],
    },
    {
      id: '4',
      name: 'Lisa Admin',
      email: 'lisa@torc.com',
      role: 'admin',
      avatar: 'LA',
      status: 'invited',
      joinedDate: 'Feb 8, 2025',
      permissions: ['all_except_billing'],
    },
  ];

  const roles: Role[] = [
    {
      id: 'super_admin',
      name: 'Super Admin',
      description: 'Full platform access and control',
      permissions: ['all'],
      membersCount: 1,
      color: 'from-[#008CE5] to-[#00D68F]',
    },
    {
      id: 'admin',
      name: 'Admin',
      description: 'Manage operations and users',
      permissions: ['jobs', 'users', 'providers', 'directory', 'analytics'],
      membersCount: 1,
      color: 'from-[#0070B8] to-[#0051D5]',
    },
    {
      id: 'manager',
      name: 'Manager',
      description: 'Oversee jobs and providers',
      permissions: ['jobs', 'providers', 'payments'],
      membersCount: 1,
      color: 'from-[#FF6B6B] to-[#FF5252]',
    },
    {
      id: 'support',
      name: 'Support',
      description: 'Handle customer and provider support',
      permissions: ['jobs', 'users', 'view_only'],
      membersCount: 1,
      color: 'from-[#FFA500] to-[#FF8C00]',
    },
  ];

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'super_admin': return Crown;
      case 'admin': return Shield;
      case 'manager': return Users;
      case 'support': return Eye;
      default: return Users;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'super_admin': return 'text-[#008CE5] bg-[#008CE5]/20';
      case 'admin': return 'text-[#0070B8] bg-[#0070B8]/20';
      case 'manager': return 'text-[#FF6B6B] bg-[#FF6B6B]/20';
      case 'support': return 'text-[#FFA500] bg-[#FFA500]/20';
      default: return 'text-white/60 bg-white/10';
    }
  };

  return (
    <AdminLayout>
      <div className="p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Team & Access Control</h1>
            <p className="text-white/60">Manage team members and role permissions</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowAddMember(true)}
            className="px-6 py-3 rounded-[20px] bg-gradient-to-r from-[#008CE5] to-[#0070B8] text-white font-bold flex items-center gap-2 shadow-lg shadow-[#008CE5]/30"
          >
            <UserPlus className="w-5 h-5" />
            Invite Member
          </motion.button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => setActiveTab('members')}
            className={`px-6 py-3 rounded-[20px] font-semibold transition-all ${
              activeTab === 'members'
                ? 'bg-gradient-to-r from-[#008CE5] to-[#0070B8] text-white'
                : 'glass text-white/70'
            }`}
          >
            Team Members
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => setActiveTab('roles')}
            className={`px-6 py-3 rounded-[20px] font-semibold transition-all ${
              activeTab === 'roles'
                ? 'bg-gradient-to-r from-[#008CE5] to-[#0070B8] text-white'
                : 'glass text-white/70'
            }`}
          >
            Roles & Permissions
          </motion.button>
        </div>

        {/* Team Members Tab */}
        {activeTab === 'members' && (
          <div className="space-y-4">
            {teamMembers.map((member, index) => {
              const RoleIcon = getRoleIcon(member.role);
              return (
                <motion.div
                  key={member.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="glass-light rounded-[24px] p-6"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#008CE5] to-[#0070B8] flex items-center justify-center">
                        <span className="text-white font-bold text-xl">{member.avatar}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-white font-bold text-xl">{member.name}</h3>
                          {member.status === 'invited' && (
                            <span className="px-3 py-1 rounded-full bg-yellow-400/20 text-yellow-400 text-xs font-semibold">
                              Invited
                            </span>
                          )}
                        </div>
                        <p className="text-white/60 mb-1">{member.email}</p>
                        <p className="text-white/40 text-sm">Joined {member.joinedDate}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right mr-4">
                        <span className={`px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2 ${getRoleColor(member.role)}`}>
                          <RoleIcon className="w-4 h-4" />
                          {member.role.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                        </span>
                      </div>

                      <div className="flex gap-2">
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          className="p-2 rounded-lg bg-white/5 text-white/60 hover:bg-white/10"
                        >
                          <Edit className="w-5 h-5" />
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          className="p-2 rounded-lg bg-red-400/20 text-red-400 hover:bg-red-400/30"
                        >
                          <Trash2 className="w-5 h-5" />
                        </motion.button>
                      </div>
                    </div>
                  </div>

                  {/* Permissions */}
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <p className="text-white/60 text-sm mb-2">Permissions</p>
                    <div className="flex flex-wrap gap-2">
                      {member.permissions.map((permission) => (
                        <span key={permission} className="px-3 py-1 rounded-full bg-white/5 text-white/70 text-xs">
                          {permission.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Roles Tab */}
        {activeTab === 'roles' && (
          <div className="grid grid-cols-2 gap-6">
            {roles.map((role, index) => {
              const RoleIcon = getRoleIcon(role.id);
              return (
                <motion.div
                  key={role.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="glass-light rounded-[24px] p-6"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${role.color} flex items-center justify-center`}>
                      <RoleIcon className="w-7 h-7 text-white" />
                    </div>
                    <div className="px-3 py-1 rounded-full bg-white/10 text-white/70 text-sm">
                      {role.membersCount} {role.membersCount === 1 ? 'member' : 'members'}
                    </div>
                  </div>

                  <h3 className="text-white font-bold text-xl mb-2">{role.name}</h3>
                  <p className="text-white/60 text-sm mb-4">{role.description}</p>

                  <div className="space-y-2 mb-4">
                    <p className="text-white/50 text-xs font-semibold uppercase">Permissions</p>
                    <div className="flex flex-wrap gap-2">
                      {role.permissions.map((permission) => (
                        <span key={permission} className="px-3 py-1 rounded-full bg-white/5 text-white/70 text-xs flex items-center gap-1">
                          <Lock className="w-3 h-3" />
                          {permission.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                        </span>
                      ))}
                    </div>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full px-4 py-2 rounded-[16px] bg-white/10 text-white hover:bg-white/20 flex items-center justify-center gap-2"
                  >
                    <Edit className="w-4 h-4" />
                    Edit Role
                  </motion.button>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Add Member Modal */}
        {showAddMember && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass-light rounded-[32px] p-8 max-w-lg w-full"
            >
              <h2 className="text-white font-bold text-2xl mb-6">Invite Team Member</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="text-white/70 text-sm mb-2 block">Email Address</label>
                  <input
                    type="email"
                    placeholder="email@torc.com"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-[16px] text-white placeholder-white/40 focus:outline-none focus:border-[#008CE5]/50"
                  />
                </div>

                <div>
                  <label className="text-white/70 text-sm mb-2 block">Role</label>
                  <select className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-[16px] text-white focus:outline-none focus:border-[#008CE5]/50">
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="support">Support</option>
                  </select>
                </div>

                <div>
                  <label className="text-white/70 text-sm mb-2 block">Personal Message (Optional)</label>
                  <textarea
                    placeholder="Welcome to the team..."
                    rows={3}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-[16px] text-white placeholder-white/40 focus:outline-none focus:border-[#008CE5]/50"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowAddMember(false)}
                  className="flex-1 px-6 py-3 rounded-[20px] bg-white/10 text-white font-semibold"
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex-1 px-6 py-3 rounded-[20px] bg-gradient-to-r from-[#008CE5] to-[#0070B8] text-white font-bold"
                >
                  Send Invite
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
