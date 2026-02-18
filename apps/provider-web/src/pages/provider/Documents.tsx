import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Upload, FileText, CheckCircle, Clock, AlertCircle, X, Eye } from 'lucide-react';
import { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';

interface DocumentUpload {
  file: File | null;
  preview: string | null;
  status: 'empty' | 'uploaded' | 'approved' | 'rejected';
  uploadDate?: string;
  rejectionReason?: string;
}

export function ProviderDocuments() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const [documents, setDocuments] = useState<Record<string, DocumentUpload>>({
    license: { file: null, preview: null, status: 'empty' },
    insurance: { file: null, preview: null, status: 'empty' },
    registration: { file: null, preview: null, status: 'empty' },
    towing: { file: null, preview: null, status: 'empty' },
  });
  const [consentChecked, setConsentChecked] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{ id: string; preview: string } | null>(null);

  const documentConfig = [
    { id: 'license', name: "Driver's License", required: true, description: "Valid state-issued driver's license" },
    { id: 'insurance', name: 'Insurance Certificate', required: true, description: 'Proof of commercial vehicle insurance' },
    { id: 'registration', name: 'Vehicle Registration', required: false, description: 'Current vehicle registration' },
    { id: 'towing', name: 'Towing Credentials', required: false, description: 'Towing certification (if applicable)' },
  ];

  const handleFileSelect = (docId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (!validTypes.includes(file.type)) { alert('Please upload a JPG, PNG, or PDF file'); return; }
    if (file.size > 10 * 1024 * 1024) { alert('File size must be less than 10MB'); return; }
    const reader = new FileReader();
    reader.onloadend = () => {
      setDocuments(prev => ({ ...prev, [docId]: { file, preview: reader.result as string, status: 'uploaded', uploadDate: new Date().toISOString() } }));
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveDocument = (docId: string) => {
    setDocuments(prev => ({ ...prev, [docId]: { file: null, preview: null, status: 'empty' } }));
  };

  const handleSubmit = () => {
    const requiredDocs = documentConfig.filter(d => d.required);
    const missingDocs = requiredDocs.filter(d => !documents[d.id].file);
    if (missingDocs.length > 0) { alert(`Please upload: ${missingDocs.map(d => d.name).join(', ')}`); return; }
    if (!consentChecked) { alert('Please consent to background check'); return; }
    navigate('/payout');
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircle className="w-5 h-5" style={{ color: '#2EFFAF' }} />;
      case 'uploaded': return <Clock className="w-5 h-5" style={{ color: '#007AFF' }} />;
      case 'rejected': return <AlertCircle className="w-5 h-5 text-red-500" />;
      default: return <FileText className="w-5 h-5" style={{ color: isDark ? 'rgba(255,255,255,0.3)' : '#9CA3AF' }} />;
    }
  };

  const allRequiredUploaded = documentConfig.filter(d => d.required).every(d => documents[d.id].file);

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-hidden"
      style={{
        background: isDark
          ? 'linear-gradient(180deg, #1A1F2E 0%, #0F1419 100%)'
          : 'linear-gradient(180deg, #FFFFFF 0%, #F0F4F8 100%)',
      }}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 right-1/4 w-[400px] h-[400px] rounded-full" style={{ backgroundColor: '#2EFFAF', filter: 'blur(160px)', opacity: isDark ? 0.06 : 0.03 }} />
      </div>

      {/* Header */}
      <div className="relative z-10 p-6 flex items-center gap-4">
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate(-1)} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}>
          <ArrowLeft className="w-5 h-5" style={{ color: isDark ? '#FFFFFF' : '#1F2937' }} />
        </motion.button>
        <h1 className="text-xl font-bold" style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }}>Upload Documents</h1>
      </div>

      <div className="relative z-10 flex-1 px-6 pb-8 overflow-y-auto">
        {/* Instructions */}
        <div className="rounded-2xl p-5 mb-6" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F9FAFB', border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#E5E7EB'}` }}>
          <p className="text-sm mb-3" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#374151' }}>
            Upload clear photos or PDFs of your documents. All documents must be valid and not expired.
          </p>
          <div className="space-y-1 text-xs" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }}>
            <p>Accepted formats: JPG, PNG, PDF &bull; Max size: 10MB</p>
          </div>
        </div>

        {/* Document Cards */}
        <div className="space-y-4 mb-6">
          {documentConfig.map((doc, index) => {
            const upload = documents[doc.id];
            return (
              <motion.div key={doc.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }}
                className="rounded-2xl p-5" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB'}`, boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.04)' }}
              >
                <div className="flex items-start gap-3 mb-4">
                  {getStatusIcon(upload.status)}
                  <div className="flex-1">
                    <h3 className="font-semibold flex items-center gap-2" style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }}>
                      {doc.name}
                      {doc.required && <span className="text-red-500 text-xs">*Required</span>}
                    </h3>
                    <p className="text-sm" style={{ color: isDark ? 'rgba(255,255,255,0.5)' : '#6B7280' }}>{doc.description}</p>
                  </div>
                </div>

                {upload.preview && (
                  <div className="mb-4 rounded-xl p-3 flex items-center gap-3" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F9FAFB' }}>
                    {upload.file?.type.startsWith('image/') ? (
                      <img src={upload.preview} alt="Preview" className="w-16 h-16 object-cover rounded-lg" />
                    ) : (
                      <div className="w-16 h-16 rounded-lg flex items-center justify-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#E5E7EB' }}>
                        <FileText className="w-6 h-6" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }}>{upload.file?.name}</p>
                      <p className="text-xs" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }}>{(upload.file!.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setPreviewDoc({ id: doc.id, preview: upload.preview! })} className="p-2 rounded-lg" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6' }}>
                        <Eye className="w-4 h-4" style={{ color: isDark ? '#FFFFFF' : '#6B7280' }} />
                      </button>
                      <button onClick={() => handleRemoveDocument(doc.id)} className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(239,68,68,0.1)' }}>
                        <X className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </div>
                )}

                <input type="file" id={`file-${doc.id}`} accept="image/jpeg,image/png,image/jpg,application/pdf" onChange={(e) => handleFileSelect(doc.id, e)} className="hidden" />
                <button
                  onClick={() => document.getElementById(`file-${doc.id}`)?.click()}
                  className="w-full rounded-xl py-3 font-semibold text-sm flex items-center justify-center gap-2 transition-all"
                  style={{
                    backgroundColor: upload.preview ? (isDark ? 'rgba(255,255,255,0.05)' : '#F9FAFB') : 'rgba(46,255,175,0.1)',
                    border: `1px solid ${upload.preview ? (isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB') : 'rgba(46,255,175,0.3)'}`,
                    color: upload.preview ? (isDark ? 'rgba(255,255,255,0.6)' : '#6B7280') : '#2EFFAF',
                  }}
                >
                  <Upload className="w-4 h-4" />
                  {upload.preview ? 'Replace Document' : 'Upload Document'}
                </button>
              </motion.div>
            );
          })}
        </div>

        {/* Consent */}
        <div className="rounded-2xl p-5 mb-6" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F9FAFB', border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#E5E7EB'}` }}>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)} className="mt-1 w-5 h-5 rounded accent-[#2EFFAF]" />
            <div>
              <h3 className="font-semibold mb-1" style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }}>Background Check Consent</h3>
              <p className="text-sm leading-relaxed" style={{ color: isDark ? 'rgba(255,255,255,0.5)' : '#6B7280' }}>
                I consent to TORC conducting a background check, which may include criminal records, driving history, and identity verification.
              </p>
            </div>
          </label>
        </div>

        {/* Submit */}
        <motion.button whileHover={{ scale: allRequiredUploaded && consentChecked ? 1.02 : 1 }} whileTap={{ scale: allRequiredUploaded && consentChecked ? 0.98 : 1 }}
          onClick={handleSubmit} disabled={!allRequiredUploaded || !consentChecked}
          className="w-full rounded-2xl py-4 font-bold text-lg disabled:opacity-40"
          style={{
            background: allRequiredUploaded && consentChecked ? 'linear-gradient(135deg, #2EFFAF, #007AFF)' : (isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB'),
            color: allRequiredUploaded && consentChecked ? '#0F1419' : (isDark ? 'rgba(255,255,255,0.3)' : '#9CA3AF'),
          }}
        >
          Submit Documents for Review
        </motion.button>
        <p className="text-sm text-center mt-4" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }}>
          Review typically takes 24-48 hours
        </p>
      </div>

      {/* Preview Modal */}
      {previewDoc && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6" onClick={() => setPreviewDoc(null)}>
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="max-w-lg w-full rounded-2xl p-6 overflow-auto" style={{ backgroundColor: isDark ? '#1A1F2E' : '#FFFFFF' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg" style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }}>Document Preview</h3>
              <button onClick={() => setPreviewDoc(null)} className="p-2 rounded-full" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }}>
                <X className="w-5 h-5" style={{ color: isDark ? '#FFFFFF' : '#6B7280' }} />
              </button>
            </div>
            {documents[previewDoc.id].file?.type.startsWith('image/') ? (
              <img src={previewDoc.preview} alt="Document" className="w-full rounded-xl" />
            ) : (
              <div className="rounded-xl p-12 text-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F9FAFB' }}>
                <FileText className="w-16 h-16 mx-auto mb-3" style={{ color: isDark ? 'rgba(255,255,255,0.3)' : '#9CA3AF' }} />
                <p className="text-sm" style={{ color: isDark ? 'rgba(255,255,255,0.5)' : '#6B7280' }}>{documents[previewDoc.id].file?.name}</p>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
