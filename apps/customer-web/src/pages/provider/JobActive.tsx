import { useNavigate, useParams } from 'react-router';
import { Navigation, Phone, MessageCircle, Share2, Camera, CheckCircle, Clock, MapPin, ArrowLeft, XCircle, AlertTriangle, X, ImagePlus, Trash2 } from 'lucide-react';
import { ProviderBottomNav } from '../../components/ProviderBottomNav';
import { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleMap, MarkerF, DirectionsRenderer } from '@react-google-maps/api';
import { useGoogleMaps } from '../../context/GoogleMapsContext';
import { useLocation as useLocationCtx } from '../../context/LocationContext';
import { useRealtimeLocation, useWatchPosition } from '../../hooks/useRealtimeLocation';
import { ChatModal } from '../../components/ChatModal';
import { callPhone, shareJobDetails } from '../../utils/communication';
import { useJob } from '../../context/JobContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { showToast } from '../../components/NotificationToast';
import { initAudio, playMessageSound } from '../../utils/audio';

const mapContainerStyle = { width: '100%', height: '100%' };

type ProviderJobStatus = 'enroute' | 'arrived' | 'working' | 'photos' | 'completed';

function normalizeToProviderStatus(dbStatus?: string): ProviderJobStatus {
  switch (dbStatus) {
    case 'enroute':
    case 'en_route':
      return 'enroute';
    case 'arrived':
      return 'arrived';
    case 'inprogress':
    case 'in_progress':
    case 'working':
      return 'working';
    case 'completed':
      return 'completed';
    default:
      return 'enroute';
  }
}

