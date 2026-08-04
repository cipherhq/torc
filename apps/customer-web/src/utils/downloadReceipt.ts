// Shared download utilities for receipts and CSV exports
// Uses navigator.share (Web Share API) for Capacitor WebView compatibility,
// falls back to Blob + link.click() for desktop browsers.

async function shareOrDownload(filename: string, content: string, mimeType: string) {
  // Try Web Share API with File (works natively in Capacitor WebViews)
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      const file = new File([content], filename, { type: mimeType });
      await navigator.share({ files: [file] });
      return;
    } catch (err: any) {
      // User cancelled share or share not supported with files — fall through
      if (err?.name === 'AbortError') return;
    }
  }

  // Fallback: Blob download (works in desktop browsers)
  const blob = new Blob([content], { type: mimeType });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

export function saveCsv(filename: string, rows: Array<Array<string | number>>) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  void shareOrDownload(filename, csv, 'text/csv;charset=utf-8;');
}

export function downloadJobReceipt(job: {
  id: string;
  service?: { name?: string } | null;
  pickup_address?: string | null;
  completed_at?: string | null;
  created_at?: string;
  base_price?: number | null;
  service_fee?: number | null;
  tax?: number | null;
  total_amount?: number | null;
  tip?: number | null;
  provider?: { first_name?: string; last_name?: string } | null;
}) {
  const date = job.completed_at || job.created_at || new Date().toISOString();
  const formatted = new Date(date).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  const providerName = job.provider
    ? `${job.provider.first_name || ''} ${job.provider.last_name || ''}`.trim() || 'Provider'
    : 'Provider';
  const base = Number(job.base_price || 0);
  const fee = Number(job.service_fee || 0);
  const tax = Number(job.tax || 0);
  const total = Number(job.total_amount || base);
  const tip = Number(job.tip || 0);

  const lines = [
    'TORC Roadside Assistance - Receipt',
    '===================================',
    `Job ID:      ${(job.id || '').slice(0, 8).toUpperCase()}`,
    `Date:        ${formatted}`,
    `Service:     ${job.service?.name || 'Service'}`,
    `Provider:    ${providerName}`,
    `Location:    ${job.pickup_address || '-'}`,
    '-----------------------------------',
    `Service:     $${base.toFixed(2)}`,
    ...(fee > 0 ? [`Torc Fee:    $${fee.toFixed(2)}`] : []),
    ...(tax > 0 ? [`Tax:         $${tax.toFixed(2)}`] : []),
    '-----------------------------------',
    `Total:       $${total.toFixed(2)}`,
    `Tip:         $${tip.toFixed(2)}`,
    `Amount Paid: $${(total + tip).toFixed(2)}`,
    '===================================',
    'Thank you for using TORC!',
  ].join('\n');

  void shareOrDownload(`torc-receipt-${(job.id || '').slice(0, 8)}.txt`, lines, 'text/plain;charset=utf-8;');
}

export function downloadWalletHistory(transactions: Array<{
  id: string;
  description: string;
  date: string;
  amount: number;
  status: string;
}>) {
  const rows: Array<Array<string | number>> = [
    ['Date', 'Description', 'Amount', 'Status'],
    ...transactions.map((t) => [t.date, t.description, t.amount, t.status]),
  ];
  saveCsv(`torc-wallet-${new Date().toISOString().slice(0, 10)}.csv`, rows);
}
