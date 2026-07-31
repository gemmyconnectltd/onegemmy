"use client";
import { fmtMoney } from "@/lib/config";
import { useState } from "react";
import { Tag, Users, TrendingUp, Clock, UserX } from "lucide-react";
import { useAppConfig } from "@/lib/appConfig";

const COLOR = "#0f766e";

type Segment = "VIP" | "Regular" | "New" | "At Risk";

const SEGMENT_STYLE: Record<Segment, { bg: string; text: string; color: string }> = {
  VIP:      { bg: "bg-violet-100", text: "text-violet-700", color: "#7c3aed" },
  Regular:  { bg: "bg-emerald-100", text: "text-emerald-700", color: "#059669" },
  New:      { bg: "bg-blue-100",   text: "text-blue-700",   color: "#0284c7" },
  "At Risk":{ bg: "bg-red-100",    text: "text-red-600",    color: "#dc2626" },
};

const CUSTOMERS = [
  { id: "1", name: "Jean Pierre",       totalPurchases: 125000, visits: 12, lastSeen: "2 days ago",  segment: "VIP" as Segment },
  { id: "2", name: "Marie Claire",      totalPurchases: 87000,  visits: 8,  lastSeen: "5 days ago",  segment: "Regular" as Segment },
  { id: "3", name: "Patrick Niyonzima", totalPurchases: 234000, visits: 20, lastSeen: "1 day ago",   segment: "VIP" as Segment },
  { id: "4", name: "Immaculate",        totalPurchases: 45000,  visits: 3,  lastSeen: "3 weeks ago", segment: "At Risk" as Segment },
  { id: "5", name: "Eric Habimana",     totalPurchases: 67000,  visits: 5,  lastSeen: "1 week ago",  segment: "Regular" as Segment },
  { id: "6", name: "Alice Uwase",       totalPurchases: 12000,  visits: 1,  lastSeen: "3 days ago",  segment: "New" as Segment },
];

const SEGMENT_ICONS: Record<Segment, React.ElementType> = {
  VIP: TrendingUp, Regular: Users, New: Clock, "At Risk": UserX,
};

export default function SegmentsPage() {
  const { currencySymbol } = useAppConfig();
  const fmt = (v: number) => fmtMoney(v, currencySymbol);
  const [active, setActive] = useState<Segment | "All">("All");

  const filtered = CUSTOMERS.filter((c) => active === "All" || c.segment === active);

  const segmentStats = (["VIP", "Regular", "New", "At Risk"] as Segment[]).map((s) => ({
    label: s, value: CUSTOMERS.filter((c) => c.segment === s).length,
    icon: SEGMENT_ICONS[s], color: SEGMENT_STYLE[s].color,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">Segments</h1>
        <p className="text-sm text-muted mt-0.5">Group customers by behaviour and value</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {segmentStats.map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 hover:shadow-md hover:border-foreground/15 transition-all cursor-pointer"
            onClick={() => setActive(s.label as Segment)}>
            <div className="w-8 h-8 flex items-center justify-center rounded-xl mb-2" style={{ backgroundColor: `${s.color}15` }}>
              <s.icon size={16} style={{ color: s.color }} />
            </div>
            <p className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight">{s.value}</p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-border flex items-center gap-1 bg-surface/50">
          {(["All", "VIP", "Regular", "New", "At Risk"] as const).map((s) => (
            <button key={s} onClick={() => setActive(s)}
              className={`px-3 py-1.5 text-[12px] font-semibold rounded-lg transition-colors ${active === s ? "text-white" : "text-foreground/50 hover:text-foreground"}`}
              style={active === s ? { backgroundColor: COLOR } : undefined}>
              {s}
            </button>
          ))}
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="p-4 font-semibold">Customer</th>
              <th className="p-4 font-semibold">Segment</th>
              <th className="p-4 font-semibold text-right">Visits</th>
              <th className="p-4 font-semibold text-right">Total Spent</th>
              <th className="p-4 font-semibold">Last Seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((c) => {
              const { bg, text } = SEGMENT_STYLE[c.segment];
              const Icon = SEGMENT_ICONS[c.segment];
              return (
                <tr key={c.id} className="hover:bg-surface/50 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: COLOR }}>
                        {c.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                      </div>
                      <span className="text-sm font-semibold text-foreground">{c.name}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full ${bg} ${text}`}>
                      <Icon size={11} /> {c.segment}
                    </span>
                  </td>
                  <td className="p-4 text-right text-sm font-semibold text-foreground tabular-nums">{c.visits}</td>
                  <td className="p-4 text-right text-sm font-bold text-foreground tabular-nums">{fmt(c.totalPurchases)}</td>
                  <td className="p-4 text-[13px] text-muted">{c.lastSeen}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
