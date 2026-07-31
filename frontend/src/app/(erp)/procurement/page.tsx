"use client";

import Link from "next/link";
import { ArrowRight, ClipboardList, RotateCcw, ShoppingBag, Truck, Users } from "lucide-react";
import { useAppConfig } from "@/lib/appConfig";

const RECENT_POS = [
  { id: "PO-1008", supplier: "Rwanda Supply Co", total: 1850000, status: "Received" },
  { id: "PO-1007", supplier: "Kigali Wholesalers", total: 1240000, status: "Received" },
  { id: "PO-1006", supplier: "East Africa Distributors", total: 890000, status: "Approved" },
  { id: "PO-1004", supplier: "Rwanda Supply Co", total: 640000, status: "Draft" },
];

const STATUS_STYLES: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-700",
  Approved: "bg-blue-50 text-blue-700",
  Received: "bg-emerald-100 text-emerald-700",
};

export default function ProcurementPage() {
  const { currencySymbol } = useAppConfig();
  const fmt = (v: number) => `${currencySymbol} ${v.toLocaleString()}`;

  const stats = [
    { label: "Pending orders", value: 2, sub: "awaiting delivery", icon: Truck, color: "#0284c7", href: "/procurement/orders" },
    { label: "Draft orders", value: 1, sub: "ready to approve", icon: ShoppingBag, color: "#64748b", href: "/procurement/orders" },
    { label: "Suppliers", value: 5, sub: "active accounts", icon: Users, color: "#4f46e5", href: "/procurement/suppliers" },
    { label: "Open requests", value: 2, sub: "awaiting approval", icon: ClipboardList, color: "#b45309", href: "/procurement/requests" },
  ];

  const quickLinks = [
    { label: "Purchase orders", desc: "Create and track orders", href: "/procurement/orders", icon: ShoppingBag, color: "#0284c7" },
    { label: "Suppliers", desc: "Manage supplier accounts", href: "/procurement/suppliers", icon: Users, color: "#4f46e5" },
    { label: "Requests", desc: "Approve team requisitions", href: "/procurement/requests", icon: ClipboardList, color: "#b45309" },
    { label: "Returns", desc: "Track returns and refunds", href: "/procurement/returns", icon: RotateCcw, color: "#0e7490" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Purchases</h1>
        <p className="text-sm text-muted mt-1">Order from suppliers, approve requests and track deliveries.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="bg-card border border-border p-4 relative overflow-hidden hover:border-accent/40 transition-colors">
            <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: s.color }} />
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 flex items-center justify-center" style={{ backgroundColor: `${s.color}15` }}>
                <s.icon size={15} style={{ color: s.color }} />
              </div>
            </div>
            <p className="text-xl font-extrabold text-foreground">{s.value}</p>
            <p className="text-[11px] text-muted mt-0.5">{s.label} · <span className="text-foreground/50">{s.sub}</span></p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {quickLinks.map((l) => (
          <Link key={l.label} href={l.href} className="bg-card border border-border p-4 flex items-center gap-3 hover:border-accent/40 hover:bg-surface/40 transition-colors">
            <div className="w-9 h-9 flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${l.color}15` }}>
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

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">Recent purchase orders</h2>
            <Link href="/procurement/orders" className="flex items-center gap-1 text-[12px] font-semibold text-accent">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {RECENT_POS.map((p) => (
              <div key={p.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-foreground">{p.supplier}</p>
                  <p className="text-[11px] text-muted">{p.id}</p>
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
        </div>

        <div className="bg-card border border-border">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-bold text-foreground">Top suppliers</h2>
          </div>
          <div className="divide-y divide-border">
            {[
              { name: "Rwanda Supply Co", orders: 18, color: "#4f46e5" },
              { name: "Nyabugogo Traders", orders: 25, color: "#0f766e" },
              { name: "Kigali Wholesalers", orders: 12, color: "#b45309" },
              { name: "Musanze Fresh Foods", orders: 9, color: "#059669" },
            ].map((s) => {
              const max = 25;
              return (
                <div key={s.name} className="px-5 py-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[13px] font-semibold text-foreground">{s.name}</p>
                    <p className="text-[11px] text-muted">{s.orders} orders</p>
                  </div>
                  <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(s.orders / max) * 100}%`, backgroundColor: s.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
