"use client";

import { useState } from "react";
import { Ban, CheckCircle2, FileText, Plus, Search, Truck, X } from "lucide-react";
import { useAppConfig } from "@/lib/appConfig";

type PoStatus = "Draft" | "Approved" | "Received" | "Cancelled";

type PurchaseOrder = {
  id: string;
  supplier: string;
  date: string;
  items: number;
  total: number;
  status: PoStatus;
  expected?: string;
};

const INITIAL_POS: PurchaseOrder[] = [
  { id: "PO-1008", supplier: "Rwanda Supply Co", date: "2026-07-29", items: 12, total: 1850000, status: "Received", expected: "2026-07-30" },
  { id: "PO-1007", supplier: "Kigali Wholesalers", date: "2026-07-26", items: 8, total: 1240000, status: "Received", expected: "2026-07-28" },
  { id: "PO-1006", supplier: "East Africa Distributors", date: "2026-07-24", items: 5, total: 890000, status: "Approved", expected: "2026-08-02" },
  { id: "PO-1005", supplier: "Nyabugogo Traders", date: "2026-07-20", items: 15, total: 2200000, status: "Received", expected: "2026-07-23" },
  { id: "PO-1004", supplier: "Rwanda Supply Co", date: "2026-07-15", items: 6, total: 640000, status: "Draft", expected: "2026-08-01" },
  { id: "PO-1003", supplier: "Kigali Wholesalers", date: "2026-07-11", items: 9, total: 1370000, status: "Cancelled" },
  { id: "PO-1002", supplier: "Musanze Fresh Foods", date: "2026-07-08", items: 11, total: 980000, status: "Received", expected: "2026-07-10" },
];

const STATUS_STYLES: Record<PoStatus, string> = {
  Draft: "bg-slate-100 text-slate-700",
  Approved: "bg-blue-50 text-blue-700",
  Received: "bg-emerald-100 text-emerald-700",
  Cancelled: "bg-red-50 text-red-600",
};

const STATUS_ORDER: (PoStatus | "All")[] = ["All", "Draft", "Approved", "Received", "Cancelled"];

