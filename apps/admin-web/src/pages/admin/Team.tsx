import { motion } from 'motion/react';
import { AdminLayout } from '../../components/AdminLayout';
import { Shield, Eye, Crown, Users, Loader2, AlertCircle, Mail, UserPlus, X, ChevronDown } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { logAudit } from '../../lib/auditLog';
import { ROLE_PERMISSIONS } from '../../lib/rbac';
import type { AdminRole } from '../../lib/rbac';

interface TeamMember {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: string;
  admin_role: string | null;
  status: string;
  avatar_url: string | null;
  created_at: string | null;
}

/**
 * Resolve the effective admin sub-role for a team member.
 * Falls back to 'admin' when admin_role is not set.
 */
function effectiveAdminRole(member: TeamMember): AdminRole {
  const valid: AdminRole[] = ['super_admin', 'admin', 'manager', 'support'];
  if (member.admin_role && valid.includes(member.admin_role as AdminRole)) {
    return member.admin_role as AdminRole;
  }
  return 'admin';
}

/**
 * Build a human-readable list of permission labels from the route permissions
 * defined in rbac.ts, for display on the Roles tab.
 */
function permissionsLabel(roleId: AdminRole): string[] {
  const routes = ROLE_PERMISSIONS[roleId];
  if (!routes) return [];
  if (routes.includes('*')) return ['All Access'];

  const labelMap: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/users': 'Users',
    '/providers': 'Providers',
    '/provider-approval': 'Provider Approval',
    '/jobs': 'Jobs',
    '/live-dispatch': 'Live Dispatch',
    '/services': 'Services',
    '/settings': 'Settings',
    '/payouts': 'Payouts',
    '/payout-history': 'Payout History',
    '/payments': 'Payments',
    '/finance': 'Finance',
    '/reporting': 'Reporting',
    '/analytics': 'Analytics',
    '/notifications': 'Notifications',
    '/support-tickets': 'Support Tickets',
    '/audit-trail': 'Audit Trail',
    '/documents': 'Documents',
    '/team': 'Team',
    '/directory': 'Directory',
  };

  return routes.map((r) => labelMap[r] || r).filter(Boolean);
}

/* Static role definitions -- visual metadata for the UI */
const ROLES = [
  {
    id: 'super_admin' as AdminRole,
    name: 'Super Admin',
    description: 'Full platform access and control',
    get permissions() { return permissionsLabel('super_admin'); },
    gradient: 'linear-gradient(135deg, #008CE5, #0070B8)',
    icon: Crown,
    badgeBg: 'rgba(0,140,229,0.1)',
    badgeColor: '#008CE5',
  },
  {
    id: 'admin' as AdminRole,
    name: 'Admin',
    description: 'Manage operations, users, finance, and settings',
    get permissions() { return permissionsLabel('admin'); },
    gradient: 'linear-gradient(135deg, #007AFF, #0051D5)',
    icon: Shield,
    badgeBg: 'rgba(0,122,255,0.1)',
    badgeColor: '#007AFF',
  },
  {
    id: 'manager' as AdminRole,
    name: 'Manager',
    description: 'Oversee jobs, providers, and payments',
    get permissions() { return permissionsLabel('manager'); },
    gradient: 'linear-gradient(135deg, #FF6B6B, #FF5252)',
    icon: Users,
    badgeBg: 'rgba(255,107,107,0.1)',
    badgeColor: '#FF6B6B',
  },
  {
    id: 'support' as AdminRole,
    name: 'Support',
    description: 'Handle customer and provider support',
    get permissions() { return permissionsLabel('support'); },
    gradient: 'linear-gradient(135deg, #FFA500, #FF8C00)',
    icon: Eye,
    badgeBg: 'rgba(255,165,0,0.1)',
    badgeColor: '#FFA500',
  },
];

