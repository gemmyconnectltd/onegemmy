"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, FileText, Loader2, Paperclip, PanelRight, RotateCcw, Send, StickyNote, Ticket, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Form";
import { Badge } from "@/components/ui/Badge";
import { ErrorState } from "@/components/ui/EmptyState";
import { Notice } from "@/components/ui/EmptyState";
import { PageLoader } from "@/components/ui/PageLoader";
import { downloadFile, supportApi, type Priority, type SupportConversation, type SupportMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAssign, useConversation, useMarkRead, useMessages, useNote, useReply, useRetry, useSetConversationStatus, useSetPriority, useTeam, useToTicket } from "@/lib/support/hooks";
import { Avatar, ChannelBadge, DeliveryTicks, Toggle2, clock, dayLabel } from "./parts";
import { cn } from "@/lib/utils";

function Bubble({ m, onRetry }: { m: SupportMessage; onRetry: (m: SupportMessage) => void }) {
  const out = m.direction === "outgoing";
  const note = m.is_internal_note;
  return (
    <div className={cn("flex", out && !note ? "justify-end" : "justify-start", note && "justify-center")}>
      <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2 text-[13.5px] sm:max-w-[70%]",
        note ? "w-full max-w-[90%] border border-dashed border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200" : out ? "rounded-br-md bg-accent text-white" : "rounded-bl-md bg-surface text-foreground")}>
        <p className={cn("mb-0.5 flex items-center gap-1 text-[11px] font-semibold", note ? "" : out ? "text-white/80" : "text-muted")}>{note && <StickyNote size={11} />}{note ? `Internal note · ${m.sender_name ?? "Staff"}` : m.sender_name ?? (out ? "Pesaa Support" : "Customer")}</p>
        {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
        {m.attachments.length > 0 && (
          <ul className="mt-1.5 space-y-1">{m.attachments.map((a) => (
            <li key={a.id}><button type="button" onClick={() => void downloadFile(a.url.replace(/^\/api\/v1/, ""), a.name)} className={cn("flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-medium underline-offset-2 hover:underline", out && !note ? "bg-white/15" : "bg-card")}><FileText size={13} /><span className="truncate">{a.name}</span>{a.size ? <span className="opacity-70">({Math.max(1, Math.round(a.size / 1024))} KB)</span> : null}</button></li>
          ))}</ul>
        )}
        <p className={cn("mt-1 flex items-center justify-end gap-1.5 text-[10.5px]", out && !note ? "text-white/70" : "text-muted")}>
          {m.delivery_status && out && !note && <DeliveryTicks status={m.delivery_status} error={m.delivery_error} />}
          {clock(m.created_at)}
          {m.delivery_status === "failed" && <button type="button" onClick={() => onRetry(m)} className="ml-1 font-semibold underline">Retry</button>}
        </p>
        {m.delivery_status === "failed" && m.delivery_error && <p className="mt-0.5 text-[11px] text-white/90">{m.delivery_error}</p>}
      </div>
    </div>
  );
}

function Composer({ conv }: { conv: SupportConversation }) {
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<{ token: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const reply = useReply();
  const note = useNote();
  const busy = reply.isPending || note.isPending || uploading;
  const canSend = !busy && (text.trim().length > 0 || (mode === "reply" && files.length > 0));

  const send = async () => {
    if (!canSend) return;
    setError(null);
    try {
      if (mode === "note") await note.mutateAsync({ id: conv.id, body: text });
      else await reply.mutateAsync({ id: conv.id, body: text, tokens: files.map((f) => f.token) });
      setText(""); setFiles([]);
    } catch (e) { setError((e as { detail?: string })?.detail ?? "Couldn't send. Try again."); }
  };
  const pick = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true); setError(null);
    try {
      for (const f of Array.from(list).slice(0, 5 - files.length)) {
        const up = await supportApi.upload(f);
        setFiles((cur) => [...cur, { token: up.token, name: up.name }]);
      }
    } catch (e) { setError((e as { detail?: string })?.detail ?? "Upload failed"); }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="border-t border-border bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {conv.status === "resolved" && mode === "reply" && <p className="mb-2 text-[12px] text-muted">This conversation is resolved — sending a reply reopens it.</p>}
      <div className="mb-2 flex items-center gap-1 rounded-lg bg-surface p-0.5 sm:w-fit">
        <Toggle2 active={mode === "reply"} onClick={() => setMode("reply")}>Reply</Toggle2>
        <Toggle2 active={mode === "note"} onClick={() => setMode("note")}>Internal note</Toggle2>
      </div>
      <div className={cn("rounded-xl border p-2", mode === "note" ? "border-amber-500/50 bg-amber-500/5" : "border-border")}>
        <textarea aria-label={mode === "note" ? "Internal note" : "Reply"} value={text} onChange={(e) => setText(e.target.value)} rows={3}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void send(); }}
          placeholder={mode === "note" ? "Only your team sees this" : conv.channel === "whatsapp" ? "Reply on WhatsApp…" : conv.channel === "email" ? "Reply by email…" : "Reply to the customer…"}
          className="w-full resize-none bg-transparent px-1 text-[14px] text-foreground outline-none placeholder:text-muted/70" />
        {files.length > 0 && <ul className="flex flex-wrap gap-1.5 px-1 pb-1">{files.map((f) => <li key={f.token} className="flex items-center gap-1 rounded-md bg-surface px-2 py-1 text-[12px]"><FileText size={12} /><span className="max-w-[140px] truncate">{f.name}</span><button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((c) => c.filter((x) => x.token !== f.token))}><X size={12} /></button></li>)}</ul>}
        <div className="flex items-center justify-between gap-2">
          <div>
            {mode === "reply" && <>
              <input ref={fileRef} type="file" multiple hidden onChange={(e) => void pick(e.target.files)} aria-label="Attach files" />
              <Button type="button" variant="ghost" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading || files.length >= 5} aria-label="Attach a file">{uploading ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}</Button>
            </>}
          </div>
          <Button type="button" variant="primary" size="sm" onClick={() => void send()} disabled={!canSend}>{busy ? <Loader2 size={13} className="animate-spin" /> : mode === "note" ? <StickyNote size={13} /> : <Send size={13} />}{mode === "note" ? "Add note" : "Send"}</Button>
        </div>
      </div>
      {error && <p role="alert" className="mt-1.5 text-[12px] text-red-600">{error}</p>}
    </div>
  );
}

