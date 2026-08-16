"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Box, Home, Megaphone, Package, Plus, Receipt, ShoppingCart,
  Truck, Wallet, Wrench, Zap,
} from "lucide-react";

import { PageHeader } from "@/components/mobile/PageHeader";
import { useMobilePos } from "@/components/mobile/MobilePosProvider";
import { useExpenses } from "@/lib/api/hooks";
import { expenseCategories } from "@/lib/config";

const CATEGORY_ICONS: Record<string, typeof Receipt> = {
  Rent: Home,
  Utilities: Zap,
  Salaries: Receipt,
  Inventory: Package,
  "Inventory Purchase": Package,
  Transport: Truck,
  Marketing: Megaphone,
  Maintenance: Wrench,
  Packaging: Box,
  Supplies: ShoppingCart,
  Other: Receipt,
};

const CATEGORY_TONES: Record<string, string> = {
  Rent: "bg-amber-500/10 text-amber-600",
  Utilities: "bg-blue-500/10 text-blue-500",
  Salaries: "bg-purple-500/10 text-purple-500",
  Inventory: "bg-indigo-500/10 text-indigo-500",
  "Inventory Purchase": "bg-indigo-500/10 text-indigo-500",
  Transport: "bg-emerald-500/10 text-emerald-600",
  Marketing: "bg-orange-500/10 text-orange-600",
  Maintenance: "bg-red-500/10 text-red-500",
  Packaging: "bg-pink-500/10 text-pink-500",
  Supplies: "bg-cyan-500/10 text-cyan-600",
};

function isThisMonth(d: Date) {
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export default function MobileExpensesPage() {
  const { currencySymbol, fmt } = useMobilePos();
  const expensesQ = useExpenses();
  const [filter, setFilter] = useState("All");

  const expenses = useMemo(() => {
    const list = [...(expensesQ.data?.items ?? [])].sort(
      (a, b) => new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime(),
    );
    if (filter === "All") return list;
    return list.filter((e) => e.category === filter);
  }, [expensesQ.data, filter]);

  const monthTotal = (expensesQ.data?.items ?? [])
    .filter((e) => isThisMonth(new Date(`${e.expense_date}T00:00:00`)))
    .reduce((sum, e) => sum + e.amount, 0);

  const filteredTotal = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="min-h-full flex flex-col pb-6">
      <PageHeader
        title="Expenses"
        subtitle={`${expensesQ.data?.items?.length ?? 0} recorded`}
        action={
          <Link
            href="/expenses/new"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-accent text-white text-[12px] font-bold"
          >
            <Plus size={14} /> New
          </Link>
        }
      />

      <div className="flex-1 px-4 pt-4 space-y-4">
        {/* Month summary */}
        <div className="rounded-2xl bg-gradient-to-br from-red-500/15 via-red-500/5 to-transparent border border-red-500/20 p-4">
          <p className="text-[11px] text-muted font-semibold">This month&apos;s spending</p>
          <p className="text-[26px] font-bold text-foreground font-mono mt-1">
            {currencySymbol} {fmt(monthTotal)}
          </p>
          <p className="text-[10px] text-muted mt-1">All recorded expenses for the current month</p>
        </div>

        {/* Category chips */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {["All", ...expenseCategories].map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full border text-[11px] font-semibold transition-colors ${
                filter === c ? "bg-accent border-accent text-white" : "border-border text-muted bg-card"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {expensesQ.isLoading ? (
          <div className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : expenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Wallet size={28} className="text-muted/40 mb-2" />
            <p className="text-[13px] text-muted">
              {filter === "All" ? "No expenses recorded yet" : "No expenses in this category"}
            </p>
            <Link
              href="/expenses/new"
              className="mt-4 px-4 py-2.5 rounded-xl bg-accent text-white text-[12px] font-semibold"
            >
              Record your first expense
            </Link>
          </div>
        ) : (
          <>
            <p className="text-[10px] text-muted uppercase tracking-wider font-semibold px-1">
              {filter === "All" ? "All expenses" : filter} ·{" "}
              <span className="font-mono text-red-500">{currencySymbol} {fmt(filteredTotal)}</span>
            </p>
            <div className="bg-card border border-border rounded-2xl divide-y divide-border">
              {expenses.map((e) => {
                const Icon = CATEGORY_ICONS[e.category] ?? Receipt;
                const tone = CATEGORY_TONES[e.category] ?? "bg-surface text-muted";
                return (
                  <div key={e.id} className="flex items-center gap-3 px-4 py-3.5">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${tone}`}>
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-foreground truncate">{e.title}</p>
                      <p className="text-[10px] text-muted mt-0.5 truncate">
                        {new Date(`${e.expense_date}T00:00:00`).toLocaleDateString([], {
                          day: "numeric",
                          month: "short",
                        })}{" "}
                        · {e.category} · {e.status}
                      </p>
                    </div>
                    <span className="text-[14px] font-bold font-mono text-red-500 flex-shrink-0">
                      -{currencySymbol} {fmt(e.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
