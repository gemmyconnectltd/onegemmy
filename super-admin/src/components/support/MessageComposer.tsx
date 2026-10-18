"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Clock, FlaskConical, LockKeyhole, Paperclip, PenLine, Send, X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { filesToAttachments, fmtBytes, fmtWindow, whatsappWindow } from "@/lib/support/logic";
import { fillVariables } from "@/lib/support/richText";
import { useSupport } from "@/lib/support/store";
import type { Attachment, Customer, SupportConversation } from "@/lib/support/types";
import { PhonePreview } from "./TemplatePreview";

const WA_LIMIT = 4096;
const EMAIL_LIMIT = 20000;

function useNow(everyMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), everyMs); return () => clearInterval(id); }, [everyMs]);
  return now;
}

/**
 * Reply / internal-note composer. Drafts survive switching conversations (they live in the demo store). On WhatsApp the
 * 24-hour customer-service window is enforced in the UI: outside it only an approved template can be prepared.
 * Everything "sent" here is demo only and is labelled as such.
 */
export function MessageComposer({ conversation: c, customer }: { conversation: SupportConversation; customer?: Customer }) {
  const { data, actions } = useSupport();
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [texts, setTexts] = useState<Record<"reply" | "note", string>>(() => ({ reply: data?.replyDrafts[`${c.id}:reply`] ?? "", note: data?.replyDrafts[`${c.id}:note`] ?? "" }));
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [flash, setFlash] = useState("");
  const [quick, setQuick] = useState(false);
  const [useTemplate, setUseTemplate] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [vars, setVars] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const now = useNow(30_000);

  const win = c.channel === "whatsapp" ? whatsappWindow(c.lastInboundAt, now) : null;
  const needsTemplate = c.channel === "whatsapp" && mode === "reply" && !win?.open;
  const templateMode = c.channel === "whatsapp" && mode === "reply" && (needsTemplate || useTemplate);
  const approved = useMemo(() => (data?.whatsappTemplates ?? []).filter((t) => t.status === "approved"), [data]);
  const template = approved.find((t) => t.id === templateId);
  const templateVars = useMemo(() => (template ? [...new Set([...template.body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => m[1]))] : []), [template]);

  // Keep drafts in the store (debounced) and flush on unmount, so switching conversations never loses typing.
  const latest = useRef(texts);
  useEffect(() => { latest.current = texts; }, [texts]);
  useEffect(() => {
    const id = setTimeout(() => { actions.setReplyDraft(`${c.id}:reply`, texts.reply); actions.setReplyDraft(`${c.id}:note`, texts.note); }, 300);
    return () => clearTimeout(id);
  }, [texts, c.id, actions]);
  useEffect(() => () => { actions.setReplyDraft(`${c.id}:reply`, latest.current.reply); actions.setReplyDraft(`${c.id}:note`, latest.current.note); }, [c.id, actions]);
  useEffect(() => { if (!flash) return; const id = setTimeout(() => setFlash(""), 6000); return () => clearTimeout(id); }, [flash]);

  const text = texts[mode];
  const setText = (v: string) => setTexts((t) => ({ ...t, [mode]: v }));
  const limit = c.channel === "whatsapp" ? WA_LIMIT : EMAIL_LIMIT;

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const { ok, errors: errs } = filesToAttachments(files, 5 - attachments.length);
    setAttachments((a) => [...a, ...ok]);
    setErrors(errs);
    if (fileRef.current) fileRef.current.value = "";
  };

  const send = () => {
    const problems: string[] = [];
    let body = text.trim();
    let templateName: string | undefined;
    if (templateMode) {
      if (!template) problems.push("Choose an approved template to continue.");
      else {
        body = template.body.replace(/\{\{\s*(\d+)\s*\}\}/g, (w, n: string) => vars[n]?.trim() || w);
        if (templateVars.some((n) => !vars[n]?.trim())) problems.push("Fill in every template variable.");
        templateName = template.name;
      }
    } else {
      if (!body) problems.push(mode === "note" ? "Write a note first." : "Write a message first.");
      if (body.length > limit) problems.push(`Message is too long (max ${limit.toLocaleString()} characters).`);
    }
    setErrors(problems);
    if (problems.length) return;
    actions.sendMessage(c.id, { body, mode, attachments: templateMode ? [] : attachments, templateName });
    setTexts((t) => ({ ...t, [mode]: "" }));
    setAttachments([]);
    setVars({});
    setFlash(mode === "note" ? "Note saved in this demo." : "Prepared in demo mode. It was not sent to the customer.");
  };

  const insertSignature = () => {
    const sig = fillVariables(c.channel === "email" ? data?.settings.signatureEmail ?? "" : data?.settings.signatureWhatsApp ?? "", { support_agent: "You" });
    setText(text ? `${text}\n\n${sig}` : sig);
  };

  const tab = (m: "reply" | "note", label: string, icon: React.ReactNode) => (
    <button type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setErrors([]); }}
      className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12.5px] font-semibold transition-colors", mode === m ? (m === "note" ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-card text-foreground shadow-sm") : "text-muted hover:text-foreground")}>
      {icon}{label}
    </button>
  );

  return (
    <div className="border-t border-border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Composer mode" className="flex gap-0.5 rounded-lg bg-surface p-0.5">
          {tab("reply", c.channel === "email" ? "Reply by email" : "Reply on WhatsApp", <PenLine size={13} />)}
          {tab("note", "Internal note", <LockKeyhole size={13} />)}
        </div>
        {win && mode === "reply" && (
          <span className={cn("ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold", win.open ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/10 text-amber-700 dark:text-amber-400")}>
            <Clock size={11} /> {win.open ? `24-hour window open · ${fmtWindow(win.msLeft)} left` : "24-hour window closed"}
          </span>
        )}
      </div>

      {needsTemplate && (
        <div role="alert" className="mb-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-800 dark:text-amber-300">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <p>It has been more than 24 hours since {customer?.contactName ?? "the customer"} last wrote. WhatsApp only allows an <strong>approved template</strong> now. Free-form replies unlock when they message again.</p>
        </div>
      )}

      {templateMode ? (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <select aria-label="Approved template" value={templateId} onChange={(e) => { setTemplateId(e.target.value); setVars({}); }} className="w-full rounded-lg border border-border bg-card px-2.5 py-2 text-base outline-none focus:border-accent sm:text-[13px]">
              <option value="">Choose an approved template…</option>
              {approved.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.language})</option>)}
            </select>
            {approved.length === 0 && <p className="text-[12px] text-muted">There are no approved templates in the demo data.</p>}
            {templateVars.map((n) => (
              <input key={n} aria-label={`Variable ${n}`} placeholder={`Value for {{${n}}}`} value={vars[n] ?? ""} onChange={(e) => setVars((v) => ({ ...v, [n]: e.target.value }))} className="w-full rounded-lg border border-border bg-card px-2.5 py-2 text-base outline-none focus:border-accent sm:text-[13px]" />
            ))}
            <p className="text-[11.5px] text-muted">Statuses are mock data: no template here has been approved by Meta.</p>
          </div>
          {template && <PhonePreview header={template.header} body={template.body} footer={template.footer} buttons={template.buttons} values={vars} />}
        </div>
      ) : (
        <textarea
          aria-label={mode === "note" ? "Internal note" : "Reply"} value={text} rows={3} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); send(); } }}
          placeholder={mode === "note" ? "Write an internal note. Only your team sees notes." : c.channel === "email" ? `Reply to ${customer?.contactName ?? "customer"}…` : "Type a message…"}
          className={cn("w-full resize-y rounded-lg border bg-card px-3 py-2 text-base leading-relaxed outline-none focus:border-accent sm:text-[13.5px]", mode === "note" ? "border-amber-500/40 bg-amber-500/5" : "border-border")}
        />
      )}

      {attachments.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Attachments">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1 text-[12px]">
              <Paperclip size={11} /> <span className="max-w-[10rem] truncate">{a.name}</span> <span className="text-muted">{fmtBytes(a.sizeBytes)}</span>
              <button type="button" aria-label={`Remove ${a.name}`} onClick={() => setAttachments((x) => x.filter((y) => y.id !== a.id))} className="text-muted hover:text-foreground"><X size={12} /></button>
            </li>
          ))}
        </ul>
      )}

      {errors.length > 0 && <ul role="alert" className="mt-2 space-y-0.5 text-[12px] text-red-600">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      {flash && <p role="status" aria-live="polite" className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-amber-700 dark:text-amber-400"><FlaskConical size={12} /> {flash}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {!templateMode && (
          <>
            <input ref={fileRef} type="file" multiple hidden onChange={(e) => addFiles(e.target.files)} aria-label="Attach files" />
            <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[12.5px] font-medium text-foreground/80 hover:bg-surface"><Paperclip size={13} /> Attach</button>
            <div className="relative">
              <button type="button" aria-expanded={quick} aria-haspopup="menu" onClick={() => setQuick((q) => !q)} className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[12.5px] font-medium text-foreground/80 hover:bg-surface"><Zap size={13} /> Quick replies</button>
              {quick && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setQuick(false)} />
                  <ul role="menu" className="absolute bottom-full left-0 z-20 mb-1 max-h-60 w-72 overflow-y-auto rounded-lg border border-border bg-card py-1 shadow-lg">
                    {data?.quickReplies.map((q) => (
                      <li key={q.id} role="none">
                        <button type="button" role="menuitem" onClick={() => { setText(text ? `${text}\n${q.text}` : q.text); setQuick(false); }} className="block w-full px-3 py-2 text-left hover:bg-surface">
                          <span className="block text-[12.5px] font-semibold">{q.label}</span><span className="line-clamp-2 text-[11.5px] text-muted">{q.text}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            {mode === "reply" && <button type="button" onClick={insertSignature} className="rounded-lg border border-border px-2.5 py-1.5 text-[12.5px] font-medium text-foreground/80 hover:bg-surface">Signature</button>}
          </>
        )}
        {c.channel === "whatsapp" && mode === "reply" && !needsTemplate && (
          <button type="button" onClick={() => setUseTemplate((u) => !u)} className="rounded-lg border border-border px-2.5 py-1.5 text-[12.5px] font-medium text-foreground/80 hover:bg-surface">{useTemplate ? "Write a message" : "Use a template"}</button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {!templateMode && <span className={cn("text-[11.5px]", text.length > limit ? "font-semibold text-red-600" : "text-muted")}>{text.length.toLocaleString()}{c.channel === "whatsapp" ? ` / ${WA_LIMIT.toLocaleString()}` : ""}</span>}
          <button type="button" onClick={send} className={cn("flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90", mode === "note" ? "bg-amber-600" : "bg-accent")}>
            <Send size={13} /> {mode === "note" ? "Add note" : "Send (demo)"}
          </button>
        </div>
      </div>
    </div>
  );
}
