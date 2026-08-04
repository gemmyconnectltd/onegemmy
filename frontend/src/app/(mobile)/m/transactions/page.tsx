"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ReceiptText, Search, Truck, Wallet, X } from "lucide-react";

import { useMobilePos } from "@/components/mobile/MobilePosProvider";
import { getSales, subscribeSales } from "@/lib/invoices";
import { getPurchases, subscribePurchases, type PurchaseResult } from "@/lib/purchases";
import { useExpenses, usePurchaseOrders, type FinanceExpense } from "@/lib/api/hooks";
import { PeriodSelector, inPeriod, type PeriodKey } from "@/components/mobile/PeriodSelector";
import type { SaleResult } from "@/components/pos/types";

type TxKind = "all" | "sale" | "purchase" | "expense";

type PurchaseDetail = {
  items: { product_id: string; name: string; qty: number; unit_cost: number }[];
  supplierName: string;
  date: Date;
  total: number;
};

type TxRow = {
  kind: "sale" | "purchase" | "expense";
  key: string;
  title: string;
  subtitle: string;
  date: Date;
  amount: number;
  saleId?: string;
  purchase?: PurchaseDetail;
  expense?: FinanceExpense;
};

const CATEGORIES: { key: TxKind; label: string }[] = [
  { key: "all", label: "All" },
  { key: "sale", label: "Sales" },
  { key: "purchase", label: "Purchases" },
  { key: "expense", label: "Expenses" },
];

