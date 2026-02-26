import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Upload, FileText, CheckCircle, Clock, AlertCircle, X, Eye, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

interface DocumentRecord {
  id: string;
  provider_id: string;
  type: string;
  file_name: string | null;
  file_path: string | null;
  file_url: string | null;
  mime_type: string | null;
  file_size: number | null;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  updated_at: string;
}

export function ProviderDocuments() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { user } = useAuth() as any;
  const [documents, setDocuments] = useState<Record<string, DocumentRecord | null>>({
    license: null,
    insurance: null,
    registration: null,
    towing: null,
  });
  const [loading, setLoading] = useState(true);
  const [savingDocId, setSavingDocId] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{ id: string; url: string; mimeType: string | null; fileName: string | null } | null>(null);

  const documentConfig = [
    { id: 'license', name: "Driver's License", required: true, description: "Valid state-issued driver's license" },
    { id: 'insurance', name: 'Insurance Certificate', required: true, description: 'Proof of commercial vehicle insurance' },
    { id: 'registration', name: 'Vehicle Registration', required: false, description: 'Current vehicle registration' },
    { id: 'towing', name: 'Towing Credentials', required: false, description: 'Towing certification (if applicable)' },
  ];

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    loadDocuments();
  }, [user?.id]);

  async function getActiveProviderUser() {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user?.id) {
      throw new Error('Session expired. Please sign in again.');
    }

    if (user?.id && user.id !== data.user.id) {
      console.warn('Provider auth context mismatch detected', {
        contextUserId: user.id,
        authUserId: data.user.id,
      });
    }

    return data.user;
  }

  async function ensureProviderRows(providerId: string, email: string | null | undefined) {
    const profilePayload: any = { id: providerId, role: 'provider' };
    if (email) {
      profilePayload.email = email;
    }

    const profileRes = await supabase.from('profiles').upsert(profilePayload, { onConflict: 'id' });
    if (profileRes.error) {
      console.warn('Could not upsert profiles row during document recovery:', profileRes.error);
    }

    const providerRes = await supabase.from('provider_profiles').upsert({ id: providerId }, { onConflict: 'id' });
    if (providerRes.error) {
      console.warn('Could not upsert provider_profiles row during document recovery:', providerRes.error);
    }
  }

  async function loadDocuments() {
    if (!user) return;
    try {
      setLoading(true);
      setPageError(null);
      const authUser = await getActiveProviderUser();
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('provider_id', authUser.id);
      if (error) throw error;

      const next: Record<string, DocumentRecord | null> = {
        license: null,
        insurance: null,
        registration: null,
        towing: null,
      };
      (data || []).forEach((row: any) => {
        if (next[row.type] !== undefined) {
          next[row.type] = row as DocumentRecord;
        }
      });
      setDocuments(next);
    } catch (error: any) {
      console.warn('Failed to load provider documents:', error);
      setPageError(error?.message || 'Could not load documents right now.');
    } finally {
      setLoading(false);
    }
  }

  async function handleFileSelect(docId: string, event: React.ChangeEvent<HTMLInputElement>) {
    if (!user) return;
    const file = event.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (!validTypes.includes(file.type)) { alert('Please upload a JPG, PNG, or PDF file'); return; }
    if (file.size > 10 * 1024 * 1024) { alert('File size must be less than 10MB'); return; }

    try {
      setSavingDocId(docId);
      const authUser = await getActiveProviderUser();
      const providerId = authUser.id;
      const safeName = file.name.replace(/\s+/g, '-').replace(/[^\w.-]/g, '');
      const storagePath = `${providerId}/${docId}/${Date.now()}-${safeName}`;

      const upload = await supabase.storage.from('provider-documents').upload(storagePath, file, { upsert: false });
      if (upload.error) throw upload.error;

      const { data: publicData } = supabase.storage.from('provider-documents').getPublicUrl(storagePath);
      const fileUrl = publicData?.publicUrl || null;

      const basePayload = {
        provider_id: providerId,
        type: docId,
        file_name: file.name,
        file_url: fileUrl,
        mime_type: file.type,
        file_size: file.size,
        status: 'pending',
        rejection_reason: null,
      };

      const withPathPayload = {
        ...basePayload,
        file_path: storagePath,
      };

      let { error: upsertError } = await supabase
        .from('documents')
        .upsert(withPathPayload, { onConflict: 'provider_id,type' });

      let upsertMsg = String(upsertError?.message || '').toLowerCase();

      // Backward compatibility for environments where documents.file_path does not exist yet.
      if (upsertError && upsertMsg.includes('file_path')) {
        const fallback = await supabase.from('documents').upsert(basePayload, { onConflict: 'provider_id,type' });
        upsertError = fallback.error;
      }

      // Legacy DB fallback: if (provider_id,type) unique constraint is missing, upsert fails.
      // In that case do an UPDATE-first then INSERT flow.
      if (upsertError && upsertMsg.includes('no unique or exclusion constraint matching the on conflict specification')) {
        let updatePayload: any = withPathPayload;
        let { data: updatedRows, error: updateErr } = await supabase
          .from('documents')
          .update(updatePayload)
          .eq('provider_id', providerId)
          .eq('type', docId)
          .select('id');

        if (updateErr && String(updateErr.message || '').includes('file_path')) {
          updatePayload = basePayload;
          const retry = await supabase
            .from('documents')
            .update(updatePayload)
            .eq('provider_id', providerId)
            .eq('type', docId)
            .select('id');
          updatedRows = retry.data;
          updateErr = retry.error;
        }

        if (updateErr) throw updateErr;

        if (!updatedRows || updatedRows.length === 0) {
          let { error: insertErr } = await supabase.from('documents').insert(withPathPayload);
          if (insertErr && String(insertErr.message || '').includes('file_path')) {
            insertErr = (await supabase.from('documents').insert(basePayload)).error;
          }
          if (insertErr) throw insertErr;
        }

        upsertError = null;
      }

      // Session/profile mismatch recovery: ensure provider rows exist, then retry once.
      if (upsertError && upsertMsg.includes('documents_provider_id_fkey')) {
        await ensureProviderRows(providerId, authUser.email);
        const retry = await supabase
          .from('documents')
          .upsert(withPathPayload, { onConflict: 'provider_id,type' });
        upsertError = retry.error;
        upsertMsg = String(upsertError?.message || '').toLowerCase();
      }

      if (upsertError && upsertMsg.includes('documents_provider_id_fkey')) {
        throw new Error('Account session is out of sync. Please sign out, sign in again, and retry upload.');
      }

      if (upsertError) throw upsertError;

      await loadDocuments();
    } catch (error: any) {
      console.warn('Upload failed:', error);
      alert(error?.message || 'Could not upload this document.');
    } finally {
      setSavingDocId(null);
    }
  }

  async function handleRemoveDocument(docId: string) {
    if (!user) return;
    const existing = documents[docId];
    if (!existing) return;
    try {
      setSavingDocId(docId);
      const authUser = await getActiveProviderUser();
      if (existing.file_path) {
        const removeRes = await supabase.storage.from('provider-documents').remove([existing.file_path]);
        if (removeRes.error) {
          // We still try DB delete if file was already removed.
          console.warn('Storage remove warning:', removeRes.error);
        }
      }
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('provider_id', authUser.id)
        .eq('type', docId);
      if (error) throw error;
      await loadDocuments();
    } catch (error: any) {
      console.warn('Failed to remove document:', error);
      alert(error?.message || 'Could not remove this document.');
    } finally {
      setSavingDocId(null);
    }
  }

  const handleSubmit = () => {
    const requiredDocs = documentConfig.filter(d => d.required);
    const missingDocs = requiredDocs.filter(d => !documents[d.id]);
    if (missingDocs.length > 0) { alert(`Please upload: ${missingDocs.map(d => d.name).join(', ')}`); return; }
    if (!consentChecked) { alert('Please consent to background check'); return; }
    navigate('/payout');
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircle className="w-5 h-5" style={{ color: '#008CE5' }} />;
      case 'pending': return <Clock className="w-5 h-5" style={{ color: '#0070B8' }} />;
      case 'rejected': return <AlertCircle className="w-5 h-5 text-red-500" />;
      default: return <FileText className="w-5 h-5" style={{ color: isDark ? 'rgba(255,255,255,0.3)' : '#9CA3AF' }} />;
    }
  };

  const allRequiredUploaded = documentConfig.filter(d => d.required).every(d => !!documents[d.id]);

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
        <div className="absolute top-1/4 right-1/4 w-[400px] h-[400px] rounded-full" style={{ backgroundColor: '#008CE5', filter: 'blur(160px)', opacity: isDark ? 0.06 : 0.03 }} />
      </div>

      {/* Header */}
      <div className="relative z-10 p-6 flex items-center gap-4" style={{ paddingTop: 'var(--safe-top)' }}>
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate(-1)} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}>
          <ArrowLeft className="w-5 h-5" style={{ color: isDark ? '#FFFFFF' : '#1F2937' }} />
        </motion.button>
        <h1 className="text-xl font-bold" style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }}>Upload Documents</h1>
      </div>

      <div className="relative z-10 flex-1 px-6 pb-8 overflow-y-auto">
        {pageError && (
          <div className="rounded-2xl p-4 mb-4 border border-red-500/30" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF' }}>
            <p className="text-red-400 text-sm">{pageError}</p>
          </div>
        )}

        {/* Instructions */}
        <div className="rounded-2xl p-5 mb-6" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#FDFBF8', border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#E8E4DE'}` }}>
          <p className="text-sm mb-3" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#374151' }}>
            Upload clear photos or PDFs of your documents. All documents must be valid and not expired.
          </p>
          <div className="space-y-1 text-xs" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }}>
            <p>Accepted formats: JPG, PNG, PDF &bull; Max size: 10MB</p>
          </div>
        </div>

        {/* Document Cards */}
        <div className="space-y-4 mb-6">
          {loading && (
            <div className="rounded-2xl p-4 flex items-center gap-2 text-sm" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF', color: isDark ? 'rgba(255,255,255,0.7)' : '#6B7280' }}>
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading document status...
            </div>
          )}
          {documentConfig.map((doc, index) => {
            const upload = documents[doc.id];
            return (
              <motion.div key={doc.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }}
                className="rounded-2xl p-5" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#E8E4DE'}`, boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.04)' }}
              >
                <div className="flex items-start gap-3 mb-4">
                  {getStatusIcon(upload?.status || 'empty')}
                  <div className="flex-1">
                    <h3 className="font-semibold flex items-center gap-2" style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }}>
                      {doc.name}
                      {doc.required && <span className="text-red-500 text-xs">*Required</span>}
                    </h3>
                    <p className="text-sm" style={{ color: isDark ? 'rgba(255,255,255,0.5)' : '#6B7280' }}>{doc.description}</p>
                    {upload?.status === 'rejected' && upload.rejection_reason && (
                      <p className="text-xs mt-1 text-red-400">Rejection reason: {upload.rejection_reason}</p>
                    )}
                  </div>
                </div>

                {upload?.file_url && (
                  <div className="mb-4 rounded-xl p-3 flex items-center gap-3" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#FDFBF8' }}>
                    {(upload.mime_type || '').startsWith('image/') ? (
                      <img src={upload.file_url} alt="Preview" className="w-16 h-16 object-cover rounded-lg" />
                    ) : (
                      <div className="w-16 h-16 rounded-lg flex items-center justify-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#E8E4DE' }}>
                        <FileText className="w-6 h-6" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }}>{upload.file_name || 'Document'}</p>
                      <p className="text-xs" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }}>
                        {upload.file_size ? `${(upload.file_size / 1024 / 1024).toFixed(2)} MB` : '-'} • {upload.status}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button title={`Preview ${doc.name}`} onClick={() => setPreviewDoc({ id: doc.id, url: upload.file_url!, mimeType: upload.mime_type, fileName: upload.file_name })} className="p-2 rounded-lg" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F5F2ED' }}>
                        <Eye className="w-4 h-4" style={{ color: isDark ? '#FFFFFF' : '#6B7280' }} />
                      </button>
                      <button title={`Remove ${doc.name}`} onClick={() => handleRemoveDocument(doc.id)} disabled={savingDocId === doc.id} className="p-2 rounded-lg disabled:opacity-50" style={{ backgroundColor: 'rgba(239,68,68,0.1)' }}>
                        <X className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </div>
                )}

                <input title={`Upload ${doc.name}`} type="file" id={`file-${doc.id}`} accept="image/jpeg,image/png,image/jpg,application/pdf" onChange={(e) => { void handleFileSelect(doc.id, e); }} className="hidden" />
                <button
                  onClick={() => document.getElementById(`file-${doc.id}`)?.click()}
                  disabled={savingDocId === doc.id}
                  className="w-full rounded-xl py-3 font-semibold text-sm flex items-center justify-center gap-2 transition-all"
                  style={{
                    backgroundColor: upload?.file_url ? (isDark ? 'rgba(255,255,255,0.05)' : '#FDFBF8') : 'rgba(0,140,229,0.1)',
                    border: `1px solid ${upload?.file_url ? (isDark ? 'rgba(255,255,255,0.08)' : '#E8E4DE') : 'rgba(0,140,229,0.3)'}`,
                    color: upload?.file_url ? (isDark ? 'rgba(255,255,255,0.6)' : '#6B7280') : '#008CE5',
                  }}
                >
                  {savingDocId === doc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {savingDocId === doc.id ? 'Uploading...' : (upload?.file_url ? 'Replace Document' : 'Upload Document')}
                </button>
              </motion.div>
            );
          })}
        </div>

        {/* Consent */}
        <div className="rounded-2xl p-5 mb-6" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#FDFBF8', border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#E8E4DE'}` }}>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)} className="mt-1 w-5 h-5 rounded accent-[#008CE5]" />
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
            background: allRequiredUploaded && consentChecked ? 'linear-gradient(135deg, #008CE5, #0070B8)' : (isDark ? 'rgba(255,255,255,0.08)' : '#E8E4DE'),
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
              <button title="Close preview" onClick={() => setPreviewDoc(null)} className="p-2 rounded-full" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#F5F2ED' }}>
                <X className="w-5 h-5" style={{ color: isDark ? '#FFFFFF' : '#6B7280' }} />
              </button>
            </div>
            {(previewDoc.mimeType || '').startsWith('image/') ? (
              <img src={previewDoc.url} alt="Document" className="w-full rounded-xl" />
            ) : (
              <div className="rounded-xl p-12 text-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#FDFBF8' }}>
                <FileText className="w-16 h-16 mx-auto mb-3" style={{ color: isDark ? 'rgba(255,255,255,0.3)' : '#9CA3AF' }} />
                <p className="text-sm" style={{ color: isDark ? 'rgba(255,255,255,0.5)' : '#6B7280' }}>{previewDoc.fileName || 'Document'}</p>
                <button
                  onClick={() => window.open(previewDoc.url, '_blank', 'noopener,noreferrer')}
                  className="mt-4 text-sm font-semibold"
                  style={{ color: '#008CE5' }}
                >
                  Open file
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
