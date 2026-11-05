"use client";

import { useState, type FormEvent } from "react";
import { AlertTriangle, CalendarDays, Clock3, Database, FileCheck2, Trash2 } from "lucide-react";
import { useCreateDataRemovalRequest, useDataRemovalModules, useDataRemovalRequests, useMyProfile } from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState, ErrorState } from "@/components/hr/State";
import { SettingsCard } from "@/components/settings/parts";

const OWNER_ROLES = new Set(["owner", "owner/ceo"]);

function errorText(error: unknown) {
  const value = error as { detail?: string; message?: string } | null;
  return value?.detail ?? value?.message ?? "The request could not be completed. Try again.";
}

function statusTone(status: string): "green" | "amber" | "red" | "slate" {
  if (status === "Completed" || status === "Approved") return "green";
  if (status === "Rejected" || status === "Declined" || status === "Failed") return "red";
  if (status === "Awaiting second approval" || status === "In progress") return "amber";
  return "slate";
}

function RequestStatus({ status }: { status: string }) {
  const tone = statusTone(status);
  const color = tone === "green" ? "pesaa-badge-success" : tone === "amber" ? "pesaa-badge-warning" : tone === "red" ? "pesaa-badge-error" : "pesaa-badge-neutral";
  return <span className={`pesaa-badge ${color}`}>{status}</span>;
}

