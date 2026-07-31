"use client";
import { fmtMoney } from "@/lib/config";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const data = [
  { month: "Jan", income: 1200000, expenses: 380000, profit: 820000 },
  { month: "Feb", income: 980000,  expenses: 310000, profit: 670000 },
  { month: "Mar", income: 1450000, expenses: 420000, profit: 1030000 },
  { month: "Apr", income: 1100000, expenses: 350000, profit: 750000 },
  { month: "May", income: 1680000, expenses: 490000, profit: 1190000 },
  { month: "Jun", income: 1250000, expenses: 380000, profit: 870000 },
];

export default function FinanceReportsPage() {
  const { currencySymbol } = useAppConfig();
  const fmt = (v: number) => fmtMoney(v, currencySymbol);
  // axis tick formatter — keep compact K for chart axis
  const axisFmt = (v: number) => fmtMoney(v, currencySymbol);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">Finance Reports</h1>
        <p className="text-sm text-muted mt-0.5">Monthly profit & loss overview</p>
      </div>
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <h2 className="text-sm font-bold text-foreground mb-4">Monthly P&L</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e4de" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#b3b6b7" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#b3b6b7" }} axisLine={false} tickLine={false} tickFormatter={axisFmt} />
              <Tooltip formatter={(v) => [fmtMoney(Number(v), currencySymbol)]} contentStyle={{ borderRadius: 8, border: "1px solid #e8e4de", fontSize: 12 }} />
              <Bar dataKey="income"   fill="#10B981" radius={[4, 4, 0, 0]} name="Income" />
              <Bar dataKey="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} name="Expenses" />
              <Bar dataKey="profit"   fill="#6f1a07" radius={[4, 4, 0, 0]} name="Profit" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-bold text-foreground">Monthly Summary</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="p-4 font-semibold">Month</th>
              <th className="p-4 font-semibold text-right">Income</th>
              <th className="p-4 font-semibold text-right">Expenses</th>
              <th className="p-4 font-semibold text-right">Profit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.map((r) => (
              <tr key={r.month} className="hover:bg-surface/50 transition-colors">
                <td className="p-4 text-sm font-medium text-foreground">{r.month}</td>
                <td className="p-4 text-right text-sm text-emerald-600 font-medium">{fmtMoney(r.income, currencySymbol)}</td>
                <td className="p-4 text-right text-sm text-red-500 font-medium">{fmtMoney(r.expenses, currencySymbol)}</td>
                <td className="p-4 text-right text-sm font-bold text-foreground">{fmtMoney(r.profit, currencySymbol)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
