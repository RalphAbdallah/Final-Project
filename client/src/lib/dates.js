const dateFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

/** "2026-11-03" → "Tue 3 Nov", read as a local date (no timezone shift). */
export function formatDate(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return dateFormat.format(new Date(y, m - 1, d));
}
