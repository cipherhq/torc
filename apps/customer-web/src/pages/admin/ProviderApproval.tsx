import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { AdminNav } from '../../components/AdminNav';
import { CheckCircle, XCircle, Clock, FileText, User, Car, Shield, DollarSign, Eye } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export function ProviderApproval() {
  const [selectedProvider, setSelectedProvider] = useState<any>(null);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<any>(null);
  const [pendingProviders, setPendingProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadPendingProviders() {
      try {
        setLoading(true);
        
        const { data, error } = await supabase
          .from('provider_profiles')
          .select(`
            id,
            account_type,
            company_name,
            created_at,
            user:profiles(full_name, email, phone)
          `)
          .eq('is_verified', false)
          .order('created_at', { ascending: false });

        if (error) throw error;

        // Fetch documents for each provider
        const formattedProviders = await Promise.all((data || []).map(async (provider: any) => {
          const { data: documents } = await supabase
            .from('documents')
            .select('*')
            .eq('provider_id', provider.id);

          // Fetch services offered
          const { data: providerServices } = await supabase
            .from('provider_services')
            .select('service:services(name)')
            .eq('provider_id', provider.id);

          const servicesOffered = providerServices?.map((ps: any) => ps.service?.name).filter(Boolean) || [];

          const name = provider.user?.full_name || provider.user?.email?.split('@')[0] || 'Unknown';
          const submittedAt = new Date(provider.created_at).toLocaleString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          });

          return {
            id: `PR-${provider.id.slice(0, 8)}`,
            name,
            email: provider.user?.email || '-',
            phone: provider.user?.phone || '-',
            accountType: provider.account_type === 'company' ? 'Company' : 'Individual',
            companyName: provider.company_name,
            submittedAt,
            documents: documents?.map((doc: any) => ({
              type: doc.type?.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) || 'Document',
              status: doc.status === 'approved' ? 'uploaded' : 'pending',
              file: doc.file_name || 'document.pdf',
            })) || [],
            backgroundCheck: 'pending', // This would need a separate background check system
            servicesOffered,
          };
        }));

        setPendingProviders(formattedProviders);
      } catch (error) {
        console.warn('Failed to load pending providers:', error);
        setPendingProviders([]);
      } finally {
        setLoading(false);
      }
    }
    loadPendingProviders();
  }, []);

  const handleApprove = (providerId: string) => {
    console.log('Approving provider:', providerId);
    // In real app: API call to approve provider
  };

  const handleReject = (providerId: string) => {
    console.log('Rejecting provider:', providerId);
    // In real app: API call to reject provider
  };

  return (
    <div className="min-h-screen bg-[#0F1419] flex">
      <AdminNav />

      <div className="flex-1 ml-64">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#252B3D] to-[#2F3548] p-8">
          <h1 className="text-3xl font-bold text-white mb-2">Provider Approval</h1>
          <p className="text-white/60">Review and approve provider applications</p>
        </div>

        <div className="p-8">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-6 mb-8">
            <div className="glass rounded-[24px] p-6">
              <Clock className="w-8 h-8 text-[#007AFF] mb-3" />
              <p className="text-white/60 text-sm">Pending Review</p>
              <p className="text-white text-3xl font-bold">{pendingProviders.length}</p>
            </div>
            <div className="glass rounded-[24px] p-6">
              <CheckCircle className="w-8 h-8 text-[#2EFFAF] mb-3" />
              <p className="text-white/60 text-sm">Approved Today</p>
              <p className="text-white text-3xl font-bold">12</p>
            </div>
            <div className="glass rounded-[24px] p-6">
              <XCircle className="w-8 h-8 text-red-400 mb-3" />
              <p className="text-white/60 text-sm">Rejected Today</p>
              <p className="text-white text-3xl font-bold">3</p>
            </div>
            <div className="glass rounded-[24px] p-6">
              <Shield className="w-8 h-8 text-[#2EFFAF] mb-3" />
              <p className="text-white/60 text-sm">Active Providers</p>
              <p className="text-white text-3xl font-bold">247</p>
            </div>
          </div>

          {/* Pending Applications */}
          <div className="glass rounded-[24px] p-6">
            <h2 className="text-white font-bold text-xl mb-6">Pending Applications</h2>

            {loading ? (
              <div className="p-12 text-center">
                <p className="text-white/60">Loading pending providers...</p>
              </div>
            ) : pendingProviders.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-white/60">No pending provider applications</p>
              </div>
            ) : (
            <div className="space-y-4">
              {pendingProviders.map((provider) => (
                <motion.div
                  key={provider.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white/5 rounded-2xl p-6 hover:bg-white/8 transition-colors"
                >
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex items-start gap-4">
                      <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center">
                        <User className="w-8 h-8 text-[#0F1419]" />
                      </div>
                      <div>
                        <h3 className="text-white font-bold text-lg">{provider.name}</h3>
                        <p className="text-white/60 text-sm">{provider.id}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-white/80 text-sm">{provider.email}</span>
                          <span className="text-white/40">•</span>
                          <span className="text-white/80 text-sm">{provider.phone}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="px-3 py-1 rounded-full bg-[#007AFF]/20 text-[#007AFF] text-xs font-semibold">
                            {provider.accountType}
                          </span>
                          {provider.companyName && (
                            <span className="text-white/60 text-xs">{provider.companyName}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-white/60 text-sm">Submitted</p>
                      <p className="text-white text-sm">{provider.submittedAt}</p>
                    </div>
                  </div>

                  {/* Documents */}
                  <div className="mb-6">
                    <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Documents
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      {provider.documents.map((doc: any) => (
                        <div key={doc.type} className="bg-white/5 rounded-xl p-3 flex items-center justify-between">
                          <span className="text-white/80 text-sm">{doc.type}</span>
                          <button className="text-[#2EFFAF] text-xs font-semibold hover:underline flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            View
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Background Check */}
                  <div className="mb-6">
                    <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      Background Check
                    </h4>
                    <div className="bg-white/5 rounded-xl p-3 flex items-center justify-between">
                      <span className="text-white/80 text-sm">Checkr Background Verification</span>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        provider.backgroundCheck === 'cleared'
                          ? 'bg-[#2EFFAF]/20 text-[#2EFFAF]'
                          : 'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {provider.backgroundCheck === 'cleared' ? 'Cleared ✓' : 'Pending...'}
                      </span>
                    </div>
                  </div>

                  {/* Services */}
                  <div className="mb-6">
                    <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                      <Car className="w-4 h-4" />
                      Services Offered
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {provider.servicesOffered.map((service: string) => (
                        <span key={service} className="px-3 py-1 rounded-full bg-white/5 text-white/80 text-sm">
                          {service}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleApprove(provider.id)}
                      className="flex-1 bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-2xl py-3 font-semibold text-[#0F1419] flex items-center justify-center gap-2"
                    >
                      <CheckCircle className="w-5 h-5" />
                      Approve Provider
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleReject(provider.id)}
                      className="flex-1 bg-red-500/20 border border-red-500/30 rounded-2xl py-3 font-semibold text-red-400 flex items-center justify-center gap-2"
                    >
                      <XCircle className="w-5 h-5" />
                      Reject
                    </motion.button>
                  </div>
                </motion.div>
              ))}
            </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}