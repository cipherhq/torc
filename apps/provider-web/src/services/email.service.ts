import { supabase } from '../lib/supabase';

/**
 * Trigger welcome email for the currently authenticated provider.
 * Server derives recipient and name. Idempotent.
 */
export async function sendWelcomeEmail(): Promise<boolean> {
  try {
    const { data: result, error } = await supabase.functions.invoke('send-email', {
      body: { template: 'welcome' },
    });
    if (error) {
      console.warn('Welcome email failed:', error.message);
      return false;
    }
    return result?.success ?? false;
  } catch (err: any) {
    console.warn('Welcome email error:', err?.message || err);
    return false;
  }
}

/**
 * Trigger documents-pending email for the currently authenticated provider.
 * Server verifies document state and derives recipient/name. Idempotent.
 */
export async function sendDocumentsPendingEmail(): Promise<boolean> {
  try {
    const { data: result, error } = await supabase.functions.invoke('send-email', {
      body: { template: 'documents_pending' },
    });
    if (error) {
      console.warn('Documents pending email failed:', error.message);
      return false;
    }
    return result?.success ?? false;
  } catch (err: any) {
    console.warn('Documents pending email error:', err?.message || err);
    return false;
  }
}
