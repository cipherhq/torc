import { useState } from 'react';
import { motion } from 'motion/react';
import { AdminNav } from '../../components/AdminNav';
import { FileText, Plus, Trash2, Edit2, Save, X, ToggleLeft, ToggleRight } from 'lucide-react';

interface DocumentType {
  id: string;
  name: string;
  description: string;
  required: boolean;
  acceptedFormats: string[];
  maxSizeMB: number;
  enabled: boolean;
}

export function DocumentSettings() {
  const [documents, setDocuments] = useState<DocumentType[]>([
    {
      id: 'license',
      name: "Driver's License",
      description: 'Valid state-issued driver\'s license',
      required: true,
      acceptedFormats: ['JPG', 'PNG', 'PDF'],
      maxSizeMB: 10,
      enabled: true,
    },
    {
      id: 'insurance',
      name: 'Insurance Certificate',
      description: 'Proof of commercial vehicle insurance',
      required: true,
      acceptedFormats: ['JPG', 'PNG', 'PDF'],
      maxSizeMB: 10,
      enabled: true,
    },
    {
      id: 'registration',
      name: 'Vehicle Registration',
      description: 'Current vehicle registration',
      required: false,
      acceptedFormats: ['JPG', 'PNG', 'PDF'],
      maxSizeMB: 10,
      enabled: true,
    },
    {
      id: 'towing',
      name: 'Towing Credentials',
      description: 'Towing certification (if applicable)',
      required: false,
      acceptedFormats: ['JPG', 'PNG', 'PDF'],
      maxSizeMB: 10,
      enabled: true,
    },
  ]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<DocumentType | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newDoc, setNewDoc] = useState<DocumentType>({
    id: '',
    name: '',
    description: '',
    required: false,
    acceptedFormats: ['JPG', 'PNG', 'PDF'],
    maxSizeMB: 10,
    enabled: true,
  });

  const handleEdit = (doc: DocumentType) => {
    setEditingId(doc.id);
    setEditForm({ ...doc });
  };

  const handleSave = () => {
    if (editForm) {
      setDocuments(docs => docs.map(d => d.id === editForm.id ? editForm : d));
      setEditingId(null);
      setEditForm(null);
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const handleToggleRequired = (id: string) => {
    setDocuments(docs => docs.map(d => 
      d.id === id ? { ...d, required: !d.required } : d
    ));
  };

  const handleToggleEnabled = (id: string) => {
    setDocuments(docs => docs.map(d => 
      d.id === id ? { ...d, enabled: !d.enabled } : d
    ));
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this document type?')) {
      setDocuments(docs => docs.filter(d => d.id !== id));
    }
  };

  const handleAddDocument = () => {
    if (!newDoc.name || !newDoc.description) {
      alert('Please fill in all fields');
      return;
    }

    const id = newDoc.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    setDocuments([...documents, { ...newDoc, id }]);
    setShowAddModal(false);
    setNewDoc({
      id: '',
      name: '',
      description: '',
      required: false,
      acceptedFormats: ['JPG', 'PNG', 'PDF'],
      maxSizeMB: 10,
      enabled: true,
    });
  };

  return (
    <div className="min-h-screen bg-[#0F1419] flex">
      <AdminNav />

      <div className="flex-1 ml-64">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#252B3D] to-[#2F3548] p-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Document Settings</h1>
              <p className="text-white/60">Manage required provider documents</p>
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowAddModal(true)}
              className="bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-2xl px-6 py-3 font-semibold text-[#0F1419] flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Add Document Type
            </motion.button>
          </div>
        </div>

        <div className="p-8">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-6 mb-8">
            <div className="glass rounded-[24px] p-6">
              <FileText className="w-8 h-8 text-[#2EFFAF] mb-3" />
              <p className="text-white/60 text-sm">Total Documents</p>
              <p className="text-white text-3xl font-bold">{documents.length}</p>
            </div>
            <div className="glass rounded-[24px] p-6">
              <FileText className="w-8 h-8 text-red-400 mb-3" />
              <p className="text-white/60 text-sm">Required</p>
              <p className="text-white text-3xl font-bold">
                {documents.filter(d => d.required).length}
              </p>
            </div>
            <div className="glass rounded-[24px] p-6">
              <FileText className="w-8 h-8 text-[#007AFF] mb-3" />
              <p className="text-white/60 text-sm">Optional</p>
              <p className="text-white text-3xl font-bold">
                {documents.filter(d => !d.required).length}
              </p>
            </div>
            <div className="glass rounded-[24px] p-6">
              <FileText className="w-8 h-8 text-[#2EFFAF] mb-3" />
              <p className="text-white/60 text-sm">Active</p>
              <p className="text-white text-3xl font-bold">
                {documents.filter(d => d.enabled).length}
              </p>
            </div>
          </div>

          {/* Document List */}
          <div className="glass rounded-[24px] p-6">
            <h2 className="text-white font-bold text-xl mb-6">Document Types</h2>

            <div className="space-y-4">
              {documents.map((doc) => (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`bg-white/5 rounded-2xl p-5 ${!doc.enabled ? 'opacity-50' : ''}`}
                >
                  {editingId === doc.id && editForm ? (
                    // Edit Mode
                    <div className="space-y-4">
                      <div>
                        <label className="text-white/80 text-sm mb-2 block">Document Name</label>
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className="w-full bg-white/10 rounded-xl px-4 py-3 text-white border border-white/20 focus:border-[#2EFFAF] focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="text-white/80 text-sm mb-2 block">Description</label>
                        <textarea
                          value={editForm.description}
                          onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                          rows={2}
                          className="w-full bg-white/10 rounded-xl px-4 py-3 text-white border border-white/20 focus:border-[#2EFFAF] focus:outline-none"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-white/80 text-sm mb-2 block">Max Size (MB)</label>
                          <input
                            type="number"
                            value={editForm.maxSizeMB}
                            onChange={(e) => setEditForm({ ...editForm, maxSizeMB: parseInt(e.target.value) })}
                            className="w-full bg-white/10 rounded-xl px-4 py-3 text-white border border-white/20 focus:border-[#2EFFAF] focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="text-white/80 text-sm mb-2 block">Required</label>
                          <select
                            value={editForm.required ? 'true' : 'false'}
                            onChange={(e) => setEditForm({ ...editForm, required: e.target.value === 'true' })}
                            className="w-full bg-white/10 rounded-xl px-4 py-3 text-white border border-white/20 focus:border-[#2EFFAF] focus:outline-none"
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
                          className="flex-1 bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-xl py-3 font-semibold text-[#0F1419] flex items-center justify-center gap-2"
                        >
                          <Save className="w-5 h-5" />
                          Save Changes
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
                    // View Mode
                    <>
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-white font-bold text-lg">{doc.name}</h3>
                            {doc.required && (
                              <span className="px-3 py-1 rounded-full bg-red-500/20 text-red-400 text-xs font-semibold">
                                REQUIRED
                              </span>
                            )}
                            {!doc.enabled && (
                              <span className="px-3 py-1 rounded-full bg-white/10 text-white/60 text-xs font-semibold">
                                DISABLED
                              </span>
                            )}
                          </div>
                          <p className="text-white/60 text-sm mb-3">{doc.description}</p>
                          <div className="flex items-center gap-4 text-sm text-white/60">
                            <span>Formats: {doc.acceptedFormats.join(', ')}</span>
                            <span>•</span>
                            <span>Max: {doc.maxSizeMB}MB</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => handleToggleEnabled(doc.id)}
                            className="p-2 rounded-xl hover:bg-white/10"
                          >
                            {doc.enabled ? (
                              <ToggleRight className="w-6 h-6 text-[#2EFFAF]" />
                            ) : (
                              <ToggleLeft className="w-6 h-6 text-white/40" />
                            )}
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => handleEdit(doc)}
                            className="p-2 rounded-xl hover:bg-white/10"
                          >
                            <Edit2 className="w-5 h-5 text-[#007AFF]" />
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => handleDelete(doc.id)}
                            className="p-2 rounded-xl hover:bg-red-500/20"
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
          </div>
        </div>
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
                  className="w-full bg-white/10 rounded-xl px-4 py-3 text-white border border-white/20 focus:border-[#2EFFAF] focus:outline-none placeholder-white/40"
                />
              </div>

              <div>
                <label className="text-white/80 text-sm mb-2 block">Description *</label>
                <textarea
                  value={newDoc.description}
                  onChange={(e) => setNewDoc({ ...newDoc, description: e.target.value })}
                  placeholder="Brief description of what this document is"
                  rows={3}
                  className="w-full bg-white/10 rounded-xl px-4 py-3 text-white border border-white/20 focus:border-[#2EFFAF] focus:outline-none placeholder-white/40"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-white/80 text-sm mb-2 block">Max Size (MB)</label>
                  <input
                    type="number"
                    value={newDoc.maxSizeMB}
                    onChange={(e) => setNewDoc({ ...newDoc, maxSizeMB: parseInt(e.target.value) })}
                    className="w-full bg-white/10 rounded-xl px-4 py-3 text-white border border-white/20 focus:border-[#2EFFAF] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-white/80 text-sm mb-2 block">Required</label>
                  <select
                    value={newDoc.required ? 'true' : 'false'}
                    onChange={(e) => setNewDoc({ ...newDoc, required: e.target.value === 'true' })}
                    className="w-full bg-white/10 rounded-xl px-4 py-3 text-white border border-white/20 focus:border-[#2EFFAF] focus:outline-none"
                  >
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </select>
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleAddDocument}
                className="w-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-2xl py-4 font-bold text-[#0F1419]"
              >
                Add Document Type
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
