// Shared date/time display formatting — one consistent look everywhere an
// order (or any other timestamped record) shows when it happened, instead of
// each page inventing its own date-only format.

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** e.g. "17 Sep 2026" */
export function fmtDate(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/** e.g. "14:30" */
export function fmtTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** e.g. "17 Sep 2026, 14:30" — the default for any per-record date display. */
export function fmtDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  return `${fmtDate(d)}, ${fmtTime(d)}`;
}

/** e.g. "2 days ago", "Just now" — for "last active"-style glances where the
 *  exact timestamp matters less than roughly how stale it is. */
export function fmtRelative(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "Never";
  const seconds = Math.round((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}
