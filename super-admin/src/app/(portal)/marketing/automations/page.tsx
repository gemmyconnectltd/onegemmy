"use client";

import { useState } from "react";
import { History, Pencil, Play, Plus, Trash2, Workflow } from "lucide-react";
import { marketingApi, type Automation, type AutomationKind, type EmailBlock } from "@/lib/api";
import { errorText, useAutomationHistory, useAutomations, useMarketingMutation, useMarketingSettings, useTemplates } from "@/lib/marketing/hooks";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Drawer } from "@/components/ui/Drawer";
import { DataCard, thClass } from "@/components/ui/DataTable";
import { Field, Input, Select } from "@/components/ui/Form";
import { EmptyState, ErrorState, Notice } from "@/components/ui/EmptyState";
import { Toggle } from "@/components/ui/Toggle";
import { EmailBuilder } from "@/components/marketing/EmailBuilder";
import { Flash, num, when } from "@/components/marketing/shared";

const PARAM_LABEL: Record<string, string> = { days: "Days after signup", days_before: "Days before renewal", inactive_days: "Days without ERP activity" };
const EXPLAIN: Record<string, string> = {
  welcome: "Sent after a business signs up. Only businesses that sign up after you activate it.",
  onboarding: "Sent to businesses that still have no completed sale a few days after signing up.",
  renewal: "Sent shortly before an active subscription renews — once per billing period.",
  reengagement: "Sent to businesses that used the ERP before but have been silent — at most once every 90 days.",
  announcement: "Sent once to every eligible contact when you press Run. Use a campaign if you want a segment or schedule.",
};

