"use client";
import { Plus, TrendingDown } from "lucide-react";
import { useAppConfig } from "@/lib/appConfig";

const rows = [
  { id: 1, desc: "Rent Payment",     amount: 80000,  date: "2025-07-24", category: "Rent" },
  { id: 2, desc: "Supplier Payment", amount: 120000, date: "2025-07-23", category: "Inventory" },
  { id: 3, desc: "Utility Bills",    amount: 45000,  date: "2025-07-21", category: "Utilities" },
  { id: 4, desc: "Transport",        amount: 15000,  date: "2025-07-19", category: "Transport" },
  { id: 5, desc: "Marketing",        amount: 30000,  date: "2025-07-17", category: "Marketing" },
];

export default function ExpensesPage() {
  const { currencySymbol } = useAppConfig();
  const fmt = (v: number) => `${currencySymbol} ${v.toLocaleString()}`;
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Expenses</h1>
          <p className="text-sm text-muted mt-1">Total: <span className="font-bold text-red-500">{fmt(total)}</span></p>
        </div>
        <button className="flex items-center gap-2 bg-accent text-white px-4 py-2 text-sm font-medium hover:bg-accent/90"><Plus size={16} />Add Expense</button>
      </div>
      <div className="bg-white border border-border">
        <table className="w-full">
          <thead><tr className="border-b border-border text-left text-xs text-muted">
            <th className="p-4 font-medium">Description</th><th className="p-4 font-medium">Category</th><th className="p-4 font-medium">Date</th><th className="p-4 font-medium text-right">Amount</th>
          </tr></thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-surface/50">
                <td className="p-4"><div className="flex items-center gap-2"><TrendingDown size={14} className="text-red-400" /><span className="text-sm font-medium text-foreground">{r.desc}</span></div></td>
                <td className="p-4 text-sm text-muted">{r.category}</td>
                <td className="p-4 text-sm text-muted">{r.date}</td>
                <td className="p-4 text-right text-sm font-bold text-red-500">{fmt(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
