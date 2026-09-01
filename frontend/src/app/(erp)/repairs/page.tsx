"use client";

import { useState } from "react";
import { Plus, Wrench, X, ChevronDown } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { type RepairJob } from "@/lib/api";
import { useRepairJobs, useCreateRepairJob, useUpdateRepairJob, useDeleteRepairJob } from "@/lib/api/hooks";

const STATUS_COLORS: Record<string, string> = {
  received:       "bg-blue-100 text-blue-700",
  diagnosing:     "bg-amber-100 text-amber-700",
  waiting_parts:  "bg-orange-100 text-orange-700",
  in_repair:      "bg-violet-100 text-violet-700",
  ready:          "bg-emerald-100 text-emerald-700",
  delivered:      "bg-slate-100 text-slate-600",
  cancelled:      "bg-red-100 text-red-500",
};

const STATUSES = Object.keys(STATUS_COLORS);

const EMPTY_FORM = {
  device_type: "", device_brand: "", device_model: "",
  serial_number: "", imei: "", device_condition: "",
  reported_issue: "", estimated_cost: 0,
  customer_id: "", assigned_to: "", promised_at: "",
};

export default function RepairsPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<Record<string, string>>({});

  const { data, isLoading } = useRepairJobs(statusFilter || undefined);
  const createJob = useCreateRepairJob();
  const updateJob = useUpdateRepairJob();
  const deleteJob = useDeleteRepairJob();
  const jobs: RepairJob[] = data?.items ?? [];

  function patch(k: keyof typeof EMPTY_FORM, v: string | number) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit() {
    if (!form.device_type || !form.reported_issue || createJob.isPending) return;
    const payload = {
      ...form,
      estimated_cost: Number(form.estimated_cost) || 0,
      customer_id: form.customer_id || null,
      assigned_to: form.assigned_to || null,
      promised_at: form.promised_at || null,
    };
    await createJob.mutateAsync(payload);
    setShowForm(false);
    setForm(EMPTY_FORM);
  }

  async function handleStatusChange(id: string, status: string) {
    setEditStatus((s) => ({ ...s, [id]: status }));
    await updateJob.mutateAsync({ id, data: { status } });
  }

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Repair Jobs</h1>
          <p className="text-sm text-muted mt-0.5">{jobs.length} job{jobs.length !== 1 ? "s" : ""}</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-accent transition-opacity hover:opacity-90">
          <Plus size={15} /> New Job
        </button>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-2">
        {["", ...STATUSES].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${statusFilter === s ? "bg-foreground text-background" : "bg-surface text-muted hover:text-foreground"}`}>
            {s ? s.replace("_", " ") : "All"}
          </button>
        ))}
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-bold text-foreground">New Repair Job</p>
            <button onClick={() => setShowForm(false)}><X size={16} className="text-muted" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { label: "Device Type *", key: "device_type", placeholder: "e.g. Phone, Laptop" },
              { label: "Brand", key: "device_brand", placeholder: "e.g. Samsung" },
              { label: "Model", key: "device_model", placeholder: "e.g. Galaxy S23" },
              { label: "Serial Number", key: "serial_number", placeholder: "" },
              { label: "IMEI", key: "imei", placeholder: "" },
              { label: "Condition", key: "device_condition", placeholder: "e.g. Cracked screen" },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="text-xs font-semibold text-muted mb-1 block">{label}</label>
                <input value={form[key as keyof typeof EMPTY_FORM] as string}
                  onChange={(e) => patch(key as keyof typeof EMPTY_FORM, e.target.value)}
                  placeholder={placeholder}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-foreground/30" />
              </div>
            ))}
          </div>
          <div>
            <label className="text-xs font-semibold text-muted mb-1 block">Reported Issue *</label>
            <textarea value={form.reported_issue} onChange={(e) => patch("reported_issue", e.target.value)}
              rows={2} placeholder="Describe the problem…"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-foreground/30 resize-none" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted mb-1 block">Estimated Cost</label>
              <input type="number" min={0} step="0.01" value={form.estimated_cost}
                onChange={(e) => patch("estimated_cost", e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-foreground/30" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted mb-1 block">Promise Date</label>
              <input type="datetime-local" value={form.promised_at}
                onChange={(e) => patch("promised_at", e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-foreground/30" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSubmit} disabled={createJob.isPending}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-accent hover:opacity-90 disabled:opacity-50">
              {createJob.isPending ? "Saving…" : "Create Job"}
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-surface text-muted hover:text-foreground">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
              <th className="px-4 py-3 font-semibold">Job #</th>
              <th className="px-4 py-3 font-semibold">Device</th>
              <th className="px-4 py-3 font-semibold">Issue</th>
              <th className="px-4 py-3 font-semibold">Customer</th>
              <th className="px-4 py-3 font-semibold">Est. Cost</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className="border-b border-border/60 last:border-0 hover:bg-surface/50">
                <td className="px-4 py-3 font-mono font-semibold text-foreground">{job.job_number}</td>
                <td className="px-4 py-3">
                  <div className="font-semibold text-foreground">{job.device_type}</div>
                  <div className="text-xs text-muted">{[job.device_brand, job.device_model].filter(Boolean).join(" · ")}</div>
                </td>
                <td className="px-4 py-3 text-muted max-w-[200px] truncate">{job.reported_issue}</td>
                <td className="px-4 py-3 text-muted">{job.customer_name ?? "—"}</td>
                <td className="px-4 py-3 text-foreground">{job.estimated_cost > 0 ? job.estimated_cost.toLocaleString() : "—"}</td>
                <td className="px-4 py-3">
                  <div className="relative inline-block">
                    <select
                      value={editStatus[job.id] ?? job.status}
                      onChange={(e) => handleStatusChange(job.id, e.target.value)}
                      className={`appearance-none pl-2 pr-6 py-1 rounded-full text-xs font-semibold cursor-pointer outline-none ${STATUS_COLORS[editStatus[job.id] ?? job.status] ?? "bg-surface text-muted"}`}>
                      {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                    </select>
                    <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => { if (confirm("Delete this repair job?")) deleteJob.mutateAsync(job.id); }}
                    className="text-xs text-muted hover:text-red-500 transition-colors font-semibold">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-16 text-center text-muted text-sm">
                No repair jobs yet. Click "New Job" to log a device for repair.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
