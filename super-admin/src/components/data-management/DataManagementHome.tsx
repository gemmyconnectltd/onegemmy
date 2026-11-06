"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { Activity, BellRing, Building2, History, ListChecks, Plus } from "lucide-react";
import { useDmMe, useDmSummary } from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";
import { cn } from "@/lib/utils";
import { BusinessDirectory } from "./BusinessDirectory";
import { OPERATION_CARDS } from "./operations";
import { errorText } from "./common";

function Stat({ href, icon: Icon, label, value, sub, loading }: { href: string; icon: typeof Building2; label: string; value: ReactNode; sub: string; loading: boolean }) {
  return (
    <Link href={href} className="group flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card p-3.5 transition-colors hover:border-accent/40 hover:bg-surface/50 focus-visible:outline-2 focus-visible:outline-accent">
      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"><Icon size={18} aria-hidden /></span>
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</span>
        <span className="block truncate text-xl font-extrabold leading-tight text-foreground">{loading ? <span className="inline-block h-5 w-12 animate-pulse rounded bg-surface align-middle" aria-label="Loading" /> : value}</span>
        <span className="block truncate text-[11px] text-muted">{sub}</span>
      </span>
    </Link>
  );
}

/** The Data Management landing page: what can be done, what is waiting, and the businesses to do it for. */
export function DataManagementHome() {
  const me = useDmMe();
  const perms = me.data?.permissions ?? [];
  const summary = useDmSummary({ enabled: perms.length > 0 });
  const s = summary.data;
  if (me.isLoading) return <PageLoader />;
  if (me.error) return <ErrorState message={errorText(me.error)} onRetry={() => void me.refetch()} />;
  if (perms.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader title="Data Management" subtitle="Manage business data, perform cleanup, corrections, imports and exports safely." />
        <EmptyState title="Data Management is not enabled for this account" description="No Data Management permission is granted automatically. A platform administrator gives them one by one, and each grant is audited." />
        <div className="space-y-2 rounded-xl border border-border bg-card p-4 text-[13px]">
          <p className="font-semibold">To grant permissions, run on the server:</p>
          <code className="block overflow-x-auto whitespace-pre rounded-lg bg-surface px-3 py-2 text-[12px]">{`python -m scripts.grant_data_permissions --email <admin email> --grant view,preview`}</code>
        </div>
      </div>
    );
  }
  const unavailable = (v: number | null | undefined, text: string, fmt?: (n: number) => string) => (v === null || v === undefined ? "—" : fmt ? fmt(v) : v.toLocaleString()) + (v === null || v === undefined ? "" : text);
  const waiting = s?.pending_requests ?? 0;
  return (
    <div className="space-y-5">
      <PageHeader title="Data Management" subtitle="Manage business data, perform cleanup, corrections, imports and exports safely."
        actions={<>
          <Link href="/data-management/operations"><Button variant="outline" size="sm"><History size={14} /> Operation History</Button></Link>
          {perms.includes("data:preview") && <Link href="/data-management/new"><Button size="sm"><Plus size={14} /> New Operation</Button></Link>}
        </>} />

      {waiting > 0 && (
        <Link href="/data-management/requests" className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12.5px] font-semibold text-amber-800 hover:bg-amber-500/15 dark:text-amber-300">
          <BellRing size={15} aria-hidden /> {waiting.toLocaleString()} owner request{waiting === 1 ? "" : "s"} waiting for review <span className="ml-auto underline">Open requests</span>
        </Link>
      )}
      {summary.error && <ErrorState message={errorText(summary.error)} onRetry={() => void summary.refetch()} />}

      <section aria-label="Overview" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat href="#businesses" icon={Building2} label="Total businesses" loading={summary.isLoading} value={unavailable(s?.businesses, "")} sub={s?.businesses == null && !summary.isLoading ? "Needs the View business records permission" : "Open the directory below"} />
        <Stat href="/data-management/requests" icon={ListChecks} label="Pending requests" loading={summary.isLoading} value={unavailable(s?.pending_requests, "")}
          sub={s?.pending_requests == null && !summary.isLoading ? "Needs the Preview or Approve permission" : s?.awaiting_approval ? `${s.awaiting_approval} operation${s.awaiting_approval === 1 ? "" : "s"} waiting for approval` : "Owner requests waiting for review"} />
        <Stat href="/data-management/operations" icon={History} label="Operations, last 30 days" loading={summary.isLoading} value={unavailable(s?.operations_30d, "")} sub={s?.operations_30d == null && !summary.isLoading ? "Needs the History permission" : "Submitted for approval or run"} />
        <Stat href="/data-management/operations" icon={Activity} label="Operation health" loading={summary.isLoading} value={s?.success_rate == null ? "—" : `${s.success_rate}%`}
          sub={s?.operations_30d == null && !summary.isLoading ? "Needs the History permission" : s?.success_rate == null ? "No operation has finished in 30 days" : `${s.finished_30d} finished, share fully completed`} />
      </section>

      <section aria-labelledby="ops-title" className="space-y-3">
        <div><h2 id="ops-title" className="pesaa-card-title">Data Management Operations</h2><p className="mt-0.5 text-[12.5px] text-muted">Every operation starts with a preview. Nothing is changed until it has been checked, approved where required, and confirmed.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {OPERATION_CARDS.map((c) => {
            const Icon = c.icon;
            return (
              <Link key={c.key} href={`/data-management/new?op=${c.key}`} className={cn("group flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-colors hover:border-accent/40 hover:bg-surface/50 focus-visible:outline-2 focus-visible:outline-accent")}>
                <span className="flex items-center justify-between gap-2"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent"><Icon size={18} aria-hidden /></span>
                  {!c.target && <span className="rounded-full border border-border px-2 py-0.5 text-[10.5px] font-semibold text-muted">Not available here</span>}</span>
                <span className="text-sm font-semibold text-foreground group-hover:text-accent">{c.title}</span>
                <span className="text-[12.5px] leading-snug text-muted">{c.description}</span>
              </Link>);
          })}
        </div>
      </section>

      {perms.includes("data:view")
        ? <BusinessDirectory urlSync hrefFor={(b) => `/data-management?tenant=${b.id}`} />
        : <EmptyState title="Business record access is not granted" description="This account cannot open business records. Ask a platform administrator for the View business records permission." />}
    </div>
  );
}
