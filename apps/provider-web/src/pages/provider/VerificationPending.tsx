import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { CheckCircle, Clock, AlertCircle, RefreshCw, ArrowRight, Upload, X } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useState, useEffect } from 'react';

interface DocRecord {
  id: string;
  type: string;
  status: string;
  rejection_reason: string | null;
}

export function VerificationPending() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { user, isVerified, providerProfile, refreshProviderProfile } = useAuth();
  const [documents, setDocuments] = useState<DocRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [revocationReason, setRevocationReason] = useState<string | null>(null);
  const approvedByAdmin = isVerified || providerProfile?.is_verified === true;

  // Load documents + latest provider verification from DB
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function loadDocs() {
      await refreshProviderProfile?.();
      const [docsRes, notifRes] = await Promise.all([
        supabase
          .from('documents')
          .select('id, type, status, rejection_reason')
          .eq('provider_id', user!.id)
          .order('created_at', { ascending: true }),
        supabase
          .from('notifications')
          .select('message')
          .eq('user_id', user!.id)
          .eq('type', 'alert')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (cancelled) return;
      setDocuments(docsRes.data || []);
      setRevocationReason(notifRes.data?.message || null);
      setLoading(false);
    }

    loadDocs();
    return () => { cancelled = true; };
  }, [user, refreshProviderProfile]);

  // Poll verification status while still pending (covers cases where realtime misses events)
  useEffect(() => {
    if (!user || approvedByAdmin) return;
    const interval = setInterval(() => {
      refreshProviderProfile?.();
    }, 8000);
    return () => clearInterval(interval);
  }, [user, approvedByAdmin, refreshProviderProfile]);

  // Realtime subscription on provider_profiles for auto-refresh when admin approves
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('verification-status')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'provider_profiles',
        filter: `id=eq.${user.id}`,
      }, () => {
        refreshProviderProfile?.();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, refreshProviderProfile]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshProviderProfile?.();
    const { data } = await supabase
      .from('documents')
      .select('id, type, status, rejection_reason')
      .eq('provider_id', user?.id)
      .order('created_at', { ascending: true });
    setDocuments(data || []);
    setRefreshing(false);
  };

  // Derive step statuses
  const hasDocuments = documents.length > 0;
  const rejectedDocs = documents.filter(d => d.status === 'rejected');
  const hasRejected = rejectedDocs.length > 0;
  const allApproved = approvedByAdmin || (hasDocuments && documents.every(d => d.status === 'approved'));

  // Determine which state to show (must be before steps array)
  const isApproved = approvedByAdmin === true;
  const isRevoked = !isApproved && !!revocationReason;
  const isRejected = !isApproved && (hasRejected || isRevoked);

  const steps = [
    { name: 'Account Created', status: 'completed' as const },
    {
      name: 'Documents Uploaded',
      status: approvedByAdmin ? 'completed' as const : hasRejected ? 'rejected' as const : hasDocuments ? 'completed' as const : 'pending' as const,
    },
    {
      name: 'Document Review',
      status: approvedByAdmin ? 'completed' as const : hasRejected ? 'rejected' as const : allApproved ? 'completed' as const : 'pending' as const,
    },
    {
      name: 'Final Approval',
      status: approvedByAdmin ? 'completed' as const : isRevoked ? 'rejected' as const : 'pending' as const,
    },
  ];

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: isDark ? 'linear-gradient(180deg, #14263D 0%, #0A1626 100%)' : 'linear-gradient(180deg, #FFFFFF 0%, #EAF3FF 100%)' }}
      >
        <div className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#008CE5', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden"
      style={{
        background: isDark
          ? 'linear-gradient(180deg, #14263D 0%, #0A1626 100%)'
          : 'linear-gradient(180deg, #FFFFFF 0%, #EAF3FF 100%)',
      }}
    >
      <motion.button
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        onClick={() => navigate('/profile')}
        aria-label="Close verification screen"
        className="absolute right-4 z-20 w-10 h-10 rounded-full flex items-center justify-center border"
        style={{
          top: 'max(12px, calc(env(safe-area-inset-top, 0px) + 8px))',
          backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF',
          borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#E5E7EB',
          boxShadow: isDark ? 'none' : '0 1px 4px rgba(0,0,0,0.08)',
        }}
      >
        <X className="w-5 h-5" style={{ color: isDark ? '#FFFFFF' : '#374151' }} />
      </motion.button>

      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] rounded-full" style={{ backgroundColor: '#008CE5', filter: 'blur(160px)', opacity: isDark ? 0.06 : 0.03 }} />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo + status */}
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-center mb-8">
          <img src="/logo.svg" alt="Torc" className="w-32 h-auto mx-auto object-contain mb-4" />
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{
              background: isApproved
                ? 'linear-gradient(135deg, #22C55E, #16A34A)'
                : isRejected
                  ? 'linear-gradient(135deg, #F59E0B, #D97706)'
                  : 'linear-gradient(135deg, #008CE5, #0070B8)',
            }}
          >
            {isApproved ? (
              <CheckCircle className="w-10 h-10 text-white" />
            ) : isRejected ? (
              <AlertCircle className="w-10 h-10 text-white" />
            ) : (
              <Clock className="w-10 h-10 text-white" />
            )}
          </div>
          <h1 className="text-3xl font-bold mb-2" style={{ color: isDark ? '#FFFFFF' : '#14263D' }}>
            {isApproved ? 'Application Approved!' : isRevoked ? 'Verification Revoked' : isRejected ? 'Action Required' : 'Verification Pending'}
          </h1>
          <p style={{ color: isDark ? 'rgba(255,255,255,0.5)' : '#6B7280' }}>
            {isApproved
              ? 'Your provider application has been approved. You can now go online and start accepting jobs!'
              : isRevoked
                ? 'Your verification has been revoked by an administrator. Please review the reason below and take action.'
                : isRejected
                  ? 'Some of your documents need attention. Please review and re-upload.'
                  : `We're reviewing your application. This usually takes 24-48 hours.`}
          </p>
        </motion.div>

        {/* Revocation reason alert */}
        {isRevoked && revocationReason && (
          <div
            className="rounded-2xl p-4 mb-6"
            style={{
              backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#FEF2F2',
              border: `1px solid ${isDark ? 'rgba(239,68,68,0.2)' : '#FECACA'}`,
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-5 h-5" style={{ color: '#EF4444' }} />
              <p className="font-semibold text-sm" style={{ color: isDark ? '#EF4444' : '#B91C1C' }}>
                Reason for Revocation
              </p>
            </div>
            <p className="text-sm ml-7" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#374151' }}>
              {revocationReason}
            </p>
          </div>
        )}

        {/* Rejection reasons alert */}
        {hasRejected && rejectedDocs.length > 0 && (
          <div
            className="rounded-2xl p-4 mb-6"
            style={{
              backgroundColor: isDark ? 'rgba(245,158,11,0.1)' : '#FFFBEB',
              border: `1px solid ${isDark ? 'rgba(245,158,11,0.2)' : '#FDE68A'}`,
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-5 h-5" style={{ color: '#F59E0B' }} />
              <p className="font-semibold text-sm" style={{ color: isDark ? '#F59E0B' : '#92400E' }}>
                Document Issues
              </p>
            </div>
            <div className="space-y-2">
              {rejectedDocs.map(doc => (
                <div key={doc.id} className="flex items-start gap-2">
                  <span className="text-xs font-semibold capitalize px-2 py-0.5 rounded-full mt-0.5" style={{ backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : '#FEE2E2', color: '#DC2626' }}>
                    {doc.type.replace(/_/g, ' ')}
                  </span>
                  <p className="text-sm flex-1" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#6B7280' }}>
                    {doc.rejection_reason || 'Document was rejected. Please re-upload.'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Status card */}
        <div
          className="rounded-2xl p-6 mb-6"
          style={{
            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF',
            border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2'}`,
            boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold" style={{ color: isDark ? '#FFFFFF' : '#14263D' }}>Application Status</h3>
            {hasDocuments && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(0,140,229,0.1)', color: '#008CE5' }}>
                {documents.length} doc{documents.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="space-y-4">
            {steps.map((step, index) => (
              <motion.div
                key={step.name}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-center gap-3"
              >
                {step.status === 'completed' && <CheckCircle className="w-5 h-5" style={{ color: '#22C55E' }} />}
                {step.status === 'pending' && <Clock className="w-5 h-5" style={{ color: '#008CE5' }} />}
                {step.status === 'rejected' && <AlertCircle className="w-5 h-5" style={{ color: '#F59E0B' }} />}
                <div className="flex-1">
                  <p
                    className="font-medium text-sm"
                    style={{
                      color: step.status === 'completed'
                        ? (isDark ? '#FFFFFF' : '#14263D')
                        : step.status === 'rejected'
                          ? (isDark ? '#F59E0B' : '#92400E')
                          : (isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF'),
                    }}
                  >
                    {step.name}
                  </p>
                </div>
                <span
                  className="text-xs capitalize px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor:
                      step.status === 'completed' ? 'rgba(34,197,94,0.1)'
                        : step.status === 'rejected' ? 'rgba(245,158,11,0.1)'
                          : 'rgba(0,140,229,0.1)',
                    color:
                      step.status === 'completed' ? '#22C55E'
                        : step.status === 'rejected' ? '#F59E0B'
                          : '#008CE5',
                  }}
                >
                  {step.status}
                </span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Action buttons based on state */}
        {isApproved ? (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/home')}
            className="w-full bg-gradient-to-r from-[#22C55E] to-[#16A34A] rounded-2xl py-4 font-bold text-white text-lg mb-4 flex items-center justify-center gap-2"
          >
            Go to Dashboard
            <ArrowRight className="w-5 h-5" />
          </motion.button>
        ) : isRejected ? (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/documents')}
            className="w-full rounded-2xl py-4 font-bold text-white text-lg mb-4 flex items-center justify-center gap-2"
            style={{ background: isRevoked ? 'linear-gradient(to right, #EF4444, #DC2626)' : 'linear-gradient(to right, #F59E0B, #D97706)' }}
          >
            <Upload className="w-5 h-5" />
            {isRevoked ? 'Update Documents' : 'Re-upload Documents'}
          </motion.button>
        ) : (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleRefresh}
            disabled={refreshing}
            className="w-full bg-gradient-to-r from-[#008CE5] to-[#0070B8] rounded-2xl py-4 font-bold text-white text-lg mb-4 flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Checking...' : 'Refresh Status'}
          </motion.button>
        )}

        <p className="text-center text-sm" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }}>
          {isApproved
            ? 'Thank you for joining TORC!'
            : "We'll notify you via email once your status changes"}
        </p>
      </div>
    </div>
  );
}