export function AdminTeam() {
  const [activeTab, setActiveTab] = useState<'members' | 'roles'>('members');
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* Invite modal */
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFirstName, setInviteFirstName] = useState('');
  const [inviteLastName, setInviteLastName] = useState('');
  const [inviteRole, setInviteRole] = useState('admin');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  /* Role editing */
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [savingRole, setSavingRole] = useState(false);

  useEffect(() => {
    loadTeam();
  }, []);

  async function loadTeam() {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('profiles')
      .select('id, full_name, first_name, last_name, email, role, admin_role, status, avatar_url, created_at')
      .eq('role', 'admin')
      .order('created_at', { ascending: true });

    if (err) {
      setError(err.message);
    } else {
      setMembers(data || []);
    }
    setLoading(false);
  }

  const displayName = (m: TeamMember) =>
    m.full_name || [m.first_name, m.last_name].filter(Boolean).join(' ') || m.email || 'Unknown';

  const initials = (m: TeamMember) => {
    const name = displayName(m);
    const parts = name.split(' ');
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
  };

  const roleMeta = (member: TeamMember) => {
    const roleId = effectiveAdminRole(member);
    return ROLES.find((r) => r.id === roleId) || ROLES[1];
  };

  /* Count members per admin sub-role for the Roles tab */
  const roleCounts: Record<string, number> = {};
  members.forEach((m) => {
    const ar = effectiveAdminRole(m);
    roleCounts[ar] = (roleCounts[ar] || 0) + 1;
  });

  /* ---- Invite flow ---- */

  const resetInviteForm = () => {
    setInviteEmail('');
    setInviteFirstName('');
    setInviteLastName('');
    setInviteRole('admin');
    setInviteError(null);
    setInviteSuccess(false);
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      setInviteError('Email is required');
      return;
    }
    setInviting(true);
    setInviteError(null);

    try {
      // Check if a profile with this email already exists
      const { data: existing } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('email', inviteEmail.trim().toLowerCase())
        .maybeSingle();

      if (existing) {
        if (existing.role === 'admin') {
          setInviteError('This user is already an admin team member.');
          setInviting(false);
          return;
        }
        // Promote existing user to admin with the selected sub-role
        const updatePayload: Record<string, unknown> = {
          role: 'admin',
          admin_role: inviteRole,
          updated_at: new Date().toISOString(),
        };
        const { error: updateErr } = await supabase
          .from('profiles')
          .update(updatePayload)
          .eq('id', existing.id);

        if (updateErr) throw updateErr;

        logAudit({
          action: 'promote_to_admin',
          entity_type: 'profile',
          entity_id: existing.id,
          details: { email: inviteEmail, previous_role: existing.role, admin_role: inviteRole },
        });

        setInviteSuccess(true);
        loadTeam();
      } else {
        // No existing profile -- attempt to create via Supabase Auth Admin API.
        // LIMITATION: supabase.auth.admin.createUser() requires the service_role key,
        // but the browser client uses the anon key, so this call will fail with a
        // "not authorized" error. To fix properly, create a server-side API route
        // (e.g. /api/admin/invite) that uses the service_role key to create the user.
        // For now, the fallback message guides the admin to create the user manually.
        const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
          email: inviteEmail.trim().toLowerCase(),
          email_confirm: true,
          user_metadata: {
            first_name: inviteFirstName.trim(),
            last_name: inviteLastName.trim(),
            role: 'admin',
          },
        });

        if (authErr) {
          if (authErr.message.includes('not authorized') || authErr.message.includes('not allowed')) {
            setInviteError(
              'Admin API requires service_role privileges which are not available in the browser. ' +
              'Please add the user manually in the Supabase Auth dashboard, then they will appear here once their role is set to admin.'
            );
          } else {
            throw authErr;
          }
          setInviting(false);
          return;
        }

        // Update profile with role = admin and admin_role
        if (authData?.user) {
          const updatePayload: Record<string, unknown> = {
            role: 'admin',
            admin_role: inviteRole,
            first_name: inviteFirstName.trim() || null,
            last_name: inviteLastName.trim() || null,
            updated_at: new Date().toISOString(),
          };
          await supabase
            .from('profiles')
            .update(updatePayload)
            .eq('id', authData.user.id);

          logAudit({
            action: 'invite_admin',
            entity_type: 'profile',
            entity_id: authData.user.id,
            details: { email: inviteEmail, admin_role: inviteRole },
          });
        }

        setInviteSuccess(true);
        loadTeam();
      }
    } catch (e: any) {
      console.error('Invite error:', e);
      setInviteError(e.message || 'Failed to invite team member');
    } finally {
      setInviting(false);
    }
  };

  /* ---- Role change ---- */

  const handleRoleChange = async (memberId: string, newAdminRole: string) => {
    setSavingRole(true);
    try {
      const member = members.find((m) => m.id === memberId);

      if (newAdminRole === 'customer') {
        // Remove from admin team entirely
        const { error: err } = await supabase
          .from('profiles')
          .update({
            role: 'customer',
            admin_role: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', memberId);

        if (err) throw err;

        setMembers((prev) => prev.filter((m) => m.id !== memberId));
      } else {
        // Update the admin sub-role; keep role as 'admin'
        const updatePayload: Record<string, unknown> = {
          admin_role: newAdminRole,
          updated_at: new Date().toISOString(),
        };
        const { error: err } = await supabase
          .from('profiles')
          .update(updatePayload)
          .eq('id', memberId);

        if (err) throw err;

        setMembers((prev) =>
          prev.map((m) =>
            m.id === memberId ? { ...m, admin_role: newAdminRole } : m
          )
        );
      }

      logAudit({
        action: 'change_role',
        entity_type: 'profile',
        entity_id: memberId,
        details: {
          previous_admin_role: member ? effectiveAdminRole(member) : null,
          new_admin_role: newAdminRole,
          email: member?.email,
        },
      });

      setEditingRoleId(null);
    } catch (e: any) {
      alert('Failed to change role: ' + (e.message || 'Unknown error'));
    } finally {
      setSavingRole(false);
    }
  };

  return (
    <AdminLayout>
      <div className="p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Team & Access Control</h1>
            <p className="text-gray-500">
              {loading ? 'Loading...' : `${members.length} admin team member${members.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => { resetInviteForm(); setShowInvite(true); }}
            className="px-6 py-3 rounded-[20px] font-bold flex items-center gap-2"
            style={{
              background: 'linear-gradient(to right, #008CE5, #0070B8)',
              color: '#FFFFFF',
              boxShadow: '0 8px 24px rgba(0,140,229,0.3)',
            }}
          >
            <UserPlus className="w-5 h-5" />
            Add Member
          </motion.button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => setActiveTab('members')}
            className="px-6 py-3 rounded-[20px] font-semibold transition-all"
            style={activeTab === 'members'
              ? { background: 'linear-gradient(to right, #008CE5, #0070B8)', color: '#FFFFFF' }
              : { backgroundColor: '#F9FAFB', color: '#4B5563' }
            }
          >
            Team Members
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => setActiveTab('roles')}
            className="px-6 py-3 rounded-[20px] font-semibold transition-all"
            style={activeTab === 'roles'
              ? { background: 'linear-gradient(to right, #008CE5, #0070B8)', color: '#FFFFFF' }
              : { backgroundColor: '#F9FAFB', color: '#4B5563' }
            }
          >
            Roles & Permissions
          </motion.button>
        </div>

        {/* Loading / Error */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#008CE5]" />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 p-4 mb-6 bg-red-50 border border-red-200 rounded-2xl">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <p className="text-red-700">{error}</p>
            <button onClick={loadTeam} className="ml-auto text-red-600 font-semibold hover:underline">Retry</button>
          </div>
        )}

        {/* Team Members Tab */}
        {!loading && !error && activeTab === 'members' && (
          <div className="space-y-4">
            {members.length === 0 ? (
              <div className="text-center py-16">
                <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">No admin team members found</p>
                <p className="text-gray-400 text-sm mt-1">Click "Add Member" to invite someone</p>
              </div>
            ) : (
              members.map((member, index) => {
                const meta = roleMeta(member);
                const RoleIcon = meta.icon;
                const memberAdminRole = effectiveAdminRole(member);
                const isEditingRole = editingRoleId === member.id;
                return (
                  <motion.div
                    key={member.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #008CE5, #0070B8)' }}>
                          <span className="text-white font-bold text-xl">{initials(member)}</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-3 mb-1">
                            <h3 className="text-gray-900 font-bold text-xl">{displayName(member)}</h3>
                            {member.status === 'suspended' && (
                              <span className="px-3 py-1 rounded-full bg-red-100 text-red-600 text-xs font-semibold">
                                Suspended
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-gray-500">
                            <Mail className="w-3.5 h-3.5" />
                            <span>{member.email || '\u2014'}</span>
                          </div>
                          {member.created_at && (
                            <p className="text-gray-400 text-sm mt-1">
                              Joined {new Date(member.created_at).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Role badge / dropdown */}
                      <div className="relative">
                        <button
                          onClick={() => setEditingRoleId(isEditingRole ? null : member.id)}
                          className="px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2 transition-all hover:ring-2 hover:ring-gray-200"
                          style={{ backgroundColor: meta.badgeBg, color: meta.badgeColor }}
                        >
                          <RoleIcon className="w-4 h-4" />
                          {meta.name}
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isEditingRole ? 'rotate-180' : ''}`} />
                        </button>

                        {isEditingRole && (
                          <div className="absolute right-0 top-12 z-20 bg-white rounded-2xl shadow-xl border border-gray-200 py-2 w-52">
                            {ROLES.map((r) => (
                              <button
                                key={r.id}
                                onClick={() => handleRoleChange(member.id, r.id)}
                                disabled={savingRole}
                                className={`w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 flex items-center gap-3 transition-colors disabled:opacity-50 ${
                                  memberAdminRole === r.id ? 'bg-gray-50 font-semibold' : ''
                                }`}
                              >
                                <r.icon className="w-4 h-4 text-gray-500" />
                                {r.name}
                                {memberAdminRole === r.id && <span className="ml-auto text-[#008CE5] text-xs">Current</span>}
                              </button>
                            ))}
                            <div className="border-t border-gray-100 mt-1 pt-1">
                              <button
                                onClick={() => handleRoleChange(member.id, 'customer')}
                                disabled={savingRole}
                                className="w-full px-4 py-2.5 text-left text-sm text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                              >
                                Remove from team
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        )}

        {/* Roles Tab -- permission config derived from rbac.ts */}
        {!loading && !error && activeTab === 'roles' && (
          <div className="grid grid-cols-2 gap-6">
            {ROLES.map((role, index) => {
              const RoleIcon = role.icon;
              const count = roleCounts[role.id] || 0;
              return (
                <motion.div
                  key={role.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: role.gradient }}>
                      <RoleIcon className="w-7 h-7 text-white" />
                    </div>
                    <div className="px-3 py-1 rounded-full bg-gray-100 text-gray-600 text-sm">
                      {count} {count === 1 ? 'member' : 'members'}
                    </div>
                  </div>

                  <h3 className="text-gray-900 font-bold text-xl mb-2">{role.name}</h3>
                  <p className="text-gray-500 text-sm mb-4">{role.description}</p>

                  <div>
                    <p className="text-gray-400 text-xs font-semibold uppercase mb-2">Permissions</p>
                    <div className="flex flex-wrap gap-2">
                      {role.permissions.map((permission) => (
                        <span key={permission} className="px-3 py-1 rounded-full bg-gray-50 text-gray-600 text-xs">
                          {permission}
                        </span>
                      ))}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Invite Modal */}
        {showInvite && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-[32px] p-8 max-w-lg w-full shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-gray-900 font-bold text-2xl">Add Team Member</h2>
                <button
                  onClick={() => setShowInvite(false)}
                  className="p-2 rounded-xl hover:bg-gray-100 text-gray-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {inviteSuccess ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                    <UserPlus className="w-8 h-8 text-green-600" />
                  </div>
                  <h3 className="text-gray-900 font-bold text-xl mb-2">Member Added</h3>
                  <p className="text-gray-500 mb-6">The user has been added to the admin team.</p>
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => { setShowInvite(false); resetInviteForm(); }}
                    className="px-6 py-3 rounded-[20px] font-bold"
                    style={{ background: 'linear-gradient(to right, #008CE5, #0070B8)', color: '#FFFFFF' }}
                  >
                    Done
                  </motion.button>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-gray-600 text-sm mb-2 block">First Name</label>
                        <input
                          type="text"
                          placeholder="Jane"
                          value={inviteFirstName}
                          onChange={(e) => setInviteFirstName(e.target.value)}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-[16px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#008CE5]/50"
                        />
                      </div>
                      <div>
                        <label className="text-gray-600 text-sm mb-2 block">Last Name</label>
                        <input
                          type="text"
                          placeholder="Smith"
                          value={inviteLastName}
                          onChange={(e) => setInviteLastName(e.target.value)}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-[16px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#008CE5]/50"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-gray-600 text-sm mb-2 block">Email Address <span className="text-red-400">*</span></label>
                      <input
                        type="email"
                        placeholder="jane@torc.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-[16px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#008CE5]/50"
                      />
                    </div>

                    <div>
                      <label className="text-gray-600 text-sm mb-2 block">Role</label>
                      <select
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-[16px] text-gray-900 focus:outline-none focus:border-[#008CE5]/50"
                      >
                        {ROLES.map((r) => (
                          <option key={r.id} value={r.id}>{r.name} -- {r.description}</option>
                        ))}
                      </select>
                    </div>

                    {inviteError && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                        <p className="text-red-600 text-sm">{inviteError}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3 mt-6">
                    <motion.button
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setShowInvite(false)}
                      className="flex-1 px-6 py-3 rounded-[20px] bg-gray-100 text-gray-900 font-semibold"
                    >
                      Cancel
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleInvite}
                      disabled={inviting || !inviteEmail.trim()}
                      className="flex-1 px-6 py-3 rounded-[20px] font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                      style={{ background: 'linear-gradient(to right, #008CE5, #0070B8)', color: '#FFFFFF' }}
                    >
                      {inviting ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
                      {inviting ? 'Adding...' : 'Add Member'}
                    </motion.button>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
