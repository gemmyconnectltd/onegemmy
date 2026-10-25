"use client";

import { useState } from "react";
import { CheckCircle2, CircleAlert, CircleHelp, Loader2 } from "lucide-react";
import { marketingApi, type ConsentMode, type DomainStatus, type MarketingSettings } from "@/lib/api";
import { errorText, useMarketingAudit, useMarketingMutation, useMarketingSettings, useSuppressions } from "@/lib/marketing/hooks";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataCard, Pagination, SearchBox, thClass } from "@/components/ui/DataTable";
import { Field, Input, Textarea } from "@/components/ui/Form";
import { ErrorState, Notice } from "@/components/ui/EmptyState";
import { Section } from "@/components/traffic/shared";
import { CONTACT_STATUS, Flash, when } from "@/components/marketing/shared";
import type { ContactStatus } from "@/lib/api";

type Msg = { tone: "ok" | "error"; text: string } | null;

export default function MarketingSettingsPage() {
  const { data, isLoading, isError, refetch } = useMarketingSettings();
  if (isLoading) return <PageLoader variant="page" />;
  if (isError || !data) return <ErrorState message="Could not load marketing settings." onRetry={() => void refetch()} />;
  return (
    <div className="space-y-4">
      <PageHeader title="Settings" subtitle="Sender identity, sending domain, provider, subscriptions and compliance." />
      <GeneralCard key={JSON.stringify(data.general) + JSON.stringify(data.brand)} s={data} />
      <DomainCard s={data} />
      <ProviderCard s={data} />
      <SubscriptionsCard />
      <ComplianceCard key={JSON.stringify(data.compliance) + JSON.stringify(data.brand)} s={data} />
      <AuditCard />
    </div>
  );
}

function useSave(section: "general" | "brand" | "compliance") {
  const m = useMarketingMutation((values: Record<string, unknown>) => marketingApi.saveSettings(section, values));
  return m;
}

function GeneralCard({ s }: { s: MarketingSettings }) {
  const [g, setG] = useState(s.general);
  const [b, setB] = useState({ color: s.brand.color, logo_url: s.brand.logo_url });
  const [msg, setMsg] = useState<Msg>(null);
  const general = useSave("general");
  const brand = useSave("brand");
  const save = async () => { setMsg(null); try { await general.mutateAsync(g); await brand.mutateAsync(b); setMsg({ tone: "ok", text: "Saved." }); } catch (e) { setMsg({ tone: "error", text: errorText(e) }); } };
  return (
    <Section title="General" subtitle="Defaults used by every campaign, newsletter and automation. Each campaign can override them.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Default sender name"><Input value={g.sender_name} onChange={(e) => setG({ ...g, sender_name: e.target.value })} maxLength={120} /></Field>
        <Field label="Sender email" hint="Must be an address your email provider may send from (see the provider and domain checks below)."><Input type="email" value={g.sender_email} onChange={(e) => setG({ ...g, sender_email: e.target.value })} placeholder={s.provider.from} /></Field>
        <Field label="Reply-to email"><Input type="email" value={g.reply_to} onChange={(e) => setG({ ...g, reply_to: e.target.value })} /></Field>
        <Field label="Brand colour" hint="Buttons and links in emails."><div className="flex gap-2"><input type="color" aria-label="Brand colour" className="h-10 w-12 rounded-lg border border-border bg-card p-1" value={b.color} onChange={(e) => setB({ ...b, color: e.target.value })} /><Input value={b.color} onChange={(e) => setB({ ...b, color: e.target.value })} maxLength={7} /></div></Field>
        <Field label="Logo address" className="sm:col-span-2" hint="Shown in the email header. Defaults to the Pesaa logo."><Input value={b.logo_url} onChange={(e) => setB({ ...b, logo_url: e.target.value })} placeholder="https://…" /></Field>
      </div>
      <div className="mt-4 flex items-center gap-3"><Button onClick={save} disabled={general.isPending || brand.isPending}>Save</Button>{msg && <Flash tone={msg.tone}>{msg.text}</Flash>}</div>
    </Section>
  );
}

