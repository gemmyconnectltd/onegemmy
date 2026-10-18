"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Clock, Mail, MessageCircle, Paperclip, Save, Send, Trash2, X } from "lucide-react";
import { CustomerPicker } from "@/components/support/CustomerPicker";
import { RichTextEditor } from "@/components/support/RichTextEditor";
import { SupportPageHeader } from "@/components/support/SupportPageHeader";
import { EmailPreview, PhonePreview } from "@/components/support/TemplatePreview";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/date";
import { filesToAttachments, fmtBytes, fmtWindow, isEmail, whatsappWindow } from "@/lib/support/logic";
import { fillVariables } from "@/lib/support/richText";
import { useSupport } from "@/lib/support/store";
import type { Attachment, ChannelKind } from "@/lib/support/types";

const WA_LIMIT = 4096;

export default function NewMessagePage() {
  const { data, actions } = useSupport();
  const router = useRouter();
  const [channel, setChannel] = useState<ChannelKind>("whatsapp");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [mode, setMode] = useState<"free" | "template">("free");
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [to, setTo] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [vars, setVars] = useState<Record<string, string>>({});
  const [emailTemplateId, setEmailTemplateId] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [draftId, setDraftId] = useState<string | undefined>();
  const fileRef = useRef<HTMLInputElement>(null);

  const customer = data?.customers.find((c) => c.id === customerId) ?? null;
  // WhatsApp customer-service window: the customer's most recent inbound WhatsApp message across their conversations.
  const lastInbound = useMemo(() => {
    const times = (data?.conversations ?? []).filter((c) => c.customerId === customerId && c.channel === "whatsapp" && c.lastInboundAt).map((c) => c.lastInboundAt as string);
    return times.sort().pop() ?? null;
  }, [data, customerId]);
  const win = whatsappWindow(lastInbound);
  const templateRequired = channel === "whatsapp" && !!customer && !win.open;
  const effectiveMode = templateRequired ? "template" : mode;

  const approved = (data?.whatsappTemplates ?? []).filter((t) => t.status === "approved");
  const template = approved.find((t) => t.id === templateId);
  const templateVars = template ? [...new Set([...template.body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => m[1]))] : [];
  const emailTemplates = (data?.emailTemplates ?? []).filter((t) => t.active && !t.archived);

  const pickCustomer = (c: typeof customer) => { setCustomerId(c?.id ?? null); setTo(c?.email ?? ""); setErrors((e) => ({ ...e, customer: "" })); };
  const applyEmailTemplate = (id: string) => {
    setEmailTemplateId(id);
    const t = emailTemplates.find((x) => x.id === id);
    if (!t) return;
    const values = { customer_name: customer?.contactName ?? "", business_name: customer?.businessName ?? "", plan_name: customer?.plan ?? "", support_agent: "You" };
    const filled = (s: string) => fillVariables(s, Object.fromEntries(Object.entries(values).filter(([, v]) => v)));
    setSubject(filled(t.subject));
    setBody(filled(t.body));
  };

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const { ok, errors: errs } = filesToAttachments(files, 5 - attachments.length);
    setAttachments((a) => [...a, ...ok]);
    setErrors((e) => ({ ...e, files: errs.join(" ") }));
    if (fileRef.current) fileRef.current.value = "";
  };

  const finalWhatsAppBody = effectiveMode === "template" && template ? template.body.replace(/\{\{\s*(\d+)\s*\}\}/g, (w, n: string) => vars[n]?.trim() || w) : body;

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!customer) e.customer = "Choose a customer first.";
    if (channel === "email") {
      if (!isEmail(to)) e.to = "Enter a valid email address.";
      if (!subject.trim()) e.subject = "Add a subject.";
      else if (subject.length > 150) e.subject = "Subject is too long (max 150 characters).";
      if (!body.trim()) e.body = "Write a message.";
    } else if (effectiveMode === "template") {
      if (!template) e.template = "Choose an approved template.";
      else if (templateVars.some((n) => !vars[n]?.trim())) e.template = "Fill in every template variable.";
    } else {
      if (!body.trim()) e.body = "Write a message.";
      else if (body.length > WA_LIMIT) e.body = `Message is too long (max ${WA_LIMIT.toLocaleString()} characters).`;
    }
    return e;
  };

  const send = () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length || !customer) return;
    const id = actions.createConversation({
      customerId: customer.id, channel, subject: channel === "email" ? subject.trim() : template ? `Template: ${template.name}` : body.trim().slice(0, 60),
      body: channel === "email" ? body : finalWhatsAppBody, attachments: effectiveMode === "template" ? [] : attachments, templateName: effectiveMode === "template" ? template?.name : undefined,
    });
    if (draftId) actions.deleteNewMessageDraft(draftId);
    router.push(`/support/conversations/${id}`);
  };

  const saveDraft = () => {
    if (!body.trim() && !subject.trim() && !customerId) { setNotice("Nothing to save yet."); return; }
    setDraftId(actions.saveNewMessageDraft({ id: draftId, channel, customerId, subject, body }));
    setNotice("Draft saved in this demo browser.");
  };

  const loadDraft = (id: string) => {
    const d = data?.newMessageDrafts.find((x) => x.id === id);
    if (!d) return;
    setDraftId(d.id); setChannel(d.channel); setSubject(d.subject); setBody(d.body);
    const c = data?.customers.find((x) => x.id === d.customerId) ?? null;
    setCustomerId(c?.id ?? null); setTo(c?.email ?? ""); setErrors({}); setNotice("Draft loaded.");
  };

  const reset = () => { setBody(""); setSubject(""); setTemplateId(""); setVars({}); setAttachments([]); setErrors({}); setDraftId(undefined); setNotice(""); };
  const err = (k: string) => errors[k] ? <p role="alert" className="mt-1 text-[12px] text-red-600">{errors[k]}</p> : null;
  const control = "w-full rounded-lg border bg-card px-3 py-2 text-base outline-none focus:border-accent sm:text-[13.5px]";

  return (
    <div className="space-y-4">
      <SupportPageHeader title="New message" description="Start a conversation with a customer by WhatsApp or email." actions={<Link href="/support" className="rounded-lg border border-border px-3 py-1.5 text-[13px] font-semibold hover:bg-surface">Back to inbox</Link>} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5 rounded-xl border border-border bg-card p-4 sm:p-5">
          <fieldset>
            <legend className="mb-2 text-[12px] font-semibold text-muted">Channel</legend>
            <div role="radiogroup" className="grid grid-cols-2 gap-2">
              {([["whatsapp", "WhatsApp", MessageCircle], ["email", "Email", Mail]] as const).map(([k, label, Icon]) => (
                <button key={k} type="button" role="radio" aria-checked={channel === k} onClick={() => { setChannel(k); setErrors({}); }}
                  className={cn("flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-[13.5px] font-semibold transition-colors", channel === k ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:text-foreground")}>
                  <Icon size={16} /> {label}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-muted">Recipient <span className="text-red-500">*</span></p>
            <CustomerPicker value={customer} onChange={pickCustomer} error={errors.customer} />
          </div>

          {channel === "whatsapp" ? (
            <div className="space-y-3">
              {customer && (
                <p className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 text-[12.5px]", win.open ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300")}>
                  {win.open ? <Clock size={14} className="mt-0.5 flex-shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />}
                  {win.open ? <span><strong>24-hour window open</strong> ({fmtWindow(win.msLeft)} left): you can write a free-form message or use a template.</span>
                    : <span><strong>Outside the 24-hour window.</strong> {lastInbound ? `${customer.contactName} last wrote ${fmtDateTime(lastInbound)}.` : `${customer.contactName} hasn't written on WhatsApp.`} Only an approved template can start this conversation.</span>}
                </p>
              )}
              <div role="tablist" aria-label="Message type" className="flex gap-0.5 rounded-lg bg-surface p-0.5 sm:w-fit">
                <button type="button" role="tab" aria-selected={effectiveMode === "free"} disabled={templateRequired} onClick={() => setMode("free")} className={cn("rounded-md px-3 py-1.5 text-[12.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-40", effectiveMode === "free" ? "bg-card shadow-sm" : "text-muted")}>Free-form message</button>
                <button type="button" role="tab" aria-selected={effectiveMode === "template"} onClick={() => setMode("template")} className={cn("rounded-md px-3 py-1.5 text-[12.5px] font-semibold", effectiveMode === "template" ? "bg-card shadow-sm" : "text-muted")}>Approved template</button>
              </div>
              {effectiveMode === "template" ? (
                <div className="space-y-2">
                  <select aria-label="Approved template" value={templateId} onChange={(e) => { setTemplateId(e.target.value); setVars({}); }} className={cn(control, errors.template ? "border-red-500" : "border-border")}>
                    <option value="">Choose an approved template…</option>
                    {approved.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.language.toUpperCase()} · {t.category}</option>)}
                  </select>
                  {templateVars.map((n) => <input key={n} aria-label={`Value for variable ${n}`} placeholder={`Value for {{${n}}}`} value={vars[n] ?? ""} onChange={(e) => setVars((v) => ({ ...v, [n]: e.target.value }))} className={cn(control, "border-border")} />)}
                  {err("template")}
                  <p className="text-[11.5px] text-muted">Template statuses are mock data: nothing here has been approved by Meta.</p>
                </div>
              ) : (
                <div>
                  <textarea aria-label="WhatsApp message" rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type your message. Use *bold*, _italic_ and ~strikethrough~." className={cn(control, "resize-y", errors.body ? "border-red-500" : "border-border")} />
                  <div className="mt-1 flex justify-between text-[11.5px]">{err("body") ?? <span />}<span className={body.length > WA_LIMIT ? "font-semibold text-red-600" : "text-muted"}>{body.length.toLocaleString()} / {WA_LIMIT.toLocaleString()}</span></div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label htmlFor="to" className="mb-1.5 block text-[12px] font-semibold text-muted">To</label>
                <input id="to" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="customer@example.com" aria-invalid={!!errors.to} className={cn(control, errors.to ? "border-red-500" : "border-border")} />
                {err("to")}
              </div>
              <div>
                <label htmlFor="tpl" className="mb-1.5 block text-[12px] font-semibold text-muted">Insert template</label>
                <select id="tpl" value={emailTemplateId} onChange={(e) => applyEmailTemplate(e.target.value)} className={cn(control, "border-border")}>
                  <option value="">None</option>
                  {emailTemplates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.category})</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="subject" className="mb-1.5 block text-[12px] font-semibold text-muted">Subject</label>
                <input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={160} aria-invalid={!!errors.subject} className={cn(control, errors.subject ? "border-red-500" : "border-border")} />
                {err("subject")}
              </div>
              <RichTextEditor label="Message" value={body} onChange={setBody} rows={10} error={errors.body} placeholder="Write your message…" />
            </div>
          )}

          {!(channel === "whatsapp" && effectiveMode === "template") && (
            <div>
              <input ref={fileRef} type="file" multiple hidden aria-label="Attach files" onChange={(e) => addFiles(e.target.files)} />
              <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-medium hover:bg-surface"><Paperclip size={13} /> Attach files</button>
              {attachments.length > 0 && <ul className="mt-2 flex flex-wrap gap-1.5">{attachments.map((a) => <li key={a.id} className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1 text-[12px]"><span className="max-w-[10rem] truncate">{a.name}</span><span className="text-muted">{fmtBytes(a.sizeBytes)}</span><button type="button" aria-label={`Remove ${a.name}`} onClick={() => setAttachments((x) => x.filter((y) => y.id !== a.id))} className="text-muted hover:text-foreground"><X size={12} /></button></li>)}</ul>}
              {err("files")}
              <p className="mt-1 text-[11.5px] text-muted">Images, PDF, CSV, TXT or Excel, up to 10 MB each. Demo only: files stay in this browser tab.</p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <button type="button" onClick={saveDraft} className="flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-[13px] font-semibold hover:bg-surface"><Save size={14} /> Save draft</button>
            <button type="button" onClick={reset} className="rounded-lg px-3 py-2 text-[13px] font-medium text-muted hover:text-foreground">Clear</button>
            <button type="button" onClick={send} className="ml-auto flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90"><Send size={14} /> Send (demo)</button>
          </div>
          <p role="status" aria-live="polite" className="text-[12px] text-amber-700 dark:text-amber-400">{notice || "Demo mode: sending prepares the conversation but nothing is delivered."}</p>
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 text-[12px] font-bold uppercase tracking-wider text-muted">Preview</h2>
            {channel === "whatsapp"
              ? <PhonePreview header={effectiveMode === "template" ? template?.header : undefined} body={effectiveMode === "template" ? (template?.body ?? "") : body} footer={effectiveMode === "template" ? template?.footer : undefined} buttons={effectiveMode === "template" ? template?.buttons : []} values={effectiveMode === "template" ? vars : {}} />
              : <EmailPreview subject={subject} body={body} to={to || "customer@example.com"} />}
          </div>
          {(data?.newMessageDrafts.length ?? 0) > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-muted">Saved drafts</h2>
              <ul className="space-y-1">
                {data?.newMessageDrafts.map((d) => (
                  <li key={d.id} className="flex items-center gap-1">
                    <button type="button" onClick={() => loadDraft(d.id)} className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left hover:bg-surface">
                      <span className="flex items-center gap-1.5 text-[12.5px] font-semibold">{d.channel === "email" ? <Mail size={12} /> : <MessageCircle size={12} />}<span className="truncate">{d.subject || d.body.slice(0, 40) || "Untitled draft"}</span></span>
                      <span className="text-[11px] text-muted">{data.customers.find((c) => c.id === d.customerId)?.businessName ?? "No recipient"} · {fmtDateTime(d.updatedAt)}</span>
                    </button>
                    <button type="button" aria-label="Delete draft" onClick={() => actions.deleteNewMessageDraft(d.id)} className="rounded-lg p-1.5 text-muted hover:text-red-600"><Trash2 size={13} /></button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
