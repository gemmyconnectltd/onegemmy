"use client";

import { useMemo, useState } from "react";
import { Copy, Eye, MessageCircle, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { ConfirmationDialog } from "@/components/support/ConfirmationDialog";
import { EmptyState, ListSkeleton } from "@/components/support/EmptyState";
import { StatusBadge } from "@/components/support/StatusBadge";
import { SupportPageHeader } from "@/components/support/SupportPageHeader";
import { PhonePreview } from "@/components/support/TemplatePreview";
import { WA_CATEGORIES, WA_LANGUAGES, WhatsAppTemplateEditor } from "@/components/support/WhatsAppTemplateEditor";
import { fmtDate } from "@/lib/date";
import { useSupport } from "@/lib/support/store";
import type { WhatsAppStatus, WhatsAppTemplate } from "@/lib/support/types";

export default function WhatsAppTemplatesPage() {
  const { data, loading, actions } = useSupport();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | WhatsAppStatus>("all");
  const [category, setCategory] = useState("all");
  const [language, setLanguage] = useState("all");
  const [editing, setEditing] = useState<WhatsAppTemplate | "new" | null>(null);
  const [del, setDel] = useState<WhatsAppTemplate | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [flash, setFlash] = useState("");

  const items = useMemo(() => (data?.whatsappTemplates ?? []).filter((t) => {
    const s = q.trim().toLowerCase();
    return (!s || t.name.includes(s) || t.body.toLowerCase().includes(s)) && (status === "all" || t.status === status) && (category === "all" || t.category === category) && (language === "all" || t.language === language);
  }), [data, q, status, category, language]);

  if (editing) {
    return (
      <WhatsAppTemplateEditor
        template={editing === "new" ? null : editing} onCancel={() => setEditing(null)}
        onSave={(t, message) => { actions.upsertWhatsAppTemplate({ ...t, id: editing === "new" ? undefined : editing.id }); setFlash(message); setEditing(null); }}
      />
    );
  }

  const ctl = "rounded-lg border border-border bg-card px-2.5 py-2 text-[13px] outline-none focus:border-accent";
  return (
    <div className="space-y-4">
      <SupportPageHeader title="WhatsApp templates" description="Message templates for WhatsApp. Template statuses on this page are mock data: nothing has been submitted to or approved by Meta."
        actions={<button type="button" onClick={() => setEditing("new")} className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-white hover:opacity-90"><Plus size={14} /> New template</button>} />
      {flash && <p role="status" aria-live="polite" className="rounded-lg bg-accent/10 px-3 py-2 text-[12.5px] font-medium text-accent">{flash}</p>}
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs"><Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" /><input type="search" aria-label="Search templates" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates" className={`${ctl} w-full pl-8 text-base sm:text-[13px]`} /></div>
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={ctl}><option value="all">All statuses</option><option value="draft">Draft</option><option value="pending">Pending approval</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select>
        <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className={ctl}><option value="all">All categories</option>{WA_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
        <select aria-label="Language" value={language} onChange={(e) => setLanguage(e.target.value)} className={ctl}><option value="all">All languages</option>{WA_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</select>
      </div>

      {loading || !data ? <div className="rounded-xl border border-border bg-card"><ListSkeleton rows={4} /></div> : items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card"><EmptyState icon={MessageCircle} title="No templates found" description="Adjust the filters or create a new template." /></div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((t) => (
            <li key={t.id} className="flex flex-col rounded-xl border border-border bg-card p-4">
              <div className="mb-2 flex items-start justify-between gap-2"><p className="min-w-0 break-all font-mono text-[13px] font-semibold">{t.name}</p><StatusBadge template={t.status} /></div>
              <p className="mb-2 flex flex-wrap gap-x-2 text-[11.5px] text-muted"><span>{WA_LANGUAGES.find((l) => l.code === t.language)?.label}</span>·<span>{t.category}</span>·<span>Updated {fmtDate(t.updatedAt)}</span></p>
              {t.header && <p className="text-[12.5px] font-semibold">{t.header}</p>}
              <p className="line-clamp-4 flex-1 whitespace-pre-line text-[12.5px] text-foreground/80">{t.body}</p>
              {t.buttons.length > 0 && <p className="mt-1.5 text-[11.5px] text-muted">{t.buttons.length} button{t.buttons.length > 1 ? "s" : ""}: {t.buttons.map((b) => b.label).join(", ")}</p>}
              {t.status === "rejected" && t.rejectionReason && <p className="mt-1.5 text-[11.5px] text-red-600">Mock reason: {t.rejectionReason}</p>}
              <div className="mt-3 flex items-center gap-1 border-t border-border pt-2.5">
                <button type="button" onClick={() => setEditing(t)} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12.5px] font-semibold text-foreground/80 hover:bg-surface">{t.status === "approved" || t.status === "pending" ? <><Eye size={13} /> View</> : <><Pencil size={13} /> Edit</>}</button>
                <button type="button" onClick={() => setPreview(preview === t.id ? null : t.id)} aria-expanded={preview === t.id} className="rounded-lg px-2 py-1.5 text-[12.5px] font-semibold text-foreground/80 hover:bg-surface">Preview</button>
                <button type="button" aria-label={`Duplicate ${t.name}`} title="Duplicate" onClick={() => { actions.duplicateWhatsAppTemplate(t.id); setFlash(`“${t.name}” duplicated as a draft.`); }} className="ml-auto rounded-lg p-1.5 text-muted hover:bg-surface hover:text-foreground"><Copy size={14} /></button>
                <button type="button" aria-label={`Delete ${t.name}`} title={t.status === "draft" || t.status === "rejected" ? "Delete" : "Only drafts and rejected templates can be deleted"} disabled={t.status === "approved" || t.status === "pending"} onClick={() => setDel(t)} className="rounded-lg p-1.5 text-muted hover:bg-red-500/10 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"><Trash2 size={14} /></button>
              </div>
              {preview === t.id && <div className="mt-3 border-t border-border pt-3"><PhonePreview header={t.header} body={t.body} footer={t.footer} buttons={t.buttons} values={{ "1": "Aline", "2": "#1042", "3": "Friday" }} /></div>}
            </li>
          ))}
        </ul>
      )}
      <ConfirmationDialog open={!!del} title="Delete this template?" message={`“${del?.name}” will be removed from this demo. Use Reset demo data to restore the originals.`} confirmLabel="Delete" onConfirm={() => { if (del) actions.deleteWhatsAppTemplate(del.id); setDel(null); }} onCancel={() => setDel(null)} />
    </div>
  );
}
