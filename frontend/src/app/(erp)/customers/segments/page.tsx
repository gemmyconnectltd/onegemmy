"use client";
import { fmtMoney } from "@/lib/config";
import { useMemo, useState } from "react";
import { Users, TrendingUp, Clock, UserX } from "lucide-react";
import { useAppConfig } from "@/lib/appConfig";
import { useCustomers, useOrders } from "@/lib/api/hooks";

const COLOR = "#0f766e";

type Segment = "VIP" | "Regular" | "New" | "At Risk";

const SEGMENT_STYLE: Record<Segment, { bg: string; text: string; color: string }> = {
  VIP:      { bg: "bg-violet-100", text: "text-violet-700", color: "#7c3aed" },
  Regular:  { bg: "bg-emerald-100", text: "text-emerald-700", color: "#059669" },
  New:      { bg: "bg-blue-100",   text: "text-blue-700",   color: "#0284c7" },
  "At Risk":{ bg: "bg-red-100",    text: "text-red-600",    color: "#dc2626" },
};

const SEGMENT_ICONS: Record<Segment, React.ElementType> = {
  VIP: TrendingUp, Regular: Users, New: Clock, "At Risk": UserX,
};

function daysAgo(d: string | null): number | null {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return Math.floor((Date.now() - dt.getTime()) / 86_400_000);
}

function relTime(days: number): string {
  if (days <= 1) return "today";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

type Member = {
  id: string;
  name: string;
  totalPurchases: number;
  visits: number;
  lastSeenDays: number | null;
  segment: Segment;
};

export default function SegmentsPage() {
  const { currencySymbol } = useAppConfig();
  const fmt = (v: number) => fmtMoney(v, currencySymbol);
  const [active, setActive] = useState<Segment | "All">("All");

  const customersQ = useCustomers(1, 500);
  const ordersQ = useOrders(1, 500);

  const members = useMemo<Member[]>(() => {
    const byCustomer = new Map<string, { spent: number; count: number; lastAt: string | null }>();
    for (const o of ordersQ.data?.items ?? []) {
      if (o.status !== "Completed" || !o.customer_id) continue;
      const entry = byCustomer.get(o.customer_id) ?? { spent: 0, count: 0, lastAt: null };
      entry.spent += o.total;
      entry.count += 1;
      const at = o.ordered_at ?? o.created_at;
      if (at && (!entry.lastAt || new Date(at) > new Date(entry.lastAt))) entry.lastAt = at;
      byCustomer.set(o.customer_id, entry);
    }
    return (customersQ.data?.items ?? []).map((cu) => {
      const e = byCustomer.get(cu.id);
      const totalPurchases = e?.spent ?? 0;
      const visits = e?.count ?? 0;
      const lastSeenDays = e?.lastAt ? daysAgo(e.lastAt) : null;
      const createdDaysAgo = cu.created_at ? daysAgo(cu.created_at) : null;
      let segment: Segment;
      if (totalPurchases >= 100000 && visits >= 3) segment = "VIP";
      else if (visits >= 2) segment = "Regular";
      else if (createdDaysAgo !== null && createdDaysAgo <= 30) segment = "New";
      else if (visits > 0 && lastSeenDays !== null && lastSeenDays > 30) segment = "At Risk";
      else if (visits === 0) segment = "New";
      else segment = "Regular";
      return { id: cu.id, name: cu.name, totalPurchases, visits, lastSeenDays, segment };
    });
  }, [customersQ.data, ordersQ.data]);

  const filtered = members.filter((c) => active === "All" || c.segment === active);

  const segmentStats = (["VIP", "Regular", "New", "At Risk"] as Segment[]).map((s) => ({
    label: s, value: members.filter((c) => c.segment === s).length,
    icon: SEGMENT_ICONS[s], color: SEGMENT_STYLE[s].color,
  }));

  const loading = customersQ.isLoading || ordersQ.isLoading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">Segments</h1>
        <p className="text-sm text-muted mt-0.5">Group customers by behaviour and value</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {segmentStats.map((s) => (
          <div key={s.label} className="bg-card p-4 cursor-pointer"
            onClick={() => setActive(s.label as Segment)}>
            <div className="w-8 h-8 flex items-center justify-center mb-2" style={{ backgroundColor: `${s.color}10` }}>
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
        {loading ? (
          <p className="p-6 text-sm text-muted">Loading segments…</p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-sm text-muted">No customers match this segment yet.</p>
        ) : (
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
                    <td className="p-4 text-[13px] text-muted">{c.lastSeenDays !== null ? relTime(c.lastSeenDays) : "Never"}</td>
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
