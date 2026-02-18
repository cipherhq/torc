import { useState } from 'react';
import { motion } from 'motion/react';
import { AdminNav } from '../../components/AdminNav';
import { CheckCircle, XCircle, Clock, FileText, User, Car, Shield, DollarSign, Eye } from 'lucide-react';

export function ProviderApproval() {
  const [selectedProvider, setSelectedProvider] = useState<any>(null);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<any>(null);

  const pendingProviders = [
    {
      id: 'PR-1001',
      name: 'Marcus Rodriguez',
      email: 'marcus.r@email.com',
      phone: '+1 (555) 123-4567',
      accountType: 'Individual',
      submittedAt: '2026-02-09 14:30',
      documents: [
        { type: "Driver's License", status: 'uploaded', file: 'license.pdf' },
        { type: 'Vehicle Registration', status: 'uploaded', file: 'registration.pdf' },
        { type: 'Insurance Certificate', status: 'uploaded', file: 'insurance.pdf' },
        { type: 'Towing Credentials', status: 'uploaded', file: 'towing-cert.pdf' },
      ],
      backgroundCheck: 'pending',
      servicesOffered: ['Towing', 'Jump Start', 'Tire Change'],
    },
    {
      id: 'PR-1002',
      name: 'Sarah Chen',
      email: 'sarah.chen@email.com',
      phone: '+1 (555) 987-6543',
      accountType: 'Company',
      companyName: 'QuickTow Services LLC',
      submittedAt: '2026-02-09 16:45',
      documents: [
        { type: "Driver's License", status: 'uploaded', file: 'license.pdf' },
        { type: 'Vehicle Registration', status: 'uploaded', file: 'registration.pdf' },
        { type: 'Insurance Certificate', status: 'uploaded', file: 'insurance.pdf' },
      ],
      backgroundCheck: 'cleared',
      servicesOffered: ['Towing', 'Lockout', 'Fuel Delivery'],
    },
  ];

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
          </div>
        </div>
      </div>
    </div>
  );
}