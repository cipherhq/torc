import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Upload, FileText, CheckCircle, Clock, AlertCircle, X, Eye, Image as ImageIcon } from 'lucide-react';
import { useState } from 'react';

interface DocumentUpload {
  file: File | null;
  preview: string | null;
  status: 'empty' | 'uploaded' | 'approved' | 'rejected';
  uploadDate?: string;
  rejectionReason?: string;
}

export function ProviderDocuments() {
  const navigate = useNavigate();

  const [documents, setDocuments] = useState<Record<string, DocumentUpload>>({
    'license': { file: null, preview: null, status: 'empty' },
    'insurance': { file: null, preview: null, status: 'empty' },
    'registration': { file: null, preview: null, status: 'empty' },
    'towing': { file: null, preview: null, status: 'empty' },
  });

  const [consentChecked, setConsentChecked] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{ id: string; preview: string } | null>(null);

  const documentConfig = [
    { id: 'license', name: "Driver's License", required: true, description: 'Valid state-issued driver\'s license' },
    { id: 'insurance', name: 'Insurance Certificate', required: true, description: 'Proof of commercial vehicle insurance' },
    { id: 'registration', name: 'Vehicle Registration', required: false, description: 'Current vehicle registration' },
    { id: 'towing', name: 'Towing Credentials', required: false, description: 'Towing certification (if applicable)' },
  ];

  const handleFileSelect = (docId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      alert('Please upload a JPG, PNG, or PDF file');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB');
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setDocuments(prev => ({
        ...prev,
        [docId]: {
          file,
          preview: reader.result as string,
          status: 'uploaded',
          uploadDate: new Date().toISOString(),
        }
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveDocument = (docId: string) => {
    setDocuments(prev => ({
      ...prev,
      [docId]: { file: null, preview: null, status: 'empty' }
    }));
  };

  const handleSubmit = () => {
    // Check if all required documents are uploaded
    const requiredDocs = documentConfig.filter(d => d.required);
    const missingDocs = requiredDocs.filter(d => !documents[d.id].file);

    if (missingDocs.length > 0) {
      alert(`Please upload: ${missingDocs.map(d => d.name).join(', ')}`);
      return;
    }

    if (!consentChecked) {
      alert('Please consent to background check');
      return;
    }

    // In real app: Upload to server
    console.log('Submitting documents:', documents);
    navigate('/provider/payout-setup');
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="w-5 h-5 text-[#008CE5]" />;
      case 'uploaded':
        return <Clock className="w-5 h-5 text-[#0070B8]" />;
      case 'rejected':
        return <AlertCircle className="w-5 h-5 text-red-400" />;
      default:
        return <FileText className="w-5 h-5 text-white/40" />;
    }
  };

  const allRequiredUploaded = documentConfig
    .filter(d => d.required)
    .every(d => documents[d.id].file);

  return (
    <div className="min-h-screen bg-[#252B3D] flex flex-col relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-[#008CE5] opacity-10 blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <div className="relative z-10 p-6 flex items-center gap-4">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate(-1)}
          className="glass rounded-full p-3"
        >
          <ArrowLeft className="w-6 h-6 text-white" />
        </motion.button>
        <h1 className="text-2xl font-bold text-white">Upload Documents</h1>
      </div>

      <div className="relative z-10 flex-1 px-6 pb-32 overflow-y-auto">
        {/* Instructions */}
        <div className="glass rounded-[24px] p-6 mb-6">
          <p className="text-white/80 text-sm mb-4">
            📄 Upload clear photos or PDFs of your documents. All documents must be valid and not expired.
          </p>
          <div className="space-y-2 text-white/60 text-sm">
            <p>✓ Accepted formats: JPG, PNG, PDF</p>
            <p>✓ Maximum file size: 10MB</p>
            <p>✓ Documents must be clearly visible</p>
          </div>
        </div>

        {/* Document Upload Cards */}
        <div className="space-y-4 mb-6">
          {documentConfig.map((doc, index) => {
            const upload = documents[doc.id];
            
            return (
              <motion.div
                key={doc.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="glass rounded-[24px] p-5"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-3 flex-1">
                    {getStatusIcon(upload.status)}
                    <div className="flex-1">
                      <h3 className="text-white font-semibold flex items-center gap-2">
                        {doc.name}
                        {doc.required && <span className="text-red-400 text-sm">*Required</span>}
                      </h3>
                      <p className="text-white/60 text-sm">{doc.description}</p>
                      {upload.uploadDate && (
                        <p className="text-white/40 text-xs mt-1">
                          Uploaded: {new Date(upload.uploadDate).toLocaleString()}
                        </p>
                      )}
                      {upload.status === 'rejected' && upload.rejectionReason && (
                        <p className="text-red-400 text-sm mt-2">
                          ❌ Rejected: {upload.rejectionReason}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* File Preview */}
                {upload.preview && (
                  <div className="mb-4 relative">
                    <div className="bg-white/5 rounded-2xl p-3 flex items-center gap-3">
                      {upload.file?.type.startsWith('image/') ? (
                        <img 
                          src={upload.preview} 
                          alt="Preview" 
                          className="w-20 h-20 object-cover rounded-xl"
                        />
                      ) : (
                        <div className="w-20 h-20 bg-white/10 rounded-xl flex items-center justify-center">
                          <FileText className="w-8 h-8 text-white/60" />
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="text-white font-semibold text-sm">{upload.file?.name}</p>
                        <p className="text-white/60 text-xs">
                          {(upload.file!.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => setPreviewDoc({ id: doc.id, preview: upload.preview! })}
                          className="p-2 rounded-xl bg-white/10 hover:bg-white/20"
                        >
                          <Eye className="w-5 h-5 text-white" />
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => handleRemoveDocument(doc.id)}
                          className="p-2 rounded-xl bg-red-500/20 hover:bg-red-500/30"
                        >
                          <X className="w-5 h-5 text-red-400" />
                        </motion.button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Upload Button */}
                <input
                  type="file"
                  id={`file-${doc.id}`}
                  accept="image/jpeg,image/png,image/jpg,application/pdf"
                  onChange={(e) => handleFileSelect(doc.id, e)}
                  className="hidden"
                />
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => document.getElementById(`file-${doc.id}`)?.click()}
                  className={`w-full rounded-2xl py-4 font-semibold flex items-center justify-center gap-2 ${
                    upload.preview
                      ? 'bg-white/5 border border-white/10 text-white/80'
                      : 'bg-gradient-to-r from-[#008CE5]/20 to-[#0070B8]/20 border border-[#008CE5]/30 text-[#008CE5]'
                  }`}
                >
                  <Upload className="w-5 h-5" />
                  {upload.preview ? 'Replace Document' : 'Upload Document'}
                </motion.button>
              </motion.div>
            );
          })}
        </div>

        {/* Background Check Consent */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-[24px] p-6 mb-6"
        >
          <label className="flex items-start gap-4 cursor-pointer">
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(e) => setConsentChecked(e.target.checked)}
              className="mt-1 w-5 h-5 rounded bg-white/10 border-white/20 checked:bg-[#008CE5]"
            />
            <div>
              <h3 className="text-white font-semibold mb-2">Background Check Consent</h3>
              <p className="text-white/60 text-sm leading-relaxed">
                I consent to TORC conducting a background check through Checkr, which may include criminal records, driving history, and identity verification. This is required for all providers to ensure customer safety.
              </p>
            </div>
          </label>
        </motion.div>

        {/* Submit Button */}
        <motion.button
          whileHover={{ scale: allRequiredUploaded && consentChecked ? 1.02 : 1 }}
          whileTap={{ scale: allRequiredUploaded && consentChecked ? 0.98 : 1 }}
          onClick={handleSubmit}
          disabled={!allRequiredUploaded || !consentChecked}
          className={`w-full rounded-[32px] py-5 font-bold text-lg transition-all ${
            allRequiredUploaded && consentChecked
              ? 'bg-gradient-to-r from-[#008CE5] to-[#0070B8] text-white shadow-lg shadow-[#008CE5]/30'
              : 'bg-white/10 text-white/40 cursor-not-allowed'
          }`}
        >
          Submit Documents for Review
        </motion.button>

        <p className="text-white/60 text-sm text-center mt-4">
          Review typically takes 24-48 hours
        </p>
      </div>

      {/* Preview Modal */}
      {previewDoc && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6"
          onClick={() => setPreviewDoc(null)}
        >
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            className="max-w-4xl w-full max-h-full overflow-auto glass rounded-[32px] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold text-xl">Document Preview</h3>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setPreviewDoc(null)}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20"
              >
                <X className="w-6 h-6 text-white" />
              </motion.button>
            </div>
            {documents[previewDoc.id].file?.type.startsWith('image/') ? (
              <img 
                src={previewDoc.preview} 
                alt="Document" 
                className="w-full rounded-2xl"
              />
            ) : (
              <div className="bg-white/5 rounded-2xl p-12 text-center">
                <FileText className="w-24 h-24 text-white/40 mx-auto mb-4" />
                <p className="text-white/60">PDF Preview</p>
                <p className="text-white text-sm mt-2">{documents[previewDoc.id].file?.name}</p>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
