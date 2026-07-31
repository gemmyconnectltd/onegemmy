"use client";
import { Plus, TrendingUp } from "lucide-react";
import { useAppConfig } from "@/lib/appConfig";

const rows = [
  { id: 1, source: "Sales Revenue", amount: 450000, date: "2025-07-25", category: "Sales" },
  { id: 2, source: "Service Fee",   amount: 25000,  date: "2025-07-23", category: "Services" },
  { id: 3, source: "Sales Revenue", amount: 320000, date: "2025-07-22", category: "Sales" },
  { id: 4, source: "Consulting",    amount: 80000,  date: "2025-07-20", category: "Services" },
  { id: 5, source: "Sales Revenue", amount: 275000, date: "2025-07-18", category: "Sales" },
];

export default function IncomePage() {
  const { currencySymbol } = useAppConfig();
  const fmt = (v: number) => `${currencySymbol} ${v.toLocaleString()}`;
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Income</h1>
          <p className="text-sm text-muted mt-1">Total: <span className="font-bold text-emerald-600">{fmt(total)}</span></p>
        </div>
        <button className="flex items-center gap-2 bg-accent text-white px-4 py-2 text-sm font-medium hover:bg-accent/90"><Plus size={16} />Add Income</button>
      </div>
      <div className="bg-white border border-border">
        <table className="w-full">
          <thead><tr className="border-b border-border text-left text-xs text-muted">
            <th className="p-4 font-medium">Source</th><th className="p-4 font-medium">Category</th><th className="p-4 font-medium">Date</th><th className="p-4 font-medium text-right">Amount</th>
          </tr></thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-surface/50">
                <td className="p-4"><div className="flex items-center gap-2"><TrendingUp size={14} className="text-emerald-500" /><span className="text-sm font-medium text-foreground">{r.source}</span></div></td>
                <td className="p-4 text-sm text-muted">{r.category}</td>
                <td className="p-4 text-sm text-muted">{r.date}</td>
                <td className="p-4 text-right text-sm font-bold text-emerald-600">{fmt(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
