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

/** Welcome email sent after provider signs up */
export async function sendWelcomeEmail(email: string, name: string) {
  return sendEmail(email, 'welcome', { name });
}

/** Notify provider their documents are under review */
export async function sendDocumentsPendingEmail(email: string, name: string) {
  return sendEmail(email, 'documents_pending', { name });
}
