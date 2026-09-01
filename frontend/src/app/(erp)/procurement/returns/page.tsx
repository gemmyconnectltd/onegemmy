"use client";
import { fmtMoney } from "@/lib/config";
import { useState } from "react";
import { RotateCcw, Search } from "lucide-react";
import { useAppConfig } from "@/lib/appConfig";

type ReturnStatus = "Processing" | "Refunded" | "Replaced";

type PurchaseReturn = {
  id: string;
  po: string;
  supplier: string;
  item: string;
  qty: number;
  amount: number;
  date: string;
  reason: string;
  status: ReturnStatus;
};

const INITIAL_RETURNS: PurchaseReturn[] = [
  { id: "RET-101", po: "PO-1005", supplier: "Nyabugogo Traders", item: "Damaged cartons", qty: 3, amount: 72000, date: "2026-07-25", reason: "Damaged in transit", status: "Refunded" },
  { id: "RET-100", po: "PO-1002", supplier: "Musanze Fresh Foods", item: "Expired produce", qty: 8, amount: 45000, date: "2026-07-12", reason: "Past expiry date", status: "Replaced" },
  { id: "RET-099", po: "PO-1007", supplier: "Kigali Wholesalers", item: "Wrong item delivered", qty: 2, amount: 18000, date: "2026-07-27", reason: "Wrong item", status: "Processing" },
];

const STATUS_STYLES: Record<ReturnStatus, string> = {
  Processing: "bg-amber-100 text-amber-700",
  Refunded: "bg-emerald-100 text-emerald-700",
  Replaced: "bg-blue-50 text-blue-700",
};

export default function PurchaseReturnsPage() {
  const { currencySymbol, brandColor } = useAppConfig();
  const [search, setSearch] = useState("");

  const fmt = (v: number) => fmtMoney(v, currencySymbol);

  const filtered = INITIAL_RETURNS.filter((r) => {
    const q = search.trim().toLowerCase();
    return !q || r.supplier.toLowerCase().includes(q) || r.id.toLowerCase().includes(q) || r.item.toLowerCase().includes(q);
  });

  const totalRefunded = INITIAL_RETURNS.filter((r) => r.status === "Refunded").reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Purchase Returns</h1>
        <p className="text-sm text-muted mt-1">Track items sent back to suppliers and refunds.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          { label: "Returns", value: INITIAL_RETURNS.length, color: brandColor },
          { label: "Refunded", value: fmt(totalRefunded), color: "#059669" },
          { label: "Processing", value: INITIAL_RETURNS.filter((r) => r.status === "Processing").length, color: "#b45309" },
        ].map((s) => (
          <div key={s.label} className="bg-card p-4">
            <div className="w-8 h-8 flex items-center justify-center mb-2" style={{ backgroundColor: `${s.color}10` }}>
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
            </div>
            <p className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight">{s.value}</p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 bg-card border border-border px-3 py-2 w-56">
        <Search size={14} className="text-muted flex-shrink-0" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search returns..."
          className="flex-1 text-[13px] outline-none bg-transparent text-foreground placeholder:text-muted"
        />
      </div>

      <div className="bg-card border border-border overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="p-4 font-medium">Return</th>
              <th className="p-4 font-medium">PO</th>
              <th className="p-4 font-medium">Supplier</th>
              <th className="p-4 font-medium">Item</th>
              <th className="p-4 font-medium text-right">Qty</th>
              <th className="p-4 font-medium text-right">Amount</th>
              <th className="p-4 font-medium">Reason</th>
              <th className="p-4 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((r) => (
              <tr key={r.id} className="hover:bg-surface/50">
                <td className="p-4">
                  <span className="flex items-center gap-2 text-[13px] font-bold text-foreground">
                    <RotateCcw size={14} className="text-accent" />{r.id}
                  </span>
                </td>
                <td className="p-4 text-[13px] text-muted">{r.po}</td>
                <td className="p-4 text-[13px] text-foreground">{r.supplier}</td>
                <td className="p-4 text-[13px] text-foreground">{r.item}</td>
                <td className="p-4 text-right text-[13px] font-semibold text-foreground tabular-nums">{r.qty}</td>
                <td className="p-4 text-right text-[13px] font-bold text-foreground tabular-nums">{fmt(r.amount)}</td>
                <td className="p-4 text-[13px] text-muted">{r.reason}</td>
                <td className="p-4">
                  <span className={`inline-flex items-center text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${STATUS_STYLES[r.status]}`}>
                    {r.status}
                  </span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="p-10 text-center text-sm text-muted">No returns match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