export function JobActive() {
  const navigate = useNavigate();
  const { jobId } = useParams();
  const { user } = useAuth();
  const { isLoaded } = useGoogleMaps();
  const { currentLocation } = useLocationCtx();
  const { currentJob, fetchJob, updateJobStatus } = useJob();
  const myPosition = useWatchPosition(true);

  const [status, setStatus] = useState<ProviderJobStatus>('enroute');
  const [photos, setPhotos] = useState<string[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [shareToast, setShareToast] = useState(false);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [updating, setUpdating] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Fetch job data and sync status from DB
  useEffect(() => {
    if (jobId) {
      fetchJob(jobId)
        .then((job: any) => {
          if (job?.status) {
            if (job.status === 'cancelled') {
              showToast('error', 'Job Cancelled', 'The customer has cancelled this request.');
              navigate('/provider/home', { replace: true });
              return;
            }
            setStatus(normalizeToProviderStatus(job.status));
          }
        })
        .catch(console.warn);
    }
  }, [jobId]);

  // Listen for customer cancellation broadcast
  useEffect(() => {
    if (!jobId) return;
    const channel = supabase
      .channel(`job-cancel-listen-${jobId}`)
      .on('broadcast', { event: 'job_cancelled' }, (payload) => {
        if (payload.payload?.job_id === jobId && payload.payload?.cancelled_by === 'customer') {
          showToast('error', 'Customer Cancelled', 'The customer has cancelled this request.');
          navigate('/provider/home', { replace: true });
        }
      })
      .subscribe();

    // Also listen via postgres_changes for status becoming cancelled
    const dbChannel = supabase
      .channel(`job-cancel-db-${jobId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'jobs',
        filter: `id=eq.${jobId}`,
      }, (payload) => {
        if (payload.new?.status === 'cancelled') {
          showToast('error', 'Job Cancelled', 'This request has been cancelled.');
          navigate('/provider/home', { replace: true });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(dbChannel);
    };
  }, [jobId, navigate]);

  // Broadcast provider location to customer in real-time
  const { broadcastLocation } = useRealtimeLocation({
    jobId,
    role: 'provider',
    enabled: true,
  });

  // Continuously broadcast our location
  useEffect(() => {
    const pos = myPosition || (currentLocation
      ? { lat: currentLocation.latitude, lng: currentLocation.longitude }
      : null);
    if (pos) broadcastLocation(pos);
  }, [myPosition, currentLocation, broadcastLocation]);

  const providerPos = myPosition || (currentLocation
    ? { lat: currentLocation.latitude, lng: currentLocation.longitude }
    : null);

  const pickupLat = currentJob?.pickup_latitude;
  const pickupLng = currentJob?.pickup_longitude;
  const customerPos = (pickupLat && pickupLng) ? { lat: pickupLat, lng: pickupLng } : null;

  // Calculate directions from provider to customer
  const directionsRequested = useRef(false);
  useEffect(() => {
    if (!isLoaded || !providerPos || !customerPos || directionsRequested.current) return;
    if (status !== 'enroute') return;

    directionsRequested.current = true;
    const service = new google.maps.DirectionsService();
    service.route({
      origin: providerPos,
      destination: customerPos,
      travelMode: google.maps.TravelMode.DRIVING,
    }, (result, dirStatus) => {
      directionsRequested.current = false;
      if (dirStatus === google.maps.DirectionsStatus.OK && result) {
        setDirections(result);
      }
    });
  }, [isLoaded, providerPos?.lat, providerPos?.lng, customerPos?.lat, customerPos?.lng, status]);

  // Re-request directions periodically while enroute
  useEffect(() => {
    if (status !== 'enroute') return;
    const interval = setInterval(() => { directionsRequested.current = false; }, 20000);
    return () => clearInterval(interval);
  }, [status]);

  // Listen for incoming chat messages — show toast when chat is closed
  const isChatOpenRef = useRef(isChatOpen);
  useEffect(() => { isChatOpenRef.current = isChatOpen; }, [isChatOpen]);

  useEffect(() => {
    if (!jobId) return;
    const channel = supabase.channel(`chat-notify-provider-${jobId}`, {
      config: { broadcast: { self: false } },
    });
    channel
      .on('broadcast', { event: 'new_message' }, (payload) => {
        const msg = payload.payload;
        if (!msg || msg.sender_role === 'provider') return;
        if (!isChatOpenRef.current) {
          initAudio();
          playMessageSound();
          const senderName = msg.sender_name || 'Customer';
          showToast('message', senderName, msg.text?.slice(0, 80) || 'Sent you a message', 5000, () => {
            setIsChatOpen(true);
          });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [jobId]);

  // Fit map bounds when we have both positions
  useEffect(() => {
    if (!map || !providerPos || !customerPos) return;
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(providerPos);
    bounds.extend(customerPos);
    map.fitBounds(bounds, { top: 80, bottom: 320, left: 40, right: 40 });
  }, [map, providerPos?.lat, customerPos?.lat]);

  const onMapLoad = useCallback((m: google.maps.Map) => setMap(m), []);

  // Use customer profile name, fallback to requester_name from job, then 'Customer'
  const customerProfileName = currentJob?.customer
    ? `${currentJob.customer.first_name || ''} ${currentJob.customer.last_name || ''}`.trim()
    : '';
  const customerName = customerProfileName
    || currentJob?.requester_name?.trim()
    || 'Customer';
  const customerInitials = customerName !== 'Customer'
    ? `${(customerName.split(' ')[0] || 'C')[0]}${(customerName.split(' ')[1] || '')[0] || ''}`.toUpperCase()
    : 'C';

  const job = {
    id: jobId,
    customer: customerName,
    customerPhone: currentJob?.customer?.phone || currentJob?.requester_phone || '',
    customerInitials,
    service: currentJob?.service?.name || 'Service',
    location: currentJob?.pickup_address || 'Fetching location...',
    payout: currentJob?.total_amount ? `$${Number(currentJob.total_amount).toFixed(2)}` : (currentJob?.base_price ? `$${Number(currentJob.base_price).toFixed(2)}` : '-'),
    notes: currentJob?.customer_notes || '',
  };

  const etaStr = directions?.routes?.[0]?.legs?.[0]?.duration?.text || '';

  const handleCall = () => callPhone(job.customerPhone);
  const handleMessage = () => setIsChatOpen(true);
  const handleShare = async () => {
    const shared = await shareJobDetails({
      jobId: jobId || '',
      service: job.service,
      status,
    });
    if (shared) {
      setShareToast(true);
      setTimeout(() => setShareToast(false), 2500);
    }
  };

  // Status progression with DB sync and broadcast to customer
  const advanceStatus = async (newStatus: ProviderJobStatus, dbStatus: string) => {
    if (updating) return;
    setUpdating(true);
    setStatus(newStatus);

    try {
      if (jobId) {
        await updateJobStatus(jobId, dbStatus);

        // Broadcast status update to customer for immediate UI response
        const channel = supabase.channel(`job-accepted-${jobId}`);
        await channel.subscribe();
        await channel.send({
          type: 'broadcast',
          event: 'status_update',
          payload: { job_id: jobId, status: dbStatus, provider_id: user?.id },
        });
        setTimeout(() => supabase.removeChannel(channel), 1500);
      }
    } catch (e) {
      console.warn('Failed to update status:', e);
    } finally {
      setUpdating(false);
    }
  };

  const handleArrived = () => advanceStatus('arrived', 'arrived');
  const handleStartService = () => advanceStatus('working', 'inprogress');
  const handleTakePhotos = () => setStatus('photos');

  const handleCompleteJob = async () => {
    if (updating) return;
    setUpdating(true);
    try {
      if (jobId) {
        await updateJobStatus(jobId, 'completed');

        const channel = supabase.channel(`job-accepted-${jobId}`);
        await channel.subscribe();
        await channel.send({
          type: 'broadcast',
          event: 'status_update',
          payload: { job_id: jobId, status: 'completed', provider_id: user?.id },
        });
        setTimeout(() => supabase.removeChannel(channel), 1500);
      }
      navigate(`/provider/complete/${jobId}`);
    } catch (e) {
      console.warn('Failed to complete job:', e);
      setUpdating(false);
    }
  };

  const handleCancelJob = async () => {
    if (!jobId || cancelling) return;
    setCancelling(true);

    try {
      // Update job status to cancelled
      await supabase
        .from('jobs')
        .update({
          status: 'cancelled',
          cancellation_reason: 'Cancelled by provider',
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', jobId);

      // Broadcast cancellation to customer
      const channel = supabase.channel(`job-accepted-${jobId}`);
      await channel.subscribe();
      await channel.send({
        type: 'broadcast',
        event: 'job_cancelled',
        payload: { job_id: jobId, cancelled_by: 'provider', reason: 'Provider cancelled the request' },
      });
      await channel.send({
        type: 'broadcast',
        event: 'status_update',
        payload: { job_id: jobId, status: 'cancelled', provider_id: user?.id },
      });
      setTimeout(() => supabase.removeChannel(channel), 1500);

      showToast('info', 'Job Cancelled', 'The request has been closed.');
      navigate('/provider/home', { replace: true, state: { cancelledJobId: jobId } });
    } catch (e) {
      console.warn('Failed to cancel job:', e);
      showToast('error', 'Cancel Failed', 'Could not cancel the job. Please try again.');
      setCancelling(false);
    }
  };

  const statusLabel = status === 'enroute' ? 'En Route'
    : status === 'arrived' ? 'Arrived'
    : status === 'working' ? 'In Progress'
    : status === 'photos' ? 'Completing'
    : 'Completed';

  const statusColor = status === 'enroute' ? '#F59E0B'
    : status === 'arrived' ? '#008CE5'
    : '#0070B8';

  const mapCenter = customerPos || providerPos || { lat: 33.749, lng: -84.388 };

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ backgroundColor: '#FFFFFF' }}>
      {/* Full-screen Google Map */}
      <div className="absolute inset-0 z-0">
        {isLoaded ? (
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={mapCenter}
            zoom={14}
            onLoad={onMapLoad}
            options={{ disableDefaultUI: true, gestureHandling: 'greedy' }}
          >
            {/* Provider marker (you) */}
            {providerPos && (
              <MarkerF
                position={providerPos}
                icon={{
                  path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                  scale: 7,
                  fillColor: '#008CE5',
                  fillOpacity: 1,
                  strokeColor: '#0070B8',
                  strokeWeight: 2,
                }}
                title="You"
              />
            )}

            {/* Customer pickup marker */}
            {customerPos && (
              <MarkerF
                position={customerPos}
                icon={{
                  path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',
                  fillColor: '#EF4444',
                  fillOpacity: 1,
                  strokeColor: '#FFFFFF',
                  strokeWeight: 2,
                  scale: 1.8,
                  anchor: new google.maps.Point(12, 22),
                }}
                title="Customer"
              />
            )}

            {/* Route directions */}
            {directions && status === 'enroute' && (
              <DirectionsRenderer
                directions={directions}
                options={{
                  suppressMarkers: true,
                  polylineOptions: { strokeColor: '#008CE5', strokeWeight: 5, strokeOpacity: 0.8 },
                }}
              />
            )}
          </GoogleMap>
        ) : (
          <div className="h-full flex items-center justify-center" style={{ backgroundColor: '#F9FAFB' }}>
            <div className="w-10 h-10 border-4 border-[#008CE5] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {/* Bottom gradient for card readability */}
        <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-white via-white/80 to-transparent" />
      </div>

      {/* Back button */}
      <div className="absolute z-20" style={{ top: 'calc(env(safe-area-inset-top, 16px) + 16px)', left: '16px' }}>
        <button
          onClick={() => navigate('/provider/home')}
          className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg"
          style={{ backgroundColor: 'rgba(255,255,255,0.95)', touchAction: 'manipulation' }}
        >
          <ArrowLeft className="w-5 h-5" style={{ color: '#1A1F2E' }} />
        </button>
      </div>

      {/* Top status + ETA badge */}
      <div className="relative z-10 p-4" style={{ paddingTop: 'calc(env(safe-area-inset-top, 16px) + 16px)' }}>
        <div className="rounded-2xl px-5 py-4 text-center shadow-lg"
          style={{ backgroundColor: 'rgba(255,255,255,0.95)', border: '1px solid #E5E7EB', backdropFilter: 'blur(12px)' }}>
          <div className="flex items-center justify-center gap-2 mb-1">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: statusColor }} />
            <p className="text-sm font-semibold" style={{ color: statusColor }}>{statusLabel}</p>
          </div>
          <p className="font-bold text-lg" style={{ color: '#1A1F2E' }}>{job.service}</p>
          {etaStr && status === 'enroute' && (
            <p className="text-sm mt-1" style={{ color: '#008CE5' }}>ETA: {etaStr}</p>
          )}
        </div>
      </div>

      {/* Bottom content area */}
      <div className="fixed bottom-0 left-0 right-0 z-20">
        <div className="rounded-t-3xl p-5 shadow-2xl"
          style={{ backgroundColor: 'rgba(255,255,255,0.97)', borderTop: '1px solid #E5E7EB', backdropFilter: 'blur(12px)' }}>

          {/* Customer info */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #008CE5, #0070B8)' }}>
              <span className="font-bold" style={{ color: '#FFFFFF' }}>{job.customerInitials}</span>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold" style={{ color: '#1A1F2E' }}>{job.customer}</h3>
              <p className="text-sm" style={{ color: '#6B7280' }}>{job.location}</p>
            </div>
            <p className="font-bold text-lg" style={{ color: '#22C55E' }}>{job.payout}</p>
          </div>

          {/* Communication buttons */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <button
              onClick={handleCall}
              className="rounded-xl py-3 flex flex-col items-center gap-1"
              style={{ backgroundColor: '#F3F4F6', touchAction: 'manipulation' }}
            >
              <Phone className="w-5 h-5" style={{ color: '#008CE5' }} />
              <span className="text-xs font-semibold" style={{ color: '#1A1F2E' }}>Call</span>
            </button>
            <button
              onClick={handleMessage}
              className="rounded-xl py-3 flex flex-col items-center gap-1"
              style={{ backgroundColor: '#F3F4F6', touchAction: 'manipulation' }}
            >
              <MessageCircle className="w-5 h-5" style={{ color: '#0070B8' }} />
              <span className="text-xs font-semibold" style={{ color: '#1A1F2E' }}>Message</span>
            </button>
            <button
              onClick={handleShare}
              className="rounded-xl py-3 flex flex-col items-center gap-1"
              style={{ backgroundColor: '#F3F4F6', touchAction: 'manipulation' }}
            >
              <Share2 className="w-5 h-5" style={{ color: '#6B7280' }} />
              <span className="text-xs font-semibold" style={{ color: '#1A1F2E' }}>Share</span>
            </button>
          </div>

          {job.notes && (
            <div className="rounded-xl p-3 mb-4" style={{ backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB' }}>
              <p className="text-xs" style={{ color: '#9CA3AF' }}>Customer Notes</p>
              <p className="text-sm mt-0.5" style={{ color: '#374151' }}>{job.notes}</p>
            </div>
          )}

          {/* Photo upload section */}
          {(status === 'working' || status === 'photos') && (
            <div className="mb-4">
              {/* Photo thumbnails */}
              {photos.length > 0 && (
                <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
                  {photos.map((photo, idx) => (
                    <div key={idx} className="relative flex-shrink-0">
                      <img
                        src={photo}
                        alt={`Photo ${idx + 1}`}
                        className="w-20 h-20 rounded-xl object-cover"
                        style={{ border: '2px solid #E5E7EB' }}
                      />
                      <button
                        onClick={() => setPhotos(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: '#EF4444', touchAction: 'manipulation' }}
                      >
                        <X className="w-3 h-3" style={{ color: '#FFFFFF' }} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Camera + Gallery buttons */}
              <div className="grid grid-cols-2 gap-3">
                <label
                  className="flex flex-col items-center gap-2 rounded-2xl py-5 cursor-pointer active:scale-[0.97] transition-transform"
                  style={{ backgroundColor: '#F0FDFA', border: '2px dashed #008CE5', touchAction: 'manipulation' }}
                >
                  <Camera className="w-6 h-6" style={{ color: '#008CE5' }} />
                  <span className="text-xs font-semibold" style={{ color: '#0070B8' }}>Take Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          if (ev.target?.result) {
                            setPhotos(prev => [...prev, ev.target!.result as string]);
                          }
                        };
                        reader.readAsDataURL(file);
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
                <label
                  className="flex flex-col items-center gap-2 rounded-2xl py-5 cursor-pointer active:scale-[0.97] transition-transform"
                  style={{ backgroundColor: '#F9FAFB', border: '2px dashed #D1D5DB', touchAction: 'manipulation' }}
                >
                  <ImagePlus className="w-6 h-6" style={{ color: '#6B7280' }} />
                  <span className="text-xs font-semibold" style={{ color: '#6B7280' }}>From Gallery</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          if (ev.target?.result) {
                            setPhotos(prev => [...prev, ev.target!.result as string]);
                          }
                        };
                        reader.readAsDataURL(file);
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>

              {photos.length > 0 && (
                <p className="text-xs text-center mt-2" style={{ color: '#9CA3AF' }}>
                  {photos.length} photo{photos.length !== 1 ? 's' : ''} added
                </p>
              )}
            </div>
          )}

          {/* Status action buttons */}
          <div style={{ paddingBottom: 'env(safe-area-inset-bottom, 8px)' }}>
            {status === 'enroute' && (
              <button
                onClick={handleArrived}
                disabled={updating}
                className="w-full rounded-2xl py-4 font-bold text-lg"
                style={{
                  background: 'linear-gradient(to right, #008CE5, #0070B8)',
                  color: '#FFFFFF',
                  boxShadow: '0 8px 24px rgba(78,205,196,0.4)',
                  touchAction: 'manipulation',
                  opacity: updating ? 0.6 : 1,
                }}
              >
                {updating ? 'Updating...' : "I've Arrived"}
              </button>
            )}

            {status === 'arrived' && (
              <button
                onClick={handleStartService}
                disabled={updating}
                className="w-full rounded-2xl py-4 font-bold text-lg"
                style={{
                  background: 'linear-gradient(to right, #008CE5, #0070B8)',
                  color: '#FFFFFF',
                  boxShadow: '0 8px 24px rgba(78,205,196,0.4)',
                  touchAction: 'manipulation',
                  opacity: updating ? 0.6 : 1,
                }}
              >
                {updating ? 'Updating...' : 'Start Service'}
              </button>
            )}

            {(status === 'working' || status === 'photos') && (
              <>
                <button
                  onClick={handleCompleteJob}
                  disabled={updating}
                  className="w-full rounded-2xl py-4 font-bold text-lg"
                  style={{
                    background: 'linear-gradient(to right, #22C55E, #16A34A)',
                    color: '#FFFFFF',
                    boxShadow: '0 8px 24px rgba(34,197,94,0.4)',
                    touchAction: 'manipulation',
                    opacity: updating ? 0.6 : 1,
                  }}
                >
                  {updating ? 'Completing...' : 'Complete Job'}
                </button>
                {photos.length === 0 && (
                  <button
                    onClick={handleTakePhotos}
                    className="w-full mt-2 rounded-xl py-3 font-semibold text-sm"
                    style={{
                      backgroundColor: '#F3F4F6',
                      color: '#374151',
                      touchAction: 'manipulation',
                    }}
                  >
                    Take Photos (Optional)
                  </button>
                )}
              </>
            )}

            {/* Cancel / Close request button */}
            {status !== 'completed' && (
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="w-full mt-3 rounded-xl py-3 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                style={{ backgroundColor: '#FFFFFF', border: '1.5px solid #E5E7EB', color: '#6B7280', touchAction: 'manipulation' }}
              >
                <XCircle className="w-4 h-4" style={{ color: '#EF4444' }} />
                <span className="text-sm font-semibold" style={{ color: '#6B7280' }}>Cancel Request</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Share toast */}
      {shareToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 rounded-full px-6 py-3 shadow-lg"
          style={{ backgroundColor: 'rgba(255,255,255,0.95)', border: '1px solid #E5E7EB' }}>
          <p className="text-sm font-semibold" style={{ color: '#008CE5' }}>Job details shared!</p>
        </div>
      )}

      {/* Chat modal */}
      <ChatModal
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        jobId={jobId || ''}
        peerName={job.customer}
        peerInitials={job.customerInitials}
        role="provider"
        jobStatus={status}
      />

      <ProviderBottomNav />

      {/* Cancel confirmation modal */}
      {showCancelConfirm && (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowCancelConfirm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="mx-6 rounded-3xl p-6 w-full max-w-sm"
            style={{ backgroundColor: '#FFFFFF' }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" style={{ color: '#EF4444' }} />
                <h2 className="font-bold text-lg" style={{ color: '#1A1F2E' }}>Cancel Request?</h2>
              </div>
              <button
                onClick={() => setShowCancelConfirm(false)}
                style={{ touchAction: 'manipulation', background: 'none', border: 'none', padding: 4 }}
              >
                <X className="w-5 h-5" style={{ color: '#6B7280' }} />
              </button>
            </div>

            <p className="text-sm mb-2" style={{ color: '#6B7280' }}>
              Are you sure you want to cancel this active request? The customer will be notified.
            </p>
            <p className="text-xs mb-5" style={{ color: '#9CA3AF' }}>
              Frequent cancellations may affect your acceptance rate.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="rounded-2xl py-3.5 font-semibold text-sm"
                style={{ backgroundColor: '#F3F4F6', color: '#374151', touchAction: 'manipulation' }}
              >
                Keep Job
              </button>
              <button
                onClick={handleCancelJob}
                disabled={cancelling}
                className="rounded-2xl py-3.5 font-semibold text-sm"
                style={{
                  backgroundColor: '#EF4444',
                  color: '#FFFFFF',
                  touchAction: 'manipulation',
                  opacity: cancelling ? 0.6 : 1,
                }}
              >
                {cancelling ? 'Cancelling...' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
