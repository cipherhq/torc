import { motion } from 'motion/react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Camera, Car, Plus, MapPin, X, Check, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useGoogleMaps } from '../../context/GoogleMapsContext';
import { useTheme } from '../../context/ThemeContext';
import { getRequestContext, updateRequestContext } from '../../data/requestContext';
import { useState, useEffect, useRef, useCallback } from 'react';
import * as Icons from 'lucide-react';

export function ServiceDetails() {
  const navigate = useNavigate();
  const { serviceId } = useParams();
  const { user } = useAuth();
  const { isLoaded } = useGoogleMaps();
  const { isDark } = useTheme();
  const context = getRequestContext();
  const [service, setService] = useState<any>(null);
  const [serviceLoading, setServiceLoading] = useState(true);

  const [vehicles, setVehicles] = useState<any[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [destination, setDestination] = useState('');
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [vehicleForm, setVehicleForm] = useState({ make: '', model: '', year: '', color: '', plate: '' });
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const textColor = isDark ? '#FFFFFF' : '#1A1F2E';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB';
  const inputBg = isDark ? 'rgba(255,255,255,0.05)' : '#F9FAFB';
  const inputBorder = isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB';

  useEffect(() => {
    async function loadService() {
      if (!serviceId) {
        setServiceLoading(false);
        return;
      }
      try {
        setServiceLoading(true);
        const { data, error } = await supabase
          .from('services')
          .select('id, name, description, icon, base_price')
          .eq('id', serviceId)
          .maybeSingle();
        if (error) throw error;
        setService(data || null);
      } catch (error) {
        console.warn('Failed to load service details:', error);
        setService(null);
      } finally {
        setServiceLoading(false);
      }
    }
    void loadService();
  }, [serviceId]);

  useEffect(() => {
    if (isLoaded && !autocompleteService.current) {
      autocompleteService.current = new google.maps.places.AutocompleteService();
    }
  }, [isLoaded]);

  useEffect(() => {
    if (!user) return;
    fetchVehicles();
  }, [user]);

  const fetchVehicles = async () => {
    try {
      const { data, error } = await supabase.from('vehicles').select('*').eq('user_id', user.id);
      if (error) throw error;
      setVehicles(data || []);
      if (data && data.length > 0) setSelectedVehicle(data[0].id);
    } catch (error) {
      console.warn('Error fetching vehicles:', error);
      setVehicles([]);
    }
  };

  const handleAddVehicle = async () => {
    if (!vehicleForm.make || !vehicleForm.model) return;
    setSavingVehicle(true);
    try {
      const { error } = await supabase.from('vehicles').insert({
        user_id: user.id,
        make: vehicleForm.make,
        model: vehicleForm.model,
        year: vehicleForm.year ? parseInt(vehicleForm.year) : null,
        color: vehicleForm.color || null,
        plate: vehicleForm.plate || null,
        is_default: vehicles.length === 0,
      });
      if (!error) {
        setVehicleForm({ make: '', model: '', year: '', color: '', plate: '' });
        setShowAddVehicle(false);
        await fetchVehicles();
      }
    } catch (e) {
      console.error('Failed to add vehicle:', e);
    }
    setSavingVehicle(false);
  };

  const handleDestinationChange = useCallback((value: string) => {
    setDestination(value);
    if (!autocompleteService.current || value.length < 3) {
      setSuggestions([]);
      return;
    }
    autocompleteService.current.getPlacePredictions(
      { input: value, componentRestrictions: { country: 'us' } },
      (predictions, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
          setSuggestions(predictions);
        } else {
          setSuggestions([]);
        }
      }
    );
  }, []);

  const selectSuggestion = (suggestion: google.maps.places.AutocompletePrediction) => {
    setDestination(suggestion.description);
    setSuggestions([]);
  };

  if (serviceLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: isDark ? '#0F1419' : '#F5F7FA' }}>
        <Loader2 className="w-7 h-7 animate-spin" style={{ color: '#2EFFAF' }} />
      </div>
    );
  }
  if (!service) return null;

  const Icon = Icons[service.icon as keyof typeof Icons] as any;
  const needsDestination = (service.name || '').toLowerCase().includes('tow');

  const handleContinue = () => {
    const validationErrors: string[] = [];
    if (vehicles.length > 0 && !selectedVehicle) {
      validationErrors.push('Please select a vehicle');
    }
    if (vehicles.length === 0 && !showAddVehicle) {
      // Allow continuing without vehicle — no error
    }
    if (needsDestination && !destination.trim()) {
      validationErrors.push('Please enter a destination address');
    }
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors([]);
    updateRequestContext({
      serviceId: service.id,
      serviceName: service.name,
      serviceBasePrice: Number(service.base_price || context.serviceBasePrice || 0),
      serviceIcon: service.icon || null,
      vehicleId: selectedVehicle,
      notes,
      photos,
      destinationAddress: destination,
    });
    navigate('/schedule');
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden" style={{ background: isDark ? '#0F1419' : '#F5F7FA' }}>
      {/* Header */}
      <div className="relative z-10 p-6 flex items-center gap-4">
        <button onClick={() => navigate('/service-selection')} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }} title="Go back">
          <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
        </button>
        <h1 className="text-xl font-bold" style={{ color: textColor }}>{service.name}</h1>
      </div>

      <div className="relative z-10 flex-1 px-6 pb-32 overflow-y-auto">
        {/* Service info card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-5 mb-6" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(46,255,175,0.1)' }}>
              {Icon && <Icon className="w-7 h-7" style={{ color: '#2EFFAF' }} />}
            </div>
            <p className="flex-1 text-sm" style={{ color: subColor }}>{service.description}</p>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-4 border-t" style={{ borderColor: cardBorder }}>
            <div>
              <p className="text-xs" style={{ color: subColor }}>Est. Time</p>
              <p className="font-semibold mt-1" style={{ color: textColor }}>~ 30-60 min</p>
            </div>
            <div>
              <p className="text-xs" style={{ color: subColor }}>Base Price</p>
              <p className="font-bold text-xl mt-1" style={{ color: '#2EFFAF' }}>${Number(service.base_price || 0)}</p>
            </div>
          </div>
        </motion.div>

        {/* Vehicle selection */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Car className="w-5 h-5" style={{ color: '#2EFFAF' }} />
            <p className="font-semibold" style={{ color: textColor }}>Select Vehicle</p>
          </div>

          {vehicles.length === 0 && !showAddVehicle && (
            <div className="rounded-2xl p-5 mb-3 text-center" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
              <p className="text-sm mb-3" style={{ color: subColor }}>No vehicles added</p>
              <button onClick={handleContinue} className="text-sm font-medium" style={{ color: '#007AFF' }}>
                Continue without selecting
              </button>
            </div>
          )}

          {vehicles.length > 0 && (
            <div className="space-y-2 mb-3">
              {vehicles.map((vehicle: any) => (
                <button key={vehicle.id} onClick={() => setSelectedVehicle(vehicle.id)}
                  className="w-full rounded-2xl p-4 flex items-center gap-3 transition-all"
                  style={{
                    backgroundColor: selectedVehicle === vehicle.id ? (isDark ? 'rgba(46,255,175,0.08)' : 'rgba(46,255,175,0.05)') : cardBg,
                    border: `2px solid ${selectedVehicle === vehicle.id ? '#2EFFAF' : cardBorder}`,
                  }}
                >
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center`} style={{ borderColor: selectedVehicle === vehicle.id ? '#2EFFAF' : subColor }}>
                    {selectedVehicle === vehicle.id && <div className="w-2 h-2 rounded-full bg-[#2EFFAF]" />}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-semibold text-sm" style={{ color: textColor }}>
                      {vehicle.year ? `${vehicle.year} ` : ''}{vehicle.make} {vehicle.model}
                    </p>
                    <p className="text-xs" style={{ color: subColor }}>{[vehicle.color, vehicle.plate].filter(Boolean).join(' • ')}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Add Vehicle Inline Form */}
          {showAddVehicle ? (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              className="rounded-2xl p-4 mb-3" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
            >
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold text-sm" style={{ color: textColor }}>Add New Vehicle</p>
                <button onClick={() => setShowAddVehicle(false)} className="p-1" title="Close"><X className="w-4 h-4" style={{ color: subColor }} /></button>
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" value={vehicleForm.make} onChange={e => setVehicleForm({ ...vehicleForm, make: e.target.value })} placeholder="Make *" className="rounded-xl px-3 py-2.5 text-sm bg-transparent outline-none" style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textColor }} />
                  <input type="text" value={vehicleForm.model} onChange={e => setVehicleForm({ ...vehicleForm, model: e.target.value })} placeholder="Model *" className="rounded-xl px-3 py-2.5 text-sm bg-transparent outline-none" style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textColor }} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input type="text" value={vehicleForm.year} onChange={e => setVehicleForm({ ...vehicleForm, year: e.target.value })} placeholder="Year" className="rounded-xl px-3 py-2.5 text-sm bg-transparent outline-none" style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textColor }} />
                  <input type="text" value={vehicleForm.color} onChange={e => setVehicleForm({ ...vehicleForm, color: e.target.value })} placeholder="Color" className="rounded-xl px-3 py-2.5 text-sm bg-transparent outline-none" style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textColor }} />
                  <input type="text" value={vehicleForm.plate} onChange={e => setVehicleForm({ ...vehicleForm, plate: e.target.value })} placeholder="Plate" className="rounded-xl px-3 py-2.5 text-sm bg-transparent outline-none" style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textColor }} />
                </div>
                <button onClick={handleAddVehicle} disabled={!vehicleForm.make || !vehicleForm.model || savingVehicle}
                  className="w-full rounded-xl py-2.5 font-bold text-sm text-[#0F1419] bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {savingVehicle ? 'Adding...' : <><Check className="w-4 h-4" />Save Vehicle</>}
                </button>
              </div>
            </motion.div>
          ) : (
            <button onClick={() => setShowAddVehicle(true)}
              className="w-full rounded-2xl p-4 flex items-center gap-3 border-2 border-dashed transition-all"
              style={{ borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#D1D5DB', backgroundColor: 'transparent' }}
            >
              <Plus className="w-5 h-5" style={{ color: '#2EFFAF' }} />
              <p className="font-semibold text-sm" style={{ color: '#2EFFAF' }}>Add New Vehicle</p>
            </button>
          )}
        </div>

        {/* Destination (for towing) - with Google Places Autocomplete */}
        {needsDestination && (
          <div className="mb-6 relative">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-5 h-5" style={{ color: '#2EFFAF' }} />
              <p className="font-semibold" style={{ color: textColor }}>Destination Address</p>
            </div>
            <input
              type="text"
              placeholder="Where should we tow your vehicle?"
              value={destination}
              onChange={(e) => handleDestinationChange(e.target.value)}
              className="w-full rounded-2xl px-4 py-4 text-sm outline-none transition-all focus:ring-2 focus:ring-[#2EFFAF]/50"
              style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
            />
            {/* Autocomplete suggestions */}
            {suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl overflow-hidden shadow-lg" style={{ backgroundColor: isDark ? '#1A1F2E' : '#FFFFFF', border: `1px solid ${cardBorder}` }}>
                {suggestions.map(s => (
                  <button key={s.place_id} onClick={() => selectSuggestion(s)}
                    className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-[#2EFFAF]/10 transition-colors"
                    style={{ borderBottom: `1px solid ${cardBorder}` }}
                  >
                    <MapPin className="w-4 h-4 flex-shrink-0" style={{ color: '#2EFFAF' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: textColor }}>{s.structured_formatting.main_text}</p>
                      <p className="text-xs truncate" style={{ color: subColor }}>{s.structured_formatting.secondary_text}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Photos */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Camera className="w-5 h-5" style={{ color: '#2EFFAF' }} />
            <p className="font-semibold" style={{ color: textColor }}>Photos (Optional)</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {photos.map((photo, i) => (
              <div key={i} className="aspect-square rounded-xl overflow-hidden" style={{ border: `1px solid ${cardBorder}` }}>
                <img src={photo} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
            <label className="aspect-square rounded-xl flex flex-col items-center justify-center gap-1 border-2 border-dashed cursor-pointer" style={{ borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#D1D5DB' }}>
              <Camera className="w-5 h-5" style={{ color: subColor }} />
              <span className="text-[10px]" style={{ color: subColor }}>Add Photo</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onloadend = () => setPhotos(prev => [...prev, reader.result as string]);
                reader.readAsDataURL(file);
              }} />
            </label>
          </div>
        </div>

        {/* Notes */}
        <div className="mb-6">
          <p className="font-semibold mb-3" style={{ color: textColor }}>Additional Notes</p>
          <textarea
            placeholder="Any details the provider should know..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-2xl px-4 py-3 text-sm outline-none resize-none focus:ring-2 focus:ring-[#2EFFAF]/50"
            style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
          />
        </div>
      </div>

      {/* Fixed bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-20 p-6" style={{ backgroundColor: isDark ? '#0F1419' : '#FFFFFF', borderTop: `1px solid ${cardBorder}` }}>
        {errors.length > 0 && (
          <div className="mb-3 rounded-xl p-3 bg-red-500/10 border border-red-500/30">
            {errors.map((err, i) => (
              <p key={i} className="text-red-500 text-sm font-medium">{err}</p>
            ))}
          </div>
        )}
        <motion.button whileTap={{ scale: 0.98 }} onClick={handleContinue}
          className="w-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-2xl py-4 font-bold text-[#0F1419] text-lg shadow-lg shadow-[#2EFFAF]/30"
        >
          Continue
        </motion.button>
      </div>
    </div>
  );
}