export default function MobileTransactionsPage() {
  const { currencySymbol, fmt } = useMobilePos();
  const [sales, setSales] = useState<SaleResult[]>(() => getSales());
  const [purchases, setPurchases] = useState<PurchaseResult[]>(() => getPurchases());
  const expensesQ = useExpenses();
  const serverPurchasesQ = usePurchaseOrders();
  const [period, setPeriod] = useState<PeriodKey>("today");
  const [category, setCategory] = useState<TxKind>("all");
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<TxRow | null>(null);

  useEffect(() => subscribeSales(() => setSales(getSales())), []);
  useEffect(() => subscribePurchases(() => setPurchases(getPurchases())), []);

  const rows = useMemo<TxRow[]>(() => {
    const expenses = expensesQ.data?.items ?? [];
    const saleRows: TxRow[] = sales.map((s) => ({
      kind: "sale",
      key: `sale-${s.orderId}`,
      title: s.isInvoice ? s.invoiceNumber! : s.orderId,
      subtitle: `${s.items.reduce((n, i) => n + i.qty, 0)} items · ${
        s.payment === "mobile" ? "mobile money" : s.payment
      }${s.customerName ? ` · ${s.customerName}` : ""}`,
      date: new Date(s.timestamp),
      amount: s.total,
      saleId: s.orderId,
    }));

    const serverPurchases = serverPurchasesQ.data?.items ?? [];
    const serverIds = new Set(serverPurchases.map((p) => p.reference));
    const localExtra = purchases.filter((p) => !serverIds.has(p.id));

    const serverPurchaseRows: TxRow[] = serverPurchases.map((p) => ({
      kind: "purchase",
      key: `purchase-${p.id}`,
      title: p.reference,
      subtitle: `${p.items.reduce((n, i) => n + i.quantity, 0)} items · ${p.supplier?.name || "No supplier"}`,
      date: new Date(p.created_at ?? 0),
      amount: p.total,
      purchase: {
        items: p.items.map((i) => ({
          product_id: i.product_id ?? i.id,
          name: i.product_name,
          qty: i.quantity,
          unit_cost: i.unit_cost,
        })),
        supplierName: p.supplier?.name || "No supplier",
        date: new Date(p.created_at ?? 0),
        total: p.total,
      },
    }));

    const localPurchaseRows: TxRow[] = localExtra.map((p) => ({
      kind: "purchase",
      key: `purchase-${p.id}`,
      title: p.id,
      subtitle: `${p.items.reduce((n, i) => n + i.qty, 0)} items · ${p.supplierName || "No supplier"}`,
      date: new Date(p.timestamp),
      amount: p.total,
      purchase: {
        items: p.items.map((i) => ({ product_id: i.product_id, name: i.name, qty: i.qty, unit_cost: i.unit_cost })),
        supplierName: p.supplierName || "No supplier",
        date: new Date(p.timestamp),
        total: p.total,
      },
    }));

    const expenseRows: TxRow[] = expenses.map((e) => ({
      kind: "expense",
      key: `expense-${e.id}`,
      title: e.title,
      subtitle: `${e.category} · ${e.status}`,
      date: new Date(`${e.expense_date}T00:00:00`),
      amount: e.amount,
      expense: e,
    }));
    return [...saleRows, ...serverPurchaseRows, ...localPurchaseRows, ...expenseRows].sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [sales, purchases, expensesQ.data, serverPurchasesQ.data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (!inPeriod(r.date, period)) return false;
      if (category !== "all" && r.kind !== category) return false;
      if (q && !`${r.title} ${r.subtitle}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, period, category, query]);

  const total = filtered.reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="min-h-full flex flex-col pb-6">
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur border-b border-border px-4 py-3">
        <h1 className="text-[15px] font-bold text-foreground">Transactions</h1>
        <p className="text-[11px] text-muted mt-0.5">
          {filtered.length} transaction{filtered.length !== 1 ? "s" : ""} ·{" "}
          <span className="font-mono text-accent font-semibold">{currencySymbol} {fmt(total)}</span>
        </p>
      </header>

      <div className="flex-1 px-3 pt-3 space-y-3">
        <PeriodSelector value={period} onChange={setPeriod} />

        {/* Search */}
        <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-3">
          <Search size={15} className="text-muted flex-shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search transactions"
            className="w-full bg-transparent py-2.5 text-[13px] text-foreground placeholder:text-muted outline-none"
          />
        </div>

        {/* Category chips */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-colors ${
                category === c.key ? "bg-accent text-white" : "bg-card border border-border text-muted"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Wallet size={28} className="text-muted/40 mb-2" />
            <p className="text-[13px] text-muted">No transactions found</p>
            <Link href="/m/pos" className="mt-4 px-4 py-2.5 rounded-xl bg-accent text-white text-[12px] font-semibold">
              Make a sale
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((row) => {
              const content = (
                <>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-surface flex items-center justify-center flex-shrink-0">
                      {row.kind === "sale" && <ReceiptText size={16} className="text-accent" />}
                      {row.kind === "purchase" && <Truck size={16} className="text-accent" />}
                      {row.kind === "expense" && <Wallet size={16} className="text-red-500" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-foreground truncate">{row.title}</p>
                      <p className="text-[10px] text-muted mt-0.5 truncate">
                        {row.date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {row.subtitle}
                      </p>
                    </div>
                  </div>
                  <span className={`text-[14px] font-bold font-mono flex-shrink-0 ${
                    row.kind === "expense" ? "text-red-500" : "text-foreground"
                  }`}>
                    {row.kind === "expense" ? "-" : ""}{currencySymbol} {fmt(row.amount)}
                  </span>
                </>
              );

              const cls = "flex items-center justify-between bg-card border border-border rounded-xl px-3.5 py-3 active:bg-surface transition-colors";

              return row.kind === "sale" && row.saleId ? (
                <Link key={row.key} href={`/m/sales/${encodeURIComponent(row.saleId)}`} className={cls}>
                  {content}
                </Link>
              ) : (
                <button key={row.key} onClick={() => setDetail(row)} className={`${cls} w-full text-left`}>
                  {content}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDetail(null)} />
          <div className="relative w-full max-w-[430px] bg-card rounded-t-2xl p-5 pb-8 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted uppercase tracking-wider font-semibold capitalize">{detail.kind}</p>
                <p className="text-[15px] font-bold text-foreground mt-0.5">{detail.title}</p>
              </div>
              <button
                onClick={() => setDetail(null)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface text-muted"
                aria-label="Close"
              >
                <X size={15} />
              </button>
            </div>

            {detail.kind === "purchase" && detail.purchase && (
              <>
                <div className="space-y-2">
                  {detail.purchase.items.map((item) => (
                    <div key={item.product_id} className="flex items-center justify-between py-1">
                      <div className="min-w-0">
                        <p className="text-[12px] font-medium text-foreground truncate">{item.name}</p>
                        <p className="text-[10px] text-muted">
                          {item.qty} × {currencySymbol} {fmt(item.unit_cost)}
                        </p>
                      </div>
                      <span className="text-[12px] font-semibold font-mono">
                        {currencySymbol} {fmt(item.qty * item.unit_cost)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="text-[12px] text-muted font-medium">
                    {detail.purchase.supplierName} ·{" "}
                    {detail.purchase.date.toLocaleString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="text-[15px] font-bold font-mono text-foreground">
                    {currencySymbol} {fmt(detail.purchase.total)}
                  </span>
                </div>
              </>
            )}

            {detail.kind === "expense" && detail.expense && (
              <div className="space-y-2.5">
                {[
                  ["Category", detail.expense.category],
                  ["Status", detail.expense.status],
                  ["Date", detail.expense.expense_date],
                  ["Reference", detail.expense.reference],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-[11px] text-muted">{label}</span>
                    <span className="text-[12px] font-semibold text-foreground">{value}</span>
                  </div>
                ))}
                {detail.expense.account && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted">Account</span>
                    <span className="text-[12px] font-semibold text-foreground">{detail.expense.account.name}</span>
                  </div>
                )}
                {detail.expense.notes && (
                  <p className="text-[12px] text-muted bg-surface rounded-xl px-3 py-2">{detail.expense.notes}</p>
                )}
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="text-[12px] text-muted font-medium">Total</span>
                  <span className="text-[15px] font-bold font-mono text-red-500">
                    -{currencySymbol} {fmt(detail.expense.amount)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