export default function DataManagementSettingsPage() {
  const profile = useMyProfile();
  const isOwner = OWNER_ROLES.has((profile.data?.role ?? "").toLowerCase());
  const modules = useDataRemovalModules({ enabled: isOwner });
  const [requestPage, setRequestPage] = useState(1);
  const requests = useDataRemovalRequests(requestPage, { enabled: isOwner });
  const create = useCreateDataRemovalRequest();
  const [mode, setMode] = useState<"one" | "many">("one");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [moduleKey, setModuleKey] = useState("");
  const [dateType, setDateType] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | false>(false);

  const selectedModule = modules.data?.find((item) => item.key === moduleKey) ?? modules.data?.[0];
  const activeModuleKey = selectedModule?.key ?? "";
  const activeDateType = selectedModule?.date_types.some((item) => item.key === dateType)
    ? dateType
    : selectedModule?.default_date_type ?? "";

  if (profile.isLoading) return <PageLoader />;
  if (profile.error) return <ErrorState message={errorText(profile.error)} onRetry={() => void profile.refetch()} />;
  if (!isOwner) {
    return <EmptyState message="Only a business owner can submit a data removal request. No records are changed from this page." />;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    try {
      const many = mode === "many";
      await create.mutateAsync({
        ...(many ? { modules: [...picked] } : { module: activeModuleKey, date_type: activeDateType }),
        from_date: fromDate,
        to_date: toDate,
        reason: reason.trim(),
      });
      setSaved(many ? `Request sent for ${picked.size} module${picked.size === 1 ? "" : "s"}. No records were changed. The platform team reviews them together.` : "Request submitted. No records were changed.");
      setReason("");
      setRequestPage(1);
    } catch (caught) {
      setError(errorText(caught));
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"><Database size={19} /></span>
        <div>
          <h2 className="pesaa-section-title">Data Management</h2>
          <p className="mt-0.5 text-sm text-muted">Ask for a review of records your business no longer needs.</p>
        </div>
      </header>

      <div role="note" className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-800 dark:text-amber-300">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <span><strong>Submitting a request does not delete anything.</strong> The platform team checks the exact records first. Any deletion needs a second administrator&apos;s approval. Records connected to payments, stock, accounting, or business history remain protected; archive records instead if you only need them out of daily use.</span>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
        <SettingsCard title="Request a data review" description="Choose one module or several, and a date range. Only the owner can submit this request." icon={Trash2}>
          {modules.isLoading ? <PageLoader variant="compact" /> : modules.error ? <ErrorState message={errorText(modules.error)} onRetry={() => void modules.refetch()} /> : !modules.data?.length ? <EmptyState message="There are no modules currently available for a date-bounded data review request." /> : (
            <form onSubmit={submit} className="space-y-4 py-3">
              <div role="radiogroup" aria-label="What to review" className="flex flex-wrap gap-2">
                {([["one", "One module"], ["many", "Several modules (a whole period)"]] as const).map(([key, label]) => (
                  <button key={key} type="button" role="radio" aria-checked={mode === key} onClick={() => { setMode(key); setSaved(false); }}
                    className={`rounded-lg border px-3 py-2 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-accent ${mode === key ? "border-accent bg-accent/10 text-accent" : "border-border hover:bg-surface"}`}>{label}</button>))}
              </div>
              {mode === "many" && (
                <fieldset className="space-y-2 rounded-lg border border-border p-3">
                  <legend className="px-1 text-[12.5px] font-semibold">Modules to include</legend>
                  <div className="flex flex-wrap gap-2 text-[12px]">
                    <button type="button" className="font-semibold text-accent hover:underline" onClick={() => setPicked(new Set((modules.data ?? []).map((m) => m.key)))}>Select all</button>
                    <button type="button" className="font-semibold text-muted hover:underline" onClick={() => setPicked(new Set())}>Clear</button>
                  </div>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {(modules.data ?? []).map((m) => (
                      <label key={m.key} className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={picked.has(m.key)} onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(m.key)) n.delete(m.key); else n.add(m.key); return n; })} />{m.label}</label>))}
                  </div>
                  <p className="text-[12px] text-muted">Each module uses its own main date (sale date for sales, created date for customers). Only records nothing else depends on can be removed, so it is looked at in a safe order.</p>
                </fieldset>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                {mode === "one" && <Field label="Business module" required>
                  <Select required value={activeModuleKey} onChange={(event) => {
                    const next = modules.data?.find((item) => item.key === event.target.value);
                    setModuleKey(event.target.value);
                    setDateType(next?.default_date_type ?? "");
                  }}>
                    {(modules.data ?? []).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                  </Select>
                </Field>}
                {mode === "one" && <Field label="Date type" required>
                  <Select required value={activeDateType} onChange={(event) => setDateType(event.target.value)}>
                    {(selectedModule?.date_types ?? []).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                  </Select>
                </Field>}
                <Field label="From" required><Input required type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></Field>
                <Field label="To" required><Input required type="date" min={fromDate || undefined} value={toDate} onChange={(event) => setToDate(event.target.value)} /></Field>
              </div>
              <Field label="Why should these records be reviewed?" required hint="At least 10 characters. Your reason is kept in the business audit trail.">
                <Textarea required minLength={10} maxLength={1000} rows={4} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="For example: These are duplicate test transactions from our setup period." />
              </Field>
              {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
              {saved && <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">{saved} You can follow it under Your requests.</p>}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                <p className="flex items-center gap-1.5 text-[12px] text-muted"><CalendarDays size={14} /> {mode === "many" ? `${picked.size} module${picked.size === 1 ? "" : "s"} over one date range` : "One module and date range"}</p>
                <Button type="submit" disabled={create.isPending || (mode === "many" ? picked.size === 0 : !activeModuleKey || !activeDateType) || !fromDate || !toDate || fromDate > toDate || reason.trim().length < 10}>
                  <FileCheck2 size={15} />{create.isPending ? "Submitting…" : "Submit for review"}
                </Button>
              </div>
            </form>
          )}
        </SettingsCard>

        <SettingsCard title="Your requests" description="Track reviews submitted by your business." icon={Clock3}>
          {requests.isLoading && <PageLoader variant="compact" />}
          {requests.error && <ErrorState message={errorText(requests.error)} onRetry={() => void requests.refetch()} />}
          {requests.data?.items.length === 0 && <EmptyState message="No data review requests yet." />}
          <ul className="divide-y divide-border">
            {requests.data?.items.map((item) => {
              const label = modules.data?.find((module) => module.key === item.module)?.label ?? item.module;
              return (
                <li key={item.id} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{label}{item.batch_id && <span className="ml-2 rounded-full bg-surface px-2 py-0.5 text-[10.5px] font-semibold text-muted">Part of a period request</span>}</p>
                    <RequestStatus status={item.status} />
                  </div>
                  <p className="text-[12px] text-muted">{item.filters.from} – {item.filters.to} · {item.filters.date_type} date · submitted <time dateTime={item.created_at}>{item.created_at.slice(0, 10)}</time></p>
                  <p className="text-[13px] leading-relaxed">{item.reason}</p>
                  {item.operation_reference && <p className="text-[12px] text-muted">Review reference: <span className="font-mono">{item.operation_reference}</span></p>}
                  {item.review_note && <p className="rounded-lg bg-surface px-3 py-2 text-[12px] text-muted">Platform note: {item.review_note}</p>}
                </li>
              );
            })}
          </ul>
          {requests.data && <Pagination page={requestPage} pageSize={20} total={requests.data.total} onPageChange={setRequestPage} itemLabel="requests" />}
        </SettingsCard>
      </div>
    </div>
  );
}
