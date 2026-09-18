"use client";

import { useState } from "react";
import { CheckCircle2, ClipboardList, Plus, Search, Trash2, X } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, Textarea, FormFooter } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { PageLoader } from "@/components/ui/PageLoader";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useBulkSelection } from "@/lib/useBulkSelection";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { fmtDateTime } from "@/lib/date";
import { useAppConfig } from "@/lib/appConfig";
import {
  useRequisitions, useDepartments,
  useCreateRequisition, useApproveRequisition, useRejectRequisition, useDeleteRequisition,
} from "@/lib/api/hooks";
import type { Requisition } from "@/lib/api";

type ReqStatus = "Pending" | "Approved" | "Rejected";
const STATUS_STYLES: Record<ReqStatus, string> = {
  Pending: "bg-amber-100 text-amber-700",
  Approved: "bg-emerald-100 text-emerald-700",
  Rejected: "bg-red-50 text-red-600",
};
const EMPTY_FORM = { item_name: "", quantity: "1", department_id: "", notes: "" };

export default function PurchaseRequestsPage() {
  const { brandColor } = useAppConfig();
  const [filter, setFilter] = useState<ReqStatus | "All">("All");
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const { data, isLoading } = useRequisitions();
  const { data: deptData } = useDepartments();
  const reqs = data?.items ?? [];
  const departments = deptData?.items ?? [];

  const createReq = useCreateRequisition();
  const approveReq = useApproveRequisition();
  const rejectReq = useRejectRequisition();
  const deleteReq = useDeleteRequisition();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  const filtered = reqs.filter((r) => {
    const q = search.trim().toLowerCase();
    return (
      (filter === "All" || r.status === filter) &&
      (!q || r.item_name.toLowerCase().includes(q) || (r.requested_by_name ?? "").toLowerCase().includes(q) || r.reference.toLowerCase().includes(q))
    );
  });

  const deletableIds = filtered.filter((r) => r.status === "Pending").map((r) => r.id);
  const bulk = useBulkSelection(deletableIds);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  function confirmBulkDelete() {
    confirm({
      title: "Delete Requisitions",
      message: `Delete ${bulk.count} selected pending request${bulk.count === 1 ? "" : "s"}? This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        setBulkDeleting(true);
        await Promise.allSettled(Array.from(bulk.selected).map((id) => deleteReq.mutateAsync(id)));
        setBulkDeleting(false);
        bulk.clear();
      },
    });
  }

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowModal(true);
  };

  const addReq = async () => {
    setFormError(null);
    if (!form.item_name.trim()) return;
    try {
      await createReq.mutateAsync({
        item_name: form.item_name.trim(),
        quantity: Number(form.quantity) || 1,
        department_id: form.department_id || null,
        notes: form.notes.trim() || null,
      });
      setShowModal(false);
    } catch (e: unknown) {
      setFormError((e as { detail?: string })?.detail ?? "Failed to submit request");
    }
  };

  const handleApprove = (r: Requisition) => {
    confirm({
      title: "Approve Requisition",
      message: `Approve request for "${r.item_name}"?`,
      confirmLabel: "Approve",
      onConfirm: () => approveReq.mutate(r.id),
    });
  };

  const handleReject = (r: Requisition) => {
    confirm({
      title: "Reject Requisition",
      message: `Reject request for "${r.item_name}"?`,
      confirmLabel: "Reject",
      danger: true,
      onConfirm: () => rejectReq.mutate(r.id),
    });
  };

  const handleDelete = (r: Requisition) => {
    confirm({
      title: "Delete Requisition",
      message: `Delete request "${r.reference}"? This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: () => deleteReq.mutate(r.id),
    });
  };

  const pending = reqs.filter((r) => r.status === "Pending").length;

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-5">
      {confirmDialog}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Purchase Requests</h1>
          <p className="text-sm text-muted mt-1">Requisitions from your team, waiting for approval.</p>
        </div>
        <Button onClick={openAdd} color={brandColor}>
          <Plus size={16} /> New Request
        </Button>
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
              style={filter === s ? { backgroundColor: brandColor } : undefined}
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

      {bulk.count > 0 && (
        <BulkActionBar count={bulk.count} label="request" onDelete={confirmBulkDelete} onClear={bulk.clear} deleting={bulkDeleting} />
      )}

      <div className="bg-card border border-border overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="p-4 w-10">
                <input type="checkbox" checked={bulk.allSelected} ref={(el) => { if (el) el.indeterminate = bulk.someSelected; }} onChange={bulk.toggleAll} className="w-4 h-4 rounded" disabled={deletableIds.length === 0} />
              </th>
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
                  {r.status === "Pending" && (
                    <input type="checkbox" checked={bulk.selected.has(r.id)} onChange={() => bulk.toggle(r.id)} className="w-4 h-4 rounded" />
                  )}
                </td>
                <td className="p-4">
                  <span className="flex items-center gap-2 text-[13px] font-bold text-foreground">
                    <ClipboardList size={14} className="text-accent" />{r.reference}
                  </span>
                </td>
                <td className="p-4 text-[13px] text-foreground">{r.item_name}</td>
                <td className="p-4 text-[13px] text-muted">{r.department_name ?? "—"}</td>
                <td className="p-4 text-[13px] text-muted">{r.requested_by_name ?? "—"}</td>
                <td className="p-4 text-right text-[13px] font-semibold text-foreground tabular-nums">{r.quantity}</td>
                <td className="p-4 text-[13px] text-muted whitespace-nowrap">{fmtDateTime(r.created_at)}</td>
                <td className="p-4">
                  <span className={`inline-flex items-center text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${STATUS_STYLES[r.status as ReqStatus] ?? "bg-surface text-muted"}`}>
                    {r.status}
                  </span>
                </td>
                <td className="p-4">
                  <div className="flex items-center justify-end gap-1.5">
                    {r.status === "Pending" && (
                      <>
                        <button
                          onClick={() => handleApprove(r)}
                          className="flex items-center gap-1 px-2.5 h-8 text-[12px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                        >
                          <CheckCircle2 size={13} /> Approve
                        </button>
                        <button
                          onClick={() => handleReject(r)}
                          className="flex items-center gap-1 px-2.5 h-8 text-[12px] font-semibold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"
                        >
                          <X size={13} /> Reject
                        </button>
                        <button onClick={() => handleDelete(r)}
                          className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors text-[12px] font-semibold">
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="p-10 text-center text-sm text-muted">No requests match.</td></tr>
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
          <form onSubmit={(e) => { e.preventDefault(); addReq(); }}>
            <FormFooter submitLabel={createReq.isPending ? "Submitting…" : "Submit request"} onCancel={() => setShowModal(false)} disabled={createReq.isPending || !form.item_name.trim()} />
          </form>
        }
      >
        <div className="p-5 space-y-4">
          <Field label="Item needed" required>
            <Input
              value={form.item_name}
              onChange={(e) => setForm((f) => ({ ...f, item_name: e.target.value }))}
              placeholder="e.g. Cooking oil 20L"
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Qty">
              <Input type="number" min="1" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} />
            </Field>
            <Field label="Department">
              <Select value={form.department_id} onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))}>
                <option value="">— None —</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Notes">
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional notes..." />
          </Field>
          {formError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>
          )}
        </div>
      </Drawer>
    </div>
  );
}
