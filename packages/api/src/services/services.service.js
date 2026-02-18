import { supabase } from '../lib/supabase';

/**
 * Services Service
 * Handles all service-related operations (the 12 services like Towing, Jump Start, etc.)
 */

/**
 * Get all active services
 */
export async function getAllServices() {
  try {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Get services error:', error);
    return { data: null, error };
  }
}

/**
 * Get single service by ID
 */
export async function getService(serviceId) {
  try {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('id', serviceId)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Get service error:', error);
    return { data: null, error };
  }
}

/**
 * Find nearby providers for a service
 */
export async function findNearbyProviders(latitude, longitude, serviceId, radiusKm = 50) {
  try {
    const { data, error } = await supabase
      .rpc('find_nearby_providers', {
        user_lat: latitude,
        user_lon: longitude,
        service_id_param: serviceId,
        radius_km: radiusKm,
      });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Find nearby providers error:', error);
    return { data: null, error };
  }
}
