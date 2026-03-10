import { motion } from 'motion/react';
import { AdminLayout } from '../../components/AdminLayout';
import { Shield, Eye, Crown, Users, Lock, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar: string;
  status: string;
  joinedDate: string;
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
  const [activeTab, setActiveTab] = useState<'members' | 'roles'>('members');
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadTeam() {
      try {
        setLoading(true);

        // Fetch all admin users from profiles
        const { data: admins } = await supabase
          .from('profiles')
          .select('id, full_name, first_name, last_name, email, role, status, created_at')
          .eq('role', 'admin')
          .order('created_at', { ascending: true });

        const members: TeamMember[] = (admins || []).map((p: any) => {
          const name = p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email?.split('@')[0] || 'Unknown';
          const initials = name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
          const joinedDate = new Date(p.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          });

          return {
            id: p.id,
            name,
            email: p.email || '-',
            role: 'admin',
            avatar: initials,
            status: p.status || 'active',
            joinedDate,
          };
        });

        setTeamMembers(members);

        // Build roles summary from profile data
        const { data: allProfiles } = await supabase
          .from('profiles')
          .select('role')
          .not('role', 'is', null);

        const roleCounts: Record<string, number> = {};
        (allProfiles || []).forEach((p: any) => {
          const r = p.role || 'customer';
          roleCounts[r] = (roleCounts[r] || 0) + 1;
        });

        setRoles([
          {
            id: 'admin',
            name: 'Admin',
            description: 'Full platform access — manage users, providers, jobs, payments, and settings',
            permissions: ['dashboard', 'users', 'providers', 'jobs', 'payments', 'settings', 'analytics'],
            membersCount: roleCounts['admin'] || 0,
            color: 'from-[#008CE5] to-[#0070B8]',
          },
          {
            id: 'provider',
            name: 'Provider',
            description: 'Service providers who accept and complete roadside assistance jobs',
            permissions: ['accept_jobs', 'view_earnings', 'manage_profile', 'upload_documents'],
            membersCount: roleCounts['provider'] || 0,
            color: 'from-[#0070B8] to-[#0051D5]',
          },
          {
            id: 'customer',
            name: 'Customer',
            description: 'End users who request roadside assistance services',
            permissions: ['request_service', 'track_jobs', 'rate_providers', 'manage_profile'],
            membersCount: roleCounts['customer'] || 0,
            color: 'from-[#FF6B6B] to-[#FF5252]',
          },
        ]);
      } catch (error) {
        console.warn('Failed to load team data:', error);
      } finally {
        setLoading(false);
      }
    }
    loadTeam();
  }, []);

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin': return Crown;
      case 'provider': return Shield;
      case 'customer': return Users;
      default: return Eye;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return 'text-[#008CE5] bg-[#008CE5]/20';
      case 'provider': return 'text-[#0070B8] bg-[#0070B8]/20';
      case 'customer': return 'text-[#FF6B6B] bg-[#FF6B6B]/20';
      default: return 'text-white/60 bg-white/10';
    }
  };

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Team & Access Control</h1>
          <p className="text-white/60">View admin team members and platform roles</p>
        </div>

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
            Admin Members
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
            Roles Overview
          </motion.button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-[#008CE5] animate-spin" />
          </div>
        )}

        {!loading && activeTab === 'members' && (
          <div className="space-y-4">
            {teamMembers.length === 0 ? (
              <div className="glass-light rounded-[24px] p-8 text-center">
                <p className="text-white/60">No admin team members found.</p>
              </div>
            ) : (
              teamMembers.map((member, index) => {
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
                            {member.status === 'suspended' && (
                              <span className="px-3 py-1 rounded-full bg-red-400/20 text-red-400 text-xs font-semibold">
                                Suspended
                              </span>
                            )}
                          </div>
                          <p className="text-white/60 mb-1">{member.email}</p>
                          <p className="text-white/40 text-sm">Joined {member.joinedDate}</p>
                        </div>
                      </div>

                      <span className={`px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2 ${getRoleColor(member.role)}`}>
                        <RoleIcon className="w-4 h-4" />
                        {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                      </span>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        )}

        {!loading && activeTab === 'roles' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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

                  <div className="space-y-2">
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
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