export default function AutomationsPage() {
  const { data, isLoading, isError, refetch } = useAutomations();
  const provider = useMarketingSettings().data?.provider;
  const [editing, setEditing] = useState<Automation | null>(null);
  const [history, setHistory] = useState<Automation | null>(null);
  const [picking, setPicking] = useState(false);
  const [del, setDel] = useState<Automation | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const create = useMarketingMutation((kind: string) => marketingApi.createAutomation({ kind }).then((r) => r.data));
  const act = useMarketingMutation((v: { id: string; a: "activate" | "pause" | "run" }) => marketingApi.automationAction(v.id, v.a).then((r) => r.data));
  const remove = useMarketingMutation((id: string) => marketingApi.deleteAutomation(id));
  const run = async (fn: () => Promise<unknown>, ok?: string) => { setMsg(null); try { await fn(); if (ok) setMsg({ tone: "ok", text: ok }); } catch (e) { setMsg({ tone: "error", text: errorText(e) }); } };
  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <PageHeader title="Automations" subtitle="Emails sent automatically when something happens to a business."
        actions={<Button onClick={() => setPicking(true)}><Plus size={14} /> New automation</Button>} />
      {provider && !provider.configured && <Notice>No email provider is configured on the server, so automations can&apos;t be activated yet. See Marketing settings.</Notice>}
      {msg && <Flash tone={msg.tone}>{msg.text}</Flash>}
      {isLoading ? <PageLoader variant="compact" /> : isError ? <ErrorState message="Could not load automations." onRetry={() => void refetch()} /> : items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card"><EmptyState icon={Workflow} title="No automations yet" description="Start with a welcome series or an onboarding follow-up. Nothing sends until you activate it." /></div>
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2">
          {items.map((a) => (
            <li key={a.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><h2 className="truncate text-sm font-bold">{a.name}</h2><p className="mt-0.5 text-[12.5px] text-muted">{a.triggerText}</p></div>
                <div className="flex flex-shrink-0 items-center gap-2"><Badge tone={a.active ? "green" : "slate"} dot>{a.active ? "Active" : "Paused"}</Badge>
                  <Toggle checked={a.active} loading={act.isPending && act.variables?.id === a.id} label={`${a.active ? "Pause" : "Activate"} ${a.name}`} onChange={(on) => run(() => act.mutateAsync({ id: a.id, a: on ? "activate" : "pause" }), on ? "Automation activated — it acts on events from now on." : "Automation paused.")} /></div>
              </div>
              <p className="mt-2 text-[12px] text-muted">{EXPLAIN[a.kind]}</p>
              <dl className="mt-3 grid grid-cols-4 gap-2 border-t border-border pt-3 text-center">
                {([["Queued", a.stats.queued], ["Sent", a.stats.sent], ["Opened", a.stats.opened], ["Clicked", a.stats.clicked]] as const).map(([k, v]) => <div key={k}><dd className="text-[16px] font-bold tabular-nums">{num(v)}</dd><dt className="text-[11px] text-muted">{k}</dt></div>)}
              </dl>
              <p className="mt-2 text-[11.5px] text-muted">{a.activated_at ? `Active since ${when(a.activated_at)}` : "Never activated"}{a.stats.failed ? ` · ${a.stats.failed} failed` : ""}{a.stats.skipped ? ` · ${a.stats.skipped} skipped` : ""}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" onClick={() => setEditing(a)}><Pencil size={13} /> Edit</Button>
                <Button size="sm" variant="outline" onClick={() => setHistory(a)}><History size={13} /> History</Button>
                {a.trigger === "manual" && a.active && <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => run(async () => { const r = (await act.mutateAsync({ id: a.id, a: "run" })) as { queued: number }; setMsg({ tone: "ok", text: `${r.queued} messages queued.` }); })}><Play size={13} /> Run now</Button>}
                {!a.active && <Button size="sm" variant="ghost" onClick={() => setDel(a)}><Trash2 size={13} /> Delete</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <KindPicker open={picking} kinds={data?.kinds ?? []} busy={create.isPending} onClose={() => setPicking(false)} onPick={(k) => run(async () => { const a = await create.mutateAsync(k); setPicking(false); setEditing(a); })} />
      {editing && <EditAutomation key={editing.id} automation={editing} onClose={() => setEditing(null)} />}
      <HistoryDrawer automation={history} onClose={() => setHistory(null)} />
      <ConfirmDialog open={!!del} title={`Delete “${del?.name}”?`} message="Its history is deleted too. This can't be undone." danger confirmLabel="Delete" onCancel={() => setDel(null)} onConfirm={() => { const id = del!.id; setDel(null); void run(() => remove.mutateAsync(id), "Automation deleted."); }} />
    </div>
  );
}

function KindPicker({ open, kinds, busy, onClose, onPick }: { open: boolean; kinds: AutomationKind[]; busy: boolean; onClose: () => void; onPick: (k: string) => void }) {
  return (
    <Drawer open={open} onClose={onClose} side="center" size="md" title="New automation" description="Choose what should trigger the email.">
      <ul className="divide-y divide-border">{kinds.map((k) => (
        <li key={k.kind}><button type="button" disabled={busy} onClick={() => onPick(k.kind)} className="block w-full px-5 py-3 text-left hover:bg-surface/60 disabled:opacity-60"><span className="block text-sm font-semibold">{k.label}</span><span className="block text-[12px] text-muted">{EXPLAIN[k.kind]}</span></button></li>))}</ul>
    </Drawer>
  );
}

function EditAutomation({ automation: a, onClose }: { automation: Automation; onClose: () => void }) {
  const templates = useTemplates({ status: "active" }).data;
  const [f, setF] = useState({ name: a.name, subject: a.subject, preheader: a.preheader ?? "", delay_hours: a.delay_hours, params: a.params });
  const [blocks, setBlocks] = useState<EmailBlock[]>(a.blocks);
  const [error, setError] = useState("");
  const save = useMarketingMutation(() => marketingApi.updateAutomation(a.id, { ...f, blocks }));
  return (
    <Drawer open onClose={onClose} side="right" size="xl" title={`Edit: ${a.name}`} description={a.triggerText}
      footer={<div className="flex items-center justify-between gap-2"><span className="text-[12px] text-muted">{a.active ? "Changes apply to messages queued from now on." : "Not active — nothing is sent until you activate it."}</span>
        <div className="flex gap-2"><Button variant="outline" onClick={onClose}>Close</Button><Button disabled={save.isPending} onClick={async () => { setError(""); try { await save.mutateAsync(undefined as never); onClose(); } catch (e) { setError(errorText(e)); } }}>Save</Button></div></div>}>
      <div className="space-y-4 p-5">
        {error && <Flash tone="error">{error}</Flash>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={160} /></Field>
          {a.trigger === "signup" && <Field label="Delay after signup (hours)" hint="0 sends as soon as possible."><Input type="number" min={0} max={720} value={f.delay_hours} onChange={(e) => setF({ ...f, delay_hours: Number(e.target.value) })} /></Field>}
          {Object.keys(a.params).map((k) => <Field key={k} label={PARAM_LABEL[k] ?? k}><Input type="number" min={1} max={365} value={f.params[k] ?? a.params[k]} onChange={(e) => setF({ ...f, params: { ...f.params, [k]: Number(e.target.value) } })} /></Field>)}
          <Field label="Subject line" required><Input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} maxLength={300} /></Field>
          <Field label="Preview text"><Input value={f.preheader} onChange={(e) => setF({ ...f, preheader: e.target.value })} maxLength={200} /></Field>
          <Field label="Start from a template" className="sm:col-span-2"><Select value="" onChange={(e) => { const t = templates?.find((x) => x.id === e.target.value); if (t && (blocks.length === 0 || window.confirm("Replace the current content with this template?"))) { setBlocks(structuredClone(t.blocks)); setF((v) => ({ ...v, subject: v.subject || t.subject || "", preheader: v.preheader || t.preheader || "" })); } }}><option value="">Choose a template…</option>{templates?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
        </div>
        <p className="text-[12px] text-muted">Eligibility: only contacts who can receive marketing — unsubscribed, suppressed, invalid and test addresses are always skipped, and each contact gets this email once.</p>
        <EmailBuilder blocks={blocks} onChange={setBlocks} subject={f.subject} preheader={f.preheader} />
      </div>
    </Drawer>
  );
}

function HistoryDrawer({ automation, onClose }: { automation: Automation | null; onClose: () => void }) {
  const { data, isLoading } = useAutomationHistory(automation?.id ?? null);
  return (
    <Drawer open={!!automation} onClose={onClose} side="right" size="xl" title={`History: ${automation?.name ?? ""}`} description="The most recent messages this automation queued.">
      {isLoading ? <PageLoader variant="compact" /> : !data?.length ? <EmptyState title="Nothing has run yet" description="Messages appear here once the automation is active and a business matches its trigger." /> : (
        <DataCard label="Automation history" className="border-0"><table className="w-full min-w-[560px] text-left text-sm">
          <thead><tr><th className={thClass}>Contact</th><th className={thClass}>Status</th><th className={thClass}>Queued</th><th className={thClass}>Engagement</th></tr></thead>
          <tbody className="divide-y divide-border">{data.map((r) => <tr key={r.id}><td className="max-w-[200px] px-4 py-2.5"><span className="block truncate font-medium">{r.contact}</span><span className="block truncate text-[11.5px] text-muted">{r.email}</span></td>
            <td className="px-4 py-2.5"><Badge tone={r.status === "sent" ? "green" : r.status === "pending" || r.status === "sending" ? "amber" : r.status === "skipped" ? "slate" : "red"}>{r.status}</Badge>{r.reason && <span className="block text-[11px] text-muted">{r.reason}</span>}</td>
            <td className="px-4 py-2.5 text-[12px] text-muted">{when(r.queuedAt)}</td><td className="px-4 py-2.5 text-[12px]">{r.opens} opens · {r.clicks} clicks</td></tr>)}</tbody></table></DataCard>
      )}
    </Drawer>
  );
}
