/** One date-period model for every list page: pick a preset or a custom range, send `from_date` / `to_date` (inclusive, YYYY-MM-DD). */
export type PeriodKey = "all" | "today" | "yesterday" | "last7" | "last30" | "week" | "last_week" | "month" | "last_month" | "quarter" | "last_quarter" | "year" | "last_year" | "custom";
export interface PeriodValue { key: PeriodKey; from?: string; to?: string }
export interface PeriodRange { from?: string; to?: string }

export const ALL_TIME: PeriodValue = { key: "all" };

export const PERIOD_PRESETS: { key: Exclude<PeriodKey, "custom">; label: string }[] = [
  { key: "today", label: "Today" }, { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 days" }, { key: "last30", label: "Last 30 days" },
  { key: "week", label: "This week" }, { key: "last_week", label: "Last week" },
  { key: "month", label: "This month" }, { key: "last_month", label: "Last month" },
  { key: "quarter", label: "This quarter" }, { key: "last_quarter", label: "Last quarter" },
  { key: "year", label: "This year" }, { key: "last_year", label: "Last year" },
  { key: "all", label: "All time" },
];

const pad = (n: number) => String(n).padStart(2, "0");
/** Local calendar date as YYYY-MM-DD (never toISOString, which shifts the day across timezones). */
export const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export function periodRange(value: PeriodValue, now: Date = new Date()): PeriodRange {
  const today = toISODate(now);
  switch (value.key) {
    case "all": return {};
    case "today": return { from: today, to: today };
    case "yesterday": { const y = toISODate(addDays(now, -1)); return { from: y, to: y }; }
    case "last7": return { from: toISODate(addDays(now, -6)), to: today };
    case "last30": return { from: toISODate(addDays(now, -29)), to: today };
    case "month": return { from: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
    case "last_month": return { from: toISODate(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: toISODate(new Date(now.getFullYear(), now.getMonth(), 0)) };
    case "week": { const monday = addDays(now, -((now.getDay() + 6) % 7)); return { from: toISODate(monday), to: today }; }
    case "last_week": { const monday = addDays(now, -((now.getDay() + 6) % 7) - 7); return { from: toISODate(monday), to: toISODate(addDays(monday, 6)) }; }
    case "quarter": { const q = Math.floor(now.getMonth() / 3) * 3; return { from: toISODate(new Date(now.getFullYear(), q, 1)), to: today }; }
    case "last_quarter": { const q = Math.floor(now.getMonth() / 3) * 3 - 3; return { from: toISODate(new Date(now.getFullYear(), q, 1)), to: toISODate(new Date(now.getFullYear(), q + 3, 0)) }; }
    case "year": return { from: `${now.getFullYear()}-01-01`, to: today };
    case "last_year": return { from: `${now.getFullYear() - 1}-01-01`, to: `${now.getFullYear() - 1}-12-31` };
    case "custom": return { from: value.from || undefined, to: value.to || undefined };
  }
}

const SHORT = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export function periodLabel(value: PeriodValue): string {
  if (value.key !== "custom") return PERIOD_PRESETS.find((p) => p.key === value.key)?.label ?? "All time";
  const { from, to } = periodRange(value);
  if (from && to) return from === to ? SHORT(from) : `${SHORT(from)} – ${SHORT(to)}`;
  return from ? `From ${SHORT(from)}` : to ? `Until ${SHORT(to)}` : "All time";
}

/** Query-string parts for the API; empty for "all time". */
export const periodParams = (range?: PeriodRange) => ({ from_date: range?.from, to_date: range?.to });
export const periodKey = (range?: PeriodRange) => `${range?.from ?? ""}|${range?.to ?? ""}`;

/** A period passed in a link (?from=&to=), e.g. when a report number is opened to see the records behind it. */
export function periodFromQuery(search: string): PeriodValue | null {
  const p = new URLSearchParams(search);
  const from = p.get("from") ?? "", to = p.get("to") ?? "";
  const ok = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  return ok(from) && ok(to) && from <= to ? { key: "custom", from, to } : null;
}
