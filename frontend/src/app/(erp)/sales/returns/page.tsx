"use client";
import { fmtMoney } from "@/lib/config";
import { RotateCcw, CheckCircle2, Clock, XCircle, Plus, Edit2, Trash2, AlertCircle } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { useState } from "react";
import { useAppConfig } from "@/lib/appConfig";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter, Textarea } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { useReturns, useCustomers, useOrders, useCreateReturn, useUpdateReturn, useDeleteReturn } from "@/lib/api/hooks";
import type { ApiReturn } from "@/lib/api";

const SAL = "#0284c7";

const STATUS_STYLE: Record<string, string> = {
  Approved: "bg-emerald-100 text-emerald-700",
  Pending:  "bg-amber-100 text-amber-700",
  Rejected: "bg-red-100 text-red-600",
};
const STATUS_ICON: Record<string, React.ElementType> = {
  Approved: CheckCircle2, Pending: Clock, Rejected: XCircle,
};

const EMPTY_FORM = { order_id: "", customer_id: "", reason: "", status: "Pending", return_date: new Date().toISOString().slice(0, 10) };

export default function SalesReturnsPage() {
  const { currencySymbol } = useAppConfig();
  const fmt = (v: number) => fmtMoney(v, currencySymbol);

  const [error, setError] = useState<string | null>(null);
  const [shownLoadError, setShownLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState("All");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<ApiReturn | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const returnsQ = useReturns(1, 200);
  const customersQ = useCustomers(1, 200);
  const ordersQ = useOrders(1, 200);
  const loading = returnsQ.isLoading || customersQ.isLoading || ordersQ.isLoading;
  const returns = returnsQ.data?.items ?? [];
  const customers = customersQ.data?.items ?? [];
  const orders = ordersQ.data?.items ?? [];

  const loadError = returnsQ.error ?? customersQ.error ?? ordersQ.error;
  const loadErrorMessage = loadError ? (loadError as { detail?: string })?.detail ?? "Failed to load returns" : null;
  if (loadErrorMessage !== shownLoadError) {
    setShownLoadError(loadErrorMessage);
    if (loadErrorMessage !== null) setError(loadErrorMessage);
  }

  const createReturn = useCreateReturn();
  const updateReturn = useUpdateReturn();
  const deleteReturn = useDeleteReturn();
  const saving = createReturn.isPending || updateReturn.isPending;

  const approved = returns.filter((r) => r.status === "Approved");
  const pending  = returns.filter((r) => r.status === "Pending");
  const totalRefunded = approved.reduce((s, r) => s + r.refund_amount, 0);

  const stats = [
    { label: "Total Returns",  value: String(returns.length),  icon: RotateCcw,    color: SAL },
    { label: "Approved",       value: String(approved.length), icon: CheckCircle2, color: "#10b981" },
    { label: "Pending",        value: String(pending.length),  icon: Clock,        color: "#f59e0b" },
    { label: "Total Refunded", value: fmt(totalRefunded),      icon: RotateCcw,    color: "#3b82f6" },
  ];

  const filtered = filter === "All" ? returns : returns.filter((r) => r.status === filter);

  const openAdd = () => { setForm(EMPTY_FORM); setShowAdd(true); };
  const openEdit = (r: ApiReturn) => {
    setEditing(r);
    setForm({ order_id: r.order_id ?? "", customer_id: r.customer_id ?? "", reason: r.reason ?? "", status: r.status, return_date: r.return_date });
  };
  const closeDrawer = () => { setShowAdd(false); setEditing(null); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      order_id: form.order_id || null,
      customer_id: form.customer_id || null,
      reason: form.reason || null,
      status: form.status,
      return_date: form.return_date,
      items: [],
    };
    const onError = (err: Error) => setError((err as { detail?: string })?.detail ?? "Failed to save return");
    const onSuccess = () => { setError(null); closeDrawer(); };
    if (editing) {
      updateReturn.mutate({ id: editing.id, data: { order_id: payload.order_id, customer_id: payload.customer_id, reason: payload.reason, status: payload.status, return_date: payload.return_date } }, { onSuccess, onError });
    } else {
      createReturn.mutate(payload, { onSuccess, onError });
    }
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this return?")) return;
    deleteReturn.mutate(id, { onError: (err: Error) => setError((err as { detail?: string })?.detail ?? "Failed to delete return") });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Sales Returns</h1>
          <p className="text-sm text-muted mt-0.5">{returns.length} return requests</p>
        </div>
        <Button color={SAL} onClick={openAdd}><Plus size={15} /> New Return</Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={15} /> {error}
          <button className="ml-auto text-xs underline" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-card p-4">
            <div className="w-8 h-8 flex items-center justify-center mb-2" style={{ backgroundColor: `${s.color}10` }}>
              <s.icon size={16} style={{ color: s.color }} />
            </div>
            <p className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight">{loading ? "—" : s.value}</p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-1 bg-surface border border-border rounded-xl p-1 w-fit">
            {["All", "Approved", "Pending", "Rejected"].map((s) => (
              <button key={s} onClick={() => setFilter(s)}
                className={`px-3 py-1.5 text-[12px] font-semibold rounded-lg transition-colors ${filter === s ? "text-white" : "text-foreground/50 hover:text-foreground"}`}
                style={filter === s ? { backgroundColor: SAL } : undefined}>{s}</button>
            ))}
          </div>
        </div>

        {loading ? (
          <PageLoader variant="compact" />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="p-4 font-semibold">Return ID</th>
                <th className="p-4 font-semibold">Order</th>
                <th className="p-4 font-semibold">Customer</th>
                <th className="p-4 font-semibold">Reason</th>
                <th className="p-4 font-semibold">Date</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 font-semibold text-right">Refund</th>
                <th className="p-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => {
                const Icon = STATUS_ICON[r.status] ?? Clock;
                const orderNum = orders.find((o) => o.id === r.order_id)?.order_number;
                return (
                  <tr key={r.id} className="hover:bg-surface/50 transition-colors group">
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ backgroundColor: `${SAL}15` }}>
                          <RotateCcw size={12} style={{ color: SAL }} />
                        </div>
                        <span className="text-sm font-mono font-bold" style={{ color: SAL }}>{r.return_number}</span>
                      </div>
                    </td>
                    <td className="p-4 text-sm font-mono text-muted">{orderNum ?? r.order_id?.slice(0, 8) ?? "—"}</td>
                    <td className="p-4 text-sm font-medium text-foreground">{r.customer?.name ?? "—"}</td>
                    <td className="p-4 text-sm text-muted max-w-[160px] truncate">{r.reason ?? "—"}</td>
                    <td className="p-4 text-sm text-muted">{r.return_date}</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLE[r.status] ?? "bg-slate-100 text-slate-600"}`}>
                        <Icon size={11} /> {r.status}
                      </span>
                    </td>
                    <td className="p-4 text-right text-sm font-bold text-foreground tabular-nums">{fmt(r.refund_amount)}</td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => openEdit(r)} aria-label="Edit return" className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-accent hover:bg-accent/10 transition-colors text-[12px] font-semibold disabled:opacity-50"><Edit2 size={13} /> Edit</button>
                        <button onClick={() => handleDelete(r.id)} aria-label="Delete return" className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors text-[12px] font-semibold disabled:opacity-50"><Trash2 size={13} /> Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!loading && filtered.length === 0 && (
          <div className="py-16 text-center">
            <RotateCcw size={32} className="text-border mx-auto mb-3" />
            <p className="text-sm font-semibold text-muted">No returns found</p>
          </div>
        )}
      </div>

      <Drawer open={showAdd || !!editing} onClose={closeDrawer} title={editing ? "Edit Return" : "New Return"} description={editing ? editing.return_number : "Record a return request"} size="md">
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Order">
              <Select value={form.order_id} onChange={(e) => setForm({ ...form, order_id: e.target.value })}>
                <option value="">— Select order —</option>
                {orders.map((o) => <option key={o.id} value={o.id}>{o.order_number}</option>)}
              </Select>
            </Field>
            <Field label="Customer">
              <Select value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })}>
                <option value="">— Select customer —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Reason">
            <Textarea rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Defective item, wrong size..." />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Return Date" required>
              <Input type="date" value={form.return_date} onChange={(e) => setForm({ ...form, return_date: e.target.value })} />
            </Field>
            <Field label="Status">
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option>Pending</option><option>Approved</option><option>Rejected</option>
              </Select>
            </Field>
          </div>
          <FormFooter submitLabel={saving ? "Saving..." : editing ? "Save Changes" : "Add Return"} onCancel={closeDrawer} disabled={!form.return_date || saving} color={SAL} />
        </form>
      </Drawer>
    </div>
  );
}
