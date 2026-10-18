"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, LifeBuoy, Loader2, Mail, MessageCircle, Plus } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { Field, FormFooter, Input, Select, Textarea } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { SUPPORT_EMAIL, SUPPORT_WHATSAPP_URL } from "@/lib/support";
import { useCreateMyTicket, useMyTickets } from "@/lib/api/supportHooks";
import { STATUS_STYLE } from "@/components/support/ticketStatus";

export default function HelpSupportPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useMyTickets(page);
  const create = useCreateMyTicket();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ subject: "", description: "", priority: "normal" as "low" | "normal" });
  const [error, setError] = useState<string | null>(null);
  const valid = f.subject.trim().length >= 3 && f.description.trim().length > 0;
  const items = data?.items ?? [];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setError(null);
    try {
      await create.mutateAsync({ subject: f.subject.trim(), description: f.description.trim(), priority: f.priority });
      setF({ subject: "", description: "", priority: "normal" });
      setOpen(false);
    } catch (err) { setError((err as { detail?: string })?.detail ?? "Couldn't send your request. Please try again."); }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-[22px] font-bold tracking-tight text-foreground">Help &amp; Support</h1><p className="mt-0.5 text-sm text-muted">Ask the Pesaa team for help and follow your requests.</p></div>
        <button type="button" onClick={() => setOpen(true)} className="flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-[13px] font-semibold text-white hover:bg-accent/90"><Plus size={14} /> New request</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:bg-surface"><MessageCircle size={20} className="text-[#25D366]" /><span><span className="block text-sm font-semibold text-foreground">WhatsApp</span><span className="text-[12px] text-muted">Chat with the Pesaa team</span></span><ExternalLink size={14} className="ml-auto text-muted" /></a>
        <a href={`mailto:${SUPPORT_EMAIL}`} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:bg-surface"><Mail size={20} className="text-sky-600" /><span><span className="block text-sm font-semibold text-foreground">Email</span><span className="text-[12px] text-muted">{SUPPORT_EMAIL}</span></span></a>
      </div>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3"><h2 className="text-sm font-bold text-foreground">Your requests</h2></div>
        {isLoading ? <PageLoader variant="compact" /> : isError ? (
          <p role="alert" className="p-4 text-sm text-red-600">Couldn&apos;t load your requests. <button onClick={() => void refetch()} className="font-semibold underline">Retry</button></p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-1 px-4 py-12 text-center"><LifeBuoy size={28} className="text-muted/50" /><p className="text-sm font-semibold text-foreground">No requests yet</p><p className="text-[12px] text-muted">Create one and we&apos;ll reply here.</p></div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((t) => (
              <li key={t.id}>
                <Link href={`/support/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface">
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-foreground">{t.subject}</span><span className="text-[11.5px] text-muted">{t.reference} · {new Date(t.created_at).toLocaleDateString()}{t.assigned_name ? ` · ${t.assigned_name}` : ""}</span></span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[t.status].cls}`}>{STATUS_STYLE[t.status].label}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {(data?.total ?? 0) > 20 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[12px] text-muted"><button disabled={page <= 1} onClick={() => setPage(page - 1)} className="font-semibold disabled:opacity-40">Previous</button><span>Page {page}</span><button disabled={page * 20 >= (data?.total ?? 0)} onClick={() => setPage(page + 1)} className="font-semibold disabled:opacity-40">Next</button></div>
        )}
      </section>

      <Drawer open={open} onClose={() => setOpen(false)} title="New request" description="Describe the problem — we'll reply here.">
        <form onSubmit={submit} className="space-y-4 p-5">
          {error && <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}
          <Field label="Subject" required><Input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} maxLength={200} placeholder="e.g. My sales report is empty" /></Field>
          <Field label="What's happening?" required><Textarea rows={6} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <Field label="How urgent is it?"><Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as "low" | "normal" })}><option value="normal">Normal</option><option value="low">Low — a question</option></Select></Field>
          <FormFooter submitLabel={create.isPending ? "Sending…" : "Send request"} onCancel={() => setOpen(false)} disabled={!valid || create.isPending} />
          {create.isPending && <Loader2 size={14} className="animate-spin text-muted" />}
        </form>
      </Drawer>
    </div>
  );
}
