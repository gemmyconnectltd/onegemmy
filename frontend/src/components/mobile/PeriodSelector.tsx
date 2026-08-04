"use client";

export type PeriodKey = "today" | "7d" | "month" | "all";

export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "month", label: "This month" },
  { key: "all", label: "All time" },
];

export function inPeriod(ts: Date, period: PeriodKey): boolean {
  const now = new Date();
  switch (period) {
    case "today": {
      return ts.toDateString() === now.toDateString();
    }
    case "7d": {
      const cutoff = new Date(now);
      cutoff.setDate(now.getDate() - 7);
      return ts.getTime() >= cutoff.getTime();
    }
    case "month": {
      return ts.getFullYear() === now.getFullYear() && ts.getMonth() === now.getMonth();
    }
    case "all":
      return true;
  }
}

interface PeriodSelectorProps {
  value: PeriodKey;
  onChange: (key: PeriodKey) => void;
}

export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <div className="grid grid-cols-4 gap-1 bg-surface border border-border rounded-xl p-1">
      {PERIODS.map((p) => (
        <button
          key={p.key}
          onClick={() => onChange(p.key)}
          className={`py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
            value === p.key ? "bg-accent text-white shadow-sm" : "text-muted"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
