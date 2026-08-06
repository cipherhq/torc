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
    if (!jobDetails.serviceId) throw new Error('Service selection is required');
    if (!jobDetails.pickupLocation || !jobDetails.pickupAddress) {
      throw new Error('Pickup location is required');
    }

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
        const hazardFee = jobDetails.isHazardLocation ? 15 : 0;
        const schedulingFee = jobDetails.scheduledFor ? 5 : 0;
        insertData.base_price = svc.base_price;
        insertData.service_fee = Math.round(svc.base_price * 0.1 * 100) / 100;
        const subtotal = svc.base_price + hazardFee + schedulingFee;
        insertData.tax = Math.round(subtotal * 0.08 * 100) / 100;
        // total_amount = what the customer pays (service_fee is deducted from provider earnings, not charged to customer)
        insertData.total_amount = subtotal + insertData.tax;
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
    const { data, error } = await supabase.rpc('transition_job_status_by_participant', {
      p_job_id: jobId,
      p_target_status: status,
    });

    if (error) throw error;
    if (!data || !data.success) {
      throw new Error(data?.message || data?.error || 'Status transition failed');
    }

    // Refetch enriched job data with all relationships
    const job = await fetchJob(jobId);

    // Send completion emails (fire-and-forget) when provider completes a job.
    if (status === 'completed' && job) {
      sendCompletionEmails(job).catch((e) => console.warn('Completion emails failed:', e));
    }

    return data;
  }

  async function sendTemplatedEmail(to, template, data = {}) {
    try {
      const { error } = await supabase.functions.invoke('send-email', {
        body: { to, template, data },
      });
      if (error) {
        console.warn(`Email (${template}) failed:`, error.message);
      }
    } catch (err) {
      console.warn(`Email (${template}) error:`, err);
    }
  }

  async function sendCompletionEmails(job) {
    try {
      const now = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const amount = job.total_amount
        ? `$${Number(job.total_amount).toFixed(2)}`
        : (job.base_price ? `$${Number(job.base_price).toFixed(2)}` : '$0.00');

      const [customerRes, providerRes, serviceRes] = await Promise.all([
        job.customer_id
          ? supabase.from('profiles').select('email, first_name, last_name').eq('id', job.customer_id).maybeSingle()
          : { data: null },
        job.provider_id
          ? supabase.from('profiles').select('email, first_name, last_name').eq('id', job.provider_id).maybeSingle()
          : { data: null },
        job.service_id
          ? supabase.from('services').select('name').eq('id', job.service_id).maybeSingle()
          : { data: null },
      ]);

      const customerProfile = customerRes?.data;
      const providerProfile = providerRes?.data;
      const serviceName = serviceRes?.data?.name || 'Roadside Assistance';
      const customerName = customerProfile
        ? `${customerProfile.first_name || ''} ${customerProfile.last_name || ''}`.trim()
        : (job.requester_name || 'Customer');
      const providerName = providerProfile
        ? `${providerProfile.first_name || ''} ${providerProfile.last_name || ''}`.trim()
        : 'Provider';

      if (customerProfile?.email) {
        await sendTemplatedEmail(customerProfile.email, 'customer_invoice', {
          customerName,
          serviceName,
          providerName,
          date: now,
          amount,
          address: job.pickup_address || 'N/A',
          jobId: job.id,
        });
      }

      if (providerProfile?.email) {
        const duration = (job.started_at && job.completed_at)
          ? `${Math.round((new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()) / 60000)} min`
          : undefined;

        await sendTemplatedEmail(providerProfile.email, 'provider_completion', {
          providerName,
          customerName,
          serviceName,
          date: now,
          payout: amount,
          address: job.pickup_address || 'N/A',
          jobId: job.id,
          duration,
        });
      }
    } catch (e) {
      console.warn('sendCompletionEmails error:', e);
    }
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
    if (!Number.isFinite(Number(rating)) || Number(rating) < 1 || Number(rating) > 5) {
      throw new Error('A rating from 1 to 5 stars is required.');
    }

    const { data, error } = await supabase
      .from('jobs')
      .update({
        // Provider feedback must be stored separately from customer->provider rating.
        provider_rating: Number(rating),
        provider_review: review || null,
      })
      .eq('id', jobId)
      .select('id, customer_id')
      .single();

    if (error) {
      const message = String(error?.message || '');
      if (message.toLowerCase().includes('provider_rating') || message.toLowerCase().includes('provider_review')) {
        throw new Error('Provider feedback columns are missing. Please run migration 025_provider_feedback_columns.sql.');
      }
      throw error;
    }

    // Recalculate customer rating from provider feedback.
    if (data?.customer_id) {
      try {
        // Preferred path if SQL function exists.
        await supabase.rpc('recalculate_customer_rating', { p_customer_id: data.customer_id });
      } catch {
        // Fallback path for environments where the RPC has not been added yet.
        try {
          const { data: completedJobs } = await supabase
            .from('jobs')
            .select('provider_rating')
            .eq('customer_id', data.customer_id)
            .eq('status', 'completed')
            .not('provider_rating', 'is', null);

          const ratings = (completedJobs || []).map((j) => Number(j.provider_rating)).filter((n) => Number.isFinite(n));
          const average = ratings.length > 0
            ? Math.round((ratings.reduce((sum, n) => sum + n, 0) / ratings.length) * 100) / 100
            : 0;

          await supabase
            .from('profiles')
            .update({ rating: average })
            .eq('id', data.customer_id);
        } catch (calcErr) {
          console.warn('Failed to recalculate customer rating:', calcErr);
        }
      }
    }

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
