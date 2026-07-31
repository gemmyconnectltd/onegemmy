"use client";
import { fmtMoney } from "@/lib/config";
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
  const fmt = (v: number) => fmtMoney(v, currencySymbol);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Income</h1>
          <p className="text-sm text-muted mt-0.5">Total: <span className="font-bold text-emerald-600">{fmt(total)}</span></p>
        </div>
        <button className="flex items-center gap-2 text-white px-4 py-2.5 text-sm font-semibold transition-colors rounded-lg" style={{ backgroundColor: "#b45309" }}>
          <Plus size={15} /> Add Income
        </button>
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="p-4 font-semibold">Source</th>
              <th className="p-4 font-semibold">Category</th>
              <th className="p-4 font-semibold">Date</th>
              <th className="p-4 font-semibold text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-surface/50 transition-colors">
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp size={14} className="text-emerald-500" />
                    <span className="text-sm font-medium text-foreground">{r.source}</span>
                  </div>
                </td>
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
