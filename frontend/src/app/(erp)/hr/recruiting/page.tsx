"use client";

import { useState } from "react";
import { UserPlus, Trash2 } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import type { ApiApplicant } from "@/lib/api/hr";
import { useApplicants, useCreateApplicant, useUpdateApplicant, useDeleteApplicant } from "@/lib/api/hooks";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter } from "@/components/ui/Form";
import { EmptyState, ErrorState, StatusBadge } from "@/components/hr/State";

const STAGES = ["Applied", "Screening", "Interview", "Offer", "Hired", "Rejected"];
const FILTERS = ["All", ...STAGES];

export default function RecruitingPage() {
  const [filter, setFilter] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    position: "",
    stage: "Applied",
  });

  const { data, isLoading, isError, refetch } = useApplicants(filter === "All" ? undefined : filter);
  const applicants = data?.items ?? [];
  const loading = isLoading;
  const error = isError ? "Could not load applicants." : null;

  const createApplicant = useCreateApplicant();
  const updateApplicant = useUpdateApplicant();
  const deleteApplicant = useDeleteApplicant();

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.name) return;
    createApplicant.mutate({
      name: form.name,
      email: form.email || null,
      phone: form.phone || null,
      position: form.position || null,
      stage: form.stage,
    }, {
      onSuccess: () => {
        setShowForm(false);
        setForm({ name: "", email: "", phone: "", position: "", stage: "Applied" });
      },
      onError: () => setNotice("Could not add the applicant."),
    });
  };

  const advance = (a: ApiApplicant, next: string) => {
    updateApplicant.mutate({ id: a.id, data: { stage: next } }, {
      onError: () => setNotice("Could not update the applicant stage."),
    });
  };

  const remove = (a: ApiApplicant) => {
    if (!window.confirm(`Remove ${a.name}?`)) return;
    deleteApplicant.mutate(a.id, { onError: () => setNotice("Could not remove the applicant.") });
  };

  const stageCounts = (stage: string) =>
    stage === "All" ? applicants.length : applicants.filter((a) => a.stage === stage).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Recruiting</h1>
          <p className="text-sm text-muted mt-0.5">Track candidates through your hiring pipeline</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 text-white px-4 py-2.5 text-sm font-semibold transition-colors rounded-lg bg-accent"
        >
          <UserPlus size={15} /> Add Applicant
        </button>
      </div>

      {notice && <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{notice}</p>}

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`bg-card border p-3 text-left transition-colors ${filter === f ? "border-accent" : "border-border hover:border-foreground/20"}`}
          >
            <p className="text-lg font-extrabold text-foreground tracking-tight">{stageCounts(f)}</p>
            <p className="text-[11px] text-muted font-medium">{f}</p>
          </button>
        ))}
      </div>

      {loading ? (
        <PageLoader variant="compact" />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : applicants.length === 0 ? (
        <div className="bg-card border border-border rounded-xl">
          <EmptyState message="No applicants here yet." />
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="p-4 font-semibold">Applicant</th>
                <th className="p-4 font-semibold">Position</th>
                <th className="p-4 font-semibold">Applied</th>
                <th className="p-4 font-semibold">Stage</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {applicants.map((a) => {
                const idx = STAGES.indexOf(a.stage);
                const next = idx >= 0 && idx < STAGES.length - 1 ? STAGES[idx + 1] : null;
                return (
                  <tr key={a.id} className="hover:bg-surface/50 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-xs font-bold text-accent">
                          {a.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{a.name}</p>
                          <p className="text-xs text-muted">{a.email ?? a.phone ?? ""}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-sm text-muted">{a.position ?? "—"}</td>
                    <td className="p-4 text-sm text-muted">{a.applied_date}</td>
                    <td className="p-4"><StatusBadge status={a.stage} /></td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-1.5">
                        {next && (
                          <button
                            type="button"
                            onClick={() => advance(a, next)}
                            className="text-xs font-semibold text-accent hover:bg-accent/10 px-2 py-1 rounded-md transition-colors"
                          >
                            Move to {next} →
                          </button>
                        )}
                        <button type="button" onClick={() => remove(a)} className="w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-red-500 hover:bg-red-50 transition-colors" aria-label="Remove">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={showForm} onClose={() => setShowForm(false)} title="Add Applicant" description="Log a new candidate into the pipeline">
        <form onSubmit={submit} className="space-y-4 p-5">
          <Field label="Name" required>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Sipho Ndlovu" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="sipho@example.com" />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+254 700 000 000" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Position">
              <Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="Backend Engineer" />
            </Field>
            <Field label="Stage">
              <Select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
                {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
          </div>
          <FormFooter submitLabel={createApplicant.isPending ? "Saving…" : "Add Applicant"} onCancel={() => setShowForm(false)} disabled={createApplicant.isPending} />
        </form>
      </Drawer>
    </div>
  );
}
