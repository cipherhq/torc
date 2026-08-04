import { supabase } from '../lib/supabase';

/**
 * Send a job-related email. The server derives the recipient from the job
 * record — no caller-supplied email addresses.
 */
async function sendJobEmail(template: string, jobId: string, data: Record<string, any> = {}): Promise<boolean> {
  try {
    const { data: result, error } = await supabase.functions.invoke('send-email', {
      body: { template, jobId, data },
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

/**
 * Send invoice to customer after service completion.
 * Recipient derived from job.customer_id by the server.
 */
export async function sendCustomerInvoiceEmail(
  jobId: string,
  data: {
    customerName: string;
    serviceName: string;
    providerName: string;
    date: string;
    amount: string;
    address: string;
    jobId: string;
    paymentMethod?: string;
  }
) {
  return sendJobEmail('customer_invoice', jobId, data);
}

/**
 * Send completion summary to provider after service.
 * Recipient derived from job.provider_id by the server.
 */
export async function sendProviderCompletionEmail(
  jobId: string,
  data: {
    providerName: string;
    customerName: string;
    serviceName: string;
    date: string;
    payout: string;
    address: string;
    jobId: string;
    duration?: string;
  }
) {
  return sendJobEmail('provider_completion', jobId, data);
}

// NOTE: Welcome, documents_pending, document_request, provider_approved,
// and provider_suspended emails are admin-only templates. They should be
// triggered by server-side processes (e.g., admin dashboard actions,
// Supabase database triggers, or Edge Functions), NOT from client apps.
//
// The old sendWelcomeEmail/sendDocumentsPendingEmail functions are removed.
// Attempting to invoke admin-only templates from a customer/provider client
// will be rejected by the send-email Edge Function (403 Forbidden).