const ICON = { pass: <CheckCircle2 size={16} className="text-emerald-600" aria-hidden />, missing: <CircleAlert size={16} className="text-red-500" aria-hidden />, unknown: <CircleHelp size={16} className="text-slate-400" aria-hidden /> } as const;
const WORDS = { pass: "Found", missing: "Not found", unknown: "Couldn't check" } as const;

function DomainCard({ s }: { s: MarketingSettings }) {
  const [domain, setDomain] = useState("");
  const [result, setResult] = useState<DomainStatus | null>(null);
  const [error, setError] = useState("");
  const check = useMarketingMutation(() => marketingApi.domain(domain.trim() || undefined).then((r) => r.data));
  const rows: [string, { status: string; record?: string | null; note?: string | null }, string][] = result ? [
    ["SPF", result.spf, "Lists the servers allowed to send for your domain."], ["DKIM", result.dkim, "Signs your mail so providers know it wasn't altered."], ["DMARC", result.dmarc, "Tells providers what to do with mail that fails SPF/DKIM."]] : [];
  return (
    <Section title="Sending domain" subtitle="Providers trust mail more when the sending domain publishes SPF, DKIM and DMARC records.">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Domain to check" className="min-w-[240px] flex-1" hint={`Leave empty to check the sender's domain (${s.general.sender_email || s.provider.from}).`}><Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="yourdomain.com" /></Field>
        <Button variant="outline" disabled={check.isPending} onClick={async () => { setError(""); try { setResult(await check.mutateAsync(undefined as never)); } catch (e) { setResult(null); setError(errorText(e)); } }}>{check.isPending ? <Loader2 size={14} className="animate-spin" /> : null} Check DNS</Button>
      </div>
      {error && <div className="mt-2"><Flash tone="error">{error}</Flash></div>}
      {result && (
        <div className="mt-4"><p className="mb-2 text-[13px] font-semibold">{result.domain}</p>
          <ul className="divide-y divide-border rounded-xl border border-border">{rows.map(([name, st, help]) => (
            <li key={name} className="flex items-start gap-3 px-4 py-3">{ICON[st.status as keyof typeof ICON] ?? ICON.unknown}
              <div className="min-w-0 flex-1"><p className="text-[13px] font-semibold">{name} <span className="font-normal text-muted">— {WORDS[st.status as keyof typeof WORDS] ?? st.status}</span></p><p className="text-[12px] text-muted">{help}</p>
                {st.record ? <p className="mt-1 break-all font-mono text-[11px] text-muted">{st.record}</p> : null}{st.note && st.status !== "pass" ? <p className="mt-1 text-[11.5px] text-muted">{st.note}</p> : null}</div></li>))}</ul></div>
      )}
    </Section>
  );
}

