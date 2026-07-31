"use client";

import { TrendingUp, TrendingDown, DollarSign, PiggyBank, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useAppConfig } from "@/lib/appConfig";

const monthly = [
  { month: "Jan", income: 1200000, expenses: 380000 },
  { month: "Feb", income: 980000,  expenses: 310000 },
  { month: "Mar", income: 1450000, expenses: 420000 },
  { month: "Apr", income: 1100000, expenses: 350000 },
  { month: "May", income: 1680000, expenses: 490000 },
  { month: "Jun", income: 1250000, expenses: 380000 },
];

const transactions = [
  { id: 1, desc: "Sales Revenue",       type: "income",  amount: 450000, date: "2025-07-25" },
  { id: 2, desc: "Rent Payment",        type: "expense", amount: 80000,  date: "2025-07-24" },
  { id: 3, desc: "Supplier Payment",    type: "expense", amount: 120000, date: "2025-07-23" },
  { id: 4, desc: "Sales Revenue",       type: "income",  amount: 320000, date: "2025-07-22" },
  { id: 5, desc: "Utility Bills",       type: "expense", amount: 45000,  date: "2025-07-21" },
];

export default function FinancePage() {
  const { currencySymbol } = useAppConfig();
  const fmt = (v: number) => `${currencySymbol} ${v.toLocaleString()}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Finance Overview</h1>
        <p className="text-sm text-muted mt-1">Track your income, expenses and profit</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total Income",   value: fmt(1250000), icon: TrendingUp,   color: "#10B981", change: "+12%", up: true },
          { label: "Total Expenses", value: fmt(380000),  icon: TrendingDown, color: "#ef4444", change: "+5%",  up: false },
          { label: "Net Profit",     value: fmt(870000),  icon: DollarSign,   color: "#6f1a07", change: "+18%", up: true },
          { label: "Cash Balance",   value: fmt(2340000), icon: PiggyBank,    color: "#3b82f6", change: null,   up: true },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-border p-4 relative overflow-hidden">
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

      <div className="bg-white border border-border p-5">
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

      <div className="bg-white border border-border">
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
                  <p className="text-[11px] text-muted">{t.date}</p>
                </div>
              </div>
              <span className={`text-sm font-bold ${t.type === "income" ? "text-emerald-600" : "text-red-500"}`}>
                {t.type === "income" ? "+" : "-"}{fmt(t.amount)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
