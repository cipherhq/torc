import { supabase } from '../lib/supabase';

/**
 * Jobs Service
 * Handles all job/service request operations
 */

/**
 * Create a new job/service request
 */
export async function createJob(jobData) {
  try {
    const { data, error } = await supabase
      .from('jobs')
      .insert([jobData])
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Create job error:', error);
    return { data: null, error };
  }
}

/**
 * Get jobs for current user (customer)
 */
export async function getCustomerJobs(customerId, status = null) {
  try {
    let query = supabase
      .from('jobs')
      .select(`
        *,
        service:services(*),
        provider:providers(
          *,
          user:profiles(*)
        ),
        vehicle:vehicles(*)
      `)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Get customer jobs error:', error);
    return { data: null, error };
  }
}

/**
 * Get jobs for provider
 */
export async function getProviderJobs(providerId, status = null) {
  try {
    let query = supabase
      .from('jobs')
      .select(`
        *,
        service:services(*),
        customer:customers(
          *,
          user:profiles(*)
        ),
        vehicle:vehicles(*)
      `)
      .eq('provider_id', providerId)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Get provider jobs error:', error);
    return { data: null, error };
  }
}

/**
 * Get available jobs for providers (unassigned)
 */
export async function getAvailableJobs(serviceId = null) {
  try {
    let query = supabase
      .from('jobs')
      .select(`
        *,
        service:services(*),
        customer:customers(
          *,
          user:profiles(*)
        )
      `)
      .eq('status', 'requested')
      .is('provider_id', null)
      .order('created_at', { ascending: false });

    if (serviceId) {
      query = query.eq('service_id', serviceId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Get available jobs error:', error);
    return { data: null, error };
  }
}

/**
 * Get single job by ID
 */
export async function getJob(jobId) {
  try {
    const { data, error } = await supabase
      .from('jobs')
      .select(`
        *,
        service:services(*),
        customer:customers(
          *,
          user:profiles(*)
        ),
        provider:providers(
          *,
          user:profiles(*)
        ),
        vehicle:vehicles(*)
      `)
      .eq('id', jobId)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Get job error:', error);
    return { data: null, error };
  }
}

/**
 * Update job status
 */
export async function updateJobStatus(jobId, status, additionalData = {}) {
  try {
    const updateData = {
      status,
      updated_at: new Date().toISOString(),
      ...additionalData,
    };

    // Add timestamp fields based on status
    if (status === 'accepted') updateData.accepted_at = new Date().toISOString();
    if (status === 'in_progress') updateData.started_at = new Date().toISOString();
    if (status === 'completed') updateData.completed_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('jobs')
      .update(updateData)
      .eq('id', jobId)
      .select()
      .single();

    if (error) throw error;

    // Add to job timeline
    await addJobTimeline(jobId, status);

    return { data, error: null };
  } catch (error) {
    console.error('Update job status error:', error);
    return { data: null, error };
  }
}

/**
 * Assign job to provider
 */
export async function assignJobToProvider(jobId, providerId) {
  try {
    const { data, error } = await supabase
      .from('jobs')
      .update({
        provider_id: providerId,
        status: 'matched',
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Assign job error:', error);
    return { data: null, error };
  }
}

/**
 * Add job timeline entry
 */
export async function addJobTimeline(jobId, status, notes = null) {
  try {
    const { error } = await supabase
      .from('job_timeline')
      .insert([{
        job_id: jobId,
        status,
        notes,
      }]);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Add timeline error:', error);
    return { error };
  }
}

/**
 * Subscribe to job updates (real-time)
 */
export function subscribeToJob(jobId, callback) {
  return supabase
    .channel(`job:${jobId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'jobs',
        filter: `id=eq.${jobId}`,
      },
      (payload) => {
        callback(payload);
      }
    )
    .subscribe();
}

/**
 * Subscribe to provider location updates
 */
export function subscribeToProviderLocation(jobId, callback) {
  return supabase
    .channel(`location:${jobId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'location_updates',
        filter: `job_id=eq.${jobId}`,
      },
      (payload) => {
        callback(payload.new);
      }
    )
    .subscribe();
}

/**
 * Update provider location
 */
export async function updateProviderLocation(jobId, providerId, location) {
  try {
    const { error } = await supabase
      .from('location_updates')
      .insert([{
        job_id: jobId,
        provider_id: providerId,
        location: `POINT(${location.longitude} ${location.latitude})`,
      }]);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Update location error:', error);
    return { error };
  }
}
