"use client";

import { useState } from "react";
import { Check, Copy, Download, Loader2, Mail, MessageCircle, Share2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Input, Textarea } from "@/components/ui/Form";
import { salesApi } from "@/lib/api";

type Busy = "link" | "whatsapp" | "email" | "pdf" | null;

/** One Share button for an invoice document: WhatsApp, email (PDF attached), a link to copy, the phone's share sheet, or the PDF.
 *  Links are signed and expire after 30 days; they open only this invoice. */
export function ShareInvoice({ orderId, orderNumber, customerName, customerEmail, customerPhone, label = "Share", variant = "secondary", iconOnly = false }: {
  orderId: string; orderNumber: string; customerName?: string | null; customerEmail?: string | null; customerPhone?: string | null;
  label?: string; variant?: "secondary" | "outline" | "ghost"; iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [emailing, setEmailing] = useState(false);
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const close = () => { if (!busy) { setOpen(false); setEmailing(false); setError(""); setNote(""); } };
  async function link() {
    const { data } = await salesApi.shareInvoice(orderId);
    return data;
  }
  const failed = (cause: unknown) => setError((cause as { detail?: string })?.detail ?? "That didn't work. Please try again.");
  async function run(kind: Exclude<Busy, null>, work: () => Promise<void>) {
    if (busy) return;
    setBusy(kind); setError(""); setNote("");
    try { await work(); } catch (cause) { failed(cause); } finally { setBusy(null); }
  }

  const copyLink = () => run("link", async () => {
    const { url } = await link();
    await navigator.clipboard.writeText(url);
    setCopied(true); setTimeout(() => setCopied(false), 2500);
    setNote("Link copied. It opens this invoice for 30 days.");
  });
  const whatsapp = () => run("whatsapp", async () => {
    const data = await link();
    const digits = (customerPhone ?? data.customer_phone ?? "").replace(/\D/g, "");
    const text = `Hello${customerName ? ` ${customerName}` : ""}, here is invoice ${data.order_number}: ${data.url}`;
    // A number is used only when it is already in international form; otherwise WhatsApp lets the sender pick the contact.
    window.open(`https://wa.me/${digits.length >= 11 ? digits : ""}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  });
  const nativeShare = () => run("link", async () => {
    const data = await link();
    try { await navigator.share({ title: `Invoice ${data.order_number}`, text: `Invoice ${data.order_number}`, url: data.url }); } catch (cause) { if ((cause as Error)?.name !== "AbortError") throw cause; }
  });
  const pdf = () => run("pdf", () => salesApi.downloadInvoicePdf(orderId, orderNumber));
  const sendEmail = () => run("email", async () => {
    const result = await salesApi.emailInvoice(orderId, (to || customerEmail || "").trim() || null, message.trim() || null);
    setNote(`Invoice emailed to ${result.data.sent_to}.`); setEmailing(false); setMessage("");
  });

  const row = "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium hover:bg-surface disabled:opacity-50";
  return <>
    {iconOnly
      ? <button type="button" onClick={() => setOpen(true)} aria-label={`Share invoice ${orderNumber}`} title="Share" className="flex h-7 w-7 items-center justify-center rounded-md bg-surface text-muted transition-colors hover:bg-accent/10 hover:text-accent"><Share2 size={13} /></button>
      : <Button variant={variant} onClick={() => setOpen(true)}><Share2 size={15} />{label}</Button>}
    {open && <Drawer open onClose={close} side="bottom" title="Share invoice" description={orderNumber}>
      <div className="space-y-1 p-3">
        <button type="button" className={row} disabled={!!busy} onClick={() => void whatsapp()}>{busy === "whatsapp" ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} className="text-emerald-600" />}WhatsApp<span className="ml-auto text-xs font-normal text-muted">Send a link</span></button>
        <button type="button" className={row} disabled={!!busy} onClick={() => { setEmailing(v => !v); setTo(customerEmail ?? ""); }}><Mail size={16} className="text-accent" />Email<span className="ml-auto text-xs font-normal text-muted">PDF attached</span></button>
        {emailing && <div className="space-y-2 rounded-lg border border-border bg-surface/40 p-3">
          <label className="block text-xs font-medium">To<Input type="email" inputMode="email" aria-label="Email address" placeholder="customer@example.com" value={to} onChange={e => setTo(e.target.value)} /></label>
          <label className="block text-xs font-medium">Message (optional)<Textarea rows={2} maxLength={1000} aria-label="Message" value={message} onChange={e => setMessage(e.target.value)} /></label>
          <Button disabled={!!busy || !to.trim()} onClick={() => void sendEmail()}>{busy === "email" ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}Send invoice</Button>
        </div>}
        <button type="button" className={row} disabled={!!busy} onClick={() => void copyLink()}>{busy === "link" ? <Loader2 size={16} className="animate-spin" /> : copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}{copied ? "Link copied" : "Copy link"}<span className="ml-auto text-xs font-normal text-muted">Valid 30 days</span></button>
        {canNativeShare && <button type="button" className={row} disabled={!!busy} onClick={() => void nativeShare()}><Smartphone size={16} />Share from this device</button>}
        <button type="button" className={row} disabled={!!busy} onClick={() => void pdf()}>{busy === "pdf" ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}Download PDF</button>
        {note && <p role="status" className="px-3 pt-2 text-xs text-emerald-700 dark:text-emerald-400">{note}</p>}
        {error && <p role="alert" className="px-3 pt-2 text-xs text-red-600">{error}</p>}
      </div>
    </Drawer>}
  </>;
}
