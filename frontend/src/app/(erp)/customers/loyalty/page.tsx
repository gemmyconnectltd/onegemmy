"use client";
import { useMemo, useState } from "react";
import { fmtMoney } from "@/lib/config";
import { Star, Crown, Award, Users } from "lucide-react";
import { useAppConfig } from "@/lib/appConfig";
import { useCustomers, useOrders } from "@/lib/api/hooks";

const COLOR = "#0f766e";

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

function tierFor(spent: number): Tier {
  if (spent >= 300000) return "Platinum";
  if (spent >= 150000) return "Gold";
  if (spent >= 50000) return "Silver";
  return "Bronze";
}

export default function LoyaltyPage() {
  const { currencySymbol } = useAppConfig();
  const fmt = (v: number) => fmtMoney(v, currencySymbol);
  const [filter, setFilter] = useState<Tier | "All">("All");

  const customersQ = useCustomers(1, 500);
  const ordersQ = useOrders(1, 500);

  const members = useMemo(() => {
    const spend = new Map<string, number>();
    for (const o of ordersQ.data?.items ?? []) {
      if (o.status !== "Completed" || !o.customer_id) continue;
      spend.set(o.customer_id, (spend.get(o.customer_id) ?? 0) + o.total);
    }
    return (customersQ.data?.items ?? [])
      .map((cu) => {
        const totalPurchases = spend.get(cu.id) ?? 0;
        const tier = tierFor(totalPurchases);
        return { id: cu.id, name: cu.name, totalPurchases, points: Math.round(totalPurchases / 100), tier };
      })
      .sort((a, b) => b.totalPurchases - a.totalPurchases);
  }, [customersQ.data, ordersQ.data]);

  const filtered = members.filter((c) => filter === "All" || c.tier === filter);

  const stats = [
    { label: "Total Members", value: members.length,                                       icon: Users,  color: COLOR },
    { label: "Gold",          value: members.filter((c) => c.tier === "Gold").length,       icon: Crown,  color: "#b45309" },
    { label: "Silver",        value: members.filter((c) => c.tier === "Silver").length,     icon: Star,   color: "#64748b" },
    { label: "Bronze",        value: members.filter((c) => c.tier === "Bronze").length,     icon: Award,  color: "#c2410c" },
  ];

  const loading = customersQ.isLoading || ordersQ.isLoading;

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
        {loading ? (
          <p className="p-6 text-sm text-muted">Loading members…</p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-sm text-muted">No members in this tier yet.</p>
        ) : (
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
        )}
      </div>
    </div>
  );
}
