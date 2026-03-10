import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { AdminLayout } from '../../components/AdminLayout';
import { FileText, Plus, Trash2, Edit2, Save, X, ToggleLeft, ToggleRight, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface DocumentType {
  id: string;
  name: string;
  description: string;
  is_required: boolean;
  is_active: boolean;
  display_order: number;
}

export function DocumentSettings() {
  const [documents, setDocuments] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<DocumentType | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newDoc, setNewDoc] = useState({ name: '', description: '', is_required: false });
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    loadDocumentTypes();
  }, []);

  async function loadDocumentTypes() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('document_types')
        .select('id, name, description, is_required, is_active, display_order')
        .order('display_order', { ascending: true });

      if (error) throw error;
      setDocuments(data || []);
    } catch (err: any) {
      console.warn('Failed to load document types:', err);
      setFeedback('Failed to load document types.');
    } finally {
      setLoading(false);
    }
  }

  const handleEdit = (doc: DocumentType) => {
    setEditingId(doc.id);
    setEditForm({ ...doc });
  };

  const handleSave = async () => {
    if (!editForm) return;
    try {
      setSaving(true);
      const { error } = await supabase
        .from('document_types')
        .update({
          name: editForm.name,
          description: editForm.description,
          is_required: editForm.is_required,
          display_order: editForm.display_order,
        })
        .eq('id', editForm.id);
      if (error) throw error;

      setDocuments(docs => docs.map(d => d.id === editForm.id ? editForm : d));
      setEditingId(null);
      setEditForm(null);
      setFeedback('Document type updated.');
    } catch (err: any) {
      setFeedback(err?.message || 'Failed to save.');
    } finally {
      setSaving(false);
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const handleToggleRequired = async (id: string) => {
    const doc = documents.find(d => d.id === id);
    if (!doc) return;
    const updated = !doc.is_required;
    try {
      const { error } = await supabase
        .from('document_types')
        .update({ is_required: updated })
        .eq('id', id);
      if (error) throw error;
      setDocuments(docs => docs.map(d => d.id === id ? { ...d, is_required: updated } : d));
    } catch (err: any) {
      console.warn('Toggle required failed:', err);
    }
  };

  const handleToggleEnabled = async (id: string) => {
    const doc = documents.find(d => d.id === id);
    if (!doc) return;
    const updated = !doc.is_active;
    try {
      const { error } = await supabase
        .from('document_types')
        .update({ is_active: updated })
        .eq('id', id);
      if (error) throw error;
      setDocuments(docs => docs.map(d => d.id === id ? { ...d, is_active: updated } : d));
    } catch (err: any) {
      console.warn('Toggle enabled failed:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this document type? This cannot be undone.')) return;
    try {
      const { error } = await supabase
        .from('document_types')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setDocuments(docs => docs.filter(d => d.id !== id));
      setFeedback('Document type deleted.');
    } catch (err: any) {
      setFeedback(err?.message || 'Failed to delete.');
    }
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleAddDocument = async () => {
    if (!newDoc.name.trim() || !newDoc.description.trim()) {
      setFeedback('Please fill in name and description.');
      setTimeout(() => setFeedback(null), 3000);
      return;
    }

    const id = newDoc.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const nextOrder = documents.length > 0 ? Math.max(...documents.map(d => d.display_order)) + 1 : 1;

    try {
      setSaving(true);
      const row = {
        id,
        name: newDoc.name.trim(),
        description: newDoc.description.trim(),
        is_required: newDoc.is_required,
        is_active: true,
        display_order: nextOrder,
      };
      const { error } = await supabase
        .from('document_types')
        .insert(row);
      if (error) throw error;

      setDocuments([...documents, row]);
      setShowAddModal(false);
      setNewDoc({ name: '', description: '', is_required: false });
      setFeedback('Document type added.');
    } catch (err: any) {
      setFeedback(err?.message || 'Failed to add.');
    } finally {
      setSaving(false);
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Document Settings</h1>
            <p className="text-white/60">Manage required provider documents</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowAddModal(true)}
            className="bg-gradient-to-r from-[#008CE5] to-[#0070B8] rounded-2xl px-6 py-3 font-semibold text-white flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Add Document Type
          </motion.button>
        </div>

        {feedback && (
          <div className="mb-4 px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-white/80 text-sm">
            {feedback}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-[#008CE5] animate-spin" />
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-4 gap-6 mb-8">
              <div className="glass-light rounded-[24px] p-6">
                <FileText className="w-8 h-8 text-[#008CE5] mb-3" />
                <p className="text-white/60 text-sm">Total Types</p>
                <p className="text-white text-3xl font-bold">{documents.length}</p>
              </div>
              <div className="glass-light rounded-[24px] p-6">
                <FileText className="w-8 h-8 text-red-400 mb-3" />
                <p className="text-white/60 text-sm">Required</p>
                <p className="text-white text-3xl font-bold">
                  {documents.filter(d => d.is_required).length}
                </p>
              </div>
              <div className="glass-light rounded-[24px] p-6">
                <FileText className="w-8 h-8 text-[#0070B8] mb-3" />
                <p className="text-white/60 text-sm">Optional</p>
                <p className="text-white text-3xl font-bold">
                  {documents.filter(d => !d.is_required).length}
                </p>
              </div>
              <div className="glass-light rounded-[24px] p-6">
                <FileText className="w-8 h-8 text-green-400 mb-3" />
                <p className="text-white/60 text-sm">Active</p>
                <p className="text-white text-3xl font-bold">
                  {documents.filter(d => d.is_active).length}
                </p>
              </div>
            </div>

            {/* Document List */}
            <div className="glass-light rounded-[24px] p-6">
              <h2 className="text-white font-bold text-xl mb-6">Document Types</h2>

              {documents.length === 0 ? (
                <p className="text-white/60 text-center py-8">No document types configured yet.</p>
              ) : (
                <div className="space-y-4">
                  {documents.map((doc) => (
                    <motion.div
                      key={doc.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`bg-white/5 rounded-2xl p-5 ${!doc.is_active ? 'opacity-50' : ''}`}
                    >
                      {editingId === doc.id && editForm ? (
                        <div className="space-y-4">
                          <div>
                            <label className="text-white/80 text-sm mb-2 block">Document Name</label>
                            <input
                              type="text"
                              value={editForm.name}
                              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                              className="w-full bg-white/10 rounded-xl px-4 py-3 text-white border border-white/20 focus:border-[#008CE5] focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="text-white/80 text-sm mb-2 block">Description</label>
                            <textarea
                              value={editForm.description}
                              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                              rows={2}
                              className="w-full bg-white/10 rounded-xl px-4 py-3 text-white border border-white/20 focus:border-[#008CE5] focus:outline-none"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="text-white/80 text-sm mb-2 block">Display Order</label>
                              <input
                                type="number"
                                value={editForm.display_order}
                                onChange={(e) => setEditForm({ ...editForm, display_order: parseInt(e.target.value) || 0 })}
                                className="w-full bg-white/10 rounded-xl px-4 py-3 text-white border border-white/20 focus:border-[#008CE5] focus:outline-none"
                              />
                            </div>

                            <div>
                              <label className="text-white/80 text-sm mb-2 block">Required</label>
                              <select
                                value={editForm.is_required ? 'true' : 'false'}
                                onChange={(e) => setEditForm({ ...editForm, is_required: e.target.value === 'true' })}
                                className="w-full bg-white/10 rounded-xl px-4 py-3 text-white border border-white/20 focus:border-[#008CE5] focus:outline-none"
                              >
                                <option value="true">Yes</option>
                                <option value="false">No</option>
                              </select>
                            </div>
                          </div>

                          <div className="flex gap-3">
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={handleSave}
                              disabled={saving}
                              className="flex-1 bg-gradient-to-r from-[#008CE5] to-[#0070B8] rounded-xl py-3 font-semibold text-white flex items-center justify-center gap-2"
                            >
                              <Save className="w-5 h-5" />
                              {saving ? 'Saving...' : 'Save Changes'}
                            </motion.button>
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={handleCancel}
                              className="flex-1 bg-white/10 border border-white/20 rounded-xl py-3 font-semibold text-white flex items-center justify-center gap-2"
                            >
                              <X className="w-5 h-5" />
                              Cancel
                            </motion.button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h3 className="text-white font-bold text-lg">{doc.name}</h3>
                                {doc.is_required && (
                                  <span className="px-3 py-1 rounded-full bg-red-500/20 text-red-400 text-xs font-semibold">
                                    REQUIRED
                                  </span>
                                )}
                                {!doc.is_active && (
                                  <span className="px-3 py-1 rounded-full bg-white/10 text-white/60 text-xs font-semibold">
                                    DISABLED
                                  </span>
                                )}
                              </div>
                              <p className="text-white/60 text-sm mb-2">{doc.description}</p>
                              <p className="text-white/40 text-xs">ID: {doc.id} &middot; Order: {doc.display_order}</p>
                            </div>

                            <div className="flex items-center gap-2">
                              <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => handleToggleEnabled(doc.id)}
                                className="p-2 rounded-xl hover:bg-white/10"
                                title={doc.is_active ? 'Disable' : 'Enable'}
                              >
                                {doc.is_active ? (
                                  <ToggleRight className="w-6 h-6 text-[#008CE5]" />
                                ) : (
                                  <ToggleLeft className="w-6 h-6 text-white/40" />
                                )}
                              </motion.button>
                              <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => handleEdit(doc)}
                                className="p-2 rounded-xl hover:bg-white/10"
                                title="Edit"
                              >
                                <Edit2 className="w-5 h-5 text-[#0070B8]" />
                              </motion.button>
                              <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => handleDelete(doc.id)}
                                className="p-2 rounded-xl hover:bg-red-500/20"
                                title="Delete"
                              >
                                <Trash2 className="w-5 h-5 text-red-400" />
                              </motion.button>
                            </div>
                          </div>
                        </>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Add Document Modal */}
      {showAddModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6"
          onClick={() => setShowAddModal(false)}
        >
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            className="max-w-2xl w-full glass rounded-[32px] p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-white font-bold text-2xl">Add Document Type</h2>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setShowAddModal(false)}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20"
              >
                <X className="w-6 h-6 text-white" />
              </motion.button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-white/80 text-sm mb-2 block">Document Name *</label>
                <input
                  type="text"
                  value={newDoc.name}
                  onChange={(e) => setNewDoc({ ...newDoc, name: e.target.value })}
                  placeholder="e.g., Commercial Driver's License"
                  className="w-full bg-white/10 rounded-xl px-4 py-3 text-white border border-white/20 focus:border-[#008CE5] focus:outline-none placeholder-white/40"
                />
              </div>

              <div>
                <label className="text-white/80 text-sm mb-2 block">Description *</label>
                <textarea
                  value={newDoc.description}
                  onChange={(e) => setNewDoc({ ...newDoc, description: e.target.value })}
                  placeholder="Brief description of what this document is"
                  rows={3}
                  className="w-full bg-white/10 rounded-xl px-4 py-3 text-white border border-white/20 focus:border-[#008CE5] focus:outline-none placeholder-white/40"
                />
              </div>

              <div>
                <label className="text-white/80 text-sm mb-2 block">Required</label>
                <select
                  value={newDoc.is_required ? 'true' : 'false'}
                  onChange={(e) => setNewDoc({ ...newDoc, is_required: e.target.value === 'true' })}
                  className="w-full bg-white/10 rounded-xl px-4 py-3 text-white border border-white/20 focus:border-[#008CE5] focus:outline-none"
                >
                  <option value="false">No</option>
                  <option value="true">Yes</option>
                </select>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleAddDocument}
                disabled={saving}
                className="w-full bg-gradient-to-r from-[#008CE5] to-[#0070B8] rounded-2xl py-4 font-bold text-white"
              >
                {saving ? 'Adding...' : 'Add Document Type'}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AdminLayout>
  );
}
