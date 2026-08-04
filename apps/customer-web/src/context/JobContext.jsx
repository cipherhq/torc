import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

const JobContext = createContext({});

// Default platform settings (used as fallback)
const DEFAULT_PLATFORM_SETTINGS = {
  cancellation_fee_pct: 25,
  platform_commission_pct: 15,
  tax_rate_pct: 8,
  service_fee_pct: 10,
  hazard_fee: 15,
  scheduling_fee: 5,
};

export function JobProvider({ children }) {
  const { user } = useAuth();
  const [currentJob, setCurrentJob] = useState(null);
  const [platformSettings, setPlatformSettings] = useState(DEFAULT_PLATFORM_SETTINGS);
  const settingsLoaded = useRef(false);

  // Fetch platform settings from DB once on mount
  useEffect(() => {
    if (settingsLoaded.current) return;
    settingsLoaded.current = true;

    async function loadSettings() {
      try {
        const { data, error } = await supabase
          .from('platform_settings')
          .select('key, value');

        if (!error && data && data.length > 0) {
          const loaded = { ...DEFAULT_PLATFORM_SETTINGS };
          data.forEach((row) => {
            if (row.key in loaded) {
              loaded[row.key] = typeof row.value === 'number' ? row.value : Number(row.value) || loaded[row.key];
            }
          });
          setPlatformSettings(loaded);
        }
      } catch (e) {
        console.warn('Using default platform settings:', e);
      }
    }
    loadSettings();
  }, []);

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
    paymentIntentId: null,
    paymentStatus: 'unpaid',
    paymentCurrency: 'USD',
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
      paymentIntentId: null,
      paymentStatus: 'unpaid',
      paymentCurrency: 'USD',
    });
    setCurrentJob(null);
  }

  async function createJob(paymentMethodId, overrides) {
    // Merge any overrides with current jobDetails (fixes async state race condition)
    const details = overrides ? { ...jobDetails, ...overrides } : jobDetails;

    if (!user) throw new Error('User must be authenticated');
    if (!details.serviceId) throw new Error('Service selection is required');
    if (!details.pickupLocation || !details.pickupAddress) {
      throw new Error('Pickup location is required');
    }

    const insertData = {
      customer_id: user.id,
      service_id: details.serviceId,
      vehicle_id: details.vehicleId || null,
      pickup_latitude: details.pickupLocation?.latitude || null,
      pickup_longitude: details.pickupLocation?.longitude || null,
      pickup_address: details.pickupAddress,
      destination_latitude: details.destinationLocation?.latitude || null,
      destination_longitude: details.destinationLocation?.longitude || null,
      destination_address: details.destinationAddress,
      requester_type: details.requesterType,
      requester_name: details.requesterName,
      requester_phone: details.requesterPhone,
      scheduled_for: details.scheduledFor || null,
      customer_notes: details.customerNotes,
      status: 'pending',
      payment_method_id: paymentMethodId || null,
      payment_intent_id: details.paymentIntentId || null,
      payment_status: 'unpaid',  // Never trust client-provided status; webhook is sole authority
      payment_currency: (details.paymentCurrency || 'USD').toUpperCase(),
      paid_at: null,  // Only the webhook sets this
      checkout_id: details.checkoutId || null,
      base_price: null,
    };

    // Get service base price and apply admin-configured fees
    if (details.serviceId) {
      const { data: svc } = await supabase.from('services').select('base_price').eq('id', details.serviceId).single();
      if (svc) {
        const ps = platformSettings;
        const hazardFee = details.isHazardLocation ? ps.hazard_fee : 0;
        const schedulingFee = details.scheduledFor ? ps.scheduling_fee : 0;
        insertData.base_price = svc.base_price;
        insertData.service_fee = Math.round(svc.base_price * (ps.service_fee_pct / 100) * 100) / 100;
        const subtotal = svc.base_price + hazardFee + schedulingFee;
        insertData.tax = Math.round(subtotal * (ps.tax_rate_pct / 100) * 100) / 100;
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
      const { data: cust, error: custErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.customer_id)
        .maybeSingle();
      if (!custErr) customer = cust;
    }
    if (data.provider_id) {
      const { data: prov } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.provider_id)
        .maybeSingle();
      const { data: pp } = await supabase
        .from('provider_profiles')
        .select('*')
        .eq('id', data.provider_id)
        .maybeSingle();
      if (prov || pp) {
        provider = { ...(prov || {}), ...(pp || {}) };
      }
    }

    const enriched = { ...data, customer, provider };
    setCurrentJob(enriched);
    return enriched;
  }

  async function updateJobStatus(jobId, status) {
    const updateData = { status };
    if (status === 'accepted') updateData.accepted_at = new Date().toISOString();
    if (status === 'in_progress' || status === 'inprogress') {
      updateData.started_at = new Date().toISOString();
    }
    if (status === 'completed') {
      updateData.completed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('jobs')
      .update(updateData)
      .eq('id', jobId)
      .select()
      .single();

    if (error) throw error;

    // Refetch enriched job data with all relationships
    await fetchJob(jobId);

    // Send completion emails when job is completed (fire-and-forget)
    if (status === 'completed' && data) {
      sendCompletionEmails(data).catch((e) => console.warn('Completion emails failed:', e));
    }

    return data;
  }

  async function sendCompletionEmails(job) {
    try {
      const { sendCustomerInvoiceEmail, sendProviderCompletionEmail } = await import('../services/email.service');
      const now = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const amount = job.total_amount ? `$${Number(job.total_amount).toFixed(2)}` : (job.base_price ? `$${Number(job.base_price).toFixed(2)}` : '$0.00');

      // Fetch customer & provider profiles
      const [customerRes, providerRes, serviceRes] = await Promise.all([
        job.customer_id ? supabase.from('profiles').select('email, first_name, last_name').eq('id', job.customer_id).maybeSingle() : { data: null },
        job.provider_id ? supabase.from('profiles').select('email, first_name, last_name').eq('id', job.provider_id).maybeSingle() : { data: null },
        job.service_id ? supabase.from('services').select('name').eq('id', job.service_id).maybeSingle() : { data: null },
      ]);

      const customerProfile = customerRes?.data;
      const providerProfile = providerRes?.data;
      const serviceName = serviceRes?.data?.name || 'Roadside Assistance';
      const customerName = customerProfile ? `${customerProfile.first_name || ''} ${customerProfile.last_name || ''}`.trim() : (job.requester_name || 'Customer');
      const providerName = providerProfile ? `${providerProfile.first_name || ''} ${providerProfile.last_name || ''}`.trim() : 'Provider';

      // Send invoice to customer
      if (customerProfile?.email) {
        sendCustomerInvoiceEmail(customerProfile.email, {
          customerName,
          serviceName,
          providerName,
          date: now,
          amount,
          address: job.pickup_address || 'N/A',
          jobId: job.id,
        });
      }

      // Send completion summary to provider
      if (providerProfile?.email) {
        const duration = (job.started_at && job.completed_at)
          ? `${Math.round((new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()) / 60000)} min`
          : undefined;

        sendProviderCompletionEmail(providerProfile.email, {
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
      p_actor_type: 'customer',
      p_reason: reason
    });

    if (error) throw error;

    if (!data || !data.success) {
      throw new Error(data?.message || 'Cancellation failed');
    }

    // Push worker will automatically notify provider via pg_notify
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
        payload: { job_id: jobId, cancelled_by: 'customer', reason },
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

    const { data, error} = await supabase
      .from('jobs')
      .update({
        rating,
        review,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .select('*, provider_id')
      .single();

    if (error) throw error;

    // Explicitly recalculate provider rating (in case DB trigger is missing)
    if (data?.provider_id) {
      try {
        // First try the DB function if it exists
        await supabase.rpc('recalculate_provider_rating', { p_provider_id: data.provider_id });
      } catch {
        // Fallback: compute average from completed jobs and update directly
        try {
          const { data: completedJobs } = await supabase
            .from('jobs')
            .select('rating')
            .eq('provider_id', data.provider_id)
            .eq('status', 'completed')
            .not('rating', 'is', null);

          if (completedJobs && completedJobs.length > 0) {
            const avgRating = completedJobs.reduce((sum, j) => sum + Number(j.rating), 0) / completedJobs.length;
            const roundedRating = Math.round(avgRating * 100) / 100;

            await supabase
              .from('provider_profiles')
              .update({
                rating: roundedRating,
                total_jobs: completedJobs.length,
                updated_at: new Date().toISOString(),
              })
              .eq('id', data.provider_id);

            // Also sync to profiles table
            await supabase
              .from('profiles')
              .update({
                rating: roundedRating,
                total_jobs: completedJobs.length,
              })
              .eq('id', data.provider_id);
          }
        } catch (calcErr) {
          console.warn('Failed to recalculate provider rating:', calcErr);
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
    platformSettings,
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
