// Shared helpers for the super-admin Platform Overview: period presets (→ the
// from/to dates the analytics API takes) and compact number / money formatting.

import type { AnalyticsGroupBy } from "@/lib/api/admin";
import { formatMoney as sharedFormatMoney } from "@/lib/money";

// ── Period presets ───────────────────────────────────────────────────────────

export type PeriodPreset =
  | "today" | "last_7_days" | "last_30_days" | "this_month" | "last_month"
  | "last_3_months" | "last_6_months" | "this_year" | "custom";

export const PERIOD_PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_3_months", label: "Last 3 months" },
  { value: "last_6_months", label: "Last 6 months" },
  { value: "this_year", label: "This year" },
  { value: "custom", label: "Custom range" },
];

/** Short codes used in the dashboard URL (`?period=7d`). */
export const PERIOD_CODES: Record<PeriodPreset, string> = {
  today: "today", last_7_days: "7d", last_30_days: "30d", this_month: "this_month", last_month: "last_month",
  last_3_months: "3m", last_6_months: "6m", this_year: "this_year", custom: "custom",
};
export const DEFAULT_PRESET = "last_30_days" as const satisfies PeriodPreset;

export function presetFromCode(code: string | null | undefined): PeriodPreset {
  return (Object.keys(PERIOD_CODES) as PeriodPreset[]).find((k) => PERIOD_CODES[k] === code) ?? DEFAULT_PRESET;
}

export interface DateRange {
  /** Inclusive start, YYYY-MM-DD. */
  from: string;
  /** Inclusive end, YYYY-MM-DD. */
  to: string;
}

/** YYYY-MM-DD from the *local* calendar date (not UTC, which can be off by a day). */
export function toISODate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Resolve a preset to concrete dates. `custom` is handled by the caller. */
export function presetRange(preset: Exclude<PeriodPreset, "custom">, now: Date = new Date()): DateRange {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const today = new Date(y, m, d);
  switch (preset) {
    case "today":
      return { from: toISODate(today), to: toISODate(today) };
    case "last_7_days":
      return { from: toISODate(new Date(y, m, d - 6)), to: toISODate(today) };
    case "last_30_days":
      return { from: toISODate(new Date(y, m, d - 29)), to: toISODate(today) };
    case "this_month":
      return { from: toISODate(new Date(y, m, 1)), to: toISODate(today) };
    case "last_month":
      return { from: toISODate(new Date(y, m - 1, 1)), to: toISODate(new Date(y, m, 0)) };
    case "last_3_months":
      return { from: toISODate(new Date(y, m - 3, d + 1)), to: toISODate(today) };
    case "last_6_months":
      return { from: toISODate(new Date(y, m - 6, d + 1)), to: toISODate(today) };
    case "this_year":
      return { from: toISODate(new Date(y, 0, 1)), to: toISODate(today) };
  }
}

/** Inclusive number of days in a range. */
export function rangeDays(r: DateRange): number {
  const [fy, fm, fd] = r.from.split("-").map(Number);
  const [ty, tm, td] = r.to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000) + 1;
}

/** Mirrors the server's default so the grouping control can show what "auto" resolves to. */
export function autoGroupBy(days: number): AnalyticsGroupBy {
  if (days <= 31) return "day";
  if (days <= 180) return "week";
  if (days <= 1100) return "month";
  return "year";
}

/** Largest range the API accepts (kept in sync with MAX_RANGE_DAYS on the backend). */
export const MAX_RANGE_DAYS = 3660;

// ── Number & money formatting ────────────────────────────────────────────────

const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** 1,200 · 12.5K · 1.2M · 1.4B — full digits below 10,000, compact above. */
export function formatCompact(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "0";
  if (Math.abs(v) < 10_000) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return COMPACT.format(v);
}

export function formatFull(n: number | null | undefined): string {
  return Number(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/**
 * "RWF 186,838,500" (full) or "RWF 186.8M" (compact) for any ISO 4217 code — a thin wrapper over the
 * shared formatter so the dashboard and the rest of the app can never format money differently.
 */
export function formatMoney(value: number | null | undefined, currency: string, compact = false): string {
  return sharedFormatMoney(value, currency, { compact });
}

export function formatPct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toLocaleString("en-US", { maximumFractionDigits: digits })}%`;
}

/** "+8.4%" / "-3.1%" / "0%". */
export function formatChange(pct: number): string {
  if (pct === 0) return "0%";
  return `${pct > 0 ? "+" : ""}${pct.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
}

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  sole: "Sole Proprietorship",
  partnership: "Partnership",
  llc: "Limited Liability (LLC)",
  unregistered: "Not Registered",
};

/** Stored business-type codes ("sole") → display names; unknown codes still read sensibly. */
export function businessTypeLabel(code: string): string {
  return BUSINESS_TYPE_LABELS[code] ?? humanizeKey(code);
}

/** "free" → "Free", "pro_plus" → "Pro plus" — plan names are data, never hardcoded. */
export function humanizeKey(key: string): string {
  const s = key.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Short x-axis label for an API bucket key ("2026-09" → "Sep 26", "2026-09-03" → "3 Sep"). */
export function formatPeriodLabel(period: string, unit: AnalyticsGroupBy): string {
  const [y, m = "1", d = "1"] = period.split("-");
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  const fmt = (o: Intl.DateTimeFormatOptions) => date.toLocaleDateString("en-GB", { timeZone: "UTC", ...o });
  switch (unit) {
    case "year": return y;
    case "month": return fmt({ month: "short", year: "2-digit" });
    default: return fmt({ day: "numeric", month: "short" });
  }
}
