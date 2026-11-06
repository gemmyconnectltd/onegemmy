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
  const [moduleKey, setModuleKey] = useState("");
  const [dateType, setDateType] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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
      await create.mutateAsync({ module: activeModuleKey, date_type: activeDateType, from_date: fromDate, to_date: toDate, reason: reason.trim() });
      setSaved(true);
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
        <SettingsCard title="Request a data review" description="Choose a module and a date range. Only the owner can submit this request." icon={Trash2}>
          {modules.isLoading ? <PageLoader variant="compact" /> : modules.error ? <ErrorState message={errorText(modules.error)} onRetry={() => void modules.refetch()} /> : !modules.data?.length ? <EmptyState message="There are no modules currently available for a date-bounded data review request." /> : (
            <form onSubmit={submit} className="space-y-4 py-3">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Business module" required>
                  <Select required value={activeModuleKey} onChange={(event) => {
                    const next = modules.data?.find((item) => item.key === event.target.value);
                    setModuleKey(event.target.value);
                    setDateType(next?.default_date_type ?? "");
                  }}>
                    {(modules.data ?? []).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                  </Select>
                </Field>
                <Field label="Date type" required>
                  <Select required value={activeDateType} onChange={(event) => setDateType(event.target.value)}>
                    {(selectedModule?.date_types ?? []).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                  </Select>
                </Field>
                <Field label="From" required><Input required type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></Field>
                <Field label="To" required><Input required type="date" min={fromDate || undefined} value={toDate} onChange={(event) => setToDate(event.target.value)} /></Field>
              </div>
              <Field label="Why should these records be reviewed?" required hint="At least 10 characters. Your reason is kept in the business audit trail.">
                <Textarea required minLength={10} maxLength={1000} rows={4} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="For example: These are duplicate test transactions from our setup period." />
              </Field>
              {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
              {saved && <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">Request submitted. No records were changed. You can follow it under Your requests.</p>}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                <p className="flex items-center gap-1.5 text-[12px] text-muted"><CalendarDays size={14} /> One module and date range</p>
                <Button type="submit" disabled={create.isPending || !activeModuleKey || !activeDateType || !fromDate || !toDate || fromDate > toDate || reason.trim().length < 10}>
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
                    <p className="text-sm font-semibold">{label}</p>
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
