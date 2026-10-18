export type Period = "today" | "week" | "month" | "last_month" | "quarter" | "year" | `year_${number}`;

const THIS_YEAR = new Date().getFullYear();

export const PERIODS: { key: Period; label: string }[] = [
  { key: "today",      label: "Today" },
  { key: "week",       label: "This Week" },
  { key: "month",      label: "This Month" },
  { key: "last_month", label: "Last Month" },
  { key: "quarter",    label: "This Quarter" },
  { key: "year",       label: "This Year" },
];

export const PAST_YEARS: { key: Period; label: string }[] = Array.from({ length: 4 }, (_, i) => {
  const y = THIS_YEAR - 1 - i;
  return { key: `year_${y}` as Period, label: String(y) };
});

// ── Date selection (presets + quarter-of-year + custom range) ────────────────

/** What the filter holds. Presets are recomputed from "now" each render; `quarter_Y_N` and `custom` carry their own dates. */
export interface DateSelection { key: string; from?: string; to?: string; label?: string }
export interface ResolvedRange { key: string; label: string; from: string; to: string }

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Parses YYYY-MM-DD as a LOCAL date (new Date("2026-01-05") would be UTC and can land on the previous day). */
export function parseISO(s: string): Date { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
export function fmtShort(iso: string, withYear = true): string { const d = parseISO(iso); return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ""}`; }
export function daysInRange(from: string, to: string): number { return Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / 86400000) + 1; }

export function isPresetKey(key: string): key is Period { return PERIODS.some((p) => p.key === key) || /^year_\d{4}$/.test(key); }

/** Quarter n (1–4) of a year. Fiscal year = calendar year (see nextTaxDeadline); the end is capped at today so a running quarter isn't "future". */
export function quarterRange(year: number, q: number): { from: string; to: string; startsInFuture: boolean } {
  const start = new Date(year, (q - 1) * 3, 1);
  const end = new Date(year, q * 3, 0);
  const today = new Date();
  return { from: toISO(start), to: toISO(end > today ? today : end), startsInFuture: start > today };
}
export const quarterLabel = (year: number, q: number) => `Q${q} ${year}`;
export function customLabel(from: string, to: string): string {
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return from === to ? fmtShort(from) : `${fmtShort(from, !sameYear)} – ${fmtShort(to)}`;
}

export function resolveSelection(sel: DateSelection): ResolvedRange {
  if (isPresetKey(sel.key)) {
    const { from, to } = periodDateRange(sel.key);
    return { key: sel.key, label: [...PERIODS, ...PAST_YEARS].find((p) => p.key === sel.key)?.label ?? sel.key.replace("year_", ""), from, to };
  }
  const from = sel.from ?? toISO(new Date());
  const to = sel.to ?? from;
  return { key: sel.key, label: sel.label ?? customLabel(from, to), from, to };
}

const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function periodDateRange(period: Period): { from: string; to: string } {
  const now = new Date();
  if (period === "today") { const t = fmt(now); return { from: t, to: t }; }
  if (period === "week") {
    const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return { from: fmt(mon), to: fmt(now) };
  }
  if (period === "month") return { from: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, to: fmt(now) };
  if (period === "last_month") {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: fmt(d), to: fmt(last) };
  }
  if (period === "quarter") {
    const startMonth = Math.floor(now.getMonth() / 3) * 3;
    return { from: `${now.getFullYear()}-${pad(startMonth + 1)}-01`, to: fmt(now) };
  }
  if (period === "year") return { from: `${now.getFullYear()}-01-01`, to: fmt(now) };
  const y = Number(period.replace("year_", ""));
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

export const METHOD_COLOR: Record<string, string> = {
  cash:   "text-emerald-600 dark:text-emerald-400",
  mobile: "text-blue-600 dark:text-blue-400",
  card:   "text-purple-600 dark:text-purple-400",
};

/**
 * Rwanda's fiscal year is the calendar year, so quarters line up Jan-Mar /
 * Apr-Jun / Jul-Sep / Oct-Dec. RRA's quarterly VAT payment (due 15 days
 * after a quarter ends) and quarterly CIT instalment (due the 15th of the
 * quarter's first month) land on the same four dates every year: Jan 15,
 * Apr 15, Jul 15, Oct 15. This only applies to VAT-quarterly filers
 * (annual turnover ≤ RWF 200M) — larger taxpayers file VAT monthly.
 */
export function nextTaxDeadline(from = new Date()): { date: Date; daysAway: number } {
  const year = from.getFullYear();
  const candidates = [0, 3, 6, 9].map((month) => new Date(year, month, 15));
  candidates.push(new Date(year + 1, 0, 15));
  const startOfToday = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const next = candidates.find((d) => d.getTime() >= startOfToday.getTime())!;
  const daysAway = Math.round((next.getTime() - startOfToday.getTime()) / 86_400_000);
  return { date: next, daysAway };
}