export function ConversationThread({ id, onBack, onOpenDetails }: { id: string; onBack: () => void; onOpenDetails: () => void }) {
  const { user } = useAuth();
  const conv = useConversation(id);
  const msgs = useMessages(id);
  const team = useTeam();
  const assign = useAssign();
  const setStatus = useSetConversationStatus();
  const setPriority = useSetPriority();
  const toTicket = useToTicket();
  const retry = useRetry();
  const markRead = useMarkRead();
  const bottom = useRef<HTMLDivElement>(null);
  const isManager = user?.role === "superadmin" || user?.role === "support_manager";

  const c = conv.data;
  const all = useMemo(() => [...(msgs.data?.pages ?? [])].reverse().flatMap((p) => p.items), [msgs.data]);
  const lastId = all[all.length - 1]?.id;
  // Day separators: a heading before the first message of each calendar day.
  const withDays = useMemo(() => all.map((m, i) => ({ m, day: dayLabel(m.created_at), sep: i === 0 || dayLabel(all[i - 1].created_at) !== dayLabel(m.created_at) })), [all]);

  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [lastId, id]);
  const unread = c?.unread_count ?? 0;
  useEffect(() => { if (unread > 0) markRead.mutate(id); }, [id, unread]); // eslint-disable-line react-hooks/exhaustive-deps

  if (conv.isLoading || msgs.isLoading) return <PageLoader variant="compact" />;
  if (conv.isError || !c) return <div className="p-4"><ErrorState message="This conversation couldn't be opened — it may be assigned to someone else." onRetry={() => void conv.refetch()} /></div>;
  const name = c.customer_name || c.customer_email || c.customer_phone || "Unknown";
  const mine = c.assigned_to === user?.id;

  return (
    <section aria-label="Conversation" className="flex h-full min-h-0 flex-col bg-background">
      <header className="space-y-2 border-b border-border bg-card px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <Button type="button" variant="ghost" size="icon" className="lg:hidden" aria-label="Back to conversations" onClick={onBack}><ArrowLeft size={16} /></Button>
          <Avatar name={name} size={32} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-bold text-foreground"><span className="truncate">{name}</span><ChannelBadge channel={c.channel} compact /></p>
            <p className="truncate text-[12px] text-muted">{c.subject ?? c.customer_email ?? c.customer_phone}{c.ticket_reference ? ` · ${c.ticket_reference}` : ""}</p>
          </div>
          <Badge tone={c.status === "open" ? "green" : "slate"}>{c.status === "open" ? "Open" : "Resolved"}</Badge>
          <Button type="button" variant="ghost" size="icon" className="2xl:hidden" aria-label="Customer details" onClick={onOpenDetails}><PanelRight size={16} /></Button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {isManager ? (
            <Select aria-label="Assign to" value={c.assigned_to ?? ""} onChange={(e) => assign.mutate({ id, userId: e.target.value || null })} className="w-auto! min-w-[130px] py-1 text-[12.5px]">
              <option value="">Unassigned</option>
              {(team.data ?? []).filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </Select>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => assign.mutate({ id, userId: mine ? null : user!.id })}>{mine ? "Unassign" : c.assigned_to ? `Assigned: ${c.assigned_name}` : "Assign to me"}</Button>
          )}
          <Select aria-label="Priority" value={c.priority} onChange={(e) => setPriority.mutate({ id, priority: e.target.value as Priority })} className="w-auto! min-w-[100px] py-1 text-[12.5px] capitalize">
            {(["low", "normal", "high", "urgent"] as const).map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
          {!c.ticket_id && <Button type="button" variant="outline" size="sm" onClick={() => toTicket.mutate(id)} disabled={toTicket.isPending}><Ticket size={13} /> Create ticket</Button>}
          {c.status === "open"
            ? <Button type="button" variant="outline" size="sm" onClick={() => setStatus.mutate({ id, status: "resolved" })}><CheckCircle2 size={13} /> Resolve</Button>
            : <Button type="button" variant="outline" size="sm" onClick={() => setStatus.mutate({ id, status: "open" })}><RotateCcw size={13} /> Reopen</Button>}
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-4">
        {msgs.hasNextPage && <div className="text-center"><Button type="button" variant="outline" size="sm" onClick={() => void msgs.fetchNextPage()} disabled={msgs.isFetchingNextPage}>{msgs.isFetchingNextPage ? "Loading…" : "Load earlier messages"}</Button></div>}
        {all.length === 0 && <p className="py-10 text-center text-sm text-muted">No messages yet.</p>}
        {withDays.map(({ m, day, sep }) => (
          <div key={m.id} className="space-y-2">
            {sep && <p className="py-1 text-center text-[11px] font-semibold text-muted">{day}</p>}
            <Bubble m={m} onRetry={(x) => retry.mutate({ id, messageId: x.id })} />
          </div>
        ))}
        <div ref={bottom} />
      </div>
      {c.channel === "email" && !c.customer_email && <div className="px-3 pb-2"><Notice tone="red">This conversation has no email address, so replies can&apos;t be sent.</Notice></div>}
      <Composer key={id} conv={c} />
    </section>
  );
}
