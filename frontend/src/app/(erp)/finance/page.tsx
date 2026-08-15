"use client";
import { fmtMoney } from "@/lib/config";
import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore, useState } from "react";
import { TrendingUp, TrendingDown, DollarSign, PiggyBank, Clock, ArrowRight, Plus, AlertTriangle, RefreshCw } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "@/components/charts/lazy";
import { useAppConfig } from "@/lib/appConfig";
import { chartPalette } from "@/lib/chartColors";
import { getSalesSnapshot, subscribeSales } from "@/lib/invoices";
import type { SaleResult } from "@/components/pos/types";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter } from "@/components/ui/Form";
import { useQueryClient } from "@tanstack/react-query";
import { useAccounts, useIncomeStatement, useCashFlow, useTransactions, useCreateExpense, useCreateTransaction, useSeedAccounts, useBackfillSales } from "@/lib/api/hooks";
import type { FinanceTransaction } from "@/lib/api/finance";

const EMPTY_SALES: SaleResult[] = [];

const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

type Tx = { id: string; desc: string; type: "income" | "expense"; amount: number; category: string; date: string };

const MONTH_RANGES = Array.from({ length: 6 }, (_, i) => {
  const now = new Date();
  const m = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
  return {
    label: m.toLocaleString("en", { month: "short" }),
    from: toISO(m),
    to: toISO(new Date(now.getFullYear(), now.getMonth() - (5 - i) + 1, 0)),
  };
});

function mapTxn(t: FinanceTransaction): Tx {
  const debits = t.lines.filter((l) => l.type === "debit").reduce((s, l) => s + l.amount, 0);
  const credits = t.lines.filter((l) => l.type === "credit").reduce((s, l) => s + l.amount, 0);
  const isIncome = t.type === "sale" || (credits > debits && !/expense|return/i.test(t.type));
  return {
    id: t.id,
    desc: t.description ?? t.reference,
    type: isIncome ? "income" : "expense",
    amount: isIncome ? credits : debits,
    category: t.type,
    date: t.transaction_date ?? "",
  };
}

