"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, CheckCircle2, Circle, Send } from "lucide-react";
import { marketingApi, type Campaign, type ContactFilters, type EmailBlock, type NewsletterSchedule } from "@/lib/api";
import { errorText, useAudienceSummary, useMarketingMutation, useMarketingSettings, useReadiness, useSegments, useTemplates } from "@/lib/marketing/hooks";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input, Select } from "@/components/ui/Form";
import { Notice } from "@/components/ui/EmptyState";
import { AudienceFilters } from "./AudienceFilters";
import { EmailBuilder, EmailPreview } from "./EmailBuilder";
import { Flash, TYPE_LABEL, num, when } from "./shared";
import { cn } from "@/lib/utils";

const STEPS = ["Setup", "Audience", "Content", "Review & send"] as const;
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const LARGE_SEND = 50;

interface Draft {
  name: string; campaign_type: string; subject: string; preheader: string; sender_name: string; sender_email: string; reply_to: string;
  segment_id: string; filters: ContactFilters; blocks: EmailBlock[]; template_id: string | null; schedule: NewsletterSchedule | null;
}
const fromCampaign = (c: Campaign): Draft => ({
  name: c.name, campaign_type: c.campaign_type, subject: c.subject, preheader: c.preheader ?? "", sender_name: c.sender_name ?? "", sender_email: c.sender_email ?? "", reply_to: c.reply_to ?? "",
  segment_id: c.audience?.segment_id ?? "", filters: c.audience?.filters ?? {}, blocks: c.blocks, template_id: c.template_id, schedule: c.schedule,
});
const toPatch = (d: Draft): Partial<Campaign> => ({
  name: d.name, campaign_type: d.campaign_type, subject: d.subject, preheader: d.preheader, sender_name: d.sender_name, sender_email: d.sender_email, reply_to: d.reply_to,
  template_id: d.template_id, blocks: d.blocks, audience: { segment_id: d.segment_id || null, filters: d.filters }, ...(d.schedule ? { schedule: d.schedule } : {}),
});

/** Four-step builder shared by campaigns and newsletters: Setup → Audience → Content → Review & send. The draft is saved to
 *  the server on every step, so leaving and coming back never loses work. */
