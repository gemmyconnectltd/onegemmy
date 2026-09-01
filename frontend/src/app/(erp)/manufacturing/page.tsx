"use client";
import { useAppConfig } from "@/lib/appConfig";
import Link from "next/link";
import {
  Factory, Layers, CheckCircle2, Boxes, ClipboardList, Package,
  BarChart2, ArrowRight, Calendar, Plus,
} from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { useProductionOrders, useBoms } from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";

const statusBadge: Record<string, string> = {
  "Draft": "bg-surface text-muted border border-border",
  "Scheduled": "bg-blue-100 text-blue-700",
  "In Progress": "bg-amber-100 text-amber-700",
  "Completed": "bg-emerald-100 text-emerald-700",
  "Cancelled": "bg-red-100 text-red-600",
};

const QUICK_LINKS = [
  { href: "/manufacturing/work-orders", label: "Work Orders", desc: "Create and track production", icon: ClipboardList },
  { href: "/manufacturing/bom", label: "Bill of Materials", desc: "Reusable component recipes", icon: Layers },
  { href: "/manufacturing/materials", label: "Materials", desc: "What your production consumes", icon: Package },
  { href: "/manufacturing/analytics", label: "Analytics", desc: "Output and completion trends", icon: BarChart2 },
];

export default function ManufacturingPage() {
  const { brandColor } = useAppConfig();
  const COLOR = brandColor;
  const ordersQ = useProductionOrders(1, 500);
  const bomsQ = useBoms(1, 500);
  const loading = ordersQ.isLoading || bomsQ.isLoading;
  const orders = ordersQ.data?.items ?? [];
  const boms = bomsQ.data?.items ?? [];

  const completedOrders = orders.filter((o) => o.status === "Completed");
  const unitsProduced = completedOrders.reduce((s, o) => s + o.quantity, 0);
  const inProgress = orders.filter((o) => o.status === "In Progress" || o.status === "Scheduled").length;

  const stats = [
    { label: "Work Orders", value: orders.length, icon: Factory, color: COLOR },
    { label: "In Progress", value: inProgress, icon: Layers, color: "#0284c7" },
    { label: "Completed", value: completedOrders.length, icon: CheckCircle2, color: "#10b981" },
    { label: "Units Produced", value: unitsProduced, icon: Boxes, color: "#b45309" },
  ];

  const recent = [...orders]
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Manufacturing</h1>
          <p className="text-sm text-muted mt-0.5">
            {loading ? "Loading..." : `${orders.length} work orders · ${boms.length} bills of materials`}
          </p>
        </div>
        <Link href="/manufacturing/work-orders">
          <Button color={COLOR}><Plus size={15} /> New Work Order</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <div className="w-8 h-8 flex items-center justify-center rounded-xl mb-2" style={{ backgroundColor: `${s.color}15` }}>
              <s.icon size={16} style={{ color: s.color }} />
            </div>
            <p className="text-xl font-extrabold text-foreground tracking-tight">{loading ? "—" : s.value}</p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {QUICK_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="group bg-card border border-border rounded-xl p-4 hover:border-accent transition-colors"
          >
            <div className="w-8 h-8 flex items-center justify-center rounded-xl mb-3 bg-accent/10">
              <l.icon size={16} className="text-accent" />
            </div>
            <p className="text-[13px] font-semibold text-foreground flex items-center gap-1">
              {l.label}
              <ArrowRight size={12} className="text-muted group-hover:translate-x-0.5 group-hover:text-accent transition-all" />
            </p>
            <p className="text-[11px] text-muted mt-0.5">{l.desc}</p>
          </Link>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="text-[13px] font-semibold text-foreground">Recent Work Orders</p>
          <Link href="/manufacturing/work-orders" className="text-[12px] font-semibold text-accent hover:underline">
            View all
          </Link>
        </div>
        {loading ? (
          <PageLoader variant="compact" />
        ) : recent.length === 0 ? (
          <div className="py-16 text-center">
            <Factory size={28} className="text-border mx-auto mb-3" />
            <p className="text-sm font-semibold text-muted">No work orders yet</p>
            <Link href="/manufacturing/work-orders" className="text-[12px] font-semibold text-accent hover:underline mt-2 inline-block">
              Create your first work order
            </Link>
          </div>
        ) : (
          <table className="w-full">
            <tbody className="divide-y divide-border">
              {recent.map((o) => (
                <tr key={o.id} className="hover:bg-surface/50 transition-colors">
                  <td className="px-4 py-3 text-sm font-bold text-foreground whitespace-nowrap">{o.order_number}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Package size={13} className="text-muted" />
                      <span className="text-sm font-medium text-foreground">{o.product_name ?? "—"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-foreground tabular-nums">{o.quantity}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-sm text-muted whitespace-nowrap">
                      <Calendar size={12} /> {o.scheduled_date ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`inline-block text-[11px] font-semibold px-2.5 py-1 rounded-full ${statusBadge[o.status] ?? "bg-surface text-muted"}`}>
                      {o.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
