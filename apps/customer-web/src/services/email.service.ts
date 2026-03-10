import { supabase } from '../lib/supabase';

async function sendEmail(to: string, template: string, data: Record<string, any> = {}) {
  try {
    const { data: result, error } = await supabase.functions.invoke('send-email', {
      body: { to, template, data },
    });

    if (error) {
      console.warn(`Email (${template}) failed:`, error.message);
      return false;
    }

    return result?.success ?? false;
  } catch (err) {
    console.warn(`Email (${template}) error:`, err);
    return false;
  }
}

/** Welcome email sent after user signs up */
export async function sendWelcomeEmail(email: string, name: string) {
  return sendEmail(email, 'welcome', { name });
}

/** Notify provider their documents are under review */
export async function sendDocumentsPendingEmail(email: string, name: string) {
  return sendEmail(email, 'documents_pending', { name });
}

/** Request additional documents from provider */
export async function sendDocumentRequestEmail(email: string, name: string, reason: string) {
  return sendEmail(email, 'document_request', { name, reason });
}

/** Send invoice to customer after service completion */
export async function sendCustomerInvoiceEmail(
  email: string,
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
  return sendEmail(email, 'customer_invoice', data);
}

/** Notify provider their account has been suspended */
export async function sendProviderSuspendedEmail(email: string, name: string, reason: string) {
  return sendEmail(email, 'provider_suspended', { name, reason });
}

/** Send completion summary to provider after service */
export async function sendProviderCompletionEmail(
  email: string,
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
  return sendEmail(email, 'provider_completion', data);
}
