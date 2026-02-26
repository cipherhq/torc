import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AdminLayout } from '../../components/AdminLayout';
import { supabase } from '../../lib/supabase';
import { Pagination } from '../../components/Pagination';
import {
  Search, Plus, RefreshCw, MapPin, Phone, Mail, Globe, Edit3,
  Trash2, X, Save, Loader2, AlertCircle, Building2, Fuel, Wrench,
  Car, Store, ToggleLeft, ToggleRight, Filter, ChevronDown,
} from 'lucide-react';

interface DirectoryListing {
  id: string;
  business_name: string;
  business_type: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  is_partner: boolean;
  is_active: boolean;
  services_offered: string[];
  created_at: string;
  updated_at: string;
}

const BUSINESS_TYPES = [
  { value: 'repair_shop', label: 'Repair Shop', icon: Wrench },
  { value: 'gas_station', label: 'Gas Station', icon: Fuel },
  { value: 'tow_yard', label: 'Tow Yard', icon: Car },
  { value: 'body_shop', label: 'Body Shop', icon: Store },
  { value: 'tire_shop', label: 'Tire Shop', icon: Store },
  { value: 'dealership', label: 'Dealership', icon: Building2 },
  { value: 'other', label: 'Other', icon: Building2 },
];

const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  BUSINESS_TYPES.map((t) => [t.value, t.label])
);

const emptyForm = {
  business_name: '',
  business_type: 'repair_shop',
  address: '',
  city: '',
  state: '',
  zip: '',
  phone: '',
  email: '',
  website: '',
  description: '',
  is_partner: false,
  is_active: true,
  services_offered: [] as string[],
};

type FilterTab = 'all' | 'partners' | 'active' | 'inactive';

