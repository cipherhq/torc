import React, { createContext, useContext, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

interface JobContextType {
  currentJob: any;
  setCurrentJob: (job: any) => void;
  jobDetails: any;
  updateJobDetails: (updates: any) => void;
  resetJobDetails: () => void;
  createJob: (paymentMethodId?: string | null) => Promise<any>;
  fetchJob: (jobId: string) => Promise<any>;
  updateJobStatus: (jobId: string, status: string) => Promise<any>;
  cancelJob: (jobId: string, reason?: string) => Promise<any>;
  acceptJob: (jobId: string, providerId: string) => Promise<any>;
  rateJob: (jobId: string, rating: number, review?: string) => Promise<any>;
  subscribeToJobUpdates: (jobId: string, callback?: () => void) => () => void;
  fetchProviderStats: (providerId: string) => Promise<any>;
}

const JobContext = createContext<JobContextType | undefined>(undefined);

export function JobProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [currentJob, setCurrentJob] = useState<any>(null);
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

  function updateJobDetails(updates: any) {
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

  async function createJob(paymentMethodId: string | null = null) {
    if (!user) throw new Error('User must be authenticated');

    const insertData: any = {
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

  async function fetchJob(jobId: string) {
    const { data, error } = await supabase
      .from('jobs')
      .select(`
        *,
        service:services(*)
      `)
      .eq('id', jobId)
      .single();

    if (error) throw error;

    // Fetch customer and provider profiles separately
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

  async function updateJobStatus(jobId: string, status: string) {
    const { data, error } = await supabase
      .from('jobs')
      .update({ status })
      .eq('id', jobId)
      .select()
      .single();

    if (error) throw error;

    // Refetch enriched job data
    await fetchJob(jobId);

    return data;
  }

  // ✅ ATOMIC RPC - Provider accepts job (race-safe)
  async function acceptJob(jobId: string, providerId: string) {
    const { data, error } = await supabase.rpc('accept_job', {
      p_job_id: jobId,
      p_provider_id: providerId
    });

    if (error) throw error;

    if (!data || !data.success) {
      throw new Error(data?.message || 'Job already accepted by another provider');
    }

    // Push worker will automatically notify customer
    console.log('Job accepted successfully:', data);

    // Refetch enriched job data
    await fetchJob(jobId);

    return data;
  }

  // ✅ ATOMIC RPC - Cancel job with authorization
  async function cancelJob(jobId: string, reason: string = '') {
    if (!user) throw new Error('User must be authenticated');

    // Determine actor type from user profile/role
    const actorType = (user as any).user_metadata?.role === 'provider' ? 'provider' : 'customer';

    const { data, error } = await supabase.rpc('cancel_job', {
      p_job_id: jobId,
      p_actor_id: user.id,
      p_actor_type: actorType,
      p_reason: reason
    });

    if (error) throw error;

    if (!data || !data.success) {
      throw new Error(data?.message || 'Cancellation failed');
    }

    // Push worker will automatically notify the other party
    console.log('Job cancelled successfully:', data);

    // Refetch enriched job data
    await fetchJob(jobId);

    return data;
  }

  async function rateJob(jobId: string, rating: number, review: string = '') {
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

  // ✅ Real-time job updates subscription
  function subscribeToJobUpdates(jobId: string, callback?: () => void) {
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

  // ✅ Fetch provider stats dynamically
  async function fetchProviderStats(providerId: string) {
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

  const value: JobContextType = {
    currentJob,
    setCurrentJob,
    jobDetails,
    updateJobDetails,
    resetJobDetails,
    createJob,
    fetchJob,
    updateJobStatus,
    cancelJob,
    acceptJob,
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
