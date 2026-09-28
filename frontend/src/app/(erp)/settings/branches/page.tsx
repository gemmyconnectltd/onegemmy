"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, Plus, Pencil, Trash2, MapPin, Phone, Globe, CheckCircle, XCircle, ChevronRight } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter } from "@/components/ui/Form";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useAppConfig } from "@/lib/appConfig";
import { useMyBranches, useCreateMyBranch, useUpdateMyBranch, useDeleteMyBranch } from "@/lib/api/hooks";
import type { ApiBranch } from "@/lib/api";

const EMPTY_FORM = { name: "", location: "", phone: "", email: "", status: "active" };

export default function BranchesPage() {
  const { brandColor } = useAppConfig();
  const C = brandColor;

  const { data, isLoading } = useMyBranches();
  const createBranch = useCreateMyBranch();
  const updateBranch = useUpdateMyBranch();
  const deleteBranch = useDeleteMyBranch();
  const { confirm, dialog } = useConfirmDialog();

  const branches = data?.items ?? [];

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ApiBranch | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (b: ApiBranch) => {
    setEditing(b);
    setForm({
      name: b.name,
      location: b.location ?? "",
      phone: b.phone ?? "",
      email: b.email ?? "",
      status: b.status ?? "active",
    });
    setFormError(null);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setFormError("Branch name is required"); return; }
    setFormError(null);
    const payload = {
      name: form.name.trim(),
      location: form.location.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      status: form.status,
    };
    try {
      if (editing) {
        await updateBranch.mutateAsync({ id: editing.id, data: payload });
      } else {
        await createBranch.mutateAsync(payload);
      }
      setShowForm(false);
    } catch (err) {
      setFormError((err as { detail?: string })?.detail ?? "Could not save branch");
    }
  };

  const handleDelete = (b: ApiBranch) => {
    confirm({
      title: "Delete branch?",
      message: `Delete "${b.name}"? Users assigned to this branch will be unassigned. This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: () => deleteBranch.mutateAsync(b.id),
    });
  };

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      {dialog}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Branches</h1>
          <p className="text-sm text-muted mt-0.5">{branches.length} branch{branches.length !== 1 ? "es" : ""}</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 text-white px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors"
          style={{ backgroundColor: C }}
        >
          <Plus size={15} /> Add Branch
        </button>
      </div>

      {branches.length === 0 ? (
        <div className="bg-card border border-border rounded-xl py-20 text-center">
          <Building2 size={36} className="text-border mx-auto mb-3" />
          <p className="text-sm font-semibold text-muted">No branches yet</p>
          <p className="text-xs text-muted/70 mt-1 mb-4">Add your first branch to manage multiple locations</p>
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-2 text-white px-4 py-2 text-sm font-semibold rounded-lg"
            style={{ backgroundColor: C }}
          >
            <Plus size={14} /> Add Branch
          </button>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-160">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="px-5 py-3 font-semibold">Branch</th>
                  <th className="px-5 py-3 font-semibold">Location</th>
                  <th className="px-5 py-3 font-semibold">Contact</th>
                  <th className="px-5 py-3 font-semibold text-center">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {branches.map((b) => (
                  <tr key={b.id} className="hover:bg-surface/50 transition-colors group">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${C}15` }}>
                          <Building2 size={14} style={{ color: C }} />
                        </div>
                        <Link href={`/settings/branches/${b.id}`} className="text-sm font-semibold text-foreground hover:text-accent hover:underline transition-colors">
                          {b.name}
                        </Link>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      {b.location ? (
                        <span className="flex items-center gap-1.5 text-[13px] text-muted">
                          <MapPin size={12} /> {b.location}
                        </span>
                      ) : <span className="text-muted">—</span>}
                    </td>
                    <td className="px-5 py-3.5 space-y-0.5">
                      {b.phone && (
                        <p className="flex items-center gap-1.5 text-[12px] text-muted">
                          <Phone size={11} /> {b.phone}
                        </p>
                      )}
                      {b.email && (
                        <p className="flex items-center gap-1.5 text-[12px] text-muted">
                          <Globe size={11} /> {b.email}
                        </p>
                      )}
                      {!b.phone && !b.email && <span className="text-muted text-[13px]">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      {b.status === "active" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
                          <CheckCircle size={11} /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-surface text-muted">
                          <XCircle size={11} /> Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEdit(b)}
                          className="w-7 h-7 rounded-lg bg-surface text-muted hover:text-accent hover:bg-accent/10 transition-colors flex items-center justify-center"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(b)}
                          className="w-7 h-7 rounded-lg bg-surface text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors flex items-center justify-center"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Drawer
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? "Edit Branch" : "Add Branch"}
        description={editing ? `Update details for ${editing.name}` : "Create a new branch location"}
        size="md"
      >
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <Field label="Branch Name" required>
            <Input
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Downtown Store"
            />
          </Field>
          <Field label="Location">
            <Input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="e.g. Kigali, Rwanda"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <Input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+250 7XX XXX XXX"
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="branch@company.com"
              />
            </Field>
          </div>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
          {formError && <p className="text-[12px] font-semibold text-red-600">{formError}</p>}
          <FormFooter
            submitLabel={createBranch.isPending || updateBranch.isPending ? "Saving…" : editing ? "Save Changes" : "Add Branch"}
            onCancel={() => setShowForm(false)}
            disabled={createBranch.isPending || updateBranch.isPending || !form.name.trim()}
          />
        </form>
      </Drawer>
    </div>
  );
}