export function CampaignWizard({ campaign, newsletter = false, onDone }: { campaign: Campaign; newsletter?: boolean; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(() => fromCampaign(campaign));
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [confirm, setConfirm] = useState<"send" | "issue" | null>(null);
  const [testTo, setTestTo] = useState("");
  const [at, setAt] = useState("");
  const settings = useMarketingSettings().data;
  const segments = useSegments().data;
  const templates = useTemplates({ status: "active" }).data;
  const merged = useMemo(() => ({ ...(segments?.find((s) => s.id === draft.segment_id)?.filters ?? {}), ...draft.filters }), [segments, draft.segment_id, draft.filters]);
  const summary = useAudienceSummary(merged, newsletter);

  const save = useMarketingMutation(() => marketingApi.updateCampaign(campaign.id, toPatch(draft)).then((r) => r.data));
  const action = useMarketingMutation((v: { run: () => Promise<unknown> }) => v.run());
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => { setDraft((d) => ({ ...d, [k]: v })); setDirty(true); };
  const frozen = campaign.status === "sending" || campaign.status === "sent";

  const persist = async (quiet = false): Promise<boolean> => {
    if (!dirty && quiet) return true;
    try { await save.mutateAsync(undefined as never); setDirty(false); if (!quiet) setMsg({ tone: "ok", text: "Draft saved." }); return true; } catch (e) { setMsg({ tone: "error", text: errorText(e) }); return false; }
  };
  const go = async (to: number) => { if (await persist(true)) { setMsg(null); setStep(to); } };
  const ready = useReadiness(step === 3 && !dirty ? campaign.id : null, step === 3 && !dirty);
  const eligible = ready.data?.audience.eligible ?? summary.data?.eligible ?? 0;

  const doAction = async (run: () => Promise<unknown>, ok: string, then?: () => void) => {
    setMsg(null);
    try { if (!(await persist(true))) return; await action.mutateAsync({ run }); setMsg({ tone: "ok", text: ok }); then?.(); } catch (e) { setMsg({ tone: "error", text: errorText(e) }); }
  };
  const sched = draft.schedule;
  const setSched = (patch: Partial<NewsletterSchedule>) => set("schedule", { frequency: "monthly", hour: 9, day: 1, weekday: 0, ...(sched ?? {}), ...patch });
  const senderLine = draft.sender_name || draft.sender_email ? `${draft.sender_name || settings?.general.sender_name} <${draft.sender_email || settings?.general.sender_email || settings?.provider.from}>` : ready.data?.sender ?? settings?.provider.from ?? "";

  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap gap-2" aria-label="Steps">
        {STEPS.map((label, i) => (
          <li key={label}><button type="button" onClick={() => go(i)} aria-current={step === i ? "step" : undefined}
            className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-semibold transition-colors", step === i ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:text-foreground")}>
            <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[11px]", step > i ? "bg-accent text-white" : "bg-surface")}>{step > i ? <Check size={11} /> : i + 1}</span>{newsletter && i === 3 ? "Schedule & activate" : label}</button></li>
        ))}
        <li className="ml-auto flex items-center gap-2 text-[12px] text-muted">{dirty ? "Unsaved changes" : "All changes saved"}<Button size="sm" variant="outline" disabled={!dirty || save.isPending || frozen} onClick={() => persist()}>Save draft</Button></li>
      </ol>
      {campaign.status === "scheduled" && <Notice tone="blue">Scheduled for {when(campaign.scheduled_at)}. You can still edit it; to change the time, move it back to draft first.</Notice>}
      {msg && <Flash tone={msg.tone}>{msg.text}</Flash>}

      {step === 0 && (
        <section className="grid gap-3 rounded-xl border border-border bg-card p-5 sm:grid-cols-2">
          <Field label={newsletter ? "Newsletter name" : "Campaign name"} required hint="For your team only — recipients never see it." className="sm:col-span-2"><Input value={draft.name} onChange={(e) => set("name", e.target.value)} maxLength={200} /></Field>
          {!newsletter && <Field label="Campaign type"><Select value={draft.campaign_type} onChange={(e) => set("campaign_type", e.target.value)}>{["promotional", "announcement", "product_update"].map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</Select></Field>}
          <Field label="Subject line" required className={newsletter ? "sm:col-span-2" : ""} hint="You can personalise it, for example “News for {{business_name}}”."><Input value={draft.subject} onChange={(e) => set("subject", e.target.value)} maxLength={300} /></Field>
          <Field label="Preview text" hint="The grey text shown next to the subject in the inbox." className="sm:col-span-2"><Input value={draft.preheader} onChange={(e) => set("preheader", e.target.value)} maxLength={200} /></Field>
          <Field label="Sender name" hint={`Default: ${settings?.general.sender_name ?? "Pesaa"}`}><Input value={draft.sender_name} onChange={(e) => set("sender_name", e.target.value)} maxLength={120} placeholder={settings?.general.sender_name} /></Field>
          <Field label="Sender email" hint="Must be an address your mail provider is allowed to send from. Leave empty to use the default."><Input type="email" value={draft.sender_email} onChange={(e) => set("sender_email", e.target.value)} placeholder={settings?.general.sender_email || "Provider default"} /></Field>
          <Field label="Reply-to (optional)"><Input type="email" value={draft.reply_to} onChange={(e) => set("reply_to", e.target.value)} placeholder={settings?.general.reply_to} /></Field>
          <p className="self-end text-[12px] text-muted">Sender identity can be verified in <Link className="font-semibold text-accent hover:underline" href="/marketing/settings">Marketing settings</Link>.</p>
        </section>
      )}

      {step === 1 && (
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4 rounded-xl border border-border bg-card p-5">
            <Field label="Saved segment" hint="A segment is a saved set of filters from the Audience page."><Select value={draft.segment_id} onChange={(e) => set("segment_id", e.target.value)}><option value="">Everyone eligible</option>{segments?.map((s) => <option key={s.id} value={s.id}>{s.name} — {num(s.eligible)} eligible</option>)}</Select></Field>
            <div><p className="mb-2 text-[13px] font-medium">Narrow it further (optional)</p><AudienceFilters value={draft.filters} onChange={(f) => set("filters", f)} /></div>
          </div>
          <aside className="h-fit rounded-xl border border-border bg-card p-5" aria-live="polite">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Will receive this</p>
            <p className="mt-1 text-[28px] font-bold tabular-nums">{summary.data ? num(summary.data.eligible) : "…"}</p>
            <p className="text-[12px] text-muted">of {summary.data ? num(summary.data.matched) : "…"} contacts match your filters</p>
            {summary.data && summary.data.matched > summary.data.eligible && (
              <ul className="mt-3 space-y-1 border-t border-border pt-3 text-[12.5px]">
                {([["unsubscribed", "Unsubscribed"], ["bounced_or_complained", "Bounced or complained"], ["invalid_email", "Invalid or test address"], ["suspended_account", "Suspended account"], ["no_consent", "No recorded consent"], ["not_newsletter_subscriber", "Not a newsletter subscriber"]] as const)
                  .filter(([k]) => summary.data!.excluded[k] > 0).map(([k, label]) => <li key={k} className="flex justify-between"><span className="text-muted">{label}</span><span className="tabular-nums">−{num(summary.data!.excluded[k])}</span></li>)}
              </ul>
            )}
            <p className="mt-3 border-t border-border pt-3 text-[11.5px] text-muted">{newsletter ? "Newsletters only go to people who subscribed to them. " : ""}Unsubscribed, suppressed and invalid contacts are always excluded.{summary.data?.consentMode === "opt_in" ? " Consent mode: opt-in — only contacts with recorded consent." : ""}</p>
          </aside>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-4">
            <Field label="Start from a template" className="min-w-[240px] flex-1"><Select value="" onChange={(e) => { const t = templates?.find((x) => x.id === e.target.value); if (t && (draft.blocks.length === 0 || window.confirm("Replace the current content with this template?"))) { setDraft((d) => ({ ...d, blocks: structuredClone(t.blocks), template_id: t.id, subject: d.subject || t.subject || "", preheader: d.preheader || t.preheader || "" })); setDirty(true); } }}>
              <option value="">Choose a template…</option>{templates?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
            <Link href="/marketing/templates" className="pb-2 text-[12px] font-semibold text-accent hover:underline">Manage templates</Link>
          </div>
          <EmailBuilder blocks={draft.blocks} onChange={(b) => set("blocks", b)} subject={draft.subject} preheader={draft.preheader} disabled={frozen} />
        </section>
      )}

      {step === 3 && (
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-2 text-sm font-bold">Summary</h2>
              <dl className="space-y-1.5 text-[13px]">
                {([["Name", draft.name], ["Subject", draft.subject || "—"], ["Sender", senderLine], ["Audience", `${num(ready.data?.audience.eligible ?? summary.data?.eligible)} eligible recipients`]] as const).map(([k, v]) => <div key={k} className="flex justify-between gap-4"><dt className="text-muted">{k}</dt><dd className="min-w-0 truncate text-right font-medium">{v}</dd></div>)}
              </dl>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-2 text-sm font-bold">Checks</h2>
              {dirty ? <p className="text-[13px] text-muted">Save your changes to run the checks.</p> : !ready.data ? <p className="text-[13px] text-muted">Checking…</p> : (
                <ul className="space-y-2">{ready.data.checks.map((c) => (
                  <li key={c.key} className="flex items-start gap-2 text-[13px]">
                    {c.ok ? <CheckCircle2 size={15} className="mt-0.5 flex-shrink-0 text-emerald-600" aria-hidden /> : c.blocking ? <Circle size={15} className="mt-0.5 flex-shrink-0 text-red-500" aria-hidden /> : <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-amber-500" aria-hidden />}
                    <span><span className="font-medium">{c.label}</span>{c.detail && <span className="block text-[12px] text-muted">{c.detail}</span>}</span></li>))}</ul>
              )}
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-2 text-sm font-bold">Send a test</h2>
              <div className="flex gap-2"><Input type="email" aria-label="Test recipient" placeholder="you@yourcompany.com" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
                <Button variant="outline" disabled={!testTo || action.isPending || dirty} onClick={() => doAction(() => marketingApi.testCampaign(campaign.id, testTo), `Test sent to ${testTo}`)}>Send test</Button></div>
              <p className="mt-1 text-[11.5px] text-muted">Goes only to this address, with sample data in the variables.</p>
            </div>
            {newsletter ? (
              <div className="space-y-3 rounded-xl border border-border bg-card p-5">
                <h2 className="text-sm font-bold">Schedule</h2>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="How often"><Select value={sched?.frequency ?? ""} onChange={(e) => setSched({ frequency: e.target.value as NewsletterSchedule["frequency"] })}><option value="" disabled>Choose…</option><option value="weekly">Every week</option><option value="biweekly">Every two weeks</option><option value="monthly">Every month</option></Select></Field>
                  {sched?.frequency === "monthly" ? <Field label="Day of month"><Select value={sched.day ?? 1} onChange={(e) => setSched({ day: Number(e.target.value) })}>{Array.from({ length: 28 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</Select></Field>
                    : <Field label="Day"><Select value={sched?.weekday ?? 0} onChange={(e) => setSched({ weekday: Number(e.target.value) })}>{WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</Select></Field>}
                  <Field label="Hour (UTC)"><Select value={sched?.hour ?? 9} onChange={(e) => setSched({ hour: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>)}</Select></Field>
                </div>
                {campaign.schedule?.next_run_at && campaign.status === "active" && <p className="text-[12.5px] text-muted">Next issue: <span className="font-semibold text-foreground">{when(campaign.schedule.next_run_at)}</span></p>}
                <div className="flex flex-wrap gap-2 pt-1">
                  {campaign.status === "active" ? <Button variant="outline" disabled={action.isPending} onClick={() => doAction(() => marketingApi.campaignAction(campaign.id, "pause"), "Newsletter paused", onDone)}>Pause newsletter</Button>
                    : <Button disabled={action.isPending || !sched?.frequency} onClick={() => doAction(() => marketingApi.campaignAction(campaign.id, "activate"), "Newsletter activated", onDone)}>Activate newsletter</Button>}
                  <Button variant="outline" disabled={action.isPending || !ready.data?.canSend} onClick={() => setConfirm("issue")}><Send size={14} /> Send an issue now</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 rounded-xl border border-border bg-card p-5">
                <h2 className="text-sm font-bold">Send</h2>
                <div className="flex flex-wrap items-end gap-2">
                  <Button disabled={action.isPending || !ready.data?.canSend || dirty} onClick={() => setConfirm("send")}><Send size={14} /> Send now</Button>
                  <span className="text-[12px] text-muted">or</span>
                  <Field label="Schedule for" className="min-w-[200px]"><Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></Field>
                  <Button variant="outline" disabled={!at || action.isPending || !ready.data?.canSend || dirty} onClick={() => doAction(() => marketingApi.scheduleCampaign(campaign.id, new Date(at).toISOString(), eligible), "Campaign scheduled", onDone)}>Schedule</Button>
                  {campaign.status === "scheduled" && <Button variant="ghost" disabled={action.isPending} onClick={() => doAction(() => marketingApi.campaignAction(campaign.id, "unschedule"), "Moved back to draft", onDone)}>Unschedule</Button>}
                </div>
                <p className="text-[11.5px] text-muted">Your local time. The audience is re-checked at send time; anyone who unsubscribes before then is skipped.</p>
              </div>
            )}
          </div>
          <EmailPreview blocks={draft.blocks} subject={draft.subject} preheader={draft.preheader} />
        </section>
      )}

      <div className="flex justify-between">
        <Button variant="outline" disabled={step === 0} onClick={() => go(step - 1)}>Back</Button>
        {step < 3 ? <Button onClick={() => go(step + 1)} disabled={step === 0 && (!draft.name.trim())}>Continue</Button> : <span />}
      </div>

      <ConfirmDialog open={confirm !== null} title={confirm === "issue" ? "Send an issue now?" : "Send this campaign now?"}
        message={`This will email ${num(eligible)} ${eligible === 1 ? "person" : "people"} straight away and can't be undone.${ready.data?.checks.find((c) => c.key === "safe_mode") ? " (Not production: only allow-listed addresses will actually be emailed.)" : ""}`}
        confirmLabel="Send" confirmText={eligible > LARGE_SEND ? String(eligible) : undefined} onCancel={() => setConfirm(null)}
        onConfirm={() => { const kind = confirm; setConfirm(null); void doAction(() => (kind === "issue" ? marketingApi.publishIssue(campaign.id, eligible) : marketingApi.sendCampaign(campaign.id, eligible)), "Sending started", onDone); }} />
    </div>
  );
}
