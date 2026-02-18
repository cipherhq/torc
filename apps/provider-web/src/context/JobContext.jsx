import { createContext, useContext, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

const JobContext = createContext({});

export function JobProvider({ children }) {
  const { user } = useAuth();
  const [currentJob, setCurrentJob] = useState(null);
  const [jobDetails, setJobDetails] = useState({
    serviceId: null,
    vehicleId: null,
    pickupLocation: null,
    pickupAddress: '',
    destinationLocation: null,
    destinationAddress: '',
    isHazardLocation: false,
    requesterType: 'self',
    requesterName: '',
    requesterPhone: '',
    scheduledFor: null,
    customerNotes: '',
  });

  function updateJobDetails(updates) {
    setJobDetails(prev => ({ ...prev, ...updates }));
  }

  function resetJobDetails() {
    setJobDetails({
      serviceId: null,
      vehicleId: null,
      pickupLocation: null,
      pickupAddress: '',
      destinationLocation: null,
      destinationAddress: '',
      isHazardLocation: false,
      requesterType: 'self',
      requesterName: '',
      requesterPhone: '',
      scheduledFor: null,
      customerNotes: '',
    });
    setCurrentJob(null);
  }

  async function createJob(paymentMethodId) {
    if (!user) throw new Error('User must be authenticated');

    const insertData = {
      customer_id: user.id,
      service_id: jobDetails.serviceId,
      vehicle_id: jobDetails.vehicleId || null,
      pickup_latitude: jobDetails.pickupLocation?.latitude || null,
      pickup_longitude: jobDetails.pickupLocation?.longitude || null,
      pickup_address: jobDetails.pickupAddress,
      destination_latitude: jobDetails.destinationLocation?.latitude || null,
      destination_longitude: jobDetails.destinationLocation?.longitude || null,
      destination_address: jobDetails.destinationAddress,
      requester_type: jobDetails.requesterType,
      requester_name: jobDetails.requesterName,
      requester_phone: jobDetails.requesterPhone,
      scheduled_for: jobDetails.scheduledFor || new Date().toISOString(),
      customer_notes: jobDetails.customerNotes,
      status: 'pending',
      payment_method_id: paymentMethodId || null,
      base_price: null,
    };

    // Get service base price
    if (jobDetails.serviceId) {
      const { data: svc } = await supabase.from('services').select('base_price').eq('id', jobDetails.serviceId).single();
      if (svc) {
        insertData.base_price = svc.base_price;
        insertData.service_fee = Math.round(svc.base_price * 0.1 * 100) / 100;
        insertData.tax = Math.round(svc.base_price * 0.05 * 100) / 100;
        insertData.total_amount = svc.base_price + insertData.service_fee + insertData.tax;
      }
    }

    const { data, error } = await supabase
      .from('jobs')
      .insert([insertData])
      .select()
      .single();

    if (error) throw error;
    setCurrentJob(data);
    return data;
  }

  async function fetchJob(jobId) {
    const { data, error } = await supabase
      .from('jobs')
      .select(`
        *,
        service:services(*)
      `)
      .eq('id', jobId)
      .single();

    if (error) throw error;

    // Fetch customer and provider profiles separately (gracefully handle missing)
    let customer = null;
    let provider = null;
    if (data.customer_id) {
      const { data: cust } = await supabase.from('profiles').select('*').eq('id', data.customer_id).maybeSingle();
      customer = cust;
    }
    if (data.provider_id) {
      const { data: prov } = await supabase.from('profiles').select('*').eq('id', data.provider_id).maybeSingle();
      const { data: pp } = await supabase.from('provider_profiles').select('*').eq('id', data.provider_id).maybeSingle();
      if (prov || pp) {
        provider = { ...(prov || {}), ...(pp || {}) };
      }
    }

    const enriched = { ...data, customer, provider };
    setCurrentJob(enriched);
    return enriched;
  }

  async function updateJobStatus(jobId, status) {
    const { data, error } = await supabase
      .from('jobs')
      .update({ status })
      .eq('id', jobId)
      .select()
      .single();

    if (error) throw error;

    // Refetch enriched job data with all relationships
    await fetchJob(jobId);

    return data;
  }

  async function cancelJob(jobId, reason) {
    if (!user) throw new Error('User must be authenticated');

    // ✅ USE ATOMIC RPC - Server-side authorization and push notifications
    const { data, error } = await supabase.rpc('cancel_job', {
      p_job_id: jobId,
      p_actor_id: user.id,
      p_actor_type: 'provider',
      p_reason: reason
    });

    if (error) throw error;

    if (!data || !data.success) {
      throw new Error(data?.message || 'Cancellation failed');
    }

    // Push worker will automatically notify customer via pg_notify
    console.log('Job cancelled successfully:', data);

    // Refetch enriched job data
    await fetchJob(jobId);

    // Broadcast cancellation for immediate UI update
    try {
      const channel = supabase.channel(`job-accepted-${jobId}`);
      await channel.subscribe();
      await channel.send({
        type: 'broadcast',
        event: 'job_cancelled',
        payload: { job_id: jobId, cancelled_by: 'provider', reason },
      });
      setTimeout(() => supabase.removeChannel(channel), 1500);
    } catch (e) {
      console.warn('Broadcast job cancellation failed:', e);
    }

    return data;
  }

  async function rateJob(jobId, rating, review) {
    const { data, error } = await supabase
      .from('jobs')
      .update({ 
        rating,
        review,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .select()
      .single();

    if (error) throw error;

    // Refetch enriched job data
    await fetchJob(jobId);

    return data;
  }

  // ✅ NEW: Subscribe to real-time job updates
  function subscribeToJobUpdates(jobId, callback) {
    if (!jobId) return () => {};

    const channel = supabase
      .channel(`job-updates-${jobId}`)
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'jobs', 
          filter: `id=eq.${jobId}` 
        },
        async () => {
          await fetchJob(jobId);
          callback?.();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }

  // ✅ NEW: Fetch provider stats dynamically
  async function fetchProviderStats(providerId) {
    if (!providerId) return null;

    const { data: completedJobs } = await supabase
      .from('jobs')
      .select('id, rating')
      .eq('provider_id', providerId)
      .eq('status', 'completed');

    const count = completedJobs?.length ?? 0;
    const withRating = (completedJobs || []).filter(j => j.rating != null);
    const avgRating = withRating.length > 0
      ? withRating.reduce((s, j) => s + Number(j.rating), 0) / withRating.length
      : null;

    return { completedCount: count, averageRating: avgRating };
  }

  const value = {
    currentJob,
    setCurrentJob,
    jobDetails,
    updateJobDetails,
    resetJobDetails,
    createJob,
    fetchJob,
    updateJobStatus,
    cancelJob,
    rateJob,
    subscribeToJobUpdates,
    fetchProviderStats,
  };

  return <JobContext.Provider value={value}>{children}</JobContext.Provider>;
}

export function useJob() {
  const context = useContext(JobContext);
  if (!context) {
    throw new Error('useJob must be used within JobProvider');
  }
  return context;
}
