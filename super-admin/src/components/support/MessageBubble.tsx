import { Check, CheckCheck, FileText, FlaskConical, LockKeyhole } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtBytes } from "@/lib/support/logic";
import { RichText, WhatsAppText } from "@/lib/support/richText";
import type { Attachment, SupportMessage } from "@/lib/support/types";
import { fmtTime } from "@/lib/date";

function AttachmentView({ a, tone }: { a: Attachment; tone: "in" | "out" | "note" }) {
  if (a.kind === "image" && a.previewUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={a.previewUrl} alt={a.name} className="mt-2 max-h-48 w-full max-w-[16rem] rounded-lg border border-border object-cover" />;
  }
  return (
    <div className={cn("mt-2 flex max-w-[16rem] items-center gap-2 rounded-lg border px-2.5 py-2 text-[12px]", tone === "out" ? "border-accent/30 bg-card/60" : "border-border bg-card/70")}>
      <FileText size={15} className="flex-shrink-0 text-muted" />
      <span className="min-w-0 flex-1 truncate font-medium" title={a.name}>{a.name}</span>
      <span className="flex-shrink-0 text-muted">{fmtBytes(a.sizeBytes)}</span>
    </div>
  );
}

function Delivery({ m }: { m: SupportMessage }) {
  if (m.direction !== "outbound") return null;
  if (m.delivery === "demo") return <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400" title="Demo mode: this message was not delivered to the customer"><FlaskConical size={11} /> Demo: not sent</span>;
  if (m.delivery === "read") return <span className="inline-flex items-center gap-1 text-sky-600"><CheckCheck size={12} /> Read</span>;
  if (m.delivery === "delivered") return <span className="inline-flex items-center gap-1"><CheckCheck size={12} /> Delivered</span>;
  if (m.delivery === "sent") return <span className="inline-flex items-center gap-1"><Check size={12} /> Sent</span>;
  if (m.delivery === "failed") return <span className="text-red-600">Failed</span>;
  return null;
}

export function MessageBubble({ message: m }: { message: SupportMessage }) {
  const out = m.direction === "outbound";
  const note = m.direction === "note";
  return (
    <div className={cn("flex", out ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[88%] sm:max-w-[75%]", note && "w-full max-w-full sm:max-w-[85%]")}>
        <div className={cn("mb-1 flex items-center gap-1.5 text-[11px] text-muted", out && "justify-end")}>
          {note && <LockKeyhole size={11} />}
          <span className="font-semibold text-foreground/80">{m.authorName}</span>
          {note && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-700 dark:text-amber-400">Internal note</span>}
          {m.templateName && <span className="rounded bg-accent/10 px-1.5 py-0.5 font-semibold text-accent">Template: {m.templateName}</span>}
        </div>
        <div className={cn(
          "break-words rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed",
          out ? "rounded-br-md bg-accent/12 text-foreground ring-1 ring-accent/20" : note ? "rounded-md border border-dashed border-amber-500/50 bg-amber-500/10" : "rounded-bl-md bg-surface ring-1 ring-border",
        )}>
          {m.channel === "email" && m.subject && <p className="mb-1 text-[12px] font-semibold text-muted">{m.subject}</p>}
          {m.channel === "email" || note ? <RichText text={m.body} /> : <p><WhatsAppText text={m.body} /></p>}
          {m.attachments.map((a) => <AttachmentView key={a.id} a={a} tone={out ? "out" : note ? "note" : "in"} />)}
        </div>
        <div className={cn("mt-1 flex items-center gap-2 text-[11px] text-muted", out && "justify-end")}>
          <time dateTime={m.sentAt}>{fmtTime(m.sentAt)}</time>
          <Delivery m={m} />
        </div>
      </div>
    </div>
  );
}
