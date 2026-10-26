"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { marketingApi, type Automation, type EmailBlock } from "@/lib/api";
import { errorText, useAutomations, useMarketingMutation, useTemplates } from "@/lib/marketing/hooks";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { ErrorState, Notice } from "@/components/ui/EmptyState";
import { EmailBuilder } from "@/components/marketing/EmailBuilder";
import { Flash } from "@/components/marketing/shared";
import { BackLink } from "@/components/traffic/shared";

const PARAM_LABEL: Record<string, string> = { days: "Days after signup", days_before: "Days before renewal", inactive_days: "Days without ERP activity" };

export default function AutomationEditorPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useAutomations();
  if (isLoading) return <PageLoader variant="page" />;
  if (isError) return <ErrorState message="Could not load this automation." onRetry={() => void refetch()} />;
  const automation = data?.items.find((a) => a.id === id);
  if (!automation) return <ErrorState message="Automation not found. It may have been deleted." />;
  return <Editor key={automation.id} automation={automation} />;
}

/** A full page, not a drawer: the content builder needs room, and the work is worth protecting from accidental loss. */
function Editor({ automation: a }: { automation: Automation }) {
  const templates = useTemplates({ status: "active" }).data;
  const [f, setF] = useState({ name: a.name, subject: a.subject, preheader: a.preheader ?? "", delay_hours: a.delay_hours, params: a.params });
  const [blocks, setBlocks] = useState<EmailBlock[]>(a.blocks);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const save = useMarketingMutation(() => marketingApi.updateAutomation(a.id, { ...f, blocks }));
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const edit = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setF((x) => ({ ...x, [k]: v })); setDirty(true); };

  return (
    <div className="space-y-4">
      <PageHeader back={<BackLink href="/marketing/automations" label="Back to automations" />} title={a.name} subtitle={a.triggerText}
        actions={<><Badge tone={a.active ? "green" : "slate"} dot>{a.active ? "Active" : "Paused"}</Badge>
          <Button disabled={!dirty || save.isPending} onClick={async () => { setMsg(null); try { await save.mutateAsync(undefined as never); setDirty(false); setMsg({ tone: "ok", text: "Saved." }); } catch (e) { setMsg({ tone: "error", text: errorText(e) }); } }}>{save.isPending ? "Saving…" : dirty ? "Save changes" : "Saved"}</Button></>} />
      <Notice tone="blue">{a.active ? "Changes apply to messages queued from now on." : "This automation isn't active — nothing is sent until you activate it from the automations list."} Only contacts who can receive marketing are emailed, once each.</Notice>
      {msg && <Flash tone={msg.tone}>{msg.text}</Flash>}
      <section className="grid gap-3 rounded-xl border border-border bg-card p-5 sm:grid-cols-2">
        <Field label="Name" className="sm:col-span-2"><Input value={f.name} onChange={(e) => edit("name", e.target.value)} maxLength={160} /></Field>
        {a.trigger === "signup" && <Field label="Delay after signup (hours)" hint="0 sends as soon as possible."><Input type="number" min={0} max={720} value={f.delay_hours} onChange={(e) => edit("delay_hours", Number(e.target.value))} /></Field>}
        {Object.keys(a.params).map((k) => <Field key={k} label={PARAM_LABEL[k] ?? k}><Input type="number" min={1} max={365} value={f.params[k] ?? a.params[k]} onChange={(e) => edit("params", { ...f.params, [k]: Number(e.target.value) })} /></Field>)}
        <Field label="Subject line" required><Input value={f.subject} onChange={(e) => edit("subject", e.target.value)} maxLength={300} /></Field>
        <Field label="Preview text"><Input value={f.preheader} onChange={(e) => edit("preheader", e.target.value)} maxLength={200} /></Field>
        <Field label="Start from a template" className="sm:col-span-2"><Select value="" onChange={(e) => { const t = templates?.find((x) => x.id === e.target.value); if (t && (blocks.length === 0 || window.confirm("Replace the current content with this template?"))) { setBlocks(structuredClone(t.blocks)); setF((v) => ({ ...v, subject: v.subject || t.subject || "", preheader: v.preheader || t.preheader || "" })); setDirty(true); } }}>
          <option value="">Choose a template…</option>{templates?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
      </section>
      <EmailBuilder blocks={blocks} onChange={(b) => { setBlocks(b); setDirty(true); }} subject={f.subject} preheader={f.preheader} />
    </div>
  );
}