function ProviderCard({ s }: { s: MarketingSettings }) {
  const p = s.provider;
  const [to, setTo] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const test = useMarketingMutation(() => marketingApi.testConnection().then((r) => r.data));
  const send = useMarketingMutation(() => marketingApi.testSend(to));
  return (
    <Section title="Email provider" subtitle="Marketing mail is sent through the server's SMTP account. Credentials stay on the server and are never shown here.">
      <dl className="grid gap-x-8 gap-y-1 text-[13px] sm:grid-cols-2">
        {([["Status", p.configured ? <Badge key="s" tone="green" dot>Configured</Badge> : <Badge key="s" tone="red" dot>Not configured</Badge>], ["Provider", `SMTP — ${p.host}:${p.port}`], ["Account", p.account || "—"], ["Sends from", p.from || "—"], ["Mailbox", p.dedicated ? "Dedicated marketing mailbox" : "Shared with other Pesaa email"]] as const)
          .map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-1"><dt className="text-muted">{k}</dt><dd className="min-w-0 text-right font-medium">{v}</dd></div>)}
      </dl>
      {!p.configured && <div className="mt-3"><Notice>Set <code>SMTP_USER</code> and <code>SMTP_PASSWORD</code> (or <code>MARKETING_SMTP_USER</code> / <code>MARKETING_SMTP_PASSWORD</code> for a dedicated mailbox) in the backend environment, then restart it. Until then campaigns can be drafted but not sent.</Notice></div>}
      {s.safeMode.active && <div className="mt-3"><Notice tone="blue">This is a {s.safeMode.environment} environment, so live sends only go to the {s.safeMode.allowedRecipients} address(es) in <code>MARKETING_TEST_RECIPIENTS</code>. Everyone else is skipped, so test data can never email real businesses. Test emails to an address you type are always allowed.</Notice></div>}
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <Button variant="outline" disabled={!p.configured || test.isPending} onClick={async () => { setMsg(null); try { const r = await test.mutateAsync(undefined as never); setMsg(r.ok ? { tone: "ok", text: "Connected to the mail server." } : { tone: "error", text: r.error ?? "Connection failed" }); } catch (e) { setMsg({ tone: "error", text: errorText(e) }); } }}>Test connection</Button>
        <Field label="Send a test email to" className="min-w-[220px]"><Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@yourcompany.com" /></Field>
        <Button disabled={!p.configured || !to || send.isPending} onClick={async () => { setMsg(null); try { await send.mutateAsync(undefined as never); setMsg({ tone: "ok", text: `Test sent to ${to}.` }); } catch (e) { setMsg({ tone: "error", text: errorText(e) }); } }}>Send test</Button>
      </div>
      {msg && <div className="mt-2"><Flash tone={msg.tone}>{msg.text}</Flash></div>}
    </Section>
  );
}

function SubscriptionsCard() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { data } = useSuppressions({ q: q || undefined, page, page_size: 10 });
  return (
    <Section title="Subscriptions & suppression" subtitle="Who must not be emailed, and how people leave.">
      <ul className="mb-4 list-disc space-y-1 pl-5 text-[12.5px] text-muted">
        <li>Every email has an unsubscribe link (and a one-click header). Opening the link asks for confirmation, so mail scanners can&apos;t unsubscribe people by accident.</li>
        <li>Unsubscribed, bounced, complained and invalid contacts are suppressed: they are excluded from every audience and from automations, and are re-checked again at the moment of sending.</li>
        <li>Newsletter subscribers are managed from the Audience page (per contact or in bulk). Reactivating a suppressed contact is a deliberate admin action recorded in the audit history.</li>
      </ul>
      <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search suppressed emails" />
      <div className="mt-3">{!data?.items.length ? <p className="py-4 text-center text-[12.5px] text-muted">No suppressed contacts{q ? " match your search" : ""}.</p> : (
        <><DataCard label="Suppression list" className="border-0"><table className="w-full min-w-[560px] text-left text-sm"><thead><tr><th className={thClass}>Email</th><th className={thClass}>Status</th><th className={thClass}>Reason</th><th className={thClass}>Since</th></tr></thead>
          <tbody className="divide-y divide-border">{data.items.map((r) => <tr key={r.id}><td className="max-w-[240px] px-4 py-2.5"><span className="block truncate font-medium">{r.email}</span>{r.business_name && <span className="block truncate text-[11.5px] text-muted">{r.business_name}</span>}</td>
            <td className="px-4 py-2.5"><Badge tone={CONTACT_STATUS[r.status as ContactStatus]?.tone ?? "slate"}>{CONTACT_STATUS[r.status as ContactStatus]?.label ?? r.status}</Badge></td><td className="px-4 py-2.5 text-[12.5px] text-muted">{r.reason ?? "—"}</td><td className="px-4 py-2.5 text-[12px] text-muted">{when(r.at)}</td></tr>)}</tbody></table></DataCard>
          <div className="mt-2"><Pagination page={page} pageSize={10} total={data.total} onPage={setPage} noun="suppressed contact" /></div></>
      )}</div>
    </Section>
  );
}

