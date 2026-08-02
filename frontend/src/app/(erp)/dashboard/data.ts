export type Period = "today" | "week" | "month" | "last_month" | "year" | `year_${number}`;

const THIS_YEAR = new Date().getFullYear();

export const PERIODS: { key: Period; label: string }[] = [
  { key: "today",      label: "Today" },
  { key: "week",       label: "This Week" },
  { key: "month",      label: "This Month" },
  { key: "last_month", label: "Last Month" },
  { key: "year",       label: "This Year" },
];

export const PAST_YEARS: { key: Period; label: string }[] = Array.from({ length: 4 }, (_, i) => {
  const y = THIS_YEAR - 1 - i;
  return { key: `year_${y}` as Period, label: String(y) };
});

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
  if (period === "year") return { from: `${now.getFullYear()}-01-01`, to: fmt(now) };
  const y = Number(period.replace("year_", ""));
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

export const METHOD_COLOR: Record<string, string> = {
  cash:   "text-emerald-600 dark:text-emerald-400",
  mobile: "text-blue-600 dark:text-blue-400",
  card:   "text-purple-600 dark:text-purple-400",
};