export default function PurchaseOrdersPage() {
  const { currencySymbol } = useAppConfig();
  const [pos, setPos] = useState<PurchaseOrder[]>(INITIAL_POS);
  const [filter, setFilter] = useState<PoStatus | "All">("All");
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [newSupplier, setNewSupplier] = useState("");
  const [newItem, setNewItem] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [newPrice, setNewPrice] = useState("");

  const fmt = (v: number) => `${currencySymbol} ${v.toLocaleString()}`;

  const filtered = pos.filter((p) => {
    const q = search.trim().toLowerCase();
    return (
      (filter === "All" || p.status === filter) &&
      (!q || p.id.toLowerCase().includes(q) || p.supplier.toLowerCase().includes(q))
    );
  });

  const stats = [
    { label: "Drafts", value: pos.filter((p) => p.status === "Draft").length, color: "#64748b" },
    { label: "Approved", value: pos.filter((p) => p.status === "Approved").length, color: "#2563eb" },
    { label: "Received", value: pos.filter((p) => p.status === "Received").length, color: "#059669" },
    { label: "Awaiting delivery", value: pos.filter((p) => p.status === "Approved").length, color: "#b45309" },
  ];

  const setStatus = (id: string, status: PoStatus) =>
    setPos((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));

  const createPo = () => {
    if (!newSupplier.trim()) return;
    const items = newItem.trim() ? 1 : 0;
    const total = items ? Math.round((Number(newQty) || 0) * (Number(newPrice) || 0)) : 0;
    const next: PurchaseOrder = {
      id: `PO-${1009 + pos.length}`,
      supplier: newSupplier.trim(),
      date: new Date().toISOString().slice(0, 10),
      items,
      total,
      status: "Draft",
      expected: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    };
    setPos((prev) => [next, ...prev]);
    setNewSupplier(""); setNewItem(""); setNewQty("1"); setNewPrice("");
    setShowModal(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Purchase Orders</h1>
          <p className="text-sm text-muted mt-1">Create and track orders from your suppliers.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-accent text-white px-4 py-2 text-sm font-medium hover:bg-accent/90 transition-colors"
        >
          <Plus size={16} /> New Purchase Order
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-card border border-border p-4 relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: s.color }} />
            <p className="text-xl font-extrabold text-foreground">{s.value}</p>
            <p className="text-[11px] text-muted mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-card border border-border p-1">
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                filter === s ? "bg-accent text-white" : "text-foreground/50 hover:text-foreground"
              }`}
            >
              {s} <span className="opacity-70">({s === "All" ? pos.length : pos.filter((p) => p.status === s).length})</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 bg-card border border-border px-3 py-2 w-56">
          <Search size={14} className="text-muted flex-shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search PO or supplier..."
            className="flex-1 text-[13px] outline-none bg-transparent text-foreground placeholder:text-muted"
          />
        </div>
      </div>

      <div className="bg-card border border-border overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="p-4 font-medium">PO Number</th>
              <th className="p-4 font-medium">Supplier</th>
              <th className="p-4 font-medium">Ordered</th>
              <th className="p-4 font-medium">Items</th>
              <th className="p-4 font-medium text-right">Total</th>
              <th className="p-4 font-medium">Expected</th>
              <th className="p-4 font-medium">Status</th>
              <th className="p-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((p) => (
              <tr key={p.id} className="hover:bg-surface/50">
                <td className="p-4 text-[13px] font-bold text-foreground">{p.id}</td>
                <td className="p-4 text-[13px] text-foreground">{p.supplier}</td>
                <td className="p-4 text-[13px] text-muted whitespace-nowrap">{p.date}</td>
                <td className="p-4 text-[13px] text-muted">{p.items}</td>
                <td className="p-4 text-right text-[13px] font-bold text-foreground tabular-nums">{fmt(p.total)}</td>
                <td className="p-4 text-[13px] text-muted whitespace-nowrap">{p.expected ?? "—"}</td>
                <td className="p-4">
                  <span className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${STATUS_STYLES[p.status]}`}>
                    {p.status === "Received" ? <CheckCircle2 size={11} /> : p.status === "Approved" ? <Truck size={11} /> : p.status === "Cancelled" ? <Ban size={11} /> : <FileText size={11} />}
                    {p.status}
                  </span>
                </td>
                <td className="p-4">
                  <div className="flex items-center justify-end gap-1.5">
                    {p.status === "Draft" && (
                      <>
                        <button
                          onClick={() => setStatus(p.id, "Approved")}
                          className="flex items-center gap-1 px-2.5 h-8 text-[12px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
                        >
                          <CheckCircle2 size={13} /> Approve
                        </button>
                        <button
                          onClick={() => setStatus(p.id, "Cancelled")}
                          title="Cancel order"
                          className="w-8 h-8 flex items-center justify-center border border-border text-foreground/50 hover:text-red-600 hover:border-red-200 transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </>
                    )}
                    {p.status === "Approved" && (
                      <button
                        onClick={() => setStatus(p.id, "Received")}
                        className="flex items-center gap-1 px-2.5 h-8 text-[12px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                      >
                        <Truck size={13} /> Mark received
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="p-10 text-center text-sm text-muted">No purchase orders match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-card border border-border w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-[15px] font-bold text-foreground">New Purchase Order</h2>
              <button onClick={() => setShowModal(false)} className="text-muted hover:text-foreground"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-[12px] text-muted font-medium">Supplier</label>
                <input
                  value={newSupplier}
                  onChange={(e) => setNewSupplier(e.target.value)}
                  placeholder="e.g. Rwanda Supply Co"
                  className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-[14px] text-foreground outline-none focus:border-accent bg-transparent"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="text-[12px] text-muted font-medium">Qty</label>
                  <input
                    type="number" min="1" value={newQty}
                    onChange={(e) => setNewQty(e.target.value)}
                    className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-[14px] text-foreground outline-none focus:border-accent bg-transparent"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[12px] text-muted font-medium">Item</label>
                  <input
                    value={newItem}
                    onChange={(e) => setNewItem(e.target.value)}
                    placeholder="e.g. Rice 25kg"
                    className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-[14px] text-foreground outline-none focus:border-accent bg-transparent"
                  />
                </div>
              </div>
              <div>
                <label className="text-[12px] text-muted font-medium">Unit price ({currencySymbol})</label>
                <input
                  type="number" min="0" value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-[14px] text-foreground outline-none focus:border-accent bg-transparent font-mono"
                />
              </div>
              <button
                onClick={createPo}
                disabled={!newSupplier.trim()}
                className="w-full py-3 bg-accent text-white font-bold text-[14px] rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Create draft order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
