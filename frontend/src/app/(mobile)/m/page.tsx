"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeftRight, Bell, Boxes, Package, PackagePlus, ReceiptText,
  ShoppingBag, TrendingDown, TrendingUp, Truck, Users, Wallet,
} from "lucide-react";

import { useMobilePos } from "@/components/mobile/MobilePosProvider";
import { useAuth } from "@/lib/auth";
import { useProducts, useOrders } from "@/lib/api/hooks";
import { LOW_STOCK_THRESHOLD } from "@/components/pos/constants";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function isToday(d: string | null) {
  return d ? new Date(d).toDateString() === new Date().toDateString() : false;
}

export default function MobileHomePage() {
  const { user } = useAuth();
  const { currencySymbol, fmt } = useMobilePos();

  const productsQ = useProducts(1, 200);
  const ordersQ = useOrders(1, 500);

  const salesOrders = useMemo(
    () => (ordersQ.data?.items ?? []).filter((o) => o.status === "Completed"),
    [ordersQ.data],
  );
  const todaySales = useMemo(() => salesOrders.filter((o) => isToday(o.ordered_at ?? o.created_at)), [salesOrders]);
  const yesterdaySales = useMemo(() => {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const key = y.toDateString();
    return salesOrders.filter((o) => {
      const d = o.ordered_at ?? o.created_at;
      return d ? new Date(d).toDateString() === key : false;
    });
  }, [salesOrders]);

  const salesTotal = todaySales.reduce((sum, s) => sum + s.total, 0);
  const yesterdayTotal = yesterdaySales.reduce((sum, s) => sum + s.total, 0);
  const trendPct =
    yesterdayTotal > 0 ? Math.round(((salesTotal - yesterdayTotal) / yesterdayTotal) * 100) : null;

  const products = productsQ.data?.items ?? [];
  const lowStock = products.filter((p) => p.stock <= Math.max(p.min_stock, LOW_STOCK_THRESHOLD));

  const firstName = (user?.name ?? "there").split(" ")[0];
  const businessName = user?.tenantName ?? "OneGemmy";

  const tiles = [
    { href: "/m/purchase/new", label: "Purchases",  icon: ShoppingBag,    color: "#6366f1" },
    { href: "/m/inventory",    label: "Inventory",  icon: Boxes,          color: "#10b981" },
    { href: "/m/products/new", label: "Products",   icon: PackagePlus,    color: "#8b5cf6" },
    { href: "/m/customers",    label: "Customers",  icon: Users,          color: "#0ea5e9" },
    { href: "/m/suppliers",    label: "Suppliers",  icon: Truck,          color: "#f59e0b" },
    { href: "/m/expenses",     label: "Expenses",   icon: Wallet,         color: "#dc2626" },
  ];

  const alertCount = lowStock.length;

  return (
    <div className="min-h-full flex flex-col">
      {/* Header */}
      <header className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] text-muted font-medium">{greeting()}, {firstName}</p>
            <h1 className="text-[17px] font-bold text-foreground truncate">{businessName}</h1>
          </div>
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <Link
              href="/m/account/notifications"
              className="relative w-9 h-9 flex items-center justify-center border border-border rounded-xl text-muted"
              aria-label="Notifications"
            >
              <Bell size={17} />
              {alertCount > 0 && <span className="absolute top-1.5 right-1.5 min-w-[7px] h-[7px] rounded-full bg-red-500" />}
            </Link>
          </div>
        </div>
      </header>

      <div className="flex-1 px-4 space-y-3">
        {/* Business summary card */}
        <div className="relative overflow-hidden rounded-2xl bg-accent text-white px-4 py-3.5 shadow-lg shadow-accent/25">
          <div className="absolute -top-10 -right-10 w-36 h-36 rounded-full bg-white/10" aria-hidden />
          <div className="absolute -bottom-12 -right-4 w-28 h-28 rounded-full bg-white/10" aria-hidden />
          <div className="relative">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/80">
                Today&apos;s Sales
              </p>
              {trendPct === null ? (
                <span className="flex items-center gap-1 text-[10px] font-bold text-white/80">
                  <ReceiptText size={12} /> no sales yet
                </span>
              ) : trendPct >= 0 ? (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/15 text-[10px] font-bold">
                  <TrendingUp size={12} /> +{trendPct}%
                </span>
              ) : (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/15 text-[10px] font-bold">
                  <TrendingDown size={12} /> {trendPct}%
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[24px] leading-none font-extrabold font-mono tracking-tight">
              {currencySymbol} {fmt(salesTotal)}
            </p>
            <div className="mt-2.5 flex items-center gap-4 text-white/85">
              <span className="flex items-center gap-1.5 text-[11px] font-medium">
                <ArrowLeftRight size={13} /> {todaySales.length} transaction{todaySales.length !== 1 ? "s" : ""}
              </span>
              <span className="flex items-center gap-1.5 text-[11px] font-medium">
                <Package size={13} /> {products.length} products
              </span>
            </div>
          </div>
        </div>

        {/* Icon navigation grid */}
        <div className="grid grid-cols-4 gap-2">
          {tiles.map((t) => (
            <Link
              key={t.label}
              href={t.href}
              className="flex flex-col items-center gap-2 rounded-2xl py-2 active:scale-95 transition-transform"
            >
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm"
                style={{ backgroundColor: `${t.color}1A`, color: t.color }}
              >
                <t.icon size={26} strokeWidth={2} />
              </div>
              <span className="text-[11px] font-semibold text-foreground/80">{t.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
