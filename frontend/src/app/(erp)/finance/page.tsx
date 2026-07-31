"use client";

import Link from "next/link";
import { useSyncExternalStore, useState } from "react";
import { TrendingUp, TrendingDown, DollarSign, PiggyBank, ArrowUpRight, ArrowDownRight, Clock, ArrowRight, Plus } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useAppConfig } from "@/lib/appConfig";
import { getSalesSnapshot, subscribeSales } from "@/lib/invoices";
import type { SaleResult } from "@/components/pos/types";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter } from "@/components/ui/Form";

const EMPTY_SALES: SaleResult[] = [];

const monthly = [
  { month: "Jan", income: 1200000, expenses: 380000 },
  { month: "Feb", income: 980000,  expenses: 310000 },
  { month: "Mar", income: 1450000, expenses: 420000 },
  { month: "Apr", income: 1100000, expenses: 350000 },
  { month: "May", income: 1680000, expenses: 490000 },
  { month: "Jun", income: 1250000, expenses: 380000 },
];

type Tx = { id: number; desc: string; type: "income" | "expense"; amount: number; category: string; date: string };

const INITIAL_TX: Tx[] = [
  { id: 1, desc: "Sales Revenue",    type: "income",  amount: 450000, category: "Sales",     date: "2025-07-25" },
  { id: 2, desc: "Rent Payment",     type: "expense", amount: 80000,  category: "Rent",      date: "2025-07-24" },
  { id: 3, desc: "Supplier Payment", type: "expense", amount: 120000, category: "Inventory", date: "2025-07-23" },
  { id: 4, desc: "Sales Revenue",    type: "income",  amount: 320000, category: "Sales",     date: "2025-07-22" },
  { id: 5, desc: "Utility Bills",    type: "expense", amount: 45000,  category: "Utilities", date: "2025-07-21" },
];

export default function FinancePage() {
  const { currencySymbol } = useAppConfig();
  const sales = useSyncExternalStore(subscribeSales, getSalesSnapshot, () => EMPTY_SALES);
  const outstanding = sales.filter((s) => s.isInvoice && !s.paid);
  const outstandingTotal = outstanding.reduce((s, i) => s + i.total, 0);
  const fmt = (v: number) => `${currencySymbol} ${v.toLocaleString()}`;

  const [transactions, setTransactions] = useState<Tx[]>(INITIAL_TX);
  const [showIncome, setShowIncome] = useState(false);
  const [showExpense, setShowExpense] = useState(false);
  const [form, setForm] = useState({ desc: "", amount: "", category: "Sales", date: "" });

  const totalIncome = transactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpenses = transactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);

  const submit = (type: "income" | "expense") => (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.desc || !form.amount) return;
    setTransactions((prev) => [
      { id: Date.now(), desc: form.desc, type, amount: Number(form.amount), category: form.category, date: form.date || new Date().toISOString().slice(0, 10) },
      ...prev,
    ]);
    setForm({ desc: "", amount: "", category: "Sales", date: "" });
    if (type === "income") setShowIncome(false);
    else setShowExpense(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Finance Overview</h1>
          <p className="text-sm text-muted mt-1">Track your income, expenses and profit</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowExpense(true)}
            className="flex items-center gap-2 border border-border px-4 py-2 text-sm font-medium hover:bg-surface transition-colors"
          >
            <Plus size={16} className="text-red-500" />Add Expense
          </button>
          <button
            onClick={() => setShowIncome(true)}
            className="flex items-center gap-2 bg-accent text-white px-4 py-2 text-sm font-medium hover:bg-accent/90"
          >
            <Plus size={16} />Add Income
          </button>
        </div>
      </div>

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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total Income",   value: fmt(totalIncome),   icon: TrendingUp,   color: "#10B981", change: "+12%", up: true },
          { label: "Total Expenses", value: fmt(totalExpenses), icon: TrendingDown, color: "#ef4444", change: "+5%",  up: false },
          { label: "Net Profit",     value: fmt(totalIncome - totalExpenses), icon: DollarSign, color: "#6f1a07", change: "+18%", up: true },
          { label: "Cash Balance",   value: fmt(2340000), icon: PiggyBank,    color: "#3b82f6", change: null,   up: true },
        ].map((s) => (
          <div key={s.label} className="bg-card border-y border-border p-4 relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: s.color }} />
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 flex items-center justify-center" style={{ backgroundColor: `${s.color}15` }}>
                <s.icon size={16} style={{ color: s.color }} />
              </div>
              {s.change && (
                <span className={`flex items-center gap-0.5 text-[11px] font-semibold ${s.up ? "text-emerald-600" : "text-red-500"}`}>
                  {s.up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}{s.change}
                </span>
              )}
            </div>
            <p className="text-xl font-extrabold text-foreground">{s.value}</p>
            <p className="text-[11px] text-muted mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border p-5">
        <h2 className="text-sm font-bold text-foreground mb-4">Income vs Expenses (6 months)</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthly}>
              <defs>
                <linearGradient id="gIncome" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e4de" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#b3b6b7" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#b3b6b7" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v, n) => [fmt(Number(v)), n === "income" ? "Income" : "Expenses"]} contentStyle={{ borderRadius: 8, border: "1px solid #e8e4de", fontSize: 12 }} />
              <Area type="monotone" dataKey="income"   stroke="#10B981" strokeWidth={2} fill="url(#gIncome)" dot={false} />
              <Area type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} fill="url(#gExp)"    dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-card border border-border">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-bold text-foreground">Recent Transactions</h2>
        </div>
        <div className="divide-y divide-border">
          {transactions.map((t) => (
            <div key={t.id} className="px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 flex items-center justify-center ${t.type === "income" ? "bg-emerald-50" : "bg-red-50"}`}>
                  {t.type === "income" ? <TrendingUp size={14} className="text-emerald-600" /> : <TrendingDown size={14} className="text-red-500" />}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{t.desc}</p>
                  <p className="text-[11px] text-muted">{t.date} · {t.category}</p>
                </div>
              </div>
              <span className={`text-sm font-bold ${t.type === "income" ? "text-emerald-600" : "text-red-500"}`}>
                {t.type === "income" ? "+" : "-"}{fmt(t.amount)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <Drawer open={showIncome} onClose={() => setShowIncome(false)} title="Add Income" description="Record a new income entry" size="md">
        <form onSubmit={submit("income")} className="p-5 space-y-4">
          <Field label="Source" required>
            <Input value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} placeholder="e.g. Sales Revenue" autoFocus />
          </Field>
          <Field label="Amount" required>
            <Input type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" />
          </Field>
          <Field label="Category">
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option>Sales</option>
              <option>Services</option>
              <option>Consulting</option>
              <option>Other</option>
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <FormFooter submitLabel="Add Income" onCancel={() => setShowIncome(false)} disabled={!form.desc || !form.amount} />
        </form>
      </Drawer>

      <Drawer open={showExpense} onClose={() => setShowExpense(false)} title="Add Expense" description="Record a new expense entry" size="md">
        <form onSubmit={submit("expense")} className="p-5 space-y-4">
          <Field label="Description" required>
            <Input value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} placeholder="e.g. Rent Payment" autoFocus />
          </Field>
          <Field label="Amount" required>
            <Input type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" />
          </Field>
          <Field label="Category">
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option>Rent</option>
              <option>Inventory</option>
              <option>Utilities</option>
              <option>Transport</option>
              <option>Marketing</option>
              <option>Other</option>
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <FormFooter submitLabel="Add Expense" onCancel={() => setShowExpense(false)} disabled={!form.desc || !form.amount} />
        </form>
      </Drawer>
    </div>
  );
}
