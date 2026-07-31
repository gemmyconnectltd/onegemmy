"use client";
import { RotateCcw } from "lucide-react";
import { useAppConfig } from "@/lib/appConfig";

const returns = [
  { id: "RET-001", order: "ORD-003", customer: "Walk-in",      reason: "Defective item",  amount: 8000,  date: "2025-07-25", status: "Approved" },
  { id: "RET-002", order: "ORD-001", customer: "Jean Pierre",  reason: "Wrong size",      amount: 5000,  date: "2025-07-24", status: "Pending" },
  { id: "RET-003", order: "ORD-005", customer: "Walk-in",      reason: "Changed mind",    amount: 3500,  date: "2025-07-22", status: "Rejected" },
];

const statusColor: Record<string, string> = {
  Approved: "bg-emerald-50 text-emerald-700",
  Pending:  "bg-amber-50 text-amber-700",
  Rejected: "bg-red-50 text-red-600",
};

export default function SalesReturnsPage() {
  const { currencySymbol } = useAppConfig();
  const fmt = (v: number) => `${currencySymbol} ${v.toLocaleString()}`;
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-foreground">Sales Returns</h1>
      <div className="bg-card border border-border">
        <table className="w-full">
          <thead><tr className="border-b border-border text-left text-xs text-muted">
            <th className="p-4 font-medium">Return ID</th><th className="p-4 font-medium">Order</th><th className="p-4 font-medium">Customer</th><th className="p-4 font-medium">Reason</th><th className="p-4 font-medium">Date</th><th className="p-4 font-medium">Status</th><th className="p-4 font-medium text-right">Amount</th>
          </tr></thead>
          <tbody className="divide-y divide-border">
            {returns.map((r) => (
              <tr key={r.id} className="hover:bg-surface/50">
                <td className="p-4"><div className="flex items-center gap-2"><RotateCcw size={13} className="text-muted" /><span className="text-sm font-mono font-medium text-accent">{r.id}</span></div></td>
                <td className="p-4 text-sm text-muted">{r.order}</td>
                <td className="p-4 text-sm font-medium text-foreground">{r.customer}</td>
                <td className="p-4 text-sm text-muted">{r.reason}</td>
                <td className="p-4 text-sm text-muted">{r.date}</td>
                <td className="p-4"><span className={`text-xs font-medium px-2 py-1 ${statusColor[r.status]}`}>{r.status}</span></td>
                <td className="p-4 text-right text-sm font-bold text-foreground">{fmt(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
