"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowDownToLine, Banknote, PackagePlus, ReceiptText, RefreshCcw,
  Search, Truck, Wallet, X,
} from "lucide-react";

import { useMobilePos } from "@/components/mobile/MobilePosProvider";
import { getSales, subscribeSales } from "@/lib/invoices";
import { getPurchases, subscribePurchases, type PurchaseResult } from "@/lib/purchases";
import {
  getStockMovements, subscribeStockMovements, type StockMovement,
} from "@/lib/stockMovements";
import { useExpenses, usePurchaseOrders, useReturns, useTransactions, type FinanceExpense } from "@/lib/api/hooks";
import type { FinanceTransaction } from "@/lib/api/finance";
import type { ApiReturn } from "@/lib/api/sales";
import { PeriodSelector, inPeriod, type PeriodKey } from "@/components/mobile/PeriodSelector";
import type { SaleResult } from "@/components/pos/types";

type TxKind = "all" | "sale" | "purchase" | "expense" | "payment" | "return" | "movement";

type PurchaseDetail = {
  items: { product_id: string; name: string; qty: number; unit_cost: number }[];
  supplierName: string;
  date: Date;
  total: number;
};

type TxRow = {
  kind: Exclude<TxKind, "all">;
  key: string;
  title: string;
  subtitle: string;
  date: Date;
  amount: number;
  saleId?: string;
  purchase?: PurchaseDetail;
  expense?: FinanceExpense;
  payment?: FinanceTransaction;
  returnRecord?: ApiReturn;
  movement?: StockMovement;
};

const CATEGORIES: { key: Exclude<TxKind, "all">; label: string; icon: typeof ReceiptText; tone: string }[] = [
  { key: "sale", label: "Sales", icon: ReceiptText, tone: "bg-accent/10 text-accent" },
  { key: "purchase", label: "Purchases", icon: Truck, tone: "bg-blue-500/10 text-blue-500" },
  { key: "expense", label: "Expenses", icon: Wallet, tone: "bg-red-500/10 text-red-500" },
  { key: "payment", label: "Payments", icon: Banknote, tone: "bg-emerald-500/10 text-emerald-600" },
  { key: "return", label: "Returns", icon: RefreshCcw, tone: "bg-amber-500/10 text-amber-600" },
  { key: "movement", label: "Stock moves", icon: PackagePlus, tone: "bg-purple-500/10 text-purple-500" },
];

const KIND_LABEL: Record<Exclude<TxKind, "all">, string> = {
  sale: "Sale",
  purchase: "Purchase",
  expense: "Expense",
  payment: "Payment",
  return: "Return",
  movement: "Stock movement",
};

function paymentNet(t: FinanceTransaction): number {
  const net = t.lines.reduce((sum, l) => (l.type === "credit" ? sum + l.amount : sum - l.amount), 0);
  return Math.abs(net);
}

