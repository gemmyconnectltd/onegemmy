"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, FlaskConical, Plus, Save, Send, Trash2 } from "lucide-react";
import { useSupport } from "@/lib/support/store";
import type { WhatsAppButton, WhatsAppCategory, WhatsAppLanguage, WhatsAppStatus, WhatsAppTemplate } from "@/lib/support/types";
import { StatusBadge } from "./StatusBadge";
import { PhonePreview } from "./TemplatePreview";

export const WA_LANGUAGES: { code: WhatsAppLanguage; label: string }[] = [{ code: "en", label: "English" }, { code: "fr", label: "French" }, { code: "rw", label: "Kinyarwanda" }, { code: "sw", label: "Swahili" }];
export const WA_CATEGORIES: WhatsAppCategory[] = ["Utility", "Marketing", "Authentication"];
type Draft = Omit<WhatsAppTemplate, "id" | "updatedAt">;
const control = "w-full rounded-lg border bg-card px-3 py-2 text-base outline-none focus:border-accent disabled:opacity-60 sm:text-[13.5px]";
const NAME_RE = /^[a-z0-9_]+$/;

/** Placeholder numbers must run 1, 2, 3… without gaps (Meta's rule), so templates stay valid when submitted for real. */
function variableProblem(text: string): string | null {
  const nums = [...new Set([...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
  return nums.some((n, i) => n !== i + 1) ? "Variables must be numbered {{1}}, {{2}}, {{3}}… with no gaps." : null;
}

export function WhatsAppTemplateEditor({ template, onSave, onCancel }: { template: WhatsAppTemplate | null; onSave: (t: Draft, message: string) => void; onCancel: () => void }) {
  const { data, actions } = useSupport();
  const locked = !!template && (template.status === "approved" || template.status === "pending");
  const [f, setF] = useState<Draft>({
    name: template?.name ?? "", language: template?.language ?? "en", category: template?.category ?? "Utility", status: template?.status ?? "draft",
    header: template?.header ?? "", body: template?.body ?? "", footer: template?.footer ?? "", buttons: template?.buttons ?? [], rejectionReason: template?.rejectionReason,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setF((x) => ({ ...x, [k]: v }));
  const taken = useMemo(() => new Set((data?.whatsappTemplates ?? []).filter((t) => t.id !== template?.id).map((t) => `${t.name}:${t.language}`)), [data, template]);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!f.name) e.name = "Add a template name.";
    else if (!NAME_RE.test(f.name)) e.name = "Use lowercase letters, numbers and underscores only.";
    else if (f.name.length > 60) e.name = "Keep the name under 60 characters.";
    else if (taken.has(`${f.name}:${f.language}`)) e.name = "A template with this name and language already exists.";
    if (!f.body.trim()) e.body = "The message body is required.";
    else if (f.body.length > 1024) e.body = "Body is too long (max 1,024 characters).";
    else { const v = variableProblem(f.body); if (v) e.body = v; }
    if ((f.header ?? "").length > 60) e.header = "Header is too long (max 60 characters).";
    if ((f.footer ?? "").length > 60) e.footer = "Footer is too long (max 60 characters).";
    if (/\{\{/.test(f.footer ?? "")) e.footer = "The footer can't contain variables.";
    if (f.buttons.length > 3) e.buttons = "WhatsApp allows up to 3 buttons.";
    f.buttons.forEach((b, i) => {
      if (!b.label.trim()) e[`b${i}`] = "Give the button a label.";
      else if (b.label.length > 25) e[`b${i}`] = "Button labels are limited to 25 characters.";
      else if (b.type === "url" && !/^https:\/\/[^\s]+$/i.test(b.url ?? "")) e[`b${i}`] = "Enter a full https:// link.";
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = (status: WhatsAppStatus) => {
    if (!validate()) return;
    onSave({ ...f, header: f.header?.trim() || undefined, footer: f.footer?.trim() || undefined, status, rejectionReason: status === "rejected" ? f.rejectionReason : undefined },
      status === "pending" ? "Marked “Pending approval” in this demo. It was NOT submitted to Meta." : "Draft saved in this demo browser.");
  };
  const setButton = (i: number, patch: Partial<WhatsAppButton>) => set("buttons", f.buttons.map((b, n) => (n === i ? { ...b, ...patch } : b)));
  const err = (k: string) => errors[k] ? <p role="alert" className="mt-1 text-[12px] text-red-600">{errors[k]}</p> : null;

  return (
    <div className="space-y-4">
      <button type="button" onClick={onCancel} className="flex items-center gap-1 text-[13px] font-semibold text-muted hover:text-foreground"><ArrowLeft size={14} /> All WhatsApp templates</button>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2"><h2 className="text-[16px] font-bold">{template ? (locked ? "View template" : "Edit template") : "New WhatsApp template"}</h2>{template && <StatusBadge template={template.status} />}</div>
          {locked && <p className="rounded-lg border border-border bg-surface px-3 py-2 text-[12.5px] text-muted">{template?.status === "pending" ? "This template is waiting for review, so it can't be edited. " : "Approved templates can't be edited. "}Duplicate it from the list to make changes.</p>}
          {template?.status === "rejected" && template.rejectionReason && <p className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-700 dark:text-red-400"><AlertTriangle size={14} className="mt-0.5 flex-shrink-0" /><span><strong>Rejected (mock reason):</strong> {template.rejectionReason}</span></p>}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <label htmlFor="wa-name" className="mb-1.5 block text-[12px] font-semibold text-muted">Template name <span className="text-red-500">*</span></label>
              <input id="wa-name" disabled={locked} value={f.name} onChange={(e) => set("name", e.target.value.toLowerCase().replace(/\s+/g, "_"))} placeholder="order_followup" aria-invalid={!!errors.name} className={`${control} font-mono ${errors.name ? "border-red-500" : "border-border"}`} />
              {err("name")}
            </div>
            <div><label htmlFor="wa-lang" className="mb-1.5 block text-[12px] font-semibold text-muted">Language</label>
              <select id="wa-lang" disabled={locked} value={f.language} onChange={(e) => set("language", e.target.value as WhatsAppLanguage)} className={`${control} border-border`}>{WA_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</select></div>
            <div><label htmlFor="wa-cat" className="mb-1.5 block text-[12px] font-semibold text-muted">Category</label>
              <select id="wa-cat" disabled={locked} value={f.category} onChange={(e) => set("category", e.target.value as WhatsAppCategory)} className={`${control} border-border`}>{WA_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
          </div>

          <div><label htmlFor="wa-header" className="mb-1.5 block text-[12px] font-semibold text-muted">Header <span className="font-normal">(optional, text)</span></label>
            <input id="wa-header" disabled={locked} value={f.header ?? ""} onChange={(e) => set("header", e.target.value)} className={`${control} ${errors.header ? "border-red-500" : "border-border"}`} />{err("header")}</div>
          <div><label htmlFor="wa-body" className="mb-1.5 block text-[12px] font-semibold text-muted">Body <span className="text-red-500">*</span></label>
            <textarea id="wa-body" disabled={locked} rows={6} value={f.body} onChange={(e) => set("body", e.target.value)} aria-invalid={!!errors.body} className={`${control} resize-y ${errors.body ? "border-red-500" : "border-border"}`} placeholder="Hello {{1}}, your request {{2}} has been received." />
            <div className="mt-1 flex justify-between text-[11.5px]">{err("body") ?? <span className="text-muted">Use {"{{1}}"}, {"{{2}}"}… for variables. *bold* _italic_ ~strike~</span>}<span className={f.body.length > 1024 ? "font-semibold text-red-600" : "text-muted"}>{f.body.length} / 1,024</span></div></div>
          <div><label htmlFor="wa-footer" className="mb-1.5 block text-[12px] font-semibold text-muted">Footer <span className="font-normal">(optional)</span></label>
            <input id="wa-footer" disabled={locked} value={f.footer ?? ""} onChange={(e) => set("footer", e.target.value)} className={`${control} ${errors.footer ? "border-red-500" : "border-border"}`} />{err("footer")}</div>

          <div>
            <div className="mb-1.5 flex items-center justify-between"><p className="text-[12px] font-semibold text-muted">Buttons <span className="font-normal">(up to 3)</span></p>
              {!locked && f.buttons.length < 3 && <div className="flex gap-2 text-[12px] font-semibold text-accent"><button type="button" onClick={() => set("buttons", [...f.buttons, { type: "quick_reply", label: "" }])} className="flex items-center gap-0.5 hover:underline"><Plus size={12} /> Quick reply</button><button type="button" onClick={() => set("buttons", [...f.buttons, { type: "url", label: "", url: "https://" }])} className="flex items-center gap-0.5 hover:underline"><Plus size={12} /> Link</button></div>}</div>
            {f.buttons.length === 0 && <p className="text-[12px] text-muted">No buttons.</p>}
            <ul className="space-y-2">{f.buttons.map((b, i) => (
              <li key={i}><div className="flex flex-wrap items-start gap-2">
                <span className="mt-2 w-20 flex-shrink-0 text-[11.5px] font-semibold text-muted">{b.type === "url" ? "Link" : "Quick reply"}</span>
                <input aria-label={`Button ${i + 1} label`} disabled={locked} value={b.label} onChange={(e) => setButton(i, { label: e.target.value })} placeholder="Label" className={`${control} min-w-[8rem] flex-1 ${errors[`b${i}`] ? "border-red-500" : "border-border"}`} />
                {b.type === "url" && <input aria-label={`Button ${i + 1} link`} disabled={locked} value={b.url ?? ""} onChange={(e) => setButton(i, { url: e.target.value })} placeholder="https://" className={`${control} min-w-[10rem] flex-[2] ${errors[`b${i}`] ? "border-red-500" : "border-border"}`} />}
                {!locked && <button type="button" aria-label={`Remove button ${i + 1}`} onClick={() => set("buttons", f.buttons.filter((_, n) => n !== i))} className="mt-1.5 rounded p-1 text-muted hover:text-red-600"><Trash2 size={14} /></button>}
              </div>{err(`b${i}`)}</li>))}</ul>
            {err("buttons")}
          </div>

          {!locked && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <button type="button" onClick={() => submit("draft")} className="flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-[13px] font-semibold hover:bg-surface"><Save size={14} /> Save draft</button>
              <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-[13px] font-medium text-muted hover:text-foreground">Cancel</button>
              <button type="button" onClick={() => submit("pending")} className="ml-auto flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90"><Send size={14} /> Submit for approval (demo)</button>
            </div>
          )}
          {template?.status === "pending" && (
            <div className="rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-amber-700 dark:text-amber-400"><FlaskConical size={13} /> Demo: simulate the review result (no real review happens)</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => { actions.upsertWhatsAppTemplate({ ...template, status: "approved" }); onCancel(); }} className="rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-semibold hover:bg-card">Mock: approved</button>
                <button type="button" onClick={() => { actions.upsertWhatsAppTemplate({ ...template, status: "rejected", rejectionReason: "Mock rejection used to demonstrate the workflow." }); onCancel(); }} className="rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-semibold hover:bg-card">Mock: rejected</button>
              </div>
            </div>
          )}
        </div>
        <aside className="rounded-xl border border-border bg-card p-4 lg:sticky lg:top-4 lg:self-start">
          <h3 className="mb-3 text-[12px] font-bold uppercase tracking-wider text-muted">Phone preview</h3>
          <PhonePreview header={f.header} body={f.body} footer={f.footer} buttons={f.buttons} values={{ "1": "Aline", "2": "#1042", "3": "Friday" }} />
          <p className="mt-3 text-[11.5px] text-muted">Variables show sample values. Template approval is a mock workflow: Meta is not involved in this demo.</p>
        </aside>
      </div>
    </div>
  );
}
