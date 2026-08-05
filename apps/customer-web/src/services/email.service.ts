import { supabase } from '../lib/supabase';

/**
 * Send a job-related email. The server derives recipient, names, amounts,
 * and all content from trusted job/profile/service records.
 * The client sends ONLY identifiers, not business data.
 */
async function sendJobEmail(template: string, jobId: string): Promise<boolean> {
  try {
    const { data: result, error } = await supabase.functions.invoke('send-email', {
      body: { template, jobId },
    });

    if (error) {
      console.warn(`Email (${template}) for job ${jobId} failed:`, error.message);
      return false;
    }

    return result?.success ?? false;
  } catch (err: any) {
    console.warn(`Email (${template}) error:`, err?.message || err);
    return false;
  }
}

/** Send invoice to customer after service completion. Server derives all content. */
export async function sendCustomerInvoiceEmail(jobId: string) {
  return sendJobEmail('customer_invoice', jobId);
}

/** Send completion summary to provider after service. Server derives all content. */
export async function sendProviderCompletionEmail(jobId: string) {
  return sendJobEmail('provider_completion', jobId);
}

/**
 * Trigger welcome email for the currently authenticated user.
 * Server derives recipient and name from auth/profile records.
 * Idempotent — sends once per user.
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
 * Server verifies document state and derives recipient/name.
 * Idempotent — sends once per submission.
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
