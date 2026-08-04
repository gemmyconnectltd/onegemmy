"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowRight, Boxes, CheckCircle2, ChevronRight,
  PackagePlus, ShoppingBasket, Sun, Moon, TrendingUp, Truck, Users,
} from "lucide-react";

import { useMobilePos } from "@/components/mobile/MobilePosProvider";
import { useAuth } from "@/lib/auth";
import { useAppConfig } from "@/lib/appConfig";
import { getSales, getInvoices, subscribeSales } from "@/lib/invoices";
import { getPurchases, subscribePurchases } from "@/lib/purchases";
import { useProducts, useCustomers, useSuppliers } from "@/lib/api/hooks";
import { LOW_STOCK_THRESHOLD } from "@/components/pos/constants";
import type { SaleResult } from "@/components/pos/types";
import type { PurchaseResult } from "@/lib/purchases";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function MobileHomePage() {
  const { theme, setTheme } = useAppConfig();
  const { user } = useAuth();
  const { currencySymbol, fmt } = useMobilePos();
  const [sales, setSales] = useState<SaleResult[]>(() => getSales());
  const [purchases, setPurchases] = useState<PurchaseResult[]>(() => getPurchases());

  useEffect(() => subscribeSales(() => setSales(getSales())), []);
  useEffect(() => subscribePurchases(() => setPurchases(getPurchases())), []);

  const productsQ = useProducts(1, 200);
  const customersQ = useCustomers(1, 200);
  const suppliersQ = useSuppliers();

  const costMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of productsQ.data?.items ?? []) map.set(p.id, p.cost);
    return map;
  }, [productsQ.data]);

  const todaySales = useMemo(
    () => sales.filter((s) => new Date(s.timestamp).toDateString() === new Date().toDateString()),
    [sales],
  );

  const salesToday = todaySales.reduce((sum, s) => sum + s.total, 0);
  const profitToday = todaySales.reduce((sum, s) => {
    let profit = 0;
    for (const item of s.items) {
      const cost = item.product_id ? costMap.get(item.product_id) : undefined;
      if (cost !== undefined) profit += (item.price - cost) * item.qty - item.discount;
    }
    return sum + profit;
  }, 0);
  const cashToday = todaySales.filter((s) => s.payment === "cash").reduce((sum, s) => sum + s.total, 0);

  const lowStock = useMemo(
    () =>
      (productsQ.data?.items ?? []).filter((p) => p.stock <= Math.max(p.min_stock, LOW_STOCK_THRESHOLD)),
    [productsQ.data],
  );

  const unpaidInvoices = useMemo(() => getInvoices().filter((s) => !s.paid).length, []);

  const activity = useMemo(() => {
    const rows: { kind: "sale" | "purchase"; label: string; time: string; amount: number }[] = [
      ...sales.map((s) => ({
        kind: "sale" as const,
        label: s.isInvoice ? s.invoiceNumber! : s.orderId,
        time: new Date(s.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        amount: s.total,
      })),
      ...purchases.map((p) => ({
        kind: "purchase" as const,
        label: p.id,
        time: new Date(p.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        amount: p.total,
      })),
    ];
    return rows
      .sort((a, b) => b.time.localeCompare(a.time))
      .slice(0, 6);
  }, [sales, purchases]);

  const firstName = (user?.name ?? "there").split(" ")[0];

  const quickActions = [
    { href: "/m/pos", label: "New Sale", desc: "Sell items", icon: ShoppingBasket },
    { href: "/m/purchase/new", label: "New Purchase", desc: "Buy stock", icon: Truck },
    { href: "/m/restock", label: "Receive Stock", desc: "Stock in", icon: PackagePlus },
    { href: "/m/products/new", label: "Add Product", desc: "New item", icon: Boxes },
  ];

  const summary = [
    { href: "/m/inventory", label: "Products", value: productsQ.data?.items?.length ?? 0, icon: Boxes },
    { href: "/m/customers", label: "Customers", value: customersQ.data?.items?.length ?? 0, icon: Users },
    { href: "/m/suppliers", label: "Suppliers", value: suppliersQ.data?.items?.length ?? 0, icon: Truck },
    { href: "/m/restock", label: "Low Stock", value: lowStock.length, icon: AlertTriangle, warn: true },
  ];

  return (
    <div className="min-h-full flex flex-col pb-6">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur border-b border-border px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] text-muted">{greeting()},</p>
            <h1 className="text-[17px] font-bold text-foreground">{firstName}</h1>
            <p className="text-[11px] text-muted mt-0.5 truncate">{user?.tenantName ?? "OneGemmy"}</p>
          </div>
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="w-9 h-9 flex items-center justify-center border border-border rounded-xl text-muted"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>

      <div className="flex-1 px-4 pt-4 space-y-5">
        {/* Today's KPIs */}
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { label: "Today's Sales", value: salesToday, icon: TrendingUp, accent: true },
            { label: "Today's Profit", value: profitToday, icon: TrendingUp },
            { label: "Cash Received", value: cashToday, icon: ShoppingBasket },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-card border border-border rounded-2xl px-3 py-3">
              <p className="text-[10px] text-muted font-medium leading-tight">{kpi.label}</p>
              <p className={`text-[15px] font-bold font-mono mt-1.5 leading-none ${kpi.accent ? "text-accent" : "text-foreground"}`}>
                {fmt(kpi.value)}
              </p>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div>
          <p className="text-[10px] text-muted uppercase tracking-wider font-semibold mb-2 px-1">Quick Actions</p>
          <div className="grid grid-cols-2 gap-2.5">
            {quickActions.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="flex items-center gap-3 px-4 py-4 bg-card border border-border rounded-2xl active:bg-surface transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent flex-shrink-0">
                  <a.icon size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] font-bold text-foreground leading-tight">{a.label}</p>
                  <p className="text-[10px] text-muted mt-0.5 truncate">{a.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Business Summary */}
        <div>
          <p className="text-[10px] text-muted uppercase tracking-wider font-semibold mb-2 px-1">Business Summary</p>
          <div className="grid grid-cols-2 gap-2.5">
            {summary.map((s) => (
              <Link
                key={s.label}
                href={s.href}
                className="flex items-center gap-3 px-4 py-4 bg-card border border-border rounded-2xl active:bg-surface transition-colors"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${s.warn ? "bg-amber-500/10 text-amber-500" : "bg-surface text-accent"}`}>
                  <s.icon size={18} />
                </div>
                <div className="min-w-0">
                  <p className={`text-[18px] font-bold font-mono leading-none ${s.warn ? "text-amber-500" : "text-foreground"}`}>
                    {s.value}
                  </p>
                  <p className="text-[10px] text-muted mt-1">{s.label}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-[10px] text-muted uppercase tracking-wider font-semibold">Recent Activity</p>
            <Link href="/m/transactions" className="flex items-center gap-0.5 text-[11px] font-semibold text-accent">
              View all <ChevronRight size={12} />
            </Link>
          </div>
          <div className="bg-card border border-border rounded-2xl divide-y divide-border">
            {activity.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12px] text-muted">No activity yet. Start with a new sale.</p>
            ) : (
              activity.map((row, i) => (
                <Link
                  key={`${row.kind}-${row.label}-${i}`}
                  href={row.kind === "sale" ? `/m/sales/${encodeURIComponent(row.label)}` : "/m/transactions"}
                  className="flex items-center justify-between px-4 py-3 active:bg-surface transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center text-accent flex-shrink-0">
                      {row.kind === "sale" ? <CheckCircle2 size={15} /> : <Truck size={15} />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-foreground truncate">
                        {row.kind === "sale" ? "Sale" : "Purchase"} {row.label}
                      </p>
                      <p className="text-[10px] text-muted">{row.time}</p>
                    </div>
                  </div>
                  <span className="text-[12px] font-bold font-mono text-foreground flex-shrink-0">
                    {currencySymbol} {fmt(row.amount)}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Analytics */}
        <Link
          href="/m/stats"
          className="flex items-center justify-between px-4 py-4 rounded-2xl bg-accent text-white shadow-lg shadow-accent/25 active:scale-[0.98] transition"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <TrendingUp size={18} />
            </div>
            <div>
              <p className="text-[13px] font-bold">Analytics</p>
              <p className="text-[11px] text-white/70">Revenue, top products & customers</p>
            </div>
          </div>
          <ArrowRight size={18} />
        </Link>

        {/* Alerts */}
        {(lowStock.length > 0 || unpaidInvoices > 0) && (
          <div>
            <p className="text-[10px] text-muted uppercase tracking-wider font-semibold mb-2 px-1">Alerts</p>
            <div className="space-y-2">
              {lowStock.length > 0 && (
                <Link href="/m/restock" className="flex items-start gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl">
                  <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-foreground">
                      {lowStock.length} low stock {lowStock.length === 1 ? "item" : "items"}
                    </p>
                    <p className="text-[10px] text-muted mt-0.5 truncate">
                      {lowStock.slice(0, 3).map((p) => p.name).join(", ")}
                      {lowStock.length > 3 ? ` +${lowStock.length - 3} more` : ""}
                    </p>
                  </div>
                </Link>
              )}
              {unpaidInvoices > 0 && (
                <Link href="/m/sales" className="flex items-start gap-3 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-2xl">
                  <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-foreground">
                      {unpaidInvoices} unpaid {unpaidInvoices === 1 ? "invoice" : "invoices"}
                    </p>
                    <p className="text-[10px] text-muted mt-0.5">Awaiting payment from customers</p>
                  </div>
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
