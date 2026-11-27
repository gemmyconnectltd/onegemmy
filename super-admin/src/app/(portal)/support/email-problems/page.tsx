"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, AtSign, Building2, CheckCircle2, ChevronRight, Clock, MailWarning, MessageCircle, Phone, RefreshCw, RotateCcw, Send } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataCard, Pagination, SearchBox, thClass } from "@/components/ui/DataTable";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState, ErrorState, Notice } from "@/components/ui/EmptyState";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { Metric } from "@/components/ui/Metric";
import { PageHeader } from "@/components/ui/PageHeader";
import { TabStrip } from "@/components/ui/TabStrip";
import { REASONS, REASON_ORDER, hasSecret, kindLabel, whatsappHref } from "@/components/support/emailProblems";
import type { EmailProblem, EmailProblemFilters, EmailProblemReason } from "@/lib/api";
import {
  useCheckEmailProblems, useCorrectEmailProblem, useEmailProblemSummary, useEmailProblems, useReopenEmailProblem,
  useResendEmailProblem, useResolveEmailProblem,
} from "@/lib/api/hooks";
import { fmtDateTime, fmtRelative } from "@/lib/date";

const PAGE_SIZE = 30;
const errorText = (e: unknown, fallback: string) => (e as { detail?: string })?.detail ?? fallback;

/** The person (or just the address when no Pesaa user has it), with their business under it. */
function Who({ p }: { p: EmailProblem }) {
  if (!p.user) return <span className="text-muted">Not a Pesaa user</span>;
  return (
    <span className="block min-w-0">
      <span className="block truncate font-medium text-foreground">{p.user.full_name}</span>
      {p.tenant && <span className="block truncate text-[11.5px] text-muted">{p.tenant.name}</span>}
    </span>
  );
}

