import { ExternalLink, Reply } from "lucide-react";
import { RichText, WhatsAppText, fillVariables } from "@/lib/support/richText";
import type { WhatsAppButton } from "@/lib/support/types";

/** WhatsApp-style phone preview. Numbered variables ({{1}}) are filled from `values` when given. */
export function PhonePreview({ header, body, footer, buttons = [], values = {}, label = "Preview" }: {
  header?: string; body: string; footer?: string; buttons?: WhatsAppButton[]; values?: Record<string, string>; label?: string;
}) {
  const fill = (s: string) => s.replace(/\{\{\s*(\d+)\s*\}\}/g, (w, n: string) => values[n] || w);
  return (
    <div className="mx-auto w-full max-w-[18rem]" aria-label={label}>
      <div className="rounded-[1.6rem] border-[6px] border-foreground/80 bg-[#efe7dd] p-2.5 shadow-sm dark:bg-[#0b141a]">
        <div className="mb-2 rounded-lg bg-[#075e54] px-3 py-1.5 text-[11px] font-semibold text-white">Pesaa Support</div>
        <div className="ml-auto rounded-xl rounded-tr-sm bg-[#d9fdd3] px-3 py-2 text-[12.5px] leading-snug text-[#111b21] shadow-sm dark:bg-[#005c4b] dark:text-[#e9edef]">
          {header && <p className="mb-1 font-bold">{fill(header)}</p>}
          <p className="break-words"><WhatsAppText text={fill(body) || "Your message appears here"} /></p>
          {footer && <p className="mt-1.5 text-[11px] opacity-60">{fill(footer)}</p>}
          <p className="mt-1 text-right text-[10px] opacity-50">now</p>
        </div>
        {buttons.map((b, i) => (
          <div key={i} className="mt-1 flex items-center justify-center gap-1.5 rounded-lg bg-white/90 px-3 py-1.5 text-[12px] font-semibold text-[#00a5f4] shadow-sm dark:bg-[#202c33]">
            {b.type === "url" ? <ExternalLink size={12} /> : <Reply size={12} />} {b.label || "Button"}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Email preview with sample variable values. Rich text renders through the safe renderer (no raw HTML). */
export function EmailPreview({ subject, body, to = "customer@example.com" }: { subject: string; body: string; to?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="space-y-0.5 border-b border-border bg-surface px-4 py-2.5 text-[12px]">
        <p><span className="text-muted">To:</span> {to}</p>
        <p className="font-semibold text-foreground">{fillVariables(subject) || "(no subject)"}</p>
      </div>
      <div className="px-4 py-3 text-[13px] leading-relaxed text-foreground">
        {body.trim() ? <RichText text={fillVariables(body)} /> : <p className="text-muted">Your message appears here.</p>}
      </div>
    </div>
  );
}
