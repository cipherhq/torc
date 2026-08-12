import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { Upload, FileText, CheckCircle, Clock, AlertCircle, X, Eye, Loader2, Calendar, Camera } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { PageHeader } from '../../components/PageHeader';
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
  expires_at: string | null;
}

interface DocTypeConfig {
  id: string;
  name: string;
  required: boolean;
  description: string;
}

export function ProviderDocuments() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { user } = useAuth() as any;
  const [documents, setDocuments] = useState<Record<string, DocumentRecord | null>>({});
  const [loading, setLoading] = useState(true);
  const [savingDocId, setSavingDocId] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{ id: string; url: string; mimeType: string | null; fileName: string | null } | null>(null);
  const [documentConfig, setDocumentConfig] = useState<DocTypeConfig[]>([]);

  // Fallback config if document_types table doesn't exist yet
  const fallbackConfig: DocTypeConfig[] = [
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
    loadDocumentTypes().then(() => loadDocuments());
  }, [user?.id]);

  // Real-time: auto-refresh when admin changes document status
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('provider-docs-status')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'documents',
        filter: `provider_id=eq.${user.id}`,
      }, () => {
        loadDocuments();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  async function loadDocumentTypes() {
    try {
      const { data, error } = await supabase
        .from('document_types')
        .select('id, name, description, is_required')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      if (error) throw error;
      if (data && data.length > 0) {
        setDocumentConfig(data.map((dt: any) => ({
          id: dt.id,
          name: dt.name,
          required: dt.is_required,
          description: dt.description || '',
        })));
      } else {
        setDocumentConfig(fallbackConfig);
      }
    } catch {
      // Table may not exist yet — use fallback
      setDocumentConfig(fallbackConfig);
    }
  }

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

  async function ensureProviderRows() {
    // Use SECURITY DEFINER RPC that bypasses RLS to guarantee rows exist.
    // This is the authoritative path — no client-side fallback.
    const { error } = await supabase.rpc('ensure_provider_setup');
    if (error) {
      throw new Error('Your provider account could not be prepared. Please try again or contact support.');
    }
  }

  async function loadDocuments() {
    if (!user) return;
    try {
      setLoading(true);
      setPageError(null);
      const authUser = await getActiveProviderUser();
      // Proactively ensure provider rows exist so uploads won't fail
      await ensureProviderRows();
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('provider_id', authUser.id);
      if (error) throw error;

      const next: Record<string, DocumentRecord | null> = {};
      // Initialize all configured types as null
      documentConfig.forEach(dc => { next[dc.id] = null; });
      // Also include fallback keys so old documents still show
      fallbackConfig.forEach(dc => { if (!(dc.id in next)) next[dc.id] = null; });
      (data || []).forEach((row: any) => {
        next[row.type] = row as DocumentRecord;
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
    if (!validTypes.includes(file.type)) { setPageError('Please upload a JPG, PNG, or PDF file'); return; }
    if (file.size > 10 * 1024 * 1024) { setPageError('File size must be less than 10MB'); return; }

    try {
      setSavingDocId(docId);

      // Refresh session to ensure token is valid before upload
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.warn('Session refresh warning:', refreshError.message);
      }

      const authUser = await getActiveProviderUser();
      const providerId = authUser.id;

      // Proactively ensure provider rows exist before upload to prevent FK errors
      await ensureProviderRows();
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
        await ensureProviderRows();
        const retry = await supabase
          .from('documents')
          .upsert(withPathPayload, { onConflict: 'provider_id,type' });
        upsertError = retry.error;
        upsertMsg = String(upsertError?.message || '').toLowerCase();
      }

      if (upsertError && upsertMsg.includes('documents_provider_id_fkey')) {
        // Try one more time - force session refresh and re-ensure rows
        try {
          await supabase.auth.refreshSession();
          const freshUser = await getActiveProviderUser();
          await ensureProviderRows();
          const lastRetry = await supabase
            .from('documents')
            .upsert({ ...withPathPayload, provider_id: freshUser.id }, { onConflict: 'provider_id,type' });
          if (!lastRetry.error) {
            upsertError = null;
          } else {
            throw new Error('Your account setup is incomplete. Please sign out, sign back in, and try again.');
          }
        } catch (retryErr: any) {
          if (retryErr?.message?.includes('sign out')) throw retryErr;
          throw new Error('Your account setup is incomplete. Please sign out, sign back in, and try again.');
        }
      }

      if (upsertError) throw upsertError;

      await loadDocuments();
    } catch (error: any) {
      setPageError(error?.message || 'Could not upload this document.');
    } finally {
      setSavingDocId(null);
    }
  }

  async function handleCameraUpload(docId: string) {
    if (!user) return;
    try {
      const perms = await CapCamera.requestPermissions({ permissions: ['camera', 'photos'] });
      if (perms.camera === 'denied' && perms.photos === 'denied') {
        setPageError('Camera and photo permissions are required. Please enable them in Settings.');
        return;
      }
      const image = await CapCamera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        width: 1600,
        height: 1600,
        promptLabelHeader: 'Upload Document',
        promptLabelPicture: 'Take Photo',
      });
      if (!image.dataUrl) return;

      setSavingDocId(docId);

      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) console.warn('Session refresh warning:', refreshError.message);

      const authUser = await getActiveProviderUser();
      const providerId = authUser.id;
      await ensureProviderRows();

      // Convert data URL to blob
      const blob = await fetch(image.dataUrl).then(r => r.blob());
      const ext = image.format === 'png' ? 'png' : 'jpg';
      const mimeType = image.format === 'png' ? 'image/png' : 'image/jpeg';
      const fileName = `${docId}-${Date.now()}.${ext}`;
      const storagePath = `${providerId}/${docId}/${fileName}`;

      const uploadRes = await supabase.storage.from('provider-documents').upload(storagePath, blob, { upsert: false, contentType: mimeType });
      if (uploadRes.error) throw uploadRes.error;

      const { data: publicData } = supabase.storage.from('provider-documents').getPublicUrl(storagePath);
      const fileUrl = publicData?.publicUrl || null;

      const payload = {
        provider_id: providerId,
        type: docId,
        file_name: fileName,
        file_url: fileUrl,
        file_path: storagePath,
        mime_type: mimeType,
        file_size: blob.size,
        status: 'pending',
        rejection_reason: null,
      };

      let { error: upsertError } = await supabase
        .from('documents')
        .upsert(payload, { onConflict: 'provider_id,type' });

      // Legacy fallback if file_path column doesn't exist
      if (upsertError && String(upsertError.message || '').toLowerCase().includes('file_path')) {
        const { file_path, ...base } = payload;
        const fallback = await supabase.from('documents').upsert(base, { onConflict: 'provider_id,type' });
        upsertError = fallback.error;
      }

      if (upsertError) throw upsertError;
      await loadDocuments();
    } catch (error: any) {
      // User cancelled camera — not an error
      if (error?.message?.includes('User cancelled') || error?.message?.includes('canceled')) return;
      setPageError(error?.message || 'Could not upload photo.');
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
      setPageError(error?.message || 'Could not remove this document.');
    } finally {
      setSavingDocId(null);
    }
  }

  async function handleUpdateExpiry(docType: string, expiryDate: string | null) {
    if (!user) return;
    try {
      const authUser = await getActiveProviderUser();
      await supabase
        .from('documents')
        .update({ expires_at: expiryDate || null })
        .eq('provider_id', authUser.id)
        .eq('type', docType);
      // Update local state
      setDocuments(prev => {
        const doc = prev[docType];
        if (!doc) return prev;
        return { ...prev, [docType]: { ...doc, expires_at: expiryDate } };
      });
    } catch (error: any) {
      console.warn('Failed to update expiry date:', error);
    }
  }

  const handleSubmit = async () => {
    const requiredDocs = documentConfig.filter(d => d.required);
    const missingDocs = requiredDocs.filter(d => !documents[d.id]);
    if (missingDocs.length > 0) { setPageError(`Please upload: ${missingDocs.map(d => d.name).join(', ')}`); return; }
    if (!consentChecked) { setPageError('Please consent to background check'); return; }

    // Trigger documents-pending email (server verifies state, derives recipient/name, idempotent)
    import('../../services/email.service').then(({ sendDocumentsPendingEmail }) => {
      sendDocumentsPendingEmail();
    }).catch(() => { /* non-blocking */ });

    navigate('/verification-pending');
  };

  const getExpiryInfo = (expiresAt: string | null) => {
    if (!expiresAt) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiresAt + 'T00:00:00');
    const diffMs = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { label: `Expired ${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''} ago`, color: '#EF4444', bgColor: 'rgba(239,68,68,0.1)', urgent: true };
    if (diffDays === 0) return { label: 'Expires today', color: '#EF4444', bgColor: 'rgba(239,68,68,0.1)', urgent: true };
    if (diffDays <= 30) return { label: `Expires in ${diffDays} day${diffDays !== 1 ? 's' : ''}`, color: '#F59E0B', bgColor: 'rgba(245,158,11,0.1)', urgent: false };
    return { label: `Expires ${expiry.toLocaleDateString()}`, color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF', bgColor: 'transparent', urgent: false };
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
  const canSubmit = allRequiredUploaded && consentChecked;

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-hidden"
      style={{
        background: isDark
          ? 'linear-gradient(180deg, #14263D 0%, #0A1626 100%)'
          : 'linear-gradient(180deg, #FFFFFF 0%, #EAF3FF 100%)',
      }}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 right-1/4 w-[400px] h-[400px] rounded-full" style={{ backgroundColor: '#008CE5', filter: 'blur(160px)', opacity: isDark ? 0.06 : 0.03 }} />
      </div>

      <PageHeader title="Documents" onBack={() => navigate(-1)} />

      {/* paddingBottom = fixed-button height (~70px) + tab-bar (64px) + safe-area + gap */}
      <div className="relative z-10 flex-1 px-6 overflow-y-auto" style={{ paddingTop: 'calc(var(--safe-top) + 64px)', paddingBottom: 'calc(160px + env(safe-area-inset-bottom, 0px))' }}>
        {pageError && (
          <div className="rounded-2xl p-4 mb-4 border border-red-500/30" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF' }}>
            <p className="text-red-400 text-sm">{pageError}</p>
          </div>
        )}

        {/* Expired documents warning banner */}
        {(() => {
          const expiredDocs = Object.entries(documents).filter(([, doc]) => {
            if (!doc?.expires_at) return false;
            return new Date(doc.expires_at + 'T00:00:00') < new Date(new Date().toDateString());
          });
          if (expiredDocs.length === 0) return null;
          return (
            <div className="rounded-2xl p-4 mb-4" style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                <p className="font-semibold text-sm text-red-500">Expired Documents</p>
              </div>
              <p className="text-xs ml-7" style={{ color: isDark ? 'rgba(255,255,255,0.6)' : '#6B7280' }}>
                {expiredDocs.length} document{expiredDocs.length !== 1 ? 's have' : ' has'} expired. Please upload updated versions to avoid account suspension.
              </p>
            </div>
          );
        })()}

        {/* Instructions */}
        <div className="rounded-2xl p-5 mb-6" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F5F9FF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#D3E0F2'}` }}>
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
                className="rounded-2xl p-5" style={{
                  backgroundColor: upload?.status === 'approved'
                    ? (isDark ? 'rgba(34,197,94,0.04)' : 'rgba(34,197,94,0.03)')
                    : (isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF'),
                  border: `1px solid ${upload?.status === 'approved'
                    ? (isDark ? 'rgba(34,197,94,0.2)' : 'rgba(34,197,94,0.3)')
                    : (isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2')}`,
                  boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.04)',
                }}
              >
                <div className="flex items-start gap-3 mb-4">
                  {getStatusIcon(upload?.status || 'empty')}
                  <div className="flex-1">
                    <h3 className="font-semibold flex items-center gap-2" style={{ color: isDark ? '#FFFFFF' : '#14263D' }}>
                      {doc.name}
                      {doc.required && <span className="text-red-500 text-xs">*Required</span>}
                    </h3>
                    <p className="text-sm" style={{ color: isDark ? 'rgba(255,255,255,0.5)' : '#6B7280' }}>{doc.description}</p>
                    {upload?.status && (
                      <span
                        className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full mt-1.5 capitalize"
                        style={{
                          backgroundColor: upload.status === 'approved' ? 'rgba(34,197,94,0.1)' : upload.status === 'rejected' ? 'rgba(239,68,68,0.1)' : 'rgba(0,140,229,0.1)',
                          color: upload.status === 'approved' ? '#22C55E' : upload.status === 'rejected' ? '#EF4444' : '#008CE5',
                        }}
                      >
                        {upload.status === 'approved' && <CheckCircle className="w-3 h-3" />}
                        {upload.status === 'pending' && <Clock className="w-3 h-3" />}
                        {upload.status === 'rejected' && <AlertCircle className="w-3 h-3" />}
                        {upload.status}
                      </span>
                    )}
                    {upload?.status === 'rejected' && upload.rejection_reason && (
                      <p className="text-xs mt-1 text-red-400">Rejection reason: {upload.rejection_reason}</p>
                    )}
                    {upload?.file_url && (() => {
                      const info = getExpiryInfo(upload.expires_at);
                      if (!info) return null;
                      return (
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <Calendar className="w-3.5 h-3.5" style={{ color: info.color }} />
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ color: info.color, backgroundColor: info.bgColor }}>
                            {info.label}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {upload?.file_url && (
                  <div className="mb-4 rounded-xl p-3 flex items-center gap-3" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F5F9FF' }}>
                    {(upload.mime_type || '').startsWith('image/') ? (
                      <img src={upload.file_url} alt="Preview" className="w-16 h-16 object-cover rounded-lg" />
                    ) : (
                      <div className="w-16 h-16 rounded-lg flex items-center justify-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#D3E0F2' }}>
                        <FileText className="w-6 h-6" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: isDark ? '#FFFFFF' : '#14263D' }}>{upload.file_name || 'Document'}</p>
                      <p className="text-xs" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }}>
                        {upload.file_size ? `${(upload.file_size / 1024 / 1024).toFixed(2)} MB` : '-'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button title={`Preview ${doc.name}`} onClick={() => setPreviewDoc({ id: doc.id, url: upload.file_url!, mimeType: upload.mime_type, fileName: upload.file_name })} className="p-2 rounded-lg" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E8F0FB' }}>
                        <Eye className="w-4 h-4" style={{ color: isDark ? '#FFFFFF' : '#6B7280' }} />
                      </button>
                      {(() => {
                        const isExpiredRemove = upload.expires_at ? new Date(upload.expires_at + 'T00:00:00') < new Date(new Date().toDateString()) : false;
                        const isExpiringSoonRemove = !isExpiredRemove && upload.expires_at ? (() => {
                          const t = new Date(); t.setHours(0, 0, 0, 0);
                          return Math.ceil((new Date(upload.expires_at + 'T00:00:00').getTime() - t.getTime()) / (1000 * 60 * 60 * 24)) <= 30;
                        })() : false;
                        const canRemove = upload.status !== 'approved' || upload.status === 'rejected' || isExpiredRemove || isExpiringSoonRemove;
                        if (!canRemove) return null;
                        return (
                          <button title={`Remove ${doc.name}`} onClick={() => handleRemoveDocument(doc.id)} disabled={savingDocId === doc.id} className="p-2 rounded-lg disabled:opacity-50" style={{ backgroundColor: 'rgba(239,68,68,0.1)' }}>
                            <X className="w-4 h-4 text-red-500" />
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {upload?.file_url && (() => {
                  const isExpiredLocal = upload.expires_at ? new Date(upload.expires_at + 'T00:00:00') < new Date(new Date().toDateString()) : false;
                  const isExpiringSoonLocal = !isExpiredLocal && upload.expires_at ? (() => {
                    const t = new Date(); t.setHours(0, 0, 0, 0);
                    return Math.ceil((new Date(upload.expires_at + 'T00:00:00').getTime() - t.getTime()) / (1000 * 60 * 60 * 24)) <= 30;
                  })() : false;
                  const isLocked = upload.status === 'approved' && !!upload.expires_at && !isExpiredLocal && !isExpiringSoonLocal;
                  return (
                    <div className="mb-4">
                      <label className="text-sm font-medium mb-2 block" style={{ color: isLocked ? (isDark ? 'rgba(255,255,255,0.3)' : '#9CA3AF') : (isDark ? 'rgba(255,255,255,0.7)' : '#374151') }}>
                        Expiry Date
                      </label>
                      <div className="relative flex items-center">
                        <Calendar className="absolute left-3.5 w-4 h-4 pointer-events-none" style={{ color: isLocked ? (isDark ? 'rgba(255,255,255,0.15)' : '#D1D5DB') : (isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF') }} />
                        <input
                          type="date"
                          value={upload.expires_at || ''}
                          onChange={(e) => handleUpdateExpiry(doc.id, e.target.value || null)}
                          disabled={isLocked}
                          placeholder="Select date"
                          className="w-full rounded-xl text-sm outline-none transition-colors"
                          style={{
                            height: '48px',
                            paddingLeft: '42px',
                            paddingRight: '14px',
                            backgroundColor: isLocked ? (isDark ? 'rgba(255,255,255,0.03)' : '#F3F4F6') : (isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF'),
                            border: `1.5px solid ${isLocked ? (isDark ? 'rgba(255,255,255,0.06)' : '#E5E7EB') : (isDark ? 'rgba(255,255,255,0.12)' : '#D3E0F2')}`,
                            color: isLocked ? (isDark ? 'rgba(255,255,255,0.25)' : '#9CA3AF') : upload.expires_at ? (isDark ? '#FFFFFF' : '#14263D') : (isDark ? 'rgba(255,255,255,0.35)' : '#9CA3AF'),
                            colorScheme: isDark ? 'dark' : 'light',
                            opacity: isLocked ? 0.6 : 1,
                          }}
                        />
                      </div>
                    </div>
                  );
                })()}

                <input title={`Upload ${doc.name}`} type="file" id={`file-${doc.id}`} accept="image/jpeg,image/png,image/jpg,application/pdf" onChange={(e) => { void handleFileSelect(doc.id, e); }} className="hidden" />
                {(() => {
                  const isExpired = upload?.expires_at ? new Date(upload.expires_at + 'T00:00:00') < new Date(new Date().toDateString()) : false;
                  const isExpiringSoon = !isExpired && upload?.expires_at ? (() => {
                    const today = new Date(); today.setHours(0, 0, 0, 0);
                    const diffDays = Math.ceil((new Date(upload.expires_at + 'T00:00:00').getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    return diffDays <= 30;
                  })() : false;
                  const needsAction = upload?.status === 'rejected' || isExpired || isExpiringSoon;
                  const hasFile = !!upload?.file_url;
                  // Hide buttons when document is approved and not expired/rejected/expiring soon
                  if (hasFile && upload?.status === 'approved' && !isExpired && !isExpiringSoon) return null;
                  const btnColor = needsAction && hasFile ? '#EF4444' : '#008CE5';
                  const btnBg = needsAction && hasFile ? 'rgba(239,68,68,0.1)' : 'rgba(0,140,229,0.1)';
                  const btnBorder = needsAction && hasFile ? 'rgba(239,68,68,0.4)' : 'rgba(0,140,229,0.3)';
                  const isBusy = savingDocId === doc.id;
                  return (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleCameraUpload(doc.id)}
                        disabled={isBusy}
                        className="flex-1 rounded-xl py-3 font-semibold text-sm flex items-center justify-center gap-2 transition-all"
                        style={{ backgroundColor: btnBg, border: `1px solid ${btnBorder}`, color: btnColor, fontWeight: 600 }}
                      >
                        {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                        Take Photo
                      </button>
                      <button
                        onClick={() => document.getElementById(`file-${doc.id}`)?.click()}
                        disabled={isBusy}
                        className="flex-1 rounded-xl py-3 font-semibold text-sm flex items-center justify-center gap-2 transition-all"
                        style={{
                          backgroundColor: hasFile ? (isDark ? 'rgba(255,255,255,0.05)' : '#F5F9FF') : btnBg,
                          border: `1px solid ${hasFile ? (isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2') : btnBorder}`,
                          color: hasFile ? (isDark ? 'rgba(255,255,255,0.6)' : '#6B7280') : btnColor,
                          fontWeight: 600,
                        }}
                      >
                        {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        Upload File
                      </button>
                    </div>
                  );
                })()}
              </motion.div>
            );
          })}
        </div>

        {/* Consent */}
        <div
          id="documents-consent-card"
          className="rounded-2xl p-5 mb-6"
          style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F5F9FF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#D3E0F2'}` }}
        >
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)} className="mt-1 w-5 h-5 rounded accent-[#008CE5]" />
            <div>
              <h3 className="font-semibold mb-1" style={{ color: isDark ? '#FFFFFF' : '#14263D' }}>Background Check Consent</h3>
              <p className="text-sm leading-relaxed" style={{ color: isDark ? 'rgba(255,255,255,0.5)' : '#6B7280' }}>
                I consent to TORC conducting a background check, which may include criminal records, driving history, and identity verification.
              </p>
            </div>
          </label>
        </div>

      </div>

      {/* Fixed bottom submit button — sits above the tab bar */}
      <div className="fixed left-0 right-0 z-20 px-6 pt-4" style={{ bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))', backgroundColor: isDark ? '#14263D' : '#FFFFFF', borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2'}`, paddingBottom: '12px' }}>
        <motion.button
          whileTap={{ scale: !canSubmit || loading || !!savingDocId ? 1 : 0.97 }}
          onClick={handleSubmit}
          disabled={!canSubmit || loading || !!savingDocId}
          className="w-full rounded-2xl font-bold text-base flex items-center justify-center gap-2"
          style={{
            padding: '18px 0',
            background: canSubmit
              ? 'linear-gradient(135deg, #008CE5, #0070B8)'
              : isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB',
            color: canSubmit ? '#FFFFFF' : isDark ? 'rgba(255,255,255,0.3)' : '#9CA3AF',
            boxShadow: canSubmit ? '0 8px 24px rgba(0,140,229,0.35)' : 'none',
          }}
        >
          {savingDocId ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
          {savingDocId ? 'Uploading...' : 'Submit Documents'}
        </motion.button>
      </div>

      {/* Preview Modal */}
      {previewDoc && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6" onClick={() => setPreviewDoc(null)}>
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="max-w-lg w-full rounded-2xl p-6 overflow-auto" style={{ backgroundColor: isDark ? '#14263D' : '#FFFFFF' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg" style={{ color: isDark ? '#FFFFFF' : '#14263D' }}>Document Preview</h3>
              <button title="Close preview" onClick={() => setPreviewDoc(null)} className="p-2 rounded-full" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#E8F0FB' }}>
                <X className="w-5 h-5" style={{ color: isDark ? '#FFFFFF' : '#6B7280' }} />
              </button>
            </div>
            {(previewDoc.mimeType || '').startsWith('image/') ? (
              <img src={previewDoc.url} alt="Document" className="w-full rounded-xl" />
            ) : (
              <div className="rounded-xl p-12 text-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F5F9FF' }}>
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
