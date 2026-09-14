"use client";
import { fmtMoney } from "@/lib/config";
import Link from "next/link";
import { ArrowRight, ClipboardList, Plus, RotateCcw, ShoppingBag, Truck, Users, Wallet } from "lucide-react";
import { useAppConfig } from "@/lib/appConfig";
import { chartPalette } from "@/lib/chartColors";
import { usePurchaseOrders, useSuppliers } from "@/lib/api/hooks";
import { BreakdownCard, breakdownColors, groupSum } from "@/components/charts/BreakdownCard";
import { PageLoader } from "@/components/ui/PageLoader";

const STATUS_STYLES: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-700",
  Approved: "bg-blue-50 text-blue-700",
  Received: "bg-emerald-100 text-emerald-700",
  Cancelled: "bg-red-50 text-red-600",
};

export default function ProcurementPage() {
  const { currencySymbol, brandColor, theme } = useAppConfig();
  const c = chartPalette(theme === "dark");
  const fmt = (v: number) => fmtMoney(v, currencySymbol);

  const poQ = usePurchaseOrders(undefined, 1, 200);
  const suppliersQ = useSuppliers();
  const orders = poQ.data?.items ?? [];
  const suppliers = suppliersQ.data?.items ?? [];

  const pending = orders.filter((o) => o.status === "Approved").length;
  const drafts = orders.filter((o) => o.status === "Draft").length;
  const totalSpend = orders.reduce((s, o) => s + o.total, 0);
  const spendBySupplier = groupSum(orders, (o) => o.supplier?.name ?? "Unknown supplier", (o) => o.total);
  const recentOrders = [...orders].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")).slice(0, 5);

  const stats = [
    { label: "Pending orders", value: String(pending), icon: Truck, color: "#0284c7", href: "/procurement/orders" },
    { label: "Draft orders", value: String(drafts), icon: ShoppingBag, color: "#64748b", href: "/procurement/orders" },
    { label: "Suppliers", value: String(suppliers.length), icon: Users, color: "#4f46e5", href: "/procurement/suppliers" },
    { label: "Total spend", value: fmt(totalSpend), icon: Wallet, color: brandColor, href: "/procurement/orders" },
  ];

  const quickLinks = [
    { label: "Purchase orders", desc: "Create and track orders", href: "/procurement/orders", icon: ShoppingBag, color: "#0284c7" },
    { label: "Suppliers", desc: "Manage supplier accounts", href: "/procurement/suppliers", icon: Users, color: "#4f46e5" },
    { label: "Requests", desc: "Approve team requisitions", href: "/procurement/requests", icon: ClipboardList, color: "#b45309" },
    { label: "Returns", desc: "Track returns and refunds", href: "/procurement/returns", icon: RotateCcw, color: brandColor },
  ];

  if (poQ.isLoading) return <PageLoader />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Purchases</h1>
          <p className="text-sm text-muted mt-1">Order from suppliers, approve requests and track deliveries.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/procurement/requests" className="flex items-center gap-2 border border-border px-4 py-2 text-sm font-medium hover:bg-surface transition-colors rounded-lg">
            <Plus size={16} />New Request
          </Link>
          <Link href="/procurement/orders" className="flex items-center gap-2 text-white px-4 py-2 text-sm font-medium rounded-lg" style={{ backgroundColor: brandColor }}>
            <Plus size={16} />New Purchase Order
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="bg-card border border-border rounded-xl p-4 hover:border-accent/40 transition-colors">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2" style={{ backgroundColor: `${s.color}10` }}>
              <s.icon size={16} style={{ color: s.color }} />
            </div>
            <p className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight truncate" title={s.value}>{s.value}</p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{s.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {quickLinks.map((l) => (
          <Link key={l.label} href={l.href} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3 hover:border-accent/40 hover:bg-surface/40 transition-colors">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${l.color}15` }}>
              <l.icon size={16} style={{ color: l.color }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-foreground">{l.label}</p>
              <p className="text-[11px] text-muted truncate">{l.desc}</p>
            </div>
            <ArrowRight size={14} className="text-muted flex-shrink-0" />
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <BreakdownCard
          title="Spend by Supplier"
          sub="Purchase orders · all time"
          icon={Wallet}
          data={spendBySupplier}
          colors={breakdownColors(c)}
          tooltipStyle={c.tooltip}
          empty="No purchase orders yet"
        />
        <div className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">Recent purchase orders</h2>
            <Link href="/procurement/orders" className="flex items-center gap-1 text-[12px] font-semibold text-accent">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <p className="text-sm text-muted py-10 text-center">No purchase orders yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {recentOrders.map((p) => (
                <div key={p.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-foreground">{p.supplier?.name ?? "Unknown supplier"}</p>
                    <p className="text-[11px] text-muted">{p.reference}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-[13px] font-bold text-foreground tabular-nums">{fmt(p.total)}</span>
                    <span className={`inline-flex items-center text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS_STYLES[p.status] ?? ""}`}>
                      {p.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
