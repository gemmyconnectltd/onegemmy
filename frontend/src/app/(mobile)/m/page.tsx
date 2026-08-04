"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftRight, Bell, Package, ReceiptText, TrendingDown, TrendingUp,
} from "lucide-react";

import { useMobilePos } from "@/components/mobile/MobilePosProvider";
import { useAuth } from "@/lib/auth";
import { getSales, subscribeSales } from "@/lib/invoices";
import { useProducts, useCustomers, useSuppliers, useExpenses, usePurchaseOrders } from "@/lib/api/hooks";
import { LOW_STOCK_THRESHOLD } from "@/components/pos/constants";
import type { SaleResult } from "@/components/pos/types";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function isToday(d: Date) {
  return d.toDateString() === new Date().toDateString();
}

function isThisMonth(d: Date) {
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export default function MobileHomePage() {
  const { user } = useAuth();
  const { currencySymbol, fmt } = useMobilePos();
  const [sales, setSales] = useState<SaleResult[]>(() => getSales());

  useEffect(() => subscribeSales(() => setSales(getSales())), []);

  const productsQ = useProducts(1, 200);
  const customersQ = useCustomers(1, 200);
  const suppliersQ = useSuppliers();
  const expensesQ = useExpenses();
  const purchasesQ = usePurchaseOrders();

  const todaySales = useMemo(() => sales.filter((s) => isToday(new Date(s.timestamp))), [sales]);
  const yesterdaySales = useMemo(() => {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const key = y.toDateString();
    return sales.filter((s) => new Date(s.timestamp).toDateString() === key);
  }, [sales]);

  const salesTotal = todaySales.reduce((sum, s) => sum + s.total, 0);
  const yesterdayTotal = yesterdaySales.reduce((sum, s) => sum + s.total, 0);
  const trendPct =
    yesterdayTotal > 0 ? Math.round(((salesTotal - yesterdayTotal) / yesterdayTotal) * 100) : null;

  const monthPurchases = (purchasesQ.data?.items ?? []).filter((p) =>
    isThisMonth(new Date(p.created_at ?? 0)),
  );
  const monthExpenses = (expensesQ.data?.items ?? []).filter((e) =>
    isThisMonth(new Date(`${e.expense_date}T00:00:00`)),
  );

  const products = productsQ.data?.items ?? [];
  const totalStockUnits = products.reduce((sum, p) => sum + p.stock, 0);
  const lowStock = products.filter((p) => p.stock <= Math.max(p.min_stock, LOW_STOCK_THRESHOLD));

  const firstName = (user?.name ?? "there").split(" ")[0];
  const businessName = user?.tenantName ?? "OneGemmy";
  const avatarInitial = (firstName[0] ?? "?").toUpperCase();

  const tiles = [
    {
      href: "/m/pos",
      label: "Sales",
      stat: `${todaySales.length} today`,
      sub: `${currencySymbol} ${fmt(salesTotal)}`,
      bg: "bg-rose-500",
    },
    {
      href: "/m/purchase/new",
      label: "Purchases",
      stat: `${monthPurchases.length} this mo`,
      sub: `${currencySymbol} ${fmt(monthPurchases.reduce((s, p) => s + p.total, 0))}`,
      bg: "bg-indigo-500",
    },
    {
      href: "/m/inventory",
      label: "Inventory",
      stat: `${totalStockUnits.toLocaleString()} units`,
      sub: `${lowStock.length} low stock`,
      bg: "bg-emerald-500",
    },
    {
      href: "/m/products/new",
      label: "Products",
      stat: `${products.length}`,
      sub: "in catalog",
      bg: "bg-violet-500",
    },
    {
      href: "/m/customers",
      label: "Customers",
      stat: `${customersQ.data?.items?.length ?? 0}`,
      sub: "registered",
      bg: "bg-sky-500",
    },
    {
      href: "/m/suppliers",
      label: "Suppliers",
      stat: `${suppliersQ.data?.items?.length ?? 0}`,
      sub: "active",
      bg: "bg-amber-500",
    },
    {
      href: "/m/expenses",
      label: "Expenses",
      stat: `${currencySymbol} ${fmt(monthExpenses.reduce((s, e) => s + e.amount, 0))}`,
      sub: `${monthExpenses.length} this mo`,
      bg: "bg-red-600",
    },
    {
      href: "/m/stats",
      label: "Reports",
      stat: "View all",
      sub: "analytics",
      bg: "bg-cyan-500",
    },
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
            <Link
              href="/m/account"
              className="w-9 h-9 rounded-full bg-accent text-white flex items-center justify-center text-[13px] font-bold"
              aria-label="Account"
            >
              {avatarInitial}
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

        {/* 8-tile navigation grid */}
        <div className="grid grid-cols-2 gap-2">
          {tiles.map((t) => (
            <Link
              key={t.label}
              href={t.href}
              className={`aspect-square flex flex-col justify-between p-2.5 shadow-sm active:opacity-80 transition-opacity ${t.bg}`}
            >
              <p className="text-[10px] font-bold uppercase tracking-wide text-white/90">{t.label}</p>
              <div className="min-w-0">
                <p className="text-[14px] font-bold font-mono text-white leading-tight truncate">{t.stat}</p>
                <p className="text-[9px] text-white/70 mt-0.5 truncate">{t.sub}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
