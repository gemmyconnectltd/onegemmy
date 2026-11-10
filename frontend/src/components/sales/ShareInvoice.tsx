"use client";

import { useState } from "react";
import { Download, Loader2, Mail, MessageCircle, Share2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Input, Textarea } from "@/components/ui/Form";
import { salesApi } from "@/lib/api";
import { saveFile } from "@/lib/api/client";

type Busy = "whatsapp" | "email" | "device" | "pdf" | null;

/** One Share button for an invoice or receipt. It always shares the PDF document itself: attached to an email, handed to the phone's
 *  share menu (WhatsApp and others), or downloaded. There are no public links. */
export function ShareInvoice({ orderId, orderNumber, customerName, customerEmail, customerPhone, label, variant = "secondary", iconOnly = false, document = "invoice", paper = "80mm" }: {
  orderId: string; orderNumber: string; customerName?: string | null; customerEmail?: string | null; customerPhone?: string | null;
  label?: string; variant?: "secondary" | "outline" | "ghost"; iconOnly?: boolean; document?: "invoice" | "receipt"; paper?: "58mm" | "80mm" | "A4";
}) {
  const noun = document === "receipt" ? "receipt" : "invoice";
  // A receipt is shared as the till receipt at the chosen paper width; on A4 paper the full invoice is the document.
  const receipt = document === "receipt" && paper !== "A4";
  const documentFile = () => receipt ? salesApi.receiptFile(orderId, orderNumber, paper as "58mm" | "80mm") : salesApi.invoiceFile(orderId, orderNumber);
  const Noun = `${noun[0].toUpperCase()}${noun.slice(1)}`;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [emailing, setEmailing] = useState(false);
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");

  const close = () => { if (!busy) { setOpen(false); setEmailing(false); setError(""); setNote(""); } };
  const failed = (cause: unknown) => setError((cause as { detail?: string })?.detail ?? "That didn't work. Please try again.");
  async function run(kind: Exclude<Busy, null>, work: () => Promise<void>) {
    if (busy) return;
    setBusy(kind); setError(""); setNote("");
    try { await work(); } catch (cause) { if ((cause as Error)?.name !== "AbortError") failed(cause); } finally { setBusy(null); }
  }

  /** The PDF as a File, if this browser can hand files to other apps (phones can; most desktops cannot). */
  async function sharableFile() {
    const { blob, filename } = await documentFile();
    const file = new File([blob], filename, { type: "application/pdf" });
    const supported = typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
    return { file, blob, filename, supported };
  }
  const deviceShare = () => run("device", async () => {
    const { file, blob, filename, supported } = await sharableFile();
    if (!supported) { saveFile(blob, filename); setNote("This browser can't send files to other apps, so the PDF was downloaded. Attach it from your downloads."); return; }
    await navigator.share({ files: [file], title: `${Noun} ${orderNumber}`, text: `${Noun} ${orderNumber}` });
  });
  const whatsapp = () => run("whatsapp", async () => {
    const { file, blob, filename, supported } = await sharableFile();
    if (supported) { await navigator.share({ files: [file], title: `${Noun} ${orderNumber}` }); setNote("Choose WhatsApp in the menu that opened."); return; }
    // No file sharing here (usually a computer): download the PDF and open WhatsApp with a short message to attach it to.
    saveFile(blob, filename);
    const digits = (customerPhone ?? "").replace(/\D/g, "");
    const text = `Hello${customerName ? ` ${customerName}` : ""}, please find your ${noun} ${orderNumber} attached.`;
    window.open(`https://wa.me/${digits.length >= 11 ? digits : ""}?text=${encodeURIComponent(text)}`, "_blank");
    setNote("The PDF was downloaded. Attach it in the WhatsApp chat that opened.");
  });
  const pdf = () => run("pdf", () => receipt ? salesApi.downloadReceiptPdf(orderId, orderNumber, paper as "58mm" | "80mm") : salesApi.downloadInvoicePdf(orderId, orderNumber));
  const sendEmail = () => run("email", async () => {
    const result = await salesApi.emailInvoice(orderId, (to || customerEmail || "").trim() || null, message.trim() || null, receipt ? "receipt" : "invoice");
    setNote(`${Noun} emailed to ${result.data.sent_to} as a PDF attachment.`); setEmailing(false); setMessage("");
  });

  const row = "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium hover:bg-surface disabled:opacity-50";
  const canDeviceShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  return <>
    {iconOnly
      ? <button type="button" onClick={() => setOpen(true)} aria-label={`Share ${noun} ${orderNumber}`} title="Share" className="flex h-7 w-7 items-center justify-center rounded-md bg-surface text-muted transition-colors hover:bg-accent/10 hover:text-accent"><Share2 size={13} /></button>
      : <Button variant={variant} onClick={() => setOpen(true)}><Share2 size={15} />{label ?? "Share"}</Button>}
    {open && <Drawer open onClose={close} side="bottom" title={`Share ${noun}`} description={`${orderNumber} · shared as a PDF document`}>
      <div className="space-y-1 p-3">
        <button type="button" className={row} disabled={!!busy} onClick={() => void whatsapp()}>{busy === "whatsapp" ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} className="text-emerald-600" />}WhatsApp<span className="ml-auto text-xs font-normal text-muted">Send the PDF</span></button>
        <button type="button" className={row} disabled={!!busy} onClick={() => { setEmailing(v => !v); setTo(customerEmail ?? ""); }}><Mail size={16} className="text-accent" />Email<span className="ml-auto text-xs font-normal text-muted">PDF attached</span></button>
        {emailing && <div className="space-y-2 rounded-lg border border-border bg-surface/40 p-3">
          <label className="block text-xs font-medium">To<Input type="email" inputMode="email" aria-label="Email address" placeholder={customerEmail || "Leave empty to use the customer's email on file"} value={to} onChange={e => setTo(e.target.value)} /></label>
          <label className="block text-xs font-medium">Message (optional)<Textarea rows={2} maxLength={1000} aria-label="Message" value={message} onChange={e => setMessage(e.target.value)} /></label>
          <Button disabled={!!busy} onClick={() => void sendEmail()}>{busy === "email" ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}Send {noun}</Button>
        </div>}
        {canDeviceShare && <button type="button" className={row} disabled={!!busy} onClick={() => void deviceShare()}>{busy === "device" ? <Loader2 size={16} className="animate-spin" /> : <Smartphone size={16} />}Share from this device<span className="ml-auto text-xs font-normal text-muted">Any app</span></button>}
        <button type="button" className={row} disabled={!!busy} onClick={() => void pdf()}>{busy === "pdf" ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}Download PDF</button>
        {note && <p role="status" className="px-3 pt-2 text-xs text-emerald-700 dark:text-emerald-400">{note}</p>}
        {error && <p role="alert" className="px-3 pt-2 text-xs text-red-600">{error}</p>}
      </div>
    </Drawer>}
  </>;
}
