"use client";
import { Target } from "lucide-react";
import { useAppConfig } from "@/lib/appConfig";

const targets = [
  { id: 1, name: "Monthly Revenue",  target: 2000000, achieved: 1250000, period: "July 2025" },
  { id: 2, name: "New Customers",    target: 50,      achieved: 32,      period: "July 2025" },
  { id: 3, name: "Orders Closed",    target: 200,     achieved: 148,     period: "July 2025" },
  { id: 4, name: "Quarterly Revenue",target: 6000000, achieved: 3870000, period: "Q3 2025" },
];

export default function SalesTargetsPage() {
  const { currencySymbol } = useAppConfig();
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-foreground">Sales Targets</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {targets.map((t) => {
          const pct = Math.min(100, Math.round((t.achieved / t.target) * 100));
          const fmt = (v: number) => typeof v === "number" && v > 999 ? `${currencySymbol} ${v.toLocaleString()}` : v.toString();
          return (
            <div key={t.id} className="bg-white border border-border p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><Target size={16} className="text-accent" /><span className="text-sm font-bold text-foreground">{t.name}</span></div>
                <span className="text-xs text-muted">{t.period}</span>
              </div>
              <div className="flex items-end justify-between">
                <div><p className="text-2xl font-extrabold text-foreground">{pct}%</p><p className="text-xs text-muted mt-0.5">{fmt(t.achieved)} of {fmt(t.target)}</p></div>
                <span className={`text-xs font-semibold px-2 py-1 ${pct >= 100 ? "bg-emerald-50 text-emerald-700" : pct >= 60 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-600"}`}>
                  {pct >= 100 ? "Achieved" : pct >= 60 ? "On Track" : "Behind"}
                </span>
              </div>
              <div className="h-2 bg-surface overflow-hidden">
                <div className={`h-full transition-all ${pct >= 100 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
