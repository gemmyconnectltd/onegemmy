"use client";

import { useState } from "react";
import { Plus, Trash2, Check, X } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import type { ApiLeave } from "@/lib/api/hr";
import { useLeave, useEmployees, useCreateLeave, useApproveLeave, useRejectLeave, useDeleteLeave } from "@/lib/api/hooks";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, Textarea, FormFooter } from "@/components/ui/Form";
import { EmptyState, ErrorState, StatusBadge } from "@/components/hr/State";

const LEAVE_TYPES = ["Annual", "Sick", "Maternity", "Study", "Unpaid"];
const FILTERS = ["All", "Pending", "Approved", "Rejected"];

export default function LeavePage() {
  const [filter, setFilter] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({
    employee_id: "",
    leave_type: "Annual",
    from_date: new Date().toISOString().slice(0, 10),
    to_date: new Date().toISOString().slice(0, 10),
    reason: "",
  });

  const days = (() => {
    if (!form.from_date || !form.to_date) return 0;
    const diff = (new Date(form.to_date).getTime() - new Date(form.from_date).getTime()) / 86400000;
    return Math.max(1, Math.round(diff) + 1);
  })();

  const { data: leaveData, isLoading: leaveLoading, isError, refetch } = useLeave(filter === "All" ? undefined : filter);
  const { data: empData, isLoading: empLoading } = useEmployees();
  const leaves = leaveData?.items ?? [];
  const employees = empData?.items ?? [];
  const loading = leaveLoading || empLoading;
  const error = isError ? "Could not load leave requests." : null;

  const createLeave = useCreateLeave();
  const approveLeave = useApproveLeave();
  const rejectLeave = useRejectLeave();
  const deleteLeave = useDeleteLeave();

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.employee_id) return;
    createLeave.mutate({
      employee_id: form.employee_id,
      leave_type: form.leave_type,
      from_date: form.from_date,
      to_date: form.to_date,
      reason: form.reason || null,
    }, {
      onSuccess: () => {
        setShowForm(false);
        setForm({ ...form, employee_id: "", reason: "" });
      },
      onError: () => setNotice("Could not create the leave request."),
    });
  };

  const act = (leave: ApiLeave, action: "approve" | "reject") => {
    const m = action === "approve" ? approveLeave : rejectLeave;
    m.mutate(leave.id, { onError: () => setNotice("Could not update the request.") });
  };

  const remove = (leave: ApiLeave) => {
    if (!window.confirm("Delete this leave request?")) return;
    deleteLeave.mutate(leave.id, { onError: () => setNotice("Could not delete the request.") });
  };

  const pendingCount = leaves.filter((l) => l.status === "Pending").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Leave Management</h1>
          <p className="text-sm text-muted mt-0.5">{pendingCount} request{pendingCount === 1 ? "" : "s"} awaiting review</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 text-white px-4 py-2.5 text-sm font-semibold transition-colors rounded-lg"
          style={{ backgroundColor: "#b45309" }}
        >
          <Plus size={15} /> Request Leave
        </button>
      </div>

      {notice && <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{notice}</p>}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filter === f ? "text-white" : "text-muted hover:bg-surface"}`}
            style={filter === f ? { backgroundColor: "#b45309" } : undefined}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <PageLoader variant="compact" />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : leaves.length === 0 ? (
        <div className="bg-card border border-border rounded-xl">
          <EmptyState message="No leave requests yet." />
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="p-4 font-semibold">Employee</th>
                <th className="p-4 font-semibold">Type</th>
                <th className="p-4 font-semibold">From</th>
                <th className="p-4 font-semibold">To</th>
                <th className="p-4 font-semibold">Days</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {leaves.map((l) => (
                <tr key={l.id} className="hover:bg-surface/50 transition-colors">
                  <td className="p-4">
                    <p className="text-sm font-medium text-foreground">{l.employee?.full_name ?? "—"}</p>
                    {l.reason && <p className="text-xs text-muted">{l.reason}</p>}
                  </td>
                  <td className="p-4 text-sm text-muted">{l.leave_type}</td>
                  <td className="p-4 text-sm text-muted">{l.from_date}</td>
                  <td className="p-4 text-sm text-muted">{l.to_date}</td>
                  <td className="p-4 text-sm font-medium text-foreground">{l.days}</td>
                  <td className="p-4"><StatusBadge status={l.status} /></td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-1.5">
                      {l.status === "Pending" && (
                        <>
                          <button
                            type="button"
                            onClick={() => act(l, "approve")}
                            className="w-7 h-7 rounded-md flex items-center justify-center bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                            aria-label="Approve"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => act(l, "reject")}
                            className="w-7 h-7 rounded-md flex items-center justify-center bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                            aria-label="Reject"
                          >
                            <X size={14} />
                          </button>
                        </>
                      )}
                      <button type="button" onClick={() => remove(l)} className="w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-red-500 hover:bg-red-50 transition-colors" aria-label="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={showForm} onClose={() => setShowForm(false)} title="Request Leave" description="Create a leave request for an employee">
        <form onSubmit={submit} className="space-y-4 p-5">
          <Field label="Employee" required>
            <Select required value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
              <option value="">Select employee</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.full_name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Leave type" required>
            <Select value={form.leave_type} onChange={(e) => setForm({ ...form, leave_type: e.target.value })}>
              {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From" required>
              <Input type="date" required value={form.from_date} onChange={(e) => setForm({ ...form, from_date: e.target.value })} />
            </Field>
            <Field label="To" required>
              <Input type="date" required value={form.to_date} onChange={(e) => setForm({ ...form, to_date: e.target.value })} />
            </Field>
          </div>
          <p className="text-xs text-muted -mt-2">{days} day{days === 1 ? "" : "s"} in this range</p>
          <Field label="Reason">
            <Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Optional note" rows={3} />
          </Field>
          <FormFooter submitLabel={createLeave.isPending ? "Saving…" : "Submit Request"} onCancel={() => setShowForm(false)} disabled={createLeave.isPending} />
        </form>
      </Drawer>
    </div>
  );
}