export default function FinancePage() {
  const { currencySymbol, theme } = useAppConfig();
  const c = chartPalette(theme === "dark");
  const sales = useSyncExternalStore(subscribeSales, getSalesSnapshot, () => EMPTY_SALES);
  const outstanding = sales.filter((s) => s.isInvoice && !s.paid);
  const outstandingTotal = outstanding.reduce((s, i) => s + i.total, 0);
  const fmt = (v: number) => fmtMoney(v, currencySymbol);

  const [from] = useState(() => toISO(new Date(new Date().getFullYear(), 0, 1)));
  const [to] = useState(() => toISO(new Date()));

  const qc = useQueryClient();
  const accounts = useAccounts();
  const income = useIncomeStatement(from, to);
  const cash = useCashFlow(from, to);
  const tx = useTransactions();
  const monthQueries = [
    useIncomeStatement(MONTH_RANGES[0].from, MONTH_RANGES[0].to),
    useIncomeStatement(MONTH_RANGES[1].from, MONTH_RANGES[1].to),
    useIncomeStatement(MONTH_RANGES[2].from, MONTH_RANGES[2].to),
    useIncomeStatement(MONTH_RANGES[3].from, MONTH_RANGES[3].to),
    useIncomeStatement(MONTH_RANGES[4].from, MONTH_RANGES[4].to),
    useIncomeStatement(MONTH_RANGES[5].from, MONTH_RANGES[5].to),
  ];
  const seedAccounts = useSeedAccounts();
  const backfillSales = useBackfillSales();
  const createExpense = useCreateExpense();
  const createTransaction = useCreateTransaction();

  const loading = [accounts, income, cash, tx, ...monthQueries].some((q) => q.isLoading);
  const error = [accounts, income, cash, tx, ...monthQueries].some((q) => q.isError)
    ? "Could not load the finance overview."
    : null;

  const stats = {
    income: income.data?.total_revenue ?? 0,
    expenses: income.data?.total_operating_expenses ?? 0,
    net: income.data?.net_income ?? 0,
    cash: cash.data?.ending_cash ?? 0,
  };
  const transactions = (tx.data?.items ?? []).slice(0, 8).map(mapTxn);
  const monthly = MONTH_RANGES.map((r, i) => ({
    month: r.label,
    income: monthQueries[i].data?.total_revenue ?? 0,
    expenses: monthQueries[i].data?.total_operating_expenses ?? 0,
  }));

  const retry = () => { qc.invalidateQueries({ queryKey: ["finance"] }); };

  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || accounts.isLoading || accounts.isError) return;
    if ((accounts.data?.items.length ?? 0) === 0) {
      seededRef.current = true;
      seedAccounts.mutate(undefined, { onSuccess: () => { backfillSales.mutate(undefined); } });
    }
  }, [accounts.isLoading, accounts.isError, accounts.data?.items.length, seedAccounts, backfillSales]);

  const [showIncome, setShowIncome] = useState(false);
  const [showExpense, setShowExpense] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ desc: "", amount: "", category: "Sales", date: "" });

  const saving = createExpense.isPending || createTransaction.isPending;

  const submit = (type: "income" | "expense") => (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.desc || !form.amount) return;
    setNotice(null);
    const date = form.date || toISO(new Date());
    if (type === "expense") {
      createExpense.mutate(
        { title: form.desc, amount: Number(form.amount), expense_date: date, category: form.category },
        {
          onSuccess: () => {
            setForm({ desc: "", amount: "", category: "Sales", date: "" });
            setShowExpense(false);
          },
          onError: () => setNotice("Could not add expense."),
        },
      );
    } else {
      const items = accounts.data?.items ?? [];
      const cashAcc = items.find((a) => a.type === "Assets" && /cash|bank/i.test(a.name)) ?? items.find((a) => a.type === "Assets");
      const revenue = items.find((a) => a.type === "Revenue" && /sales/i.test(a.name)) ?? items.find((a) => a.type === "Revenue");
      if (!cashAcc || !revenue) {
        setNotice("Create Asset and Revenue accounts first (Accounts → Seed Defaults).");
        return;
      }
      createTransaction.mutate(
        {
          type: "manual",
          transaction_date: date,
          description: form.desc,
          lines: [
            { account_id: cashAcc.id, type: "debit", amount: Number(form.amount) },
            { account_id: revenue.id, type: "credit", amount: Number(form.amount) },
          ],
        },
        {
          onSuccess: () => {
            setForm({ desc: "", amount: "", category: "Sales", date: "" });
            setShowIncome(false);
          },
          onError: () => setNotice("Could not add income."),
        },
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Finance Overview</h1>
          <p className="text-sm text-muted mt-1">Track your income, expenses and profit</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowExpense(true)}
            className="flex items-center gap-2 border border-border px-4 py-2.5 text-sm font-semibold hover:bg-surface transition-colors rounded-lg"
          >
            <Plus size={15} className="text-red-500" />Add Expense
          </button>
          <button
            onClick={() => setShowIncome(true)}
            className="flex items-center gap-2 text-white px-4 py-2.5 text-sm font-semibold transition-colors rounded-lg"
            style={{ backgroundColor: "#b45309" }}
          >
            <Plus size={16} />Add Income
          </button>
        </div>
      </div>

      {notice && <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{notice}</p>}

      <Link
        href="/finance/invoices"
        className="flex items-center gap-3 bg-card border border-border border-l-4 px-4 py-3 hover:bg-surface/50 transition-colors"
        style={{ borderLeftColor: "#b45309" }}
      >
        <div className="w-8 h-8 flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#b4530915" }}>
          <Clock size={15} className="text-[#b45309]" />
        </div>
        <div className="flex-1">
          <p className="text-[13px] font-bold text-foreground">
            {outstanding.length > 0
              ? `${outstanding.length} outstanding invoice${outstanding.length > 1 ? "s" : ""} — ${fmt(outstandingTotal)}`
              : "No outstanding invoices"}
          </p>
          <p className="text-[11px] text-muted">
            {outstanding.length > 0
              ? "Awaiting payment from POS invoice sales."
              : "All POS invoices have been settled."}
          </p>
        </div>
        <span className="flex items-center gap-1 text-[12px] font-semibold text-accent">
          View invoices <ArrowRight size={13} />
        </span>
      </Link>

      {loading ? (
        <PageLoader variant="compact" />
      ) : error ? (
        <div className="bg-card border border-border rounded-xl py-12 px-6 text-center space-y-3">
          <AlertTriangle size={22} className="mx-auto text-red-500" />
          <p className="text-sm font-semibold text-foreground">{error}</p>
          <button type="button" onClick={retry} className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-border bg-surface text-sm font-semibold text-foreground hover:bg-surface/70">
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Total Income", value: fmt(stats.income), icon: TrendingUp, color: c.income },
              { label: "Total Expenses", value: fmt(stats.expenses), icon: TrendingDown, color: c.expenses },
              { label: "Net Profit", value: fmt(stats.net), icon: DollarSign, color: c.profit },
              { label: "Cash Balance", value: fmt(stats.cash), icon: PiggyBank, color: c.blue },
            ].map((s) => (
              <div key={s.label} className="bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="w-8 h-8 flex items-center justify-center" style={{ backgroundColor: `${s.color}14` }}>
                    <s.icon size={16} style={{ color: s.color }} />
                  </div>
                </div>
                <p className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight truncate" title={s.value}>{s.value}</p>
                <p className="text-[11px] text-muted mt-0.5 font-medium">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
            <h2 className="text-sm font-bold text-foreground mb-4">Income vs Expenses (6 months)</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthly}>
                  <defs>
                    <linearGradient id="gIncome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={c.income} stopOpacity={0.15} />
                      <stop offset="95%" stopColor={c.income} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={c.expenses} stopOpacity={0.1} />
                      <stop offset="95%" stopColor={c.expenses} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: c.tick }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: c.tick }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v, n) => [fmt(Number(v)), n === "income" ? "Income" : "Expenses"]} contentStyle={c.tooltip} />
                  <Area type="monotone" dataKey="income" stroke={c.income} strokeWidth={2} fill="url(#gIncome)" dot={false} />
                  <Area type="monotone" dataKey="expenses" stroke={c.expenses} strokeWidth={2} fill="url(#gExp)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <h2 className="text-sm font-bold text-foreground">Recent Activity</h2>
              <Link href="/finance/expenses" className="flex items-center gap-1 text-[12px] font-semibold text-accent hover:underline">
                View all <ArrowRight size={13} />
              </Link>
            </div>
            {transactions.length === 0 ? (
              <p className="text-sm text-muted py-10 text-center">No transactions recorded yet.</p>
            ) : (
              <table className="w-full">
                <tbody className="divide-y divide-border">
                  {transactions.map((t) => (
                    <tr key={t.id} className="hover:bg-surface/50 transition-colors">
                      <td className="p-4">
                        <p className="text-sm font-medium text-foreground">{t.desc}</p>
                        <p className="text-[11px] text-muted uppercase tracking-wider">{t.category}</p>
                      </td>
                      <td className="p-4 text-sm text-muted hidden sm:table-cell">{t.date}</td>
                      <td className={`p-4 text-right text-sm font-bold ${t.type === "income" ? "text-emerald-600" : "text-red-500"}`}>
                        {t.type === "income" ? "+" : "-"}{fmt(t.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      <Drawer open={showExpense} onClose={() => setShowExpense(false)} title="Add Expense" description="Record a business expense">
        <form onSubmit={submit("expense")} className="space-y-4 p-5">
          <Field label="Description" required>
            <Input required value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} placeholder="Rent Payment" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount" required>
              <Input type="number" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" />
            </Field>
            <Field label="Category">
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {["Rent", "Utilities", "Salaries", "Inventory", "Transport", "Marketing", "Supplies", "Other"].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Date">
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <FormFooter submitLabel={saving ? "Saving…" : "Add Expense"} onCancel={() => setShowExpense(false)} disabled={saving} />
        </form>
      </Drawer>

      <Drawer open={showIncome} onClose={() => setShowIncome(false)} title="Add Income" description="Record a manual income entry">
        <form onSubmit={submit("income")} className="space-y-4 p-5">
          <Field label="Description" required>
            <Input required value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} placeholder="Consulting fee" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount" required>
              <Input type="number" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" />
            </Field>
            <Field label="Category">
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {["Sales", "Services", "Other Income"].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Date">
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <p className="text-xs text-muted">Creates a journal: debit Cash, credit Sales Revenue.</p>
          <FormFooter submitLabel={saving ? "Saving…" : "Add Income"} onCancel={() => setShowIncome(false)} disabled={saving} />
        </form>
      </Drawer>
    </div>
  );
}
