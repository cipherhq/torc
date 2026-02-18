import { motion } from 'motion/react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Camera, Car, Plus } from 'lucide-react';
import { services } from '../../data/services';
import { mockVehicles } from '../../data/mockData';
import { updateRequestContext } from '../../data/requestContext';
import { useState } from 'react';
import * as Icons from 'lucide-react';

export function ServiceDetails() {
  const navigate = useNavigate();
  const { serviceId } = useParams();
  const service = services.find(s => s.id === serviceId);
  
  const [selectedVehicle, setSelectedVehicle] = useState(mockVehicles[0].id);
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [destination, setDestination] = useState('');

  if (!service) return null;

  const Icon = Icons[service.icon as keyof typeof Icons] as any;
  const needsDestination = service.id === 'towing';

  const handleContinue = () => {
    updateRequestContext({
      vehicleId: selectedVehicle,
      notes,
      photos,
      destinationAddress: destination,
    });
    navigate('/schedule');
  };

  return (
    <div className="min-h-screen bg-[#0A0F1E] flex flex-col relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-[#2EFFAF] opacity-10 blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <div className="relative z-10 p-6 flex items-center gap-4">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate('/service-selection')}
          className="glass rounded-full p-3"
        >
          <ArrowLeft className="w-6 h-6 text-white" />
        </motion.button>
        <h1 className="text-2xl font-bold text-white">{service.name}</h1>
      </div>

      <div className="relative z-10 flex-1 px-6 pb-32 overflow-y-auto">
        {/* Service info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-[32px] p-6 mb-6"
        >
          <div className="flex items-center gap-4 mb-4">
            <div 
              className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#2EFFAF]/20 to-[#007AFF]/20 flex items-center justify-center"
              style={{
                boxShadow: '0 4px 16px rgba(46, 255, 175, 0.3)',
              }}
            >
              {Icon && <Icon className="w-8 h-8 text-[#2EFFAF]" />}
            </div>
            <div className="flex-1">
              <p className="text-white/60 text-sm">{service.description}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
            <div>
              <p className="text-white/60 text-xs">Est. Time</p>
              <p className="text-white font-semibold mt-1">{service.estimatedTime}</p>
            </div>
            <div>
              <p className="text-white/60 text-xs">Base Price</p>
              <p className="text-[#2EFFAF] font-bold text-xl mt-1">${service.basePrice}</p>
            </div>
          </div>
        </motion.div>

        {/* Vehicle selection */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            <Car className="w-5 h-5 text-[#2EFFAF]" />
            <p className="text-white font-semibold">Select Vehicle</p>
          </div>
          <div className="space-y-3">
            {mockVehicles.map((vehicle) => (
              <motion.button
                key={vehicle.id}
                whileTap={{ scale: 0.98 }}
                onClick={() => setSelectedVehicle(vehicle.id)}
                className={`w-full rounded-[24px] p-4 flex items-center gap-4 transition-all ${
                  selectedVehicle === vehicle.id
                    ? 'bg-gradient-to-r from-[#2EFFAF]/20 to-[#007AFF]/20 border-2 border-[#2EFFAF]'
                    : 'glass'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  selectedVehicle === vehicle.id
                    ? 'border-[#2EFFAF]'
                    : 'border-white/40'
                }`}>
                  {selectedVehicle === vehicle.id && (
                    <div className="w-2 h-2 rounded-full bg-[#2EFFAF]" />
                  )}
                </div>
                <div className="flex-1 text-left">
                  <p className="text-white font-semibold">
                    {vehicle.year} {vehicle.make} {vehicle.model}
                  </p>
                  <p className="text-white/60 text-sm">{vehicle.color} • {vehicle.plate}</p>
                </div>
              </motion.button>
            ))}
            
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full glass rounded-[24px] p-4 flex items-center gap-4 border-2 border-dashed border-white/20"
            >
              <Plus className="w-6 h-6 text-white/40" />
              <p className="text-white/60 font-semibold">Add New Vehicle</p>
            </motion.button>
          </div>
        </div>

        {/* Destination (for towing) */}
        {needsDestination && (
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <Icons.MapPin className="w-5 h-5 text-[#2EFFAF]" />
              <p className="text-white font-semibold">Destination Address</p>
            </div>
            <input
              type="text"
              placeholder="Where should we tow your vehicle?"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className="w-full glass rounded-[24px] px-4 py-4 text-white placeholder-white/40 focus:outline-none focus:border-[#2EFFAF] border-2 border-transparent transition-colors"
            />
          </div>
        )}

        {/* Photos */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            <Camera className="w-5 h-5 text-[#2EFFAF]" />
            <p className="text-white font-semibold">Photos (Optional)</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {photos.map((photo, i) => (
              <div key={i} className="aspect-square glass rounded-2xl overflow-hidden">
                <img src={photo} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="aspect-square glass rounded-2xl flex flex-col items-center justify-center gap-2 border-2 border-dashed border-white/20"
            >
              <Camera className="w-6 h-6 text-white/40" />
              <span className="text-white/40 text-xs">Add Photo</span>
            </motion.button>
          </div>
        </div>

        {/* Additional notes */}
        <div className="mb-6">
          <p className="text-white font-semibold mb-3">Additional Notes</p>
          <textarea
            placeholder="Any details the provider should know..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="w-full glass rounded-[24px] px-4 py-4 text-white placeholder-white/40 focus:outline-none focus:border-[#2EFFAF] border-2 border-transparent transition-colors resize-none"
          />
        </div>
      </div>

      {/* Fixed bottom button */}
      <div className="fixed bottom-0 left-0 right-0 z-20 p-6 glass border-t border-white/10">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleContinue}
          className="w-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-[32px] py-5 font-bold text-[#0A0F1E] text-lg shadow-lg shadow-[#2EFFAF]/30"
        >
          Continue
        </motion.button>
      </div>
    </div>
  );
}