function ComplianceCard({ s }: { s: MarketingSettings }) {
  const [c, setC] = useState(s.compliance);
  const [b, setB] = useState({ company: s.brand.company, address: s.brand.address });
  const [msg, setMsg] = useState<Msg>(null);
  const comp = useSave("compliance");
  const brand = useSave("brand");
  const save = async () => { setMsg(null); try { await comp.mutateAsync(c); await brand.mutateAsync(b); setMsg({ tone: "ok", text: "Saved." }); } catch (e) { setMsg({ tone: "error", text: errorText(e) }); } };
  const modes: { value: ConsentMode; title: string; text: string }[] = [
    { value: "opt_out", title: "Existing customers until they unsubscribe", text: "Businesses on Pesaa can be emailed until they unsubscribe. Imported contacts always need recorded consent." },
    { value: "opt_in", title: "Only people with recorded consent", text: "Only contacts whose consent you have recorded (import, manual or bulk) receive marketing." },
  ];
  return (
    <Section title="Compliance" subtitle="Consent rules and the sender details shown in every email footer.">
      <fieldset className="space-y-2"><legend className="mb-1 text-[13px] font-medium">Marketing consent rule</legend>
        {modes.map((m) => <label key={m.value} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 has-[:checked]:border-accent has-[:checked]:bg-accent/5"><input type="radio" name="consent" className="mt-1" checked={c.consent_mode === m.value} onChange={() => setC({ ...c, consent_mode: m.value })} /><span><span className="block text-[13px] font-semibold">{m.title}</span><span className="block text-[12px] text-muted">{m.text}</span></span></label>)}</fieldset>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Company name in footer"><Input value={b.company} onChange={(e) => setB({ ...b, company: e.target.value })} maxLength={120} /></Field>
        <Field label="Postal address in footer" hint="Many countries require a physical address in marketing email."><Input value={b.address} onChange={(e) => setB({ ...b, address: e.target.value })} placeholder="Street, city, country" /></Field>
        <Field label="Footer note — why they receive this email" className="sm:col-span-2"><Textarea rows={2} value={c.footer_note} onChange={(e) => setC({ ...c, footer_note: e.target.value })} className="resize-y" /></Field>
        <label className="flex items-center gap-2 text-[13px] sm:col-span-2"><input type="checkbox" className="h-4 w-4" checked={c.require_address} onChange={(e) => setC({ ...c, require_address: e.target.checked })} />Block sending until a postal address is set</label>
      </div>
      <p className="mt-3 text-[11.5px] text-muted">The footer always includes the company name, this note and an unsubscribe link; it can&apos;t be removed from an email.</p>
      <div className="mt-3 flex items-center gap-3"><Button onClick={save} disabled={comp.isPending || brand.isPending}>Save</Button>{msg && <Flash tone={msg.tone}>{msg.text}</Flash>}</div>
    </Section>
  );
}

function AuditCard() {
  const [page, setPage] = useState(1);
  const { data } = useMarketingAudit({ page, page_size: 10 });
  return (
    <Section title="Audit history" subtitle="Who created, scheduled, sent or changed marketing — including system actions.">
      {!data?.items.length ? <p className="py-4 text-center text-[12.5px] text-muted">Nothing recorded yet.</p> : (
        <><DataCard label="Audit history" className="border-0"><table className="w-full min-w-[600px] text-left text-sm"><thead><tr><th className={thClass}>When</th><th className={thClass}>Who</th><th className={thClass}>What</th></tr></thead>
          <tbody className="divide-y divide-border">{data.items.map((a) => <tr key={a.id}><td className="whitespace-nowrap px-4 py-2.5 text-[12px] text-muted">{when(a.at)}</td><td className="px-4 py-2.5 text-[12.5px]">{a.by ?? "System"}</td><td className="px-4 py-2.5 text-[12.5px]">{a.summary}</td></tr>)}</tbody></table></DataCard>
          <div className="mt-2"><Pagination page={page} pageSize={10} total={data.total} onPage={setPage} noun="entry" /></div></>
      )}
    </Section>
  );
}