function MobileTransactionsInner() {
  const { currencySymbol, fmt } = useMobilePos();
  const searchParams = useSearchParams();
  const [sales, setSales] = useState<SaleResult[]>(() => getSales());
  const [purchases, setPurchases] = useState<PurchaseResult[]>(() => getPurchases());
  const [movements, setMovements] = useState<StockMovement[]>(() => getStockMovements());
  const expensesQ = useExpenses();
  const serverPurchasesQ = usePurchaseOrders();
  const paymentsQ = useTransactions("payment");
  const returnsQ = useReturns();
  const [period, setPeriod] = useState<PeriodKey>("today");
  const [category, setCategory] = useState<TxKind>(() => {
    const cat = searchParams.get("cat");
    return cat && CATEGORIES.some((c) => c.key === cat) ? (cat as Exclude<TxKind, "all">) : "all";
  });
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<TxRow | null>(null);

  useEffect(() => subscribeSales(() => setSales(getSales())), []);
  useEffect(() => subscribePurchases(() => setPurchases(getPurchases())), []);
  useEffect(() => subscribeStockMovements(() => setMovements(getStockMovements())), []);

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

    const paymentRows: TxRow[] = (paymentsQ.data?.items ?? []).map((t) => ({
      kind: "payment",
      key: `payment-${t.id}`,
      title: t.reference,
      subtitle: t.description || `Payment · ${t.status}`,
      date: new Date(t.transaction_date ?? 0),
      amount: paymentNet(t),
      payment: t,
    }));

    const returnRows: TxRow[] = (returnsQ.data?.items ?? []).map((r) => ({
      kind: "return",
      key: `return-${r.id}`,
      title: r.return_number,
      subtitle: `${r.status}${r.customer?.name ? ` · ${r.customer.name}` : ""}${r.reason ? ` · ${r.reason}` : ""}`,
      date: new Date(r.return_date),
      amount: r.refund_amount,
      returnRecord: r,
    }));

    const movementRows: TxRow[] = movements.map((m) => ({
      kind: "movement",
      key: `movement-${m.id}`,
      title: m.productName,
      subtitle: m.reason || "Stock in",
      date: new Date(m.timestamp),
      amount: m.qty,
      movement: m,
    }));

    return [...saleRows, ...serverPurchaseRows, ...localPurchaseRows, ...expenseRows, ...paymentRows, ...returnRows, ...movementRows]
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [sales, purchases, movements, expensesQ.data, serverPurchasesQ.data, paymentsQ.data, returnsQ.data]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rows) map[r.kind] = (map[r.kind] ?? 0) + 1;
    return map;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (!inPeriod(r.date, period)) return false;
      if (category !== "all" && r.kind !== category) return false;
      if (q && !`${r.title} ${r.subtitle}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, period, category, query]);

  const total = filtered.reduce((sum, r) => sum + (r.kind === "movement" ? 0 : r.kind === "sale" || r.kind === "payment" ? r.amount : -r.amount), 0);

  return (
    <div className="min-h-full flex flex-col pb-6">
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur border-b border-border px-4 py-3">
        <h1 className="text-[15px] font-bold text-foreground">Transactions</h1>
        <p className="text-[11px] text-muted mt-0.5">
          {filtered.length} transaction{filtered.length !== 1 ? "s" : ""} ·{" "}
          <span className="font-mono text-accent font-semibold">
            {total < 0 ? "-" : ""}{currencySymbol} {fmt(Math.abs(total))}
          </span>
        </p>
      </header>

      <div className="flex-1 px-3 pt-3 space-y-3">
        {/* Category tiles */}
        <div className="grid grid-cols-3 gap-2">
          {CATEGORIES.map((c) => {
            const active = category === c.key;
            const Icon = c.icon;
            return (
              <button
                key={c.key}
                onClick={() => setCategory(active ? "all" : c.key)}
                className={`relative flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 transition-colors ${
                  active ? "border-accent bg-accent/10" : "border-border bg-card"
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${c.tone}`}>
                  <Icon size={15} />
                </div>
                <span className="text-[11px] font-semibold text-foreground">{c.label}</span>
                <span className="text-[10px] text-muted font-mono">{counts[c.key] ?? 0}</span>
              </button>
            );
          })}
        </div>

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
              const amountColor =
                row.kind === "expense" || row.kind === "return"
                  ? "text-red-500"
                  : row.kind === "payment"
                    ? "text-emerald-600"
                    : "text-foreground";
              const content = (
                <>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-surface flex items-center justify-center flex-shrink-0">
                      {row.kind === "sale" && <ReceiptText size={16} className="text-accent" />}
                      {row.kind === "purchase" && <Truck size={16} className="text-blue-500" />}
                      {row.kind === "expense" && <Wallet size={16} className="text-red-500" />}
                      {row.kind === "payment" && <Banknote size={16} className="text-emerald-600" />}
                      {row.kind === "return" && <RefreshCcw size={16} className="text-amber-600" />}
                      {row.kind === "movement" && <ArrowDownToLine size={16} className="text-purple-500" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-foreground truncate">{row.title}</p>
                      <p className="text-[10px] text-muted mt-0.5 truncate">
                        {row.date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {row.subtitle}
                      </p>
                    </div>
                  </div>
                  {row.kind === "movement" ? (
                    <span className="text-[13px] font-bold font-mono text-emerald-600 flex-shrink-0">
                      +{row.amount} units
                    </span>
                  ) : (
                    <span className={`text-[14px] font-bold font-mono flex-shrink-0 ${amountColor}`}>
                      {row.kind === "sale" || row.kind === "payment" ? "+" : "-"}{currencySymbol} {fmt(row.amount)}
                    </span>
                  )}
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
          <div className="relative w-full max-w-[430px] bg-card rounded-t-2xl p-5 pb-8 space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted uppercase tracking-wider font-semibold capitalize">
                  {KIND_LABEL[detail.kind]}
                </p>
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

            {detail.kind === "payment" && detail.payment && (
              <div className="space-y-2.5">
                {[
                  ["Reference", detail.payment.reference],
                  ["Type", detail.payment.type],
                  ["Status", detail.payment.status],
                  ["Date", detail.payment.transaction_date ? new Date(detail.payment.transaction_date).toLocaleDateString() : "-"],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-[11px] text-muted">{label}</span>
                    <span className="text-[12px] font-semibold text-foreground capitalize">{value}</span>
                  </div>
                ))}
                <div className="space-y-2 pt-1">
                  {detail.payment.lines.map((l) => (
                    <div key={l.id} className="flex items-center justify-between py-1">
                      <div className="min-w-0">
                        <p className="text-[12px] font-medium text-foreground truncate">
                          {l.account?.name ?? l.account_id}
                        </p>
                        <p className="text-[10px] text-muted capitalize">{l.type}</p>
                      </div>
                      <span className="text-[12px] font-semibold font-mono">
                        {currencySymbol} {fmt(l.amount)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="text-[12px] text-muted font-medium">Total</span>
                  <span className="text-[15px] font-bold font-mono text-emerald-600">
                    +{currencySymbol} {fmt(detail.amount)}
                  </span>
                </div>
              </div>
            )}

            {detail.kind === "return" && detail.returnRecord && (
              <div className="space-y-2.5">
                {[
                  ["Status", detail.returnRecord.status],
                  ["Date", detail.returnRecord.return_date],
                  ["Reason", detail.returnRecord.reason ?? "-"],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-[11px] text-muted">{label}</span>
                    <span className="text-[12px] font-semibold text-foreground">{value}</span>
                  </div>
                ))}
                <div className="space-y-2 pt-1">
                  {detail.returnRecord.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between py-1">
                      <div className="min-w-0">
                        <p className="text-[12px] font-medium text-foreground truncate">{item.product_name}</p>
                        <p className="text-[10px] text-muted">
                          {item.quantity} × {currencySymbol} {fmt(item.refund_per_unit)}
                        </p>
                      </div>
                      <span className="text-[12px] font-semibold font-mono">
                        {currencySymbol} {fmt(item.line_refund)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="text-[12px] text-muted font-medium">Refund</span>
                  <span className="text-[15px] font-bold font-mono text-red-500">
                    -{currencySymbol} {fmt(detail.returnRecord.refund_amount)}
                  </span>
                </div>
              </div>
            )}

            {detail.kind === "movement" && detail.movement && (
              <div className="space-y-2.5">
                {[
                  ["Product", detail.movement.productName],
                  ["Reason", detail.movement.reason || "Stock in"],
                  ["Time", new Date(detail.movement.timestamp).toLocaleString()],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-[11px] text-muted">{label}</span>
                    <span className="text-[12px] font-semibold text-foreground">{value}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="text-[12px] text-muted font-medium">Quantity added</span>
                  <span className="text-[15px] font-bold font-mono text-emerald-600">+{detail.movement.qty}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MobileTransactionsPage() {
  return (
    <Suspense fallback={<div className="min-h-full flex items-center justify-center text-[13px] text-muted">Loading…</div>}>
      <MobileTransactionsInner />
    </Suspense>
  );
}
