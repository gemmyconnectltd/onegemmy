"use client";

import { useMemo, useState } from "react";
import { Archive, ArchiveRestore, Copy, Mail, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { ConfirmationDialog } from "@/components/support/ConfirmationDialog";
import { EMAIL_CATEGORIES, EmailTemplateEditor } from "@/components/support/EmailTemplateEditor";
import { EmptyState, ListSkeleton } from "@/components/support/EmptyState";
import { StatusBadge } from "@/components/support/StatusBadge";
import { SupportPageHeader } from "@/components/support/SupportPageHeader";
import { TableScroll } from "@/components/ui/TableScroll";
import { fmtDate } from "@/lib/date";
import { fillVariables } from "@/lib/support/richText";
import { useSupport } from "@/lib/support/store";
import type { EmailTemplate } from "@/lib/support/types";

export default function EmailTemplatesPage() {
  const { data, loading, actions } = useSupport();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [state, setState] = useState<"all" | "active" | "inactive" | "archived">("all");
  const [editing, setEditing] = useState<EmailTemplate | "new" | null>(null);
  const [del, setDel] = useState<EmailTemplate | null>(null);
  const [flash, setFlash] = useState("");

  const items = useMemo(() => (data?.emailTemplates ?? []).filter((t) => {
    const s = q.trim().toLowerCase();
    if (s && !t.name.toLowerCase().includes(s) && !t.subject.toLowerCase().includes(s)) return false;
    if (category !== "all" && t.category !== category) return false;
    if (state === "archived") return t.archived;
    if (t.archived) return false;
    return state === "all" || (state === "active" ? t.active : !t.active);
  }), [data, q, category, state]);

  if (editing) {
    return (
      <EmailTemplateEditor
        template={editing === "new" ? null : editing}
        onCancel={() => setEditing(null)}
        onSave={(t, asDraft) => {
          actions.upsertEmailTemplate({ ...t, archived: false, id: editing === "new" ? undefined : editing.id });
          setFlash(asDraft ? "Draft saved (inactive) in this demo browser." : editing === "new" ? "Template created in this demo browser." : "Template updated in this demo browser.");
          setEditing(null);
        }}
      />
    );
  }

  const ctl = "rounded-lg border border-border bg-card px-2.5 py-2 text-[13px] outline-none focus:border-accent";
  return (
    <div className="space-y-4">
      <SupportPageHeader title="Email templates" description="Reusable emails for common support requests. Variables are filled in when you use a template."
        actions={<button type="button" onClick={() => setEditing("new")} className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-white hover:opacity-90"><Plus size={14} /> New template</button>} />
      {flash && <p role="status" aria-live="polite" className="rounded-lg bg-accent/10 px-3 py-2 text-[12.5px] font-medium text-accent">{flash}</p>}
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input type="search" aria-label="Search templates" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates" className={`${ctl} w-full pl-8 text-base sm:text-[13px]`} />
        </div>
        <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className={ctl}><option value="all">All categories</option>{EMAIL_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
        <select aria-label="Status" value={state} onChange={(e) => setState(e.target.value as typeof state)} className={ctl}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {loading || !data ? <ListSkeleton rows={5} /> : items.length === 0 ? (
          <EmptyState icon={Mail} title="No templates found" description="Adjust the filters or create a new template." action={<button type="button" onClick={() => setEditing("new")} className="rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-white">New template</button>} />
        ) : (
          <TableScroll label="Email templates">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead><tr className="border-b border-border bg-surface text-[11px] uppercase tracking-wide text-muted"><th className="px-4 py-2.5 font-semibold">Template</th><th className="px-3 py-2.5 font-semibold">Category</th><th className="px-3 py-2.5 font-semibold">Status</th><th className="px-3 py-2.5 font-semibold">Updated</th><th className="px-4 py-2.5 text-right font-semibold">Actions</th></tr></thead>
              <tbody className="divide-y divide-border">
                {items.map((t) => (
                  <tr key={t.id} className="hover:bg-surface/50">
                    <td className="max-w-[22rem] px-4 py-3"><button type="button" onClick={() => setEditing(t)} className="block max-w-full text-left"><span className="block truncate font-semibold hover:text-accent">{t.name}</span><span className="block truncate text-[12px] text-muted">{fillVariables(t.subject)}</span></button></td>
                    <td className="px-3 py-3 text-muted">{t.category}</td>
                    <td className="px-3 py-3"><StatusBadge active={t.active} archived={t.archived} /></td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted">{fmtDate(t.updatedAt)}</td>
                    <td className="px-4 py-3"><div className="flex justify-end gap-0.5">
                      <button type="button" aria-label={`Edit ${t.name}`} title="Edit" onClick={() => setEditing(t)} className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-foreground"><Pencil size={14} /></button>
                      <button type="button" aria-label={`Duplicate ${t.name}`} title="Duplicate" onClick={() => { actions.duplicateEmailTemplate(t.id); setFlash(`“${t.name}” duplicated as an inactive copy.`); }} className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-foreground"><Copy size={14} /></button>
                      <button type="button" aria-label={`${t.archived ? "Restore" : "Archive"} ${t.name}`} title={t.archived ? "Restore" : "Archive"} onClick={() => actions.toggleArchiveEmailTemplate(t.id)} className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-foreground">{t.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}</button>
                      <button type="button" aria-label={`Delete ${t.name}`} title="Delete" onClick={() => setDel(t)} className="rounded-lg p-1.5 text-muted hover:bg-red-500/10 hover:text-red-600"><Trash2 size={14} /></button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </div>
      <ConfirmationDialog open={!!del} title="Delete this template?" message={`“${del?.name}” will be removed from this demo. This can't be undone (use Reset demo data to restore the originals).`} confirmLabel="Delete" onConfirm={() => { if (del) actions.deleteEmailTemplate(del.id); setDel(null); }} onCancel={() => setDel(null)} />
    </div>
  );
}
