/**
 * Open the phone dialer with the given number.
 */
export function callPhone(phoneNumber: string) {
  window.location.href = `tel:${phoneNumber.replace(/\s/g, '')}`;
}

/**
 * Share trip / job details using the Web Share API,
 * with a clipboard fallback for browsers that don't support it.
 */
export async function shareJobDetails(details: {
  jobId?: string;
  service?: string;
  providerName?: string;
  eta?: number | null;
  status?: string;
}): Promise<boolean> {
  const { jobId, service, providerName, eta, status } = details;

  const lines: string[] = ['Torc - Roadside Assistance'];
  if (service) lines.push(`Service: ${service}`);
  if (providerName) lines.push(`Provider: ${providerName}`);
  if (eta != null) lines.push(`ETA: ${eta} min`);
  if (status) lines.push(`Status: ${status}`);
  if (jobId) lines.push(`Track: ${window.location.origin}/tracking/${jobId}`);

  const text = lines.join('\n');

  if (navigator.share) {
    try {
      await navigator.share({
        title: 'My Torc Rescue',
        text,
        url: jobId ? `${window.location.origin}/tracking/${jobId}` : undefined,
      });
      return true;
    } catch (err: any) {
      if (err?.name === 'AbortError') return false;
    }
  }

  // Fallback: copy to clipboard
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Open SMS app with pre-filled message.
 */
export function sendSMS(phoneNumber: string, message?: string) {
  const body = message ? `&body=${encodeURIComponent(message)}` : '';
  window.location.href = `sms:${phoneNumber.replace(/\s/g, '')}${body}`;
}
