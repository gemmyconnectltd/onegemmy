"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { useMyTicket, useReplyMyTicket } from "@/lib/api/supportHooks";
import { STATUS_STYLE } from "@/components/support/ticketStatus";

export default function MyTicketPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useMyTicket(id);
  const reply = useReplyMyTicket();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (isLoading) return <PageLoader variant="page" />;
  if (isError || !data) return (
    <div className="mx-auto max-w-3xl space-y-3"><Link href="/support" className="flex items-center gap-1 text-[12px] font-semibold text-muted hover:text-foreground"><ArrowLeft size={13} /> Help &amp; Support</Link><p role="alert" className="rounded-xl border border-border bg-card p-6 text-sm text-muted">This request couldn&apos;t be found.</p></div>
  );
  const { ticket, messages } = data;
  const closed = ticket.status === "closed";

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || reply.isPending) return;
    setError(null);
    try { await reply.mutateAsync({ id, body: text }); setText(""); } catch (err) { setError((err as { detail?: string })?.detail ?? "Couldn't send your reply."); }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/support" className="flex items-center gap-1 text-[12px] font-semibold text-muted hover:text-foreground"><ArrowLeft size={13} /> Help &amp; Support</Link>
      <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h1 className="text-xl font-bold text-foreground">{ticket.subject}</h1><p className="text-[12px] text-muted">{ticket.reference} · opened {new Date(ticket.created_at).toLocaleDateString()}{ticket.assigned_name ? ` · handled by ${ticket.assigned_name}` : ""}</p></div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLE[ticket.status].cls}`}>{STATUS_STYLE[ticket.status].label}</span></div>

      <ol className="space-y-2.5" aria-label="Conversation">
        {messages.map((m) => {
          const mine = m.direction === "incoming"; // from the customer side
          return (
            <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[88%] rounded-2xl px-3.5 py-2 text-[13.5px] sm:max-w-[75%] ${mine ? "rounded-br-md bg-accent text-white" : "rounded-bl-md border border-border bg-card text-foreground"}`}>
                <p className={`mb-0.5 text-[11px] font-semibold ${mine ? "text-white/80" : "text-muted"}`}>{mine ? "You" : m.sender_name ?? "Pesaa Support"}</p>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={`mt-1 text-right text-[10.5px] ${mine ? "text-white/70" : "text-muted"}`}>{new Date(m.created_at).toLocaleString()}</p>
              </div>
            </li>
          );
        })}
      </ol>

      {closed ? <p className="rounded-xl border border-border bg-surface px-4 py-3 text-[13px] text-muted">This request is closed. Please open a new one for a new question.</p> : (
        <form onSubmit={send} className="rounded-xl border border-border bg-card p-3">
          <textarea aria-label="Your reply" value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Write a reply…" className="w-full resize-none bg-transparent px-1 text-[14px] text-foreground outline-none placeholder:text-muted/70" />
          <div className="flex items-center justify-between gap-2">
            {error ? <span role="alert" className="text-[12px] text-red-600">{error}</span> : <span className="text-[11px] text-muted">{ticket.status === "resolved" ? "Replying reopens this request." : ""}</span>}
            <button type="submit" disabled={!text.trim() || reply.isPending} className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[12.5px] font-semibold text-white hover:bg-accent/90 disabled:opacity-50">{reply.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send</button>
          </div>
        </form>
      )}
    </div>
  );
}
