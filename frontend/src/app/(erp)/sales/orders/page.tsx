"use client";
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { useAppConfig } from "@/lib/appConfig";

const orders = [
  { id: "ORD-001", customer: "Jean Pierre",  items: 3, total: 45000,  status: "Completed", date: "2025-07-25" },
  { id: "ORD-002", customer: "Marie Claire", items: 1, total: 15000,  status: "Pending",   date: "2025-07-25" },
  { id: "ORD-003", customer: "Walk-in",      items: 5, total: 24000,  status: "Completed", date: "2025-07-24" },
  { id: "ORD-004", customer: "Patrick N.",   items: 2, total: 32000,  status: "Cancelled", date: "2025-07-24" },
  { id: "ORD-005", customer: "Walk-in",      items: 4, total: 18500,  status: "Completed", date: "2025-07-23" },
];

const statusColor: Record<string, string> = {
  Completed: "bg-emerald-50 text-emerald-700",
  Pending:   "bg-amber-50 text-amber-700",
  Cancelled: "bg-red-50 text-red-600",
};

export default function SalesOrdersPage() {
  const { currencySymbol } = useAppConfig();
  const [search, setSearch] = useState("");
  const fmt = (v: number) => `${currencySymbol} ${v.toLocaleString()}`;
  const filtered = orders.filter((o) => o.customer.toLowerCase().includes(search.toLowerCase()) || o.id.includes(search));
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Orders</h1>
        <button className="flex items-center gap-2 bg-accent text-white px-4 py-2 text-sm font-medium hover:bg-accent/90"><Plus size={16} />New Order</button>
      </div>
      <div className="bg-white border border-border p-3">
        <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search orders..." className="w-full pl-9 pr-4 py-2 border border-border text-sm focus:border-accent focus:outline-none" />
        </div>
      </div>
      <div className="bg-white border border-border">
        <table className="w-full">
          <thead><tr className="border-b border-border text-left text-xs text-muted">
            <th className="p-4 font-medium">Order ID</th><th className="p-4 font-medium">Customer</th><th className="p-4 font-medium">Items</th><th className="p-4 font-medium">Date</th><th className="p-4 font-medium">Status</th><th className="p-4 font-medium text-right">Total</th>
          </tr></thead>
          <tbody className="divide-y divide-border">
            {filtered.map((o) => (
              <tr key={o.id} className="hover:bg-surface/50">
                <td className="p-4 text-sm font-mono font-medium text-accent">{o.id}</td>
                <td className="p-4 text-sm font-medium text-foreground">{o.customer}</td>
                <td className="p-4 text-sm text-muted">{o.items}</td>
                <td className="p-4 text-sm text-muted">{o.date}</td>
                <td className="p-4"><span className={`text-xs font-medium px-2 py-1 ${statusColor[o.status]}`}>{o.status}</span></td>
                <td className="p-4 text-right text-sm font-bold text-foreground">{fmt(o.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