function FollowUp({ problem, onClose }: { problem: EmailProblem; onClose: () => void }) {
  const reason = REASONS[problem.reason];
  const correct = useCorrectEmailProblem();
  const resend = useResendEmailProblem();
  const resolve = useResolveEmailProblem();
  const reopen = useReopenEmailProblem();
  const [email, setEmail] = useState(problem.recipient);
  const [again, setAgain] = useState(problem.can_resend);
  const [note, setNote] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = correct.isPending || resend.isPending || resolve.isPending || reopen.isPending;
  const open = problem.status === "open";
  const wrongAddress = problem.reason === "no_such_address" || problem.reason === "domain_not_found";
  const phone = problem.user?.phone || problem.tenant?.phone;
  const changed = email.trim().toLowerCase() !== problem.recipient && /^\S+@\S+\.\S+$/.test(email.trim());

  const run = async (fn: () => Promise<{ message: string }>, fallback: string) => {
    setError(null);
    try { setDone((await fn()).message); } catch (e) { setError(errorText(e, fallback)); }
  };

  return (
    <Drawer open onClose={onClose} side="right" size="lg" title="Follow up" description={`${kindLabel(problem)} to ${problem.recipient}`}
      footer={done ? <div className="flex justify-end"><Button variant="primary" onClick={onClose}>Done</Button></div> : open ? (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={busy} onClick={() => void run(() => resolve.mutateAsync({ id: problem.id, note: note.trim() }), "Couldn't save.")}>
            <CheckCircle2 size={14} /> Mark as followed up
          </Button>
        </div>
      ) : (
        <div className="flex justify-end"><Button variant="outline" disabled={busy} onClick={() => void run(() => reopen.mutateAsync({ id: problem.id }), "Couldn't reopen.")}><RotateCcw size={14} /> Reopen</Button></div>
      )}>
      <div className="space-y-5 px-5 py-4">
        {done && <div role="status" className="flex items-start gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-[13px] text-foreground"><CheckCircle2 size={15} className="mt-0.5 flex-shrink-0 text-accent" />{done}</div>}

        <section className="space-y-2">
          <div className="flex flex-wrap items-center gap-2"><Badge tone={reason.tone} dot>{reason.label}</Badge><span className="text-[12px] text-muted">{fmtDateTime(problem.occurred_at)} · {problem.source === "bounce" ? "bounced back" : "refused while sending"}</span></div>
          <p className="text-[13.5px] text-foreground">{reason.what(problem.recipient)}</p>
          {problem.detail && (
            <div className="rounded-lg border border-border bg-surface px-3 py-2">
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted">The mail server said{problem.smtp_code ? ` · ${problem.smtp_code}` : ""}</p>
              <p className="mt-0.5 break-words font-mono text-[12px] text-foreground">{problem.detail}</p>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted">Who it was for</h3>
          {problem.user ? (
            <div className="rounded-xl border border-border p-3">
              <p className="font-semibold text-foreground">{problem.user.full_name} <span className="font-normal capitalize text-muted">· {problem.user.role}</span></p>
              {problem.tenant && (
                <Link href={`/tenants/${problem.tenant.id}`} className="mt-0.5 inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline">
                  <Building2 size={13} /> {problem.tenant.name}<ChevronRight size={13} />
                </Link>
              )}
              {phone ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={`tel:${phone}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[13px] font-medium hover:bg-surface"><Phone size={13} /> {phone}</a>
                  <a href={whatsappHref(phone)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[13px] font-medium hover:bg-surface"><MessageCircle size={13} /> WhatsApp</a>
                </div>
              ) : <p className="mt-2 text-[12px] text-muted">No phone number on file.</p>}
            </div>
          ) : <p className="text-[13px] text-muted">No Pesaa user signs in with {problem.recipient}, so there is no account to correct.</p>}
        </section>

        {open && (
          <section className="space-y-3">
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted">What to do</h3>
            <p className="text-[13px] text-foreground">{reason.next}</p>

            {problem.user && (wrongAddress || problem.reason === "other" || problem.reason === "blocked") && (
              <div className="space-y-2 rounded-xl border border-border p-3">
                <Field label="Correct email address" hint={`${problem.user.full_name} will sign in with this email from now on.`}>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
                </Field>
                {problem.can_resend && (
                  <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={again} onChange={(e) => setAgain(e.target.checked)} className="accent-[var(--primary)]" /> Send the “{kindLabel(problem)}” email again to the new address</label>
                )}
                {hasSecret(problem.kind) && <Notice tone="blue">For security, a password or sign-in link is never resent from here. After correcting the email, reset their password from the business&apos;s Team page.</Notice>}
                <div className="flex justify-end">
                  <Button variant="primary" disabled={!changed || busy} onClick={() => void run(() => correct.mutateAsync({ id: problem.id, body: { email: email.trim(), resend: again, note: note.trim() } }), "Couldn't change the email.")}>
                    <AtSign size={14} /> {correct.isPending ? "Saving…" : again && problem.can_resend ? "Correct and resend" : "Correct email"}
                  </Button>
                </div>
              </div>
            )}

            {problem.can_resend && !wrongAddress && (
              <Button variant="outline" disabled={busy} onClick={() => void run(() => resend.mutateAsync({ id: problem.id }), "Couldn't send it.")}>
                <Send size={14} /> {resend.isPending ? "Sending…" : `Send again to ${problem.recipient}`}
              </Button>
            )}

            <Field label="Note (optional)" hint="Saved with the follow-up, e.g. “Called, they gave the right email”.">
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
            </Field>
          </section>
        )}

        {!open && (
          <section className="rounded-xl border border-border bg-surface px-3 py-2 text-[13px]">
            <p className="font-semibold text-foreground">Followed up {fmtRelative(problem.resolved_at)}</p>
            {problem.resolution && <p className="text-muted">{problem.resolution}</p>}
          </section>
        )}

        {error && <p role="alert" className="text-[12.5px] text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </Drawer>
  );
}

export default function EmailProblemsPage() {
  const [status, setStatus] = useState<NonNullable<EmailProblemFilters["status"]>>("open");
  const [reason, setReason] = useState<EmailProblemReason | "">("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<EmailProblem | null>(null);
  const filters: EmailProblemFilters = { status, reason: reason || undefined, q: search.trim() || undefined };
  const list = useEmailProblems(page, PAGE_SIZE, filters);
  const summary = useEmailProblemSummary();
  const check = useCheckEmailProblems();
  const [checkMsg, setCheckMsg] = useState<string | null>(null);
  const s = summary.data;
  const wrong = (s?.by_reason.no_such_address ?? 0) + (s?.by_reason.domain_not_found ?? 0);
  const rows = list.data?.items ?? [];
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  const checkNow = async () => {
    setCheckMsg(null);
    try { setCheckMsg((await check.mutateAsync(undefined)).message); } catch (e) { setCheckMsg(errorText(e, "Couldn't check the mailbox.")); }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Email problems" subtitle="Emails Pesaa sent that never reached the person. Follow each one up so nobody is left waiting."
        actions={<Button variant="outline" onClick={() => void checkNow()} disabled={check.isPending || s?.check.enabled === false}><RefreshCw size={14} className={check.isPending ? "animate-spin" : ""} /> {check.isPending ? "Checking…" : "Check now"}</Button>} />

      {s && !s.check.enabled && <Notice>Bounced emails aren&apos;t being read: no sending mailbox is set up here. Emails refused while sending are still listed.</Notice>}
      {s?.check.last_error && <Notice tone="red">Last mailbox check failed: {s.check.last_error}</Notice>}
      {s?.check.enabled && !s.check.last_error && (
        <p className="flex items-center gap-1.5 text-[12px] text-muted"><Clock size={12} /> Bounced emails are picked up from {s.check.host} every 5 minutes · last checked {fmtRelative(s.check.last_checked_at).toLowerCase()}{checkMsg ? ` · ${checkMsg}` : ""}</p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Waiting for follow-up" value={s?.open ?? "—"} icon={MailWarning} tone={s?.open ? "bg-red-500/10 text-red-600 dark:text-red-400" : undefined} />
        <Metric label="Wrong address" value={s ? wrong : "—"} sub="Typo or domain that doesn't exist" icon={AtSign} tone="bg-amber-500/10 text-amber-600 dark:text-amber-400" />
        <Metric label="Other reasons" value={s ? s.open - wrong : "—"} sub="Full, blocked or not sent" icon={AlertTriangle} tone="bg-surface text-muted" />
        <Metric label="Followed up" value={s?.resolved_last_7_days ?? "—"} sub="Last 7 days" icon={CheckCircle2} />
      </div>

      <TabStrip label="Status" items={[
        { key: "open", label: "Needs follow-up", count: s?.open, active: status === "open", onSelect: () => reset(setStatus)("open") },
        { key: "resolved", label: "Followed up", active: status === "resolved", onSelect: () => reset(setStatus)("resolved") },
        { key: "all", label: "All", active: status === "all", onSelect: () => reset(setStatus)("all") },
      ]} />

      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={search} onChange={reset(setSearch)} placeholder="Search email, person or business" />
        <Select aria-label="Reason" value={reason} onChange={(e) => reset(setReason)(e.target.value as EmailProblemReason | "")} className="w-auto!">
          <option value="">All reasons</option>
          {REASON_ORDER.map((r) => <option key={r} value={r}>{REASONS[r].label}{status === "open" && s?.by_reason[r] ? ` (${s.by_reason[r]})` : ""}</option>)}
        </Select>
      </div>

      {list.isError ? <ErrorState message="Couldn't load email problems." onRetry={() => void list.refetch()} /> : (
        <DataCard label="Email problems">
          {list.isLoading ? <p className="p-6 text-sm text-muted">Loading…</p> : rows.length === 0 ? (
            <EmptyState icon={status === "open" ? CheckCircle2 : MailWarning} title={status === "open" ? "Every email arrived" : "Nothing here"}
              description={status === "open" ? "When an email bounces or can't be sent, it shows up here so you can follow up with the person." : "No email problems match these filters."} />
          ) : (
            <table className="w-full min-w-[820px] text-left text-[13px]">
              <thead><tr className="border-b border-border bg-surface/40">{["Who", "Email address", "What was sent", "Why", "When", ""].map((h, i) => <th key={i} scope="col" aria-label={h || "Follow up"} className={thClass}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-border">
                {rows.map((p) => (
                  <tr key={p.id} onClick={() => setPicked(p)} className="cursor-pointer hover:bg-surface/40">
                    <td className="max-w-[220px] px-4 py-3"><Who p={p} /></td>
                    <td className="max-w-[240px] px-4 py-3"><span className="block truncate font-mono text-[12px] text-foreground" title={p.recipient}>{p.recipient}</span></td>
                    <td className="max-w-[200px] px-4 py-3"><span className="block truncate">{kindLabel(p)}</span></td>
                    <td className="px-4 py-3"><Badge tone={p.status === "open" ? REASONS[p.reason].tone : "slate"} dot>{REASONS[p.reason].label}</Badge>{p.status === "resolved" && <span className="ml-1.5 text-[11px] text-accent">Followed up</span>}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-[12px] text-muted" title={fmtDateTime(p.occurred_at)}>{fmtRelative(p.occurred_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button variant={p.status === "open" ? "outline" : "ghost"} size="sm" onClick={(e) => { e.stopPropagation(); setPicked(p); }}>{p.status === "open" ? "Follow up" : "View"}</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DataCard>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onPage={setPage} noun="email" />
      {picked && <FollowUp key={picked.id} problem={picked} onClose={() => setPicked(null)} />}
    </div>
  );
}