export function AdminDirectory() {
  const [listings, setListings] = useState<DirectoryListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 12;

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from('directory_listings')
        .select('*')
        .order('business_name');

      if (fetchErr) throw fetchErr;
      setListings(data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load directory listings');
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  const filtered = useMemo(() => {
    let result = listings;

    // Status filter
    if (activeFilter === 'partners') result = result.filter((l) => l.is_partner);
    else if (activeFilter === 'active') result = result.filter((l) => l.is_active);
    else if (activeFilter === 'inactive') result = result.filter((l) => !l.is_active);

    // Type filter
    if (typeFilter !== 'all') result = result.filter((l) => l.business_type === typeFilter);

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (l) =>
          l.business_name.toLowerCase().includes(q) ||
          l.city?.toLowerCase().includes(q) ||
          l.state?.toLowerCase().includes(q) ||
          l.phone?.includes(q) ||
          l.email?.toLowerCase().includes(q)
      );
    }

    return result;
  }, [listings, activeFilter, typeFilter, searchQuery]);

  const paged = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeFilter, typeFilter]);

  // Counts
  const counts = useMemo(() => ({
    all: listings.length,
    partners: listings.filter((l) => l.is_partner).length,
    active: listings.filter((l) => l.is_active).length,
    inactive: listings.filter((l) => !l.is_active).length,
  }), [listings]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setShowModal(true);
  };

  const openEdit = (listing: DirectoryListing) => {
    setEditingId(listing.id);
    setForm({
      business_name: listing.business_name,
      business_type: listing.business_type,
      address: listing.address || '',
      city: listing.city || '',
      state: listing.state || '',
      zip: listing.zip || '',
      phone: listing.phone || '',
      email: listing.email || '',
      website: listing.website || '',
      description: listing.description || '',
      is_partner: listing.is_partner,
      is_active: listing.is_active,
      services_offered: listing.services_offered || [],
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.business_name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        business_name: form.business_name.trim(),
        business_type: form.business_type,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        zip: form.zip.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        website: form.website.trim() || null,
        description: form.description.trim() || null,
        is_partner: form.is_partner,
        is_active: form.is_active,
        services_offered: form.services_offered,
        updated_at: new Date().toISOString(),
      };

      if (editingId) {
        const { error: updateErr } = await supabase
          .from('directory_listings')
          .update(payload)
          .eq('id', editingId);
        if (updateErr) throw updateErr;
      } else {
        const { error: insertErr } = await supabase
          .from('directory_listings')
          .insert(payload);
        if (insertErr) throw insertErr;
      }

      setShowModal(false);
      fetchListings();
    } catch (err: any) {
      setError(err.message || 'Failed to save listing');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this listing?')) return;
    setDeleting(id);
    setError(null);
    try {
      const { error: delErr } = await supabase
        .from('directory_listings')
        .delete()
        .eq('id', id);
      if (delErr) throw delErr;
      fetchListings();
    } catch (err: any) {
      setError(err.message || 'Failed to delete listing');
    } finally {
      setDeleting(null);
    }
  };

  const handleToggleActive = async (listing: DirectoryListing) => {
    try {
      const { error: toggleErr } = await supabase
        .from('directory_listings')
        .update({ is_active: !listing.is_active, updated_at: new Date().toISOString() })
        .eq('id', listing.id);
      if (toggleErr) throw toggleErr;
      fetchListings();
    } catch (err: any) {
      setError(err.message || 'Failed to toggle status');
    }
  };

  const filterTabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'partners', label: 'Partners' },
    { key: 'active', label: 'Active' },
    { key: 'inactive', label: 'Inactive' },
  ];

  const getTypeStyle = (type: string): React.CSSProperties => {
    switch (type) {
      case 'repair_shop': return { backgroundColor: '#EFF6FF', color: '#1D4ED8' };
      case 'gas_station': return { backgroundColor: '#FEF9C3', color: '#A16207' };
      case 'tow_yard': return { backgroundColor: '#F3E8FF', color: '#7C3AED' };
      case 'body_shop': return { backgroundColor: '#FCE7F3', color: '#BE185D' };
      case 'tire_shop': return { backgroundColor: '#ECFDF5', color: '#059669' };
      case 'dealership': return { backgroundColor: '#F0F9FF', color: '#0284C7' };
      default: return { backgroundColor: '#F3F4F6', color: '#4B5563' };
    }
  };

  return (
    <AdminLayout>
      <div className="p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Directory Management</h1>
            <p className="text-gray-500">Manage partner shops, gas stations, and repair facilities</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchListings}
              className="p-3 rounded-xl border border-gray-200 transition-all cursor-pointer"
              style={{ color: '#6B7280' }}
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-white transition-all cursor-pointer"
              style={{ background: 'linear-gradient(to right, #008CE5, #0070B8)' }}
            >
              <Plus className="w-5 h-5" />
              Add Listing
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-6 px-4 py-3 rounded-xl flex items-center gap-3" style={{ backgroundColor: '#FEE2E2', color: '#B91C1C' }}>
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm font-medium">{error}</span>
            <button onClick={() => setError(null)} className="ml-auto cursor-pointer"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* Filter tabs + type filter + search */}
        <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            {/* Status tabs */}
            <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: '#F3F4F6' }}>
              {filterTabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveFilter(tab.key)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer"
                  style={
                    activeFilter === tab.key
                      ? { backgroundColor: '#FFFFFF', color: '#008CE5', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
                      : { color: '#6B7280' }
                  }
                >
                  {tab.label} ({counts[tab.key]})
                </button>
              ))}
            </div>

            {/* Type filter */}
            <div className="relative">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="appearance-none pl-10 pr-8 py-2 rounded-xl border border-gray-200 text-sm font-medium cursor-pointer"
                style={{ color: '#374151' }}
              >
                <option value="all">All Types</option>
                {BUSINESS_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>

            {/* Search */}
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, city, state, phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 text-sm outline-none"
                style={{ color: '#374151' }}
              />
            </div>
          </div>
        </div>

        {/* Listings grid */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#008CE5' }} />
          </div>
        ) : filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-12 text-center"
          >
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#EFF6FF' }}>
              <Building2 className="w-8 h-8" style={{ color: '#008CE5' }} />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              {searchQuery || activeFilter !== 'all' || typeFilter !== 'all'
                ? 'No listings match your filters'
                : 'No directory listings yet'}
            </h3>
            <p className="text-gray-500 mb-6">
              {searchQuery || activeFilter !== 'all' || typeFilter !== 'all'
                ? 'Try adjusting your search or filters.'
                : 'Add partner businesses, gas stations, and repair facilities to the directory.'}
            </p>
            {!searchQuery && activeFilter === 'all' && typeFilter === 'all' && (
              <button
                onClick={openCreate}
                className="px-6 py-3 rounded-xl font-semibold text-white cursor-pointer"
                style={{ background: 'linear-gradient(to right, #008CE5, #0070B8)' }}
              >
                Add First Listing
              </button>
            )}
          </motion.div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {paged.map((listing, i) => (
                <motion.div
                  key={listing.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="bg-white shadow-sm border border-gray-100 rounded-[20px] p-5 flex flex-col"
                >
                  {/* Top row */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0 pr-3">
                      <h3 className="text-lg font-bold text-gray-900 truncate">{listing.business_name}</h3>
                      <span
                        className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-semibold"
                        style={getTypeStyle(listing.business_type)}
                      >
                        {TYPE_LABELS[listing.business_type] || listing.business_type}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {listing.is_partner && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: '#DCFCE7', color: '#15803D' }}>
                          Partner
                        </span>
                      )}
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={listing.is_active ? { backgroundColor: '#DCFCE7', color: '#15803D' } : { backgroundColor: '#FEE2E2', color: '#B91C1C' }}
                      >
                        {listing.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="space-y-1.5 text-sm text-gray-500 flex-1">
                    {(listing.address || listing.city) && (
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span className="truncate">
                          {[listing.address, listing.city, listing.state, listing.zip].filter(Boolean).join(', ')}
                        </span>
                      </div>
                    )}
                    {listing.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 flex-shrink-0" />
                        <span>{listing.phone}</span>
                      </div>
                    )}
                    {listing.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">{listing.email}</span>
                      </div>
                    )}
                    {listing.website && (
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 flex-shrink-0" />
                        <a href={listing.website} target="_blank" rel="noreferrer" className="truncate" style={{ color: '#008CE5' }}>
                          {listing.website.replace(/^https?:\/\//, '')}
                        </a>
                      </div>
                    )}
                    {listing.description && (
                      <p className="text-gray-400 text-xs mt-1 line-clamp-2">{listing.description}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
                    <button
                      onClick={() => handleToggleActive(listing)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                      style={listing.is_active ? { backgroundColor: '#FEF9C3', color: '#A16207' } : { backgroundColor: '#DCFCE7', color: '#15803D' }}
                    >
                      {listing.is_active ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                      {listing.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => openEdit(listing)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                      style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8' }}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(listing.id)}
                      disabled={deleting === listing.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ml-auto"
                      style={{ backgroundColor: '#FEE2E2', color: '#B91C1C' }}
                    >
                      {deleting === listing.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      Delete
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>

            <Pagination
              currentPage={currentPage}
              totalItems={filtered.length}
              pageSize={PAGE_SIZE}
              onPageChange={setCurrentPage}
            />
          </>
        )}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[24px] shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">
                  {editingId ? 'Edit Listing' : 'Add New Listing'}
                </h2>
                <button onClick={() => setShowModal(false)} className="p-2 rounded-xl cursor-pointer" style={{ color: '#6B7280' }}>
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-5">
                {/* Business Name */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Business Name *</label>
                  <input
                    type="text"
                    value={form.business_name}
                    onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none"
                    placeholder="Enter business name"
                  />
                </div>

                {/* Type + Partner */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Business Type</label>
                    <select
                      value={form.business_type}
                      onChange={(e) => setForm({ ...form, business_type: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none cursor-pointer"
                    >
                      {BUSINESS_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col justify-end">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.is_partner}
                        onChange={(e) => setForm({ ...form, is_partner: e.target.checked })}
                        className="w-5 h-5 rounded cursor-pointer"
                        style={{ accentColor: '#008CE5' }}
                      />
                      <span className="text-sm font-semibold text-gray-700">Partner Business</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer mt-2">
                      <input
                        type="checkbox"
                        checked={form.is_active}
                        onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                        className="w-5 h-5 rounded cursor-pointer"
                        style={{ accentColor: '#008CE5' }}
                      />
                      <span className="text-sm font-semibold text-gray-700">Active</span>
                    </label>
                  </div>
                </div>

                {/* Address */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Address</label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none"
                    placeholder="Street address"
                  />
                </div>

                {/* City, State, Zip */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">City</label>
                    <input
                      type="text"
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">State</label>
                    <input
                      type="text"
                      value={form.state}
                      onChange={(e) => setForm({ ...form, state: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">ZIP</label>
                    <input
                      type="text"
                      value={form.zip}
                      onChange={(e) => setForm({ ...form, zip: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none"
                    />
                  </div>
                </div>

                {/* Contact */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Phone</label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none"
                      placeholder="(555) 123-4567"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none"
                      placeholder="contact@business.com"
                    />
                  </div>
                </div>

                {/* Website */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Website</label>
                  <input
                    type="url"
                    value={form.website}
                    onChange={(e) => setForm({ ...form, website: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none"
                    placeholder="https://www.example.com"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Description</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none resize-none"
                    placeholder="Brief description of the business..."
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold cursor-pointer"
                  style={{ color: '#6B7280' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !form.business_name.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
                  style={{ background: 'linear-gradient(to right, #008CE5, #0070B8)' }}
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {editingId ? 'Update' : 'Create'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AdminLayout>
  );
}
