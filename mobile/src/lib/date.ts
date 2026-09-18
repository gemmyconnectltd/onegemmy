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
