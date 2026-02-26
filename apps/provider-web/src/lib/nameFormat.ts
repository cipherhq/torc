/**
 * Privacy-safe name formatting: "FirstName L." format.
 */
export function formatPrivacyName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  fallback: string = 'User'
): string {
  const first = (firstName || '').trim();
  const last = (lastName || '').trim();
  if (!first && !last) return fallback;
  if (!last) return first;
  return `${first} ${last[0].toUpperCase()}.`;
}

/**
 * Parse a full name string into privacy-safe format.
 * "John Doe" → "John D."
 */
export function formatPrivacyNameFromFull(
  fullName: string | null | undefined,
  fallback: string = 'User'
): string {
  const name = (fullName || '').trim();
  if (!name) return fallback;
  const parts = name.split(/\s+/);
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const lastInitial = parts[parts.length - 1][0];
  return `${first} ${lastInitial.toUpperCase()}.`;
}

/**
 * Get initials from a name (for avatar circles).
 * "John D." → "JD", "Jane" → "J"
 */
export function getInitials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] || '';
  const second = parts.length > 1 ? (parts[1][0] || '').replace('.', '') : '';
  return `${first}${second}`.toUpperCase();
}

/**
 * Relative time label for conversation list.
 */
export function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMin = Math.floor((now - then) / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

/**
 * Date label for day separators in chat.
 */
export function getDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
