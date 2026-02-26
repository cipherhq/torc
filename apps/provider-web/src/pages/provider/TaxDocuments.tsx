import { useNavigate } from 'react-router';
import { ArrowLeft, FileText } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useEffect, useState } from 'react';

export function TaxDocuments() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { user } = useAuth();
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    void loadDocuments();
  }, [user?.id]);

  async function loadDocuments() {
    if (!user) return;
    try {
      setLoading(true);
      setLoadError(null);
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('provider_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.warn('Failed to load tax documents:', error);
      setDocuments([]);
      setLoadError('Could not load documents right now.');
    } finally {
      setLoading(false);
    }
  }

  function getDocumentUrl(doc: any) {
    if (doc.file_url) return doc.file_url;
    const path = doc.file_path || doc.storage_path || null;
    if (!path) return null;
    const { data } = supabase.storage.from('provider-documents').getPublicUrl(path);
    return data.publicUrl;
  }

  return (
    <div className="min-h-screen p-6" style={{ background: isDark ? '#0F1419' : '#FAF8F5' }}>
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/profile')}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E8E4DE' }}
          title="Back to profile"
        >
          <ArrowLeft className="w-5 h-5" style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }} />
        </button>
        <h1 className="text-2xl font-bold" style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }}>Tax Documents</h1>
      </div>

      <div className="rounded-2xl p-6" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#E8E4DE'}` }}>
        <div className="flex items-center gap-3 mb-2">
          <FileText className="w-5 h-5" style={{ color: '#F59E0B' }} />
          <p className="font-semibold" style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }}>Tax document center</p>
        </div>

        {loading ? (
          <p style={{ color: isDark ? 'rgba(255,255,255,0.6)' : '#6B7280' }}>Loading documents...</p>
        ) : loadError ? (
          <p className="text-red-400 text-sm">{loadError}</p>
        ) : documents.length === 0 ? (
          <p style={{ color: isDark ? 'rgba(255,255,255,0.6)' : '#6B7280' }}>No tax documents uploaded yet.</p>
        ) : (
          <div className="space-y-3 mt-4">
            {documents.map((doc) => {
              const url = getDocumentUrl(doc);
              const statusColor =
                doc.status === 'approved' ? 'text-emerald-400' :
                doc.status === 'rejected' ? 'text-red-400' :
                'text-yellow-400';
              return (
                <div
                  key={doc.id}
                  className="rounded-xl p-3"
                  style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FDFBF8', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#E8E4DE'}` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold truncate" style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }}>
                        {doc.file_name || doc.type}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: isDark ? 'rgba(255,255,255,0.55)' : '#6B7280' }}>
                        {doc.type} • {new Date(doc.created_at).toLocaleDateString()}
                      </p>
                      {doc.rejection_reason && (
                        <p className="text-xs mt-1 text-red-400">{doc.rejection_reason}</p>
                      )}
                    </div>
                    <span className={`text-xs font-semibold uppercase ${statusColor}`}>{doc.status}</span>
                  </div>
                  {url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block mt-2 text-xs font-semibold text-[#008CE5]"
                    >
                      Open document
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
