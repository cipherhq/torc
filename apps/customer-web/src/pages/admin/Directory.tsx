import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Plus, MapPin, Edit, Trash } from 'lucide-react';

export function AdminDirectory() {
  const navigate = useNavigate();

  const listings = [
    { id: 1, name: 'AutoZone Downtown', type: 'Auto Parts', address: '123 Main St', verified: true },
    { id: 2, name: 'Shell Gas Station', type: 'Gas Station', address: '456 Oak Ave', verified: true },
    { id: 3, name: "Joe's Repair Shop", type: 'Mechanic', address: '789 Pine Rd', verified: false },
  ];

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <div className="bg-gradient-to-r from-[#1A1F2E] to-[#2F3548] p-8">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate('/admin')}
            className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center"
          >
            <ArrowLeft className="w-6 h-6 text-white" />
          </motion.button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-white">Directory Management</h1>
          </div>
          <button className="px-6 py-3 rounded-2xl bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-white font-semibold flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Add Listing
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-8">
        <div className="bg-white rounded-3xl shadow-lg p-6">
          <div className="space-y-4">
            {listings.map((listing) => (
              <div key={listing.id} className="p-5 rounded-2xl bg-gray-50 hover:bg-gray-100 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#2EFFAF]/20 to-[#007AFF]/20 flex items-center justify-center">
                      <MapPin className="w-6 h-6 text-[#2EFFAF]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-gray-900 font-semibold">{listing.name}</h3>
                        {listing.verified && (
                          <span className="px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
                            Verified
                          </span>
                        )}
                      </div>
                      <p className="text-gray-600 text-sm">{listing.type}</p>
                      <p className="text-gray-500 text-sm">{listing.address}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button className="p-2 hover:bg-gray-200 rounded-xl">
                      <Edit className="w-5 h-5 text-gray-600" />
                    </button>
                    <button className="p-2 hover:bg-red-100 rounded-xl">
                      <Trash className="w-5 h-5 text-red-500" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
