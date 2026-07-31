"use client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useAppConfig } from "@/lib/appConfig";

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
  const fmt = (v: number) => `${currencySymbol} ${(v/1000).toFixed(0)}k`;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Finance Reports</h1>
      <div className="bg-white border border-border p-5">
        <h2 className="text-sm font-bold text-foreground mb-4">Monthly P&L</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e4de" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#b3b6b7" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#b3b6b7" }} axisLine={false} tickLine={false} tickFormatter={fmt} />
              <Tooltip formatter={(v) => [`${currencySymbol} ${Number(v).toLocaleString()}`]} contentStyle={{ borderRadius: 8, border: "1px solid #e8e4de", fontSize: 12 }} />
              <Bar dataKey="income"   fill="#10B981" radius={[4,4,0,0]} name="Income" />
              <Bar dataKey="expenses" fill="#ef4444" radius={[4,4,0,0]} name="Expenses" />
              <Bar dataKey="profit"   fill="#6f1a07" radius={[4,4,0,0]} name="Profit" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="bg-white border border-border">
        <div className="px-5 py-4 border-b border-border"><h2 className="text-sm font-bold text-foreground">Monthly Summary</h2></div>
        <table className="w-full">
          <thead><tr className="border-b border-border text-left text-xs text-muted">
            <th className="p-4 font-medium">Month</th><th className="p-4 font-medium text-right">Income</th><th className="p-4 font-medium text-right">Expenses</th><th className="p-4 font-medium text-right">Profit</th>
          </tr></thead>
          <tbody className="divide-y divide-border">
            {data.map((r) => (
              <tr key={r.month} className="hover:bg-surface/50">
                <td className="p-4 text-sm font-medium text-foreground">{r.month}</td>
                <td className="p-4 text-right text-sm text-emerald-600 font-medium">{currencySymbol} {r.income.toLocaleString()}</td>
                <td className="p-4 text-right text-sm text-red-500 font-medium">{currencySymbol} {r.expenses.toLocaleString()}</td>
                <td className="p-4 text-right text-sm font-bold text-foreground">{currencySymbol} {r.profit.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
