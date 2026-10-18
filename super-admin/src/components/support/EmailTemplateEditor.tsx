"use client";

import { useState } from "react";
import { ArrowLeft, FlaskConical, Save, Send } from "lucide-react";
import { Toggle } from "@/components/ui/Toggle";
import { isEmail } from "@/lib/support/logic";
import { unknownVariables } from "@/lib/support/richText";
import type { EmailCategory, EmailTemplate } from "@/lib/support/types";
import { RichTextEditor } from "./RichTextEditor";
import { EmailPreview } from "./TemplatePreview";

export const EMAIL_CATEGORIES: EmailCategory[] = ["General", "Account", "Billing", "Technical"];
type Draft = Omit<EmailTemplate, "id" | "updatedAt" | "archived">;
const control = "w-full rounded-lg border bg-card px-3 py-2 text-base outline-none focus:border-accent sm:text-[13.5px]";

export function EmailTemplateEditor({ template, onSave, onCancel }: { template: EmailTemplate | null; onSave: (t: Draft, asDraft: boolean) => void; onCancel: () => void }) {
  const [f, setF] = useState<Draft>({ name: template?.name ?? "", category: template?.category ?? "General", subject: template?.subject ?? "", body: template?.body ?? "", active: template?.active ?? true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [testTo, setTestTo] = useState("");
  const [testMsg, setTestMsg] = useState("");
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setF((x) => ({ ...x, [k]: v }));

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!f.name.trim()) e.name = "Give the template a name."; else if (f.name.length > 80) e.name = "Keep the name under 80 characters.";
    if (!f.subject.trim()) e.subject = "Add a subject line."; else if (f.subject.length > 150) e.subject = "Subject is too long (max 150 characters).";
    if (!f.body.trim()) e.body = "The message can't be empty.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };
  const save = (asDraft: boolean) => { if (validate()) onSave({ ...f, name: f.name.trim(), subject: f.subject.trim(), active: asDraft ? false : f.active }, asDraft); };
  const sendTest = () => {
    if (!isEmail(testTo)) { setTestMsg("Enter a valid email address first."); return; }
    setTestMsg(`Demo only: no email was sent to ${testTo}. Real test emails need the email integration.`);
  };
  const bad = unknownVariables(f.subject);

  return (
    <div className="space-y-4">
      <button type="button" onClick={onCancel} className="flex items-center gap-1 text-[13px] font-semibold text-muted hover:text-foreground"><ArrowLeft size={14} /> All email templates</button>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
          <h2 className="text-[16px] font-bold">{template ? "Edit template" : "New email template"}</h2>
          <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
            <div>
              <label htmlFor="et-name" className="mb-1.5 block text-[12px] font-semibold text-muted">Template name <span className="text-red-500">*</span></label>
              <input id="et-name" value={f.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name} className={`${control} ${errors.name ? "border-red-500" : "border-border"}`} />
              {errors.name && <p role="alert" className="mt-1 text-[12px] text-red-600">{errors.name}</p>}
            </div>
            <div>
              <label htmlFor="et-cat" className="mb-1.5 block text-[12px] font-semibold text-muted">Category</label>
              <select id="et-cat" value={f.category} onChange={(e) => set("category", e.target.value as EmailCategory)} className={`${control} border-border`}>{EMAIL_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
            </div>
          </div>
          <div>
            <label htmlFor="et-subject" className="mb-1.5 block text-[12px] font-semibold text-muted">Subject <span className="text-red-500">*</span></label>
            <input id="et-subject" value={f.subject} onChange={(e) => set("subject", e.target.value)} aria-invalid={!!errors.subject} className={`${control} ${errors.subject ? "border-red-500" : "border-border"}`} />
            {errors.subject && <p role="alert" className="mt-1 text-[12px] text-red-600">{errors.subject}</p>}
            {bad.length > 0 && <p className="mt-1 text-[12px] text-amber-700 dark:text-amber-400">Unknown variable in the subject: {bad.map((b) => `{{${b}}}`).join(", ")}</p>}
          </div>
          <RichTextEditor label="Message" value={f.body} onChange={(v) => set("body", v)} rows={12} error={errors.body} />
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <div><p className="text-[13px] font-semibold">Active</p><p className="text-[11.5px] text-muted">Inactive templates can&apos;t be inserted into new messages.</p></div>
            <Toggle checked={f.active} onChange={(v) => set("active", v)} label="Template active" />
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <button type="button" onClick={() => save(true)} className="flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-[13px] font-semibold hover:bg-surface"><Save size={14} /> Save draft</button>
            <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-[13px] font-medium text-muted hover:text-foreground">Cancel</button>
            <button type="button" onClick={() => save(false)} className="ml-auto rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90">{template ? "Update template" : "Create template"}</button>
          </div>
        </div>
        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-3 text-[12px] font-bold uppercase tracking-wider text-muted">Live preview</h3>
            <EmailPreview subject={f.subject} body={f.body} />
            <p className="mt-2 text-[11.5px] text-muted">Variables show sample values (e.g. Aline Uwase). Real values are filled in when the template is used.</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-muted"><FlaskConical size={13} /> Test email (demo)</h3>
            <div className="flex gap-2">
              <input aria-label="Send test to" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" className={`${control} border-border`} />
              <button type="button" onClick={sendTest} className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-border px-3 text-[12.5px] font-semibold hover:bg-surface"><Send size={13} /> Test</button>
            </div>
            {testMsg && <p role="status" aria-live="polite" className="mt-2 text-[12px] text-amber-700 dark:text-amber-400">{testMsg}</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}
