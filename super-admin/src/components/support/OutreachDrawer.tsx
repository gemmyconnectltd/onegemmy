"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Send, TriangleAlert } from "lucide-react";
import type { OutreachResult } from "@/lib/api";
import { useSendOutreach } from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";
import { Badge, type Tone } from "@/components/ui/Badge";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";

const STATUS_TONE: Record<OutreachResult["status"], Tone> = { sent: "green", queued: "blue", failed: "red", skipped: "amber" };
const newRequestId = () => crypto.randomUUID();

/** Compose one message to one or many businesses. Each business gets its own Support conversation, so replies come back to the Inbox. */
export function OutreachDrawer({ recipients, onClose, onDone }: { recipients: { id: string; name: string }[]; onClose: () => void; onDone: () => void }) {
  const [channel, setChannel] = useState<"preferred" | "email" | "whatsapp">("preferred");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  // One id per compose session: a double-click or a retried request returns the original sends instead of messaging anyone twice.
  const [requestId, setRequestId] = useState(newRequestId);
  const [results, setResults] = useState<OutreachResult[] | null>(null);
  const [error, setError] = useState("");
  const send = useSendOutreach();

  const needsSubject = channel !== "whatsapp";
  const canSend = body.trim().length > 0 && (!needsSubject || subject.trim().length > 0) && !send.isPending;
  const submit = () => {
    setError("");
    send.mutate({ tenant_ids: recipients.map((r) => r.id), channel, subject, body, client_request_id: requestId }, {
      onSuccess: (res) => { setResults(res.data.results); setRequestId(newRequestId()); onDone(); },
      onError: (e) => setError((e as { detail?: string }).detail || "Could not send. Please try again."),
    });
  };
  const count = (s: OutreachResult["status"]) => results?.filter((r) => r.status === s).length ?? 0;

  return <Drawer open onClose={onClose} side="right" size="xl" title={results ? "Message results" : recipients.length === 1 ? `Message ${recipients[0].name}` : `Message ${recipients.length} businesses`}
    description={results ? undefined : "Each business gets its own conversation. Replies appear in the Support inbox."}
    footer={results ? <Button onClick={onClose}>Done</Button> : <div className="flex items-center gap-2"><Button onClick={submit} disabled={!canSend}>{send.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send{recipients.length > 1 ? ` to ${recipients.length}` : ""}</Button><Button variant="outline" onClick={onClose}>Cancel</Button></div>}>
    {results ? <div className="space-y-4">
      <p className="flex items-center gap-2 text-sm"><CheckCircle2 size={16} className="text-green-600" /> {count("sent") + count("queued")} sent{count("queued") ? ` (${count("queued")} still sending)` : ""}{count("failed") ? ` · ${count("failed")} failed` : ""}{count("skipped") ? ` · ${count("skipped")} skipped` : ""}</p>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {results.map((r) => <li key={r.tenant_id} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
          <span className="min-w-0"><span className="block truncate font-medium">{r.name}</span>{r.reason && <span className="block text-[12px] text-muted">{r.reason}</span>}</span>
          <Badge tone={STATUS_TONE[r.status]} className="shrink-0 capitalize">{r.status}{r.channel && r.status !== "skipped" ? ` · ${r.channel}` : ""}</Badge>
        </li>)}
      </ul>
    </div> : <div className="space-y-4">
      <Field label="Send via"><Select value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}>
        <option value="preferred">Each business&apos;s preferred channel</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option>
      </Select></Field>
      {needsSubject && <Field label="Subject" required><Input value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} placeholder="What is this about?" /></Field>}
      <Field label="Message" required hint="An unsubscribe link (email) or a “Reply STOP” line (WhatsApp) is added automatically. Businesses that opted out are skipped."><Textarea rows={9} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message…" /></Field>
      {error && <p role="alert" className="flex items-start gap-2 text-sm text-red-600"><TriangleAlert size={15} className="mt-0.5 shrink-0" />{error}</p>}
    </div>}
  </Drawer>;
}
