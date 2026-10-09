/**
 * MineGuard Predict - Date/Time & Presentation Formatting Utilities
 */

/**
 * Format ISO or raw datetime string to clean human readable format: YYYY-MM-DD HH:MM
 * Examples:
 *   "2026-06-01T05:05:00.000000" -> "2026-06-01 05:05"
 *   "2026-06-01 05:05:00" -> "2026-06-01 05:05"
 */
export function formatDateTime(val?: string | null): string {
  if (!val) return '--';
  const clean = String(val).replace('T', ' ').replace(/\.\d+.*$/, '').trim();
  return clean.slice(0, 16);
}

/**
 * Format time range cleanly:
 * E.g. "05:05 - 05:30" (when same day) or "2026-06-01 05:05 - 2026-06-02 05:30" (cross day)
 */
export function formatTimeRange(start?: string | null, end?: string | null): string {
  if (!start && !end) return '--';
  const sClean = String(start || '').replace('T', ' ').replace(/\.\d+.*$/, '').trim();
  const eClean = String(end || '').replace('T', ' ').replace(/\.\d+.*$/, '').trim();

  const sDate = sClean.slice(0, 10);
  const sTime = sClean.length >= 16 ? sClean.slice(11, 16) : sClean;
  const eDate = eClean.slice(0, 10);
  const eTime = eClean.length >= 16 ? eClean.slice(11, 16) : eClean;

  if (sDate && eDate && sDate === eDate) {
    return `${sTime} - ${eTime}`;
  }
  if (sClean && eClean) {
    return `${sClean.slice(0, 16)} - ${eClean.slice(0, 16)}`;
  }
  return sClean.slice(0, 16) || eClean.slice(0, 16);
}

/**
 * Format time-only: e.g. "05:05"
 */
export function formatTimeOnly(val?: string | null): string {
  if (!val) return '--';
  const clean = String(val).replace('T', ' ').replace(/\.\d+.*$/, '').trim();
  const parts = clean.split(' ');
  return parts.length > 1 ? parts[1].slice(0, 5) : clean.slice(0, 5);
}
