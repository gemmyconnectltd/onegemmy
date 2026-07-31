"use client";
import { Plus } from "lucide-react";

const leaves = [
  { id: 1, name: "David Habimana",  type: "Annual",  from: "2025-07-20", to: "2025-07-28", days: 8, status: "Approved" },
  { id: 2, name: "Alice Uwimana",   type: "Sick",    from: "2025-07-26", to: "2025-07-27", days: 2, status: "Pending" },
  { id: 3, name: "Eve Ingabire",    type: "Annual",  from: "2025-08-01", to: "2025-08-05", days: 5, status: "Pending" },
];

const statusColor: Record<string, string> = {
  Approved: "bg-emerald-50 text-emerald-700",
  Pending:  "bg-amber-50 text-amber-700",
  Rejected: "bg-red-50 text-red-600",
};

export default function LeavePage() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Leave Management</h1>
        <button className="flex items-center gap-2 bg-accent text-white px-4 py-2 text-sm font-medium hover:bg-accent/90"><Plus size={16} />Request Leave</button>
      </div>
      <div className="bg-card border border-border">
        <table className="w-full">
          <thead><tr className="border-b border-border text-left text-xs text-muted">
            <th className="p-4 font-medium">Employee</th><th className="p-4 font-medium">Type</th><th className="p-4 font-medium">From</th><th className="p-4 font-medium">To</th><th className="p-4 font-medium">Days</th><th className="p-4 font-medium">Status</th>
          </tr></thead>
          <tbody className="divide-y divide-border">
            {leaves.map((l) => (
              <tr key={l.id} className="hover:bg-surface/50">
                <td className="p-4 text-sm font-medium text-foreground">{l.name}</td>
                <td className="p-4 text-sm text-muted">{l.type}</td>
                <td className="p-4 text-sm text-muted">{l.from}</td>
                <td className="p-4 text-sm text-muted">{l.to}</td>
                <td className="p-4 text-sm font-medium text-foreground">{l.days}</td>
                <td className="p-4"><span className={`text-xs font-medium px-2 py-1 ${statusColor[l.status]}`}>{l.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
