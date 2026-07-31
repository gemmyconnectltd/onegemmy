"use client";

import { useState } from "react";
import { CheckCircle2, ClipboardList, Plus, Search, X } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, FormFooter } from "@/components/ui/Form";

type ReqStatus = "Pending" | "Approved" | "Rejected";

type Requisition = {
  id: string;
  requestedBy: string;
  department: string;
  item: string;
  qty: number;
  date: string;
  status: ReqStatus;
};

const INITIAL_REQS: Requisition[] = [
  { id: "REQ-204", requestedBy: "Sarah M.", department: "Kitchen", item: "Cooking oil 20L", qty: 4, date: "2026-07-30", status: "Pending" },
  { id: "REQ-203", requestedBy: "Jean B.", department: "Sales", item: "Receipt paper rolls", qty: 50, date: "2026-07-29", status: "Approved" },
  { id: "REQ-202", requestedBy: "Alice U.", department: "Store", item: "Packaging bags (large)", qty: 200, date: "2026-07-28", status: "Pending" },
  { id: "REQ-201", requestedBy: "David K.", department: "Kitchen", item: "Rice 25kg bags", qty: 10, date: "2026-07-27", status: "Rejected" },
  { id: "REQ-200", requestedBy: "Marie C.", department: "Admin", item: "Printer toner", qty: 2, date: "2026-07-26", status: "Approved" },
];

const STATUS_STYLES: Record<ReqStatus, string> = {
  Pending: "bg-amber-100 text-amber-700",
  Approved: "bg-emerald-100 text-emerald-700",
  Rejected: "bg-red-50 text-red-600",
};

export default function PurchaseRequestsPage() {
  const [reqs, setReqs] = useState<Requisition[]>(INITIAL_REQS);
  const [filter, setFilter] = useState<ReqStatus | "All">("All");
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ requestedBy: "", department: "", item: "", qty: "1" });

  const filtered = reqs.filter((r) => {
    const q = search.trim().toLowerCase();
    return (
      (filter === "All" || r.status === filter) &&
      (!q || r.item.toLowerCase().includes(q) || r.requestedBy.toLowerCase().includes(q) || r.id.toLowerCase().includes(q))
    );
  });

  const setStatus = (id: string, status: ReqStatus) =>
    setReqs((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));

  const addReq = () => {
    if (!form.item.trim()) return;
    setReqs((prev) => [
      {
        id: `REQ-${205 + prev.length}`,
        requestedBy: form.requestedBy.trim() || "Team",
        department: form.department.trim() || "General",
        item: form.item.trim(),
        qty: Number(form.qty) || 1,
        date: new Date().toISOString().slice(0, 10),
        status: "Pending",
      },
      ...prev,
    ]);
    setForm({ requestedBy: "", department: "", item: "", qty: "1" });
    setShowModal(false);
  };

  const pending = reqs.filter((r) => r.status === "Pending").length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Purchase Requests</h1>
          <p className="text-sm text-muted mt-1">Requisitions from your team, waiting for approval.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 text-white px-4 py-2 text-sm font-medium transition-colors rounded-lg" style={{ backgroundColor: "#0e7490" }}
        >
          <Plus size={16} /> New Request
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-card border border-border p-1">
          {(["All", "Pending", "Approved", "Rejected"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 text-[13px] font-semibold transition-colors rounded-lg ${
                filter === s ? "text-white" : "text-foreground/50 hover:text-foreground"
              }`}
              style={filter === s ? { backgroundColor: "#0e7490" } : undefined}
            >
              {s} <span className="opacity-70">({s === "All" ? reqs.length : reqs.filter((r) => r.status === s).length})</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 bg-card border border-border px-3 py-2 w-56">
          <Search size={14} className="text-muted flex-shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search requests..."
            className="flex-1 text-[13px] outline-none bg-transparent text-foreground placeholder:text-muted"
          />
        </div>
      </div>

      <div className="bg-card border border-border overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="p-4 font-medium">Request</th>
              <th className="p-4 font-medium">Item</th>
              <th className="p-4 font-medium">Department</th>
              <th className="p-4 font-medium">Requested by</th>
              <th className="p-4 font-medium text-right">Qty</th>
              <th className="p-4 font-medium">Date</th>
              <th className="p-4 font-medium">Status</th>
              <th className="p-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((r) => (
              <tr key={r.id} className="hover:bg-surface/50">
                <td className="p-4">
                  <span className="flex items-center gap-2 text-[13px] font-bold text-foreground">
                    <ClipboardList size={14} className="text-accent" />{r.id}
                  </span>
                </td>
                <td className="p-4 text-[13px] text-foreground">{r.item}</td>
                <td className="p-4 text-[13px] text-muted">{r.department}</td>
                <td className="p-4 text-[13px] text-muted">{r.requestedBy}</td>
                <td className="p-4 text-right text-[13px] font-semibold text-foreground tabular-nums">{r.qty}</td>
                <td className="p-4 text-[13px] text-muted whitespace-nowrap">{r.date}</td>
                <td className="p-4">
                  <span className={`inline-flex items-center text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${STATUS_STYLES[r.status]}`}>
                    {r.status}
                  </span>
                </td>
                <td className="p-4">
                  <div className="flex items-center justify-end gap-1.5">
                    {r.status === "Pending" && (
                      <>
                        <button
                          onClick={() => setStatus(r.id, "Approved")}
                          className="flex items-center gap-1 px-2.5 h-8 text-[12px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                        >
                          <CheckCircle2 size={13} /> Approve
                        </button>
                        <button
                          onClick={() => setStatus(r.id, "Rejected")}
                          className="flex items-center gap-1 px-2.5 h-8 text-[12px] font-semibold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"
                        >
                          <X size={13} /> Reject
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="p-10 text-center text-sm text-muted">No requests match.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[13px] text-muted">{pending} request{pending === 1 ? "" : "s"} awaiting approval.</p>

      <Drawer
        open={showModal}
        onClose={() => setShowModal(false)}
        title="New Purchase Request"
        description="Raise a requisition for your team to approve."
        side="right"
        footer={
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addReq();
            }}
          >
            <FormFooter submitLabel="Submit request" onCancel={() => setShowModal(false)} disabled={!form.item.trim()} />
          </form>
        }
      >
        <div className="p-5 space-y-4">
          <Field label="Item needed" required>
            <Input
              value={form.item}
              onChange={(e) => setForm((f) => ({ ...f, item: e.target.value }))}
              placeholder="e.g. Cooking oil 20L"
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Qty">
              <Input type="number" min="1" value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} />
            </Field>
            <Field label="Department">
              <Input value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} placeholder="Kitchen" />
            </Field>
          </div>
          <Field label="Requested by">
            <Input value={form.requestedBy} onChange={(e) => setForm((f) => ({ ...f, requestedBy: e.target.value }))} placeholder="Your name" />
          </Field>
        </div>
      </Drawer>
    </div>
  );
}
