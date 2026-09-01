"use client";
import { fmtMoney } from "@/lib/config";
import { useState } from "react";
import { Star, Crown, Award, Users } from "lucide-react";
import { useAppConfig } from "@/lib/appConfig";

type Tier = "Bronze" | "Silver" | "Gold" | "Platinum";

const TIER_STYLE: Record<Tier, { bg: string; text: string; icon: React.ElementType }> = {
  Bronze:   { bg: "bg-orange-100",  text: "text-orange-700",  icon: Award },
  Silver:   { bg: "bg-slate-100",   text: "text-slate-600",   icon: Star },
  Gold:     { bg: "bg-amber-100",   text: "text-amber-700",   icon: Crown },
  Platinum: { bg: "bg-violet-100",  text: "text-violet-700",  icon: Crown },
};

const TIER_THRESHOLDS: Record<Tier, string> = {
  Bronze:   "0 – 49,999",
  Silver:   "50,000 – 149,999",
  Gold:     "150,000 – 299,999",
  Platinum: "300,000+",
};

const CUSTOMERS = [
  { id: "1", name: "Jean Pierre",       totalPurchases: 125000, points: 1250, tier: "Gold" as Tier },
  { id: "2", name: "Marie Claire",      totalPurchases: 87000,  points: 870,  tier: "Silver" as Tier },
  { id: "3", name: "Patrick Niyonzima", totalPurchases: 234000, points: 2340, tier: "Gold" as Tier },
  { id: "4", name: "Immaculate",        totalPurchases: 45000,  points: 450,  tier: "Bronze" as Tier },
  { id: "5", name: "Eric Habimana",     totalPurchases: 67000,  points: 670,  tier: "Silver" as Tier },
];

export default function LoyaltyPage() {
  const { currencySymbol, brandColor } = useAppConfig();
  const COLOR = brandColor;
  const fmt = (v: number) => fmtMoney(v, currencySymbol);
  const [filter, setFilter] = useState<Tier | "All">("All");

  const filtered = CUSTOMERS.filter((c) => filter === "All" || c.tier === filter);

  const stats = [
    { label: "Total Members", value: CUSTOMERS.length,                                    icon: Users,  color: COLOR },
    { label: "Gold",          value: CUSTOMERS.filter((c) => c.tier === "Gold").length,   icon: Crown,  color: "#b45309" },
    { label: "Silver",        value: CUSTOMERS.filter((c) => c.tier === "Silver").length, icon: Star,   color: "#64748b" },
    { label: "Bronze",        value: CUSTOMERS.filter((c) => c.tier === "Bronze").length, icon: Award,  color: "#c2410c" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">Loyalty Program</h1>
        <p className="text-sm text-muted mt-0.5">Customer tiers based on total spending</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-card p-4">
            <div className="w-8 h-8 flex items-center justify-center mb-2" style={{ backgroundColor: `${s.color}10` }}>
              <s.icon size={16} style={{ color: s.color }} />
            </div>
            <p className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight">{s.value}</p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tier legend */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(Object.entries(TIER_THRESHOLDS) as [Tier, string][]).map(([tier, range]) => {
          const { bg, text, icon: Icon } = TIER_STYLE[tier];
          return (
            <div key={tier} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${bg}`}>
                <Icon size={15} className={text} />
              </div>
              <div>
                <p className={`text-[13px] font-bold ${text}`}>{tier}</p>
                <p className="text-[11px] text-muted">{currencySymbol} {range}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-border flex items-center gap-1 bg-surface/50">
          {(["All", "Platinum", "Gold", "Silver", "Bronze"] as const).map((t) => (
            <button key={t} onClick={() => setFilter(t)}
              className={`px-3 py-1.5 text-[12px] font-semibold rounded-lg transition-colors ${filter === t ? "text-white" : "text-foreground/50 hover:text-foreground"}`}
              style={filter === t ? { backgroundColor: COLOR } : undefined}>
              {t}
            </button>
          ))}
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="p-4 font-semibold">Customer</th>
              <th className="p-4 font-semibold">Tier</th>
              <th className="p-4 font-semibold text-right">Points</th>
              <th className="p-4 font-semibold text-right">Total Spent</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((c) => {
              const { bg, text, icon: Icon } = TIER_STYLE[c.tier];
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
                      <Icon size={11} /> {c.tier}
                    </span>
                  </td>
                  <td className="p-4 text-right text-sm font-bold text-foreground tabular-nums">{c.points.toLocaleString()} pts</td>
                  <td className="p-4 text-right text-sm font-bold text-foreground tabular-nums">{fmt(c.totalPurchases)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
